import type { Metadata } from "next";
import { notFound } from "next/navigation";
import FichaProducto from "@/components/producto/FichaProducto";
import EventoPixel from "@/components/EventoPixel";
import GrillaProductos from "@/components/GrillaProductos";
import { getTramos } from "@/lib/descuentos";
import { getProducto, getProductos } from "@/lib/catalogo";
import { getConfig } from "@/lib/config";
import { mensajesDeConfianza } from "@/lib/confianza";
import { cuotasActivas } from "@/lib/cuotas";
import { indiceVarianteInicial } from "@/lib/variantes";

/**
 * La página de producto, compartida por dos rutas:
 *
 *   /producto/[slug]          abre en el primer color con stock
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
  const descripcion = producto.descripcion || `${producto.nombre} — Harper.`;

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

export async function Ficha({ slug, color }: { slug: string; color?: string }) {
  const producto = await getProducto(slug);
  if (!producto) notFound();

  const [tramos, config, delMismoTipo] = await Promise.all([
    getTramos(),
    getConfig(),
    getProductos(producto.categoria),
  ]);

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

  const seccion =
    producto.categoria === "Anteojos"
      ? "anteojos"
      : producto.categoria === "Estuches"
        ? "estuches"
        : "panos";

  // Datos estructurados: habilitan el resultado enriquecido con precio en Google.
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "Product",
      name: producto.nombre,
      description: producto.descripcion || undefined,
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
          item: `${sitio}/${seccion}`,
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
      <EventoPixel evento="ViewContent" data={{
        content_ids: [producto.slug], content_type: "product",
        content_name: producto.nombre, value: producto.precio, currency: "ARS",
      }} />
      <FichaProducto
        producto={producto}
        tramos={tramos}
        varianteInicial={varianteInicial}
        confianza={mensajesDeConfianza(config)}
        cuotas={cuotasActivas()}
      />

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
