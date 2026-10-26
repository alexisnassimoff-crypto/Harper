import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import EventoPixel from "@/components/EventoPixel";
import GrillaProductos from "@/components/GrillaProductos";
import MensajesConfianza from "@/components/MensajesConfianza";
import Revelar from "@/components/Revelar";
import CompraPortada from "@/components/portada/CompraPortada";
import Opiniones from "@/components/portada/Opiniones";
import { ComoComprar, PreguntasFrecuentes } from "@/components/portada/SeccionesPortada";
import { caracteristicasDe } from "@/lib/caracteristicas";
import { getProductos } from "@/lib/catalogo";
import { categoriasConProductos, esCategoriaDeAnteojos, rutaDeCategoria } from "@/lib/categorias";
import { getConfig, type ConfigTienda } from "@/lib/config";
import { DIAS_ARREPENTIMIENTO, DIAS_CAMBIO, MESES_GARANTIA, mensajesDeConfianza } from "@/lib/confianza";
import { CUPON_BIENVENIDA } from "@/lib/cupones";
import { NOMBRE_MARCAS, type CuotasVerificadas } from "@/lib/cuotas";
import { conEspera, verificarCuotas, verificarCuotasPara } from "@/lib/cuotas-servidor";
import { getTramos } from "@/lib/descuentos";
import { PORCENTAJE_DINERO_MP } from "@/lib/dinero-mp";
import { precio as formatearPrecio } from "@/lib/formato";
import { datosDeMercadoLibre, ultimoDeMercadoLibre } from "@/lib/ml-resenas-servidor";
import { paresDisponibles, totalesPosibles } from "@/lib/packs";
import {
  DESCRIPCION_SITIO,
  ESTUCHE_PORTADA,
  garantiasDePortada,
  pasosDeCompra,
  preguntasDePortada,
  slugDePortada,
  subtituloDeLaPortada,
  TITULO_SITIO,
} from "@/lib/portada";
import type { Producto } from "@/lib/tipos";
import { indiceVarianteInicial } from "@/lib/variantes";

export const revalidate = 60;

export const metadata: Metadata = {
  alternates: { canonical: "/" },
  openGraph: {
    title: TITULO_SITIO,
    description: DESCRIPCION_SITIO,
    type: "website",
    // Sin `images`: las pone app/opengraph-image.jpg.
  },
};

/**
 * La fotografía de la portada. Es la foto de la marca (public/hero.webp), no
 * un producto elegido automáticamente del catálogo. Solo la reemplaza una
 * foto cargada a propósito en Config.portada_imagen.
 */
const FOTO_PORTADA = "/hero.webp";

/**
 * Cuánto se espera a Mercado Pago (cuotas) y a Mercado Libre (opiniones) al
 * armar la portada. Son datos para mostrar: si tardan, la portada sale sin
 * ellos y la consulta queda en cache para la próxima.
 *
 * Mercado Libre tiene más margen: cada 6 horas hay que renovar el token y
 * volver a preguntar todo, y al regenerar la portada Next espera el dato
 * nuevo en vez de usar el viejo. Nadie espera por esto: mientras tanto se
 * sigue sirviendo la portada anterior.
 */
const ESPERA_CUOTAS_MS = 3_000;
const ESPERA_OPINIONES_MS = 9_000;

export default async function Home() {
  const [productos, config] = await Promise.all([getProductos(), getConfig()]);

  // El modelo estrella (Config.portada_producto, el Citrino si está vacío),
  // solo si es un anteojo publicado y le queda stock. Si no, la portada de
  // catálogo de siempre.
  const slug = slugDePortada(config.portadaProducto);
  const estrella = slug
    ? productos.find(
        (p) => p.slug === slug && esCategoriaDeAnteojos(p.categoria) && paresDisponibles(p.variantes) > 0
      )
    : undefined;

  if (!estrella) return <PortadaCatalogo productos={productos} config={config} />;
  return <PortadaEstrella estrella={estrella} productos={productos} config={config} />;
}

