import Image from "next/image";

/**
 * La primera pantalla (Ale, 05/11/2026): Harper vende anteojos de diseño, y
 * se dice primero. Debajo, la frase de la marca en dos tiempos, una línea y un
 * solo botón: «Explorar anteojos», que baja a Comprar. La foto es un anteojo
 * real entero, de tres cuartos, con el logo en la patilla (sin caras).
 */
export default function PortadaHero({
  producto,
  frase,
  bajada,
  boton,
  foto,
}: {
  /** «Anteojos de diseño»: qué vende Harper, siempre a la vista. */
  producto: string;
  /** La frase en dos tiempos: la segunda va en verde. */
  frase: [string, string?];
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
        <h1 id="inicio-titulo" className="inicio-hero__titulo">
          <span className="inicio-hero__producto">{producto}</span>
          <span className="inicio-hero__frase">{frase[0]}</span>
          {frase[1] ? <span className="inicio-hero__frase inicio-hero__frase--acento">{frase[1]}</span> : null}
        </h1>
        {bajada ? <p className="inicio-hero__bajada">{bajada}</p> : null}
        <a href="#los-modelos" className="boton inicio-hero__boton">
          {boton}
        </a>
      </div>
    </section>
  );
}
