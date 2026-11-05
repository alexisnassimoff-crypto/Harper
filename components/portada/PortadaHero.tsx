import Image from "next/image";

/**
 * La primera pantalla (Ale, 05/11/2026): Harper como marca de anteojos de
 * diseño. Una foto protagonista (un anteojo de cerca, sin caras), el título,
 * una línea y un solo botón: «Explorar anteojos», que baja a Comprar.
 */
export default function PortadaHero({
  etiqueta,
  titulo,
  bajada,
  boton,
  foto,
}: {
  etiqueta: string;
  titulo: string;
  bajada: string | null;
  boton: string;
  foto: { src: string; alt: string } | null;
}) {
  return (
    <section id="vitrina-portada" className="inicio-hero" aria-labelledby="inicio-titulo">
      {foto ? (
        <div className="inicio-hero__foto">
          <Image src={foto.src} alt={foto.alt} fill priority sizes="(max-width: 768px) 100vw, 58vw" className="foto-multiplicada" />
        </div>
      ) : null}
      <div className="inicio-hero__texto">
        <p className="etiqueta-mono">{etiqueta}</p>
        <h1 id="inicio-titulo" className="inicio-hero__titulo">
          {titulo}
        </h1>
        {bajada ? <p className="inicio-hero__bajada">{bajada}</p> : null}
        <a href="#los-modelos" className="boton inicio-hero__boton">
          {boton}
        </a>
      </div>
    </section>
  );
}
