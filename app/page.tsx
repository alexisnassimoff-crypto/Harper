import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import GrillaProductos from "@/components/GrillaProductos";
import MensajesConfianza from "@/components/MensajesConfianza";
import Revelar from "@/components/Revelar";
import { getProductos } from "@/lib/catalogo";
import { getConfig } from "@/lib/config";
import { mensajesDeConfianza } from "@/lib/confianza";
import { DESCRIPCION_SITIO, TITULO_SITIO, subtituloPorDefecto } from "@/lib/portada";
import { indiceVarianteInicial, rutaDeVariante } from "@/lib/variantes";

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

export default async function Home() {
  const [productos, config] = await Promise.all([getProductos(), getConfig()]);

  const anteojos = productos.filter((p) => p.categoria === "Anteojos");
  // Los complementos van juntos y después: son secundarios en la portada.
  const complementos = productos.filter((p) => p.categoria !== "Anteojos");

  const coloresMaximo = anteojos.reduce((max, p) => Math.max(max, p.variantes.length), 0);
  const titulo = config.portadaTitulo || "Anteojos Harper";
  const subtitulo =
    config.portadaSubtitulo || subtituloPorDefecto(anteojos.length, coloresMaximo);

  const confianza = mensajesDeConfianza(config);

  // El producto que protagoniza el hero cuando no hay una foto aprobada en
  // Config: el primer anteojo del catálogo, en su primer color con stock, con
  // la foto en tres cuartos si la tiene. Es una foto del catálogo —ya
  // publicada— así que muestra exactamente lo que se vende.
  const protagonista = anteojos[0] ?? null;
  const varianteHero = protagonista
    ? protagonista.variantes[indiceVarianteInicial(protagonista)]
    : null;
  const fotoHero = varianteHero?.fotos[1] ?? varianteHero?.fotos[0] ?? null;

  const texto = (
    <div className="hero__contenido surge">
      <h1 className="hero__titulo">{titulo}</h1>
      <p className="hero__texto">{subtitulo}</p>
      <a href="#anteojos" className="boton hero__boton">
        Ver anteojos
      </a>
    </div>
  );

  return (
    <>
      {/* Hero compacto: en celular ocupa menos de media pantalla, así el
          catálogo asoma sin scrollear. Un solo botón, que lleva a la grilla. */}
      {config.portadaImagen ? (
        // Foto editorial aprobada y cargada en Config: a sangre, con velo.
        <section className="hero hero--foto">
          <Image
            src={config.portadaImagen}
            alt=""
            fill
            priority
            sizes="100vw"
            style={{ objectFit: "cover", objectPosition: "center 30%" }}
          />
          <div className="hero__velo" aria-hidden="true" />
          <div className="contenedor hero__cuerpo">{texto}</div>
        </section>
      ) : (
        // Sin foto aprobada: el producto real sobre el fondo de la marca.
        <section className="hero hero--producto">
          <div className="contenedor hero__grilla">
            {texto}
            {protagonista && varianteHero && fotoHero ? (
              <Link
                href={rutaDeVariante(protagonista, indiceVarianteInicial(protagonista))}
                className="hero__producto surge surge-1"
                aria-label={`Ver ${protagonista.nombre}`}
              >
                <Image
                  src={fotoHero}
                  alt={`${protagonista.nombre} — ${varianteHero.color}`}
                  fill
                  priority
                  sizes="(max-width: 48rem) 92vw, 44vw"
                  style={{ objectFit: "contain" }}
                />
              </Link>
            ) : null}
          </div>
        </section>
      )}

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