/**
 * La portada con un modelo estrella: se compra ahí mismo, en packs, con las
 * opiniones de Mercado Libre, las garantías y las preguntas frecuentes. Los
 * demás modelos y los complementos quedan más abajo.
 */
async function PortadaEstrella({
  estrella,
  productos,
  config,
}: {
  estrella: Producto;
  productos: Producto[];
  config: ConfigTienda;
}) {
  const anteojos = productos.filter((p) => esCategoriaDeAnteojos(p.categoria));
  const estuche =
    productos.find((p) => p.slug === ESTUCHE_PORTADA && p.variantes.some((v) => !v.agotada)) ?? null;

  const [tramos, cuotasAnteojos, mercadoLibre] = await Promise.all([
    getTramos(),
    // Para los textos generales ("6 cuotas sin interés en anteojos"): con el
    // anteojo más barato, como la portada de catálogo.
    conEspera(verificarCuotasPara(anteojos.map((p) => p.precio)), ESPERA_CUOTAS_MS, null),
    conEspera(datosDeMercadoLibre(), ESPERA_OPINIONES_MS, ultimoDeMercadoLibre()),
  ]);
  const opiniones = mercadoLibre?.opiniones ?? null;
  const reputacion = mercadoLibre?.reputacion ?? null;

  // Las cuotas de cada total que la compra puede mostrar, confirmadas una por
  // una con Mercado Pago: el anuncio de cada pack es cierto para ese monto.
  const totales = totalesPosibles({
    precio: estrella.precio,
    tramos,
    categoria: estrella.categoria,
    cuponPorcentaje: CUPON_BIENVENIDA.porcentaje,
    extra: estuche ? { precio: estuche.precio, categoria: estuche.categoria } : null,
  });
  const verificadas = await conEspera(
    Promise.all(totales.map(async (total) => [String(total), await verificarCuotas(total)] as const)),
    ESPERA_CUOTAS_MS,
    []
  );
  const cuotasPorTotal: Record<string, CuotasVerificadas> = {};
  for (const [total, cuotas] of verificadas) if (cuotas) cuotasPorTotal[total] = cuotas;

  const envioGratisTexto = formatearPrecio(config.envioGratisDesde);
  const caracteristicas = caracteristicasDe(estrella);
  const otrosAnteojos = anteojos.filter((p) => p.id !== estrella.id);
  const complementos = productos.filter((p) => !esCategoriaDeAnteojos(p.categoria));
  const seccionesComplementos = categoriasConProductos(productos).filter((c) => !esCategoriaDeAnteojos(c.nombre));

  const titulo = config.portadaTitulo || "Anteojos Harper";
  const subtitulo = subtituloDeLaPortada(
    config.portadaSubtitulo,
    anteojos.map((p) => ({ confirmado: caracteristicasDe(p) !== null }))
  );

  const varianteInicial = estrella.variantes[indiceVarianteInicial(estrella)];

  return (
    <>
      {/* El mismo identificador que AddToCart y Purchase: el SKU del color
          con el que abre la compra. */}
      <EventoPixel
        evento="ViewContent"
        data={{
          content_ids: [varianteInicial?.sku ?? estrella.slug],
          content_type: "product",
          content_name: estrella.nombre,
          value: estrella.precio,
          currency: "ARS",
        }}
      />

      <CompraPortada
        producto={estrella}
        tramos={tramos}
        cuotasPorTotal={cuotasPorTotal}
        impuestos={config.impuestosNacionales}
        envioGratisDesde={config.envioGratisDesde}
        estuche={estuche}
        calificacion={opiniones ? { promedio: opiniones.promedio, total: opiniones.total } : null}
        garantias={garantiasDePortada({
          diasArrepentimiento: DIAS_ARREPENTIMIENTO,
          diasCambio: DIAS_CAMBIO,
          mesesGarantia: MESES_GARANTIA,
          envioGratisDesde: config.envioGratisDesde,
          envioGratisTexto,
        })}
        whatsapp={config.whatsapp || null}
      />

      <Opiniones opiniones={opiniones} reputacion={reputacion} />

      <ComoComprar
        pasos={pasosDeCompra({
          cuotas: cuotasAnteojos,
          nombreMarcas: NOMBRE_MARCAS,
          porcentajeDineroMP: PORCENTAJE_DINERO_MP,
          envioGratisDesde: config.envioGratisDesde,
          envioGratisTexto,
          diasCambio: DIAS_CAMBIO,
        })}
      />

      {/* La foto de la marca, como respiro entre la compra y el catálogo. */}
      <section className="hero hero--banda">
        <Image
          src={config.portadaImagen || FOTO_PORTADA}
          alt=""
          fill
          sizes="100vw"
          style={{ objectFit: "cover", objectPosition: "52% 28%" }}
        />
        <div className="hero__velo" aria-hidden="true" />
        <div className="contenedor hero__cuerpo">
          <div className="hero__contenido">
            <h2 className="hero__titulo">{titulo}</h2>
            {subtitulo ? <p className="hero__texto">{subtitulo}</p> : null}
            {otrosAnteojos.length > 0 ? (
              <a href="#modelos" className="boton hero__boton">
                Ver todos los modelos
              </a>
            ) : null}
          </div>
        </div>
      </section>

      {otrosAnteojos.length > 0 ? (
        <section id="modelos" className="contenedor seccion">
          <div className="seccion__cabecera">
            <h2 className="titulo titulo--chico">Otros modelos</h2>
            <Link href={rutaDeCategoria(estrella.categoria)} className="label enlace-verde">
              Ver todo
            </Link>
          </div>
          <GrillaProductos productos={otrosAnteojos} animar />
        </section>
      ) : null}

      {complementos.length > 0 ? (
        <section className="contenedor seccion seccion--secundaria">
          <Revelar>
            <div className="seccion__cabecera">
              <div className="pila" style={{ gap: "0.4rem" }}>
                <span className="label">Complementos</span>
                <h2 className="titulo titulo--chico">{seccionesComplementos.map((c) => c.nombre).join(" y ")}</h2>
              </div>
              <nav aria-label="Complementos" style={{ display: "flex", gap: "1.25rem" }}>
                {seccionesComplementos.map((c) => (
                  <Link key={c.slug} href={`/${c.slug}`} className="label enlace-verde">
                    {c.nombre}
                  </Link>
                ))}
              </nav>
            </div>
          </Revelar>
          <GrillaProductos productos={complementos} compacta animar />
        </section>
      ) : null}

      <PreguntasFrecuentes
        preguntas={preguntasDePortada({
          incluye: estrella.incluye,
          caracteristicas: caracteristicas?.lista ?? null,
          cuotas: cuotasAnteojos,
          nombreMarcas: NOMBRE_MARCAS,
          envioGratisDesde: config.envioGratisDesde,
          envioGratisTexto,
          hayWhatsapp: Boolean(config.whatsapp),
          diasArrepentimiento: DIAS_ARREPENTIMIENTO,
          diasCambio: DIAS_CAMBIO,
          mesesGarantia: MESES_GARANTIA,
          cupon: CUPON_BIENVENIDA,
          porcentajeDineroMP: PORCENTAJE_DINERO_MP,
        })}
      />
    </>
  );
}

