import type { Metadata } from "next";
import { notFound } from "next/navigation";
import FichaProducto from "@/components/producto/FichaProducto";
import EventoPixel from "@/components/EventoPixel";
import GrillaProductos from "@/components/GrillaProductos";
import Opiniones from "@/components/portada/Opiniones";
import { escalaDe, getTramos, nombreDelTramo } from "@/lib/descuentos";
import { precio as formatearPrecio, precioConCentavos } from "@/lib/formato";
import { armarPack } from "@/lib/packs";
import { enLetras, fotosDeVitrina } from "@/lib/vitrina";
import type { OpcionPares } from "@/components/producto/OpcionesPares";
import type { ColorDeADos } from "@/components/HojaPack";
import type { Producto } from "@/lib/tipos";
import type { Tramo } from "@/lib/descuentos";
import { getProducto, getProductos } from "@/lib/catalogo";
import { getConfig } from "@/lib/config";
import { mensajesDeConfianza } from "@/lib/confianza";
import { verificarCuotas } from "@/lib/cuotas-servidor";
import { netoDe } from "@/lib/impuestos";
import { indiceVarianteInicial } from "@/lib/variantes";
import { rutaDeCategoria } from "@/lib/categorias";
import { parrafosDe, resumenDe } from "@/lib/descripcion";
import { datosGuardadosDeMercadoLibre } from "@/lib/ml-resenas-servidor";

/**
 * La página de producto, compartida por dos rutas:
 *
 *   /producto/[slug]          abre en el primer color con stock y foto de portada
 *   /producto/[slug]/[color]  abre en ese color (el SKU en minúsculas)
 *
 * La segunda existe para que la grilla pueda enlazar al color que muestra y
 * para que un link compartido conserve el color. Las dos son estáticas con
 * revalidación: leer el color del query string obligaría a renderizar en cada
 * pedido, y el tráfico de anuncios llega justo acá.
 */

const SITIO = () => process.env.NEXT_PUBLIC_SITE_URL ?? "https://harper.ar";

