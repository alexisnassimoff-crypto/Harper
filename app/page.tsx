import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import GrillaProductos from "@/components/GrillaProductos";
import MensajesConfianza from "@/components/MensajesConfianza";
import Revelar from "@/components/Revelar";
import { getProductos } from "@/lib/catalogo";
import { getConfig } from "@/lib/config";
import { mensajesDeConfianza } from "@/lib/confianza";
import { DESCRIPCION_SITIO, SUBTITULO_PORTADA, TITULO_SITIO } from "@/lib/portada";

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

  const anteojos = productos.filter((p) => p.categoria === "Anteojos");
  // Los complementos van juntos y después: son secundarios en la portada.
  const complementos = productos.filter((p) => p.categoria !== "Anteojos");

  const titulo = config.portadaTitulo || "Anteojos Harper";
  // Qué vendemos, en una frase. Config.portada_subtitulo lo reemplaza si se carga.
  const subtitulo = config.portadaSubtitulo || SUBTITULO_PORTADA;

  const confianza = mensajesDeConfianza(config);

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
            <p className="hero__texto">{subtitulo}</p>
            <a href="#anteojos" className="boton hero__boton">
              Comprar anteojos
            </a>
          </div>
        </div>
      </section>

      <div className="contenedor">
        <MensajesConfianza mensajes={confianza} variante="tira" />
      </div>

      {anteojos.length > 0 ? (
        <section id="anteojos" className="contenedor seccion">
          <div className="seccion__cabecera">
            <h2 className="titulo">Anteojos</h2>
            <Link href="/anteojos" className="label enlace-verde">
              Ver todo
            </Link>
          </div>
          {/* Sin animación de aparición: es lo que vino a ver el visitante y
              tiene que estar ahí aunque el JavaScript tarde. Se precargan las
              cuatro fotos porque las cuatro entran en la primera pantalla. */}
          <GrillaProductos productos={anteojos} precargar={4} />
        </section>
      ) : null}

      {complementos.length > 0 ? (
        <section className="contenedor seccion seccion--secundaria">
          <Revelar>
            <div className="seccion__cabecera">
              <div className="pila" style={{ gap: "0.4rem" }}>
                <span className="label">Complementos</span>
                <h2 className="titulo titulo--chico">Estuches y paños</h2>
              </div>
              <nav aria-label="Complementos" style={{ display: "flex", gap: "1.25rem" }}>
                <Link href="/estuches" className="label enlace-verde">
                  Estuches
                </Link>
                <Link href="/panos" className="label enlace-verde">
                  Paños
                </Link>
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
