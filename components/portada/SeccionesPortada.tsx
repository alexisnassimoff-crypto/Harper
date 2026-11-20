import Link from "next/link";
import { IconoConfianza } from "@/components/MensajesConfianza";
import { IconoCondicion } from "@/components/producto/InfoFicha";
import { TEXTOS } from "@/lib/textos";
import type { Garantia, Paso, Pregunta } from "@/lib/portada";

/**
 * Las piezas de texto de la portada: las garantías (debajo del botón de
 * compra), el bloque de confianza, cómo es comprar y las preguntas
 * frecuentes. Los textos los arman lib/portada.ts y lib/confianza.ts con
 * datos que ya son ciertos en la tienda; acá solo se dibujan.
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

/**
 * Un renglón de «Comprá tranquilo»: el envío, el pago, las cuotas, la
 * devolución o el asesoramiento, cada uno con su enlace.
 */
export type ItemConfianza = {
  clave: "envio" | "pago" | "cuotas" | "devolucion" | "whatsapp" | "credito";
  texto: string;
  detalle: string | null;
  /** Una aclaración más, debajo del detalle (cómo se cuenta el mínimo del envío). */
  nota?: string | null;
  href: string;
  /** WhatsApp abre en otra pestaña. */
  externo?: boolean;
};

/**
 * La confianza, en un bloque compacto (Ale, 05/11/2026), con los mismos datos
 * que la ficha (lib/confianza.ts, Config y Mercado Pago).
 *
 * Ale, 18/11/2026: como la portada no lleva la barra de anuncios, las
 * condiciones de compra se dicen acá. Va en dos filas: arriba, lo que tiene
 * que ver con la plata (el envío gratis con sus dos mínimos, el 10 % por
 * pagar con el dinero de la cuenta de Mercado Pago y las cuotas, si Mercado
 * Pago las confirmó); abajo, la devolución y el asesoramiento. En el celular
 * es una sola lista. Una fila vacía no se dibuja.
 */
/** El Crédito Harper: una flecha que vuelve, para «de vuelta en tu próxima compra». */
function IconoCredito() {
  return (
    <svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" />
      <path d="M4.5 3.8v3.6h3.6" />
      <path d="M12 8.2v7.6M14.2 9.8c-.4-.7-1.2-1.1-2.2-1.1-1.3 0-2.2.7-2.2 1.6 0 2.2 4.6 1.2 4.6 3.5 0 .9-1 1.7-2.4 1.7-1 0-1.9-.4-2.3-1.2" />
    </svg>
  );
}

export function ConfianzaPortada({ filas }: { filas: ItemConfianza[][] }) {
  const conItems = filas.filter((fila) => fila.length > 0);
  if (conItems.length === 0) return null;
  return (
    <section className="confianza-inicio" aria-label={TEXTOS.inicio.confianza.titulo}>
      {conItems.map((fila, n) => (
        <ul
          key={fila[0].clave}
          className="contenedor confianza-inicio__lista"
          // La línea que separa una fila de la anterior (en el celular, un renglón del anterior).
          style={n > 0 ? { borderTop: "1px solid var(--borde)" } : undefined}
        >
          {fila.map((c) => {
            const contenido = (
              <>
                <span className="confianza-inicio__icono" aria-hidden="true">
                  {c.clave === "cuotas" ? (
                    <IconoConfianza clave="cuotas" />
                  ) : c.clave === "credito" ? (
                    <IconoCredito />
                  ) : (
                    <IconoCondicion clave={c.clave} />
                  )}
                </span>
                <span className="confianza-inicio__texto">
                  <strong>{c.texto}</strong>
                  {c.detalle ? <span>{c.detalle}</span> : null}
                  {c.nota ? <span>{c.nota}</span> : null}
                </span>
              </>
            );
            return (
              <li key={c.clave}>
                {c.externo ? (
                  <a href={c.href} target="_blank" rel="noopener noreferrer" className="confianza-inicio__item">
                    {contenido}
                  </a>
                ) : (
                  <Link href={c.href} className="confianza-inicio__item">
                    {contenido}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      ))}
    </section>
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