/** La portada de catálogo: el hero de la marca y una grilla por categoría. */
async function PortadaCatalogo({ productos, config }: { productos: Producto[]; config: ConfigTienda }) {
  // Una sección por cada categoría de anteojos con productos (hoy, Anteojos;
  // mañana también de sol, Clip-On o de receta), y los complementos juntos al
  // final: son secundarios en la portada.
  const categorias = categoriasConProductos(productos);
  const seccionesAnteojos = categorias
    .filter((c) => esCategoriaDeAnteojos(c.nombre))
    .map((c) => ({ ...c, productos: productos.filter((p) => p.categoria === c.nombre) }));
  const deAnteojos = seccionesAnteojos.flatMap((s) => s.productos);
  const complementos = productos.filter((p) => !esCategoriaDeAnteojos(p.categoria));
  const seccionesComplementos = categorias.filter((c) => !esCategoriaDeAnteojos(c.nombre));

  const titulo = config.portadaTitulo || "Anteojos Harper";
  // Qué vendemos, en una frase, sin afirmar nada que no esté confirmado.
  const subtitulo = subtituloDeLaPortada(
    config.portadaSubtitulo,
    deAnteojos.map((p) => ({ confirmado: caracteristicasDe(p) !== null }))
  );

  // Las cuotas se anuncian solo si Mercado Pago las confirma para el anteojo
  // más barato publicado, y se dice que son en anteojos: los complementos
  // cuestan menos que el mínimo de la promoción y ahí las cuotas tienen interés.
  const cuotas = await verificarCuotasPara(deAnteojos.map((p) => p.precio));
  const confianza = mensajesDeConfianza(config, cuotas, "en anteojos");

  return (
    <>
      {/* Hero editorial: la foto a sangre, con el texto y el botón apoyados en
          el tercio inferior. La cara está arriba y queda siempre libre. */}
      <section className="hero">
        <Image
          src={config.portadaImagen || FOTO_PORTADA}
          alt=""
          fill
          priority
          sizes="100vw"
          // El rostro está en el centro, arriba: al recortar para celular se
          // conserva esa zona.
          style={{ objectFit: "cover", objectPosition: "52% 28%" }}
        />
        <div className="hero__velo" aria-hidden="true" />
        <div className="contenedor hero__cuerpo">
          <div className="hero__contenido surge">
            <h1 className="hero__titulo">{titulo}</h1>
            {subtitulo ? <p className="hero__texto">{subtitulo}</p> : null}
            <a href="#anteojos" className="boton hero__boton">
              Comprar anteojos
            </a>
          </div>
        </div>
      </section>

      <div className="contenedor">
        <MensajesConfianza mensajes={confianza} variante="tira" />
      </div>

      {seccionesAnteojos.map((seccion, i) => (
        // La primera sección es a la que lleva "Comprar anteojos".
        <section key={seccion.slug} id={i === 0 ? "anteojos" : seccion.slug} className="contenedor seccion">
          <div className="seccion__cabecera">
            <h2 className="titulo">{seccion.nombre}</h2>
            <Link href={`/${seccion.slug}`} className="label enlace-verde">
              Ver todo
            </Link>
          </div>
          {/* Sin animación de aparición: es lo que vino a ver el visitante y
              tiene que estar ahí aunque el JavaScript tarde. En la primera se
              precargan las cuatro fotos que entran en la primera pantalla. */}
          <GrillaProductos productos={seccion.productos} precargar={i === 0 ? 4 : 0} />
        </section>
      ))}

      {complementos.length > 0 ? (
        <section className="contenedor seccion seccion--secundaria">
          <Revelar>
            <div className="seccion__cabecera">
              <div className="pila" style={{ gap: "0.4rem" }}>
                <span className="label">Complementos</span>
                <h2 className="titulo titulo--chico">
                  {seccionesComplementos.map((c) => c.nombre).join(" y ")}
                </h2>
              </div>
              <nav aria-label="Complementos" style={{ display: "flex", gap: "1.25rem" }}>
                {seccionesComplementos.map((c) => (
                  <Link key={c.slug} href={`/${c.slug}`} className="label enlace-verde">
                    {c.nombre}
                  </Link>
                ))}
              </nav>
            </div>
          </Revelar>
          <GrillaProductos productos={complementos} compacta animar />
        </section>
      ) : null}

      {productos.length === 0 ? (
        <section className="contenedor" style={{ paddingBlock: "5rem" }}>
          <h2 className="titulo">Catálogo en preparación</h2>
          <p className="apagado" style={{ marginTop: "1rem", maxWidth: "34rem" }}>
            Cargá los productos y sus colores en Airtable y aparecen acá
            automáticamente.
          </p>
        </section>
      ) : null}
    </>
  );
}