/** URL absoluta de una foto para Google y las redes. */
function fotoAbsoluta(ruta: string) {
  // Las fotos subidas a Blob ya son absolutas y no tienen .jpg hermano.
  if (/^https?:\/\//i.test(ruta)) return ruta;

  // Las locales van sobre fondo blanco: de ahí el .jpg hermano en vez del
  // .webp con transparencia. Misma conversión que usa el mail de compra.
  return `${SITIO()}${ruta.replace(/\.webp$/i, ".jpg")}`;
}

export async function metadataFicha(slug: string, color?: string): Promise<Metadata> {
  const producto = await getProducto(slug);

  if (!producto) return { title: "Producto no encontrado" };

  const variante = color ? producto.variantes[indiceVarianteInicial(producto, color)] : null;
  const titulo = variante ? `${producto.nombre} — ${variante.color}` : producto.nombre;
  const descripcion = resumenDe(producto.descripcion) || `${producto.nombre} — Harper.`;

  return {
    title: titulo,
    description: descripcion,
    // El color es una vista de la misma ficha: todas apuntan a la URL base.
    alternates: { canonical: `/producto/${producto.slug}` },
    openGraph: {
      title: `${titulo} · Harper`,
      description: descripcion,
      type: "website",
      // Sin `images` a propósito: si el segmento las declara, Next descarta el
      // archivo `opengraph-image.tsx` de al lado. Y las fotos del catálogo son
      // WebP con transparencia, que es lo que rompía la miniatura.
    },
  };
}

/**
 * «Llevá 3, pagá 2 · Llevá 5, pagá 3» en la ficha: las opciones con su total,
 * el precio de a uno tachado y la cuota confirmada con Mercado Pago, y los
 * colores de todos los modelos de la categoría para armar el pack. Null si la
 * categoría no tiene escala o no queda stock.
 */
async function paresDeLaFicha(producto: Producto, tramos: Tramo[], delMismoTipo: Producto[]) {
  const escala = escalaDe(tramos, producto.categoria);
  if (escala.length === 0) return null;

  const colores: ColorDeADos[] = delMismoTipo.flatMap((m) =>
    m.variantes.map((v) => ({
      id: v.id,
      sku: v.sku,
      modeloSlug: m.slug,
      modeloNombre: m.nombre,
      precio: m.precio,
      color: v.color,
      foto: fotosDeVitrina(v, m.fotoPrincipal ?? "").adentro,
      agotada: v.agotada,
    })),
  );
  if (!colores.some((c) => !c.agotada)) return null;

  const packs = [1, ...escala.map((t) => t.desdeUnidades)].map((cantidad) =>
    armarPack({ precio: producto.precio, cantidad, tramos, categoria: producto.categoria }),
  );
  const cuotas = await Promise.all(packs.map((p) => verificarCuotas(p.total)));
  const ultimo = escala[escala.length - 1];

  const opciones: OpcionPares[] = packs.map((p, i) => {
    const tramo = escala.find((t) => t.desdeUnidades === p.cantidad) ?? null;
    const cuota = cuotas[i];
    return {
      cantidad: p.cantidad,
      titulo: tramo ? nombreDelTramo(tramo) : "1 par",
      sello: tramo ? (tramo === ultimo ? "Mejor precio por par" : `Llevás ${enLetras(tramo.desdeUnidades - tramo.paga)} gratis`) : null,
      total: formatearPrecio(p.total),
      tachado: p.lista > p.total ? formatearPrecio(p.lista) : null,
      porPar: p.cantidad > 1 ? `Cada par ${formatearPrecio(p.precioUnitario)}` : null,
      cuota: cuota ? `${cuota.cuotas} cuotas sin interés de ${precioConCentavos(cuota.montoCuota)}` : null,
    };
  });

  // El total en el botón de la hoja solo si todos los modelos cuestan lo mismo.
  const mismoPrecio = delMismoTipo.every((m) => m.precio === producto.precio);
  const totales = mismoPrecio ? Object.fromEntries(packs.map((p) => [p.cantidad, formatearPrecio(p.total)])) : {};

  return { opciones, colores, totales };
}

export async function Ficha({ slug, color }: { slug: string; color?: string }) {
  const producto = await getProducto(slug);
  if (!producto) notFound();

  const [tramos, config, delMismoTipo, cuotas, mercadoLibre] = await Promise.all([
    getTramos(),
    getConfig(),
    getProductos(producto.categoria),
    verificarCuotas(producto.precio),
    // Las opiniones de todos los productos Harper, de la copia que guarda la
    // portada: la ficha no le pregunta a Mercado Libre.
    datosGuardadosDeMercadoLibre(),
  ]);
  const opiniones = mercadoLibre?.opiniones ?? null;
  const pares = await paresDeLaFicha(producto, tramos, delMismoTipo);

  const otros = delMismoTipo.filter((p) => p.id !== producto.id);
  const varianteInicial = indiceVarianteInicial(producto, color);
  const sitio = SITIO();

  const fotos = producto.variantes
    .flatMap((v) => v.fotos)
    .slice(0, 6)
    .map(fotoAbsoluta);

  const enUnMes = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const seccion = rutaDeCategoria(producto.categoria);

  // Datos estructurados: habilitan el resultado enriquecido con precio en Google.
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "Product",
      name: producto.nombre,
      description: parrafosDe(producto.descripcion).join(" ") || undefined,
      image: fotos,
      sku: producto.variantes[0]?.sku,
      brand: { "@type": "Brand", name: "Harper" },
      ...(producto.material ? { material: producto.material } : {}),
      offers: {
        "@type": "Offer",
        price: producto.precio,
        priceCurrency: "ARS",
        itemCondition: "https://schema.org/NewCondition",
        priceValidUntil: enUnMes,
        availability: producto.agotado
          ? "https://schema.org/OutOfStock"
          : "https://schema.org/InStock",
        url: `${sitio}/producto/${producto.slug}`,
        seller: { "@id": `${sitio}#organizacion` },
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Inicio", item: sitio },
        {
          "@type": "ListItem",
          position: 2,
          name: producto.categoria,
          item: `${sitio}${seccion}`,
        },
        { "@type": "ListItem", position: 3, name: producto.nombre },
      ],
    },
  ];

  return (
    <>
      <script
        type="application/ld+json"
        // El escape de "<" evita que un "</script>" en una descripción de
        // Airtable corte el bloque y rompa la página.
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
      {/* El mismo identificador que AddToCart y Purchase: el SKU de la
          variante con la que abre la ficha. */}
      <EventoPixel evento="ViewContent" data={{
        content_ids: [producto.variantes[varianteInicial]?.sku ?? producto.slug],
        content_type: "product",
        content_name: producto.nombre,
        value: producto.precio,
        currency: "ARS",
      }} />
      <FichaProducto
        producto={producto}
        tramos={tramos}
        varianteInicial={varianteInicial}
        confianza={mensajesDeConfianza(config, cuotas)}
        cuotas={cuotas}
        precioSinImpuestos={netoDe(config.impuestosNacionales, producto.categoria, producto.precio)}
        whatsapp={config.whatsapp || null}
        calificacion={opiniones ? { promedio: opiniones.promedio, total: opiniones.total } : null}
        pares={pares}
      />

      <Opiniones opiniones={opiniones} reputacion={mercadoLibre?.reputacion ?? null} />

      {otros.length > 0 ? (
        <section className="contenedor seccion seccion--secundaria" aria-labelledby="otros-modelos">
          <div className="seccion__cabecera">
            <h2 id="otros-modelos" className="titulo titulo--chico">
              Otros modelos de {producto.categoria.toLowerCase()}
            </h2>
          </div>
          <GrillaProductos productos={otros} compacta />
        </section>
      ) : null}
    </>
  );
}
