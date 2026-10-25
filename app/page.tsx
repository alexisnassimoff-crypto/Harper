import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import GrillaProductos from "@/components/GrillaProductos";
import MensajesConfianza from "@/components/MensajesConfianza";
import Revelar from "@/components/Revelar";
import { caracteristicasDe } from "@/lib/caracteristicas";
import { getProductos } from "@/lib/catalogo";
import { categoriasConProductos, esCategoriaDeAnteojos } from "@/lib/categorias";
import { getConfig } from "@/lib/config";
import { mensajesDeConfianza } from "@/lib/confianza";
import { verificarCuotasPara } from "@/lib/cuotas-servidor";
import { DESCRIPCION_SITIO, subtituloDeLaPortada, TITULO_SITIO } from "@/lib/portada";

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

export default async function Home() {
  const [productos, config] = await Promise.all([getProductos(), getConfig()]);

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
