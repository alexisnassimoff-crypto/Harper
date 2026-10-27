import Link from "next/link";
import { IconoConfianza } from "@/components/MensajesConfianza";
import type { Garantia, Paso, Pregunta } from "@/lib/portada";

/**
 * Las piezas de texto de la portada: las garantías (debajo del botón de
 * compra), cómo es comprar y las preguntas frecuentes. Los textos los arma lib/portada.ts con datos que ya
 * son ciertos en la tienda; acá solo se dibujan.
 */

export function Garantias({ garantias }: { garantias: Garantia[] }) {
  return (
    <ul className="garantias" aria-label="Garantías">
      {garantias.map((g) => (
        <li key={g.clave} className="garantia">
          <span className="garantia__icono" aria-hidden="true">
            <IconoConfianza clave={g.clave} />
          </span>
          <span className="pila" style={{ gap: "0.25rem" }}>
            <span className="garantia__titulo">{g.titulo}</span>
            <span className="garantia__texto">
              {g.texto}{" "}
              {g.href ? (
                <Link href={g.href} className="enlace-verde">
                  Ver más
                </Link>
              ) : null}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function ComoComprar({ pasos }: { pasos: Paso[] }) {
  return (
    <section className="contenedor seccion como-comprar" aria-labelledby="como-comprar-titulo">
      <div className="pila" style={{ gap: "0.4rem" }}>
        <span className="label">Cómo comprar</span>
        <h2 id="como-comprar-titulo" className="titulo titulo--chico">
          Comprar en Harper es simple
        </h2>
      </div>
      <ol className="pasos">
        {pasos.map((p, i) => (
          <li key={p.titulo} className="paso">
            <span className="paso__numero" aria-hidden="true">
              {i + 1}
            </span>
            <span className="pila" style={{ gap: "0.25rem" }}>
              <span className="paso__titulo">{p.titulo}</span>
              <span className="paso__texto">{p.texto}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function PreguntasFrecuentes({ preguntas }: { preguntas: Pregunta[] }) {
  if (preguntas.length === 0) return null;

  return (
    <section className="contenedor seccion preguntas" aria-labelledby="preguntas-titulo">
      <div className="pila" style={{ gap: "0.4rem" }}>
        <span className="label">Preguntas frecuentes</span>
        <h2 id="preguntas-titulo" className="titulo titulo--chico">
          Antes de comprar
        </h2>
      </div>
      <div className="preguntas__lista">
        {preguntas.map((p) => (
          <details key={p.pregunta} className="pregunta">
            <summary className="pregunta__titulo">{p.pregunta}</summary>
            <p className="pregunta__respuesta">
              {p.respuesta}{" "}
              {p.enlace ? (
                <Link href={p.enlace.href} className="enlace-verde">
                  {p.enlace.texto}
                </Link>
              ) : null}
            </p>
          </details>
        ))}
      </div>
    </section>
  );
}
