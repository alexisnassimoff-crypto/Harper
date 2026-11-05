import Link from "next/link";
import type { ReactNode } from "react";
import { IconoConfianza } from "@/components/MensajesConfianza";
import { medidasDeLaFicha, numerosDeLaPatilla, talleDe, TALLES, type Condicion } from "@/lib/ficha";
import { TEXTOS } from "@/lib/textos";
import type { Medidas } from "@/lib/tipos";
import { enlaceWhatsApp, mensajeTalleModelo } from "@/lib/whatsapp";

/**
 * Las partes informativas de la ficha (Plan Maestro, 04/11/2026), ordenadas
 * como en las tiendas de anteojos de referencia (Etnia Barcelona): arriba,
 * comprar; debajo, las condiciones a la vista y la información larga en
 * secciones que se abren de a una, para que en el celular no haya que
 * scrollear un muro de texto.
 */

const T = TEXTOS.ficha;

/** Una sección que se abre y se cierra, con el mismo estilo que las preguntas de la portada. */
export function Acordeon({
  id,
  titulo,
  extra,
  abierto = false,
  children,
}: {
  id?: string;
  titulo: string;
  /** Un dato corto al lado del título, visible con la sección cerrada (el talle, por ejemplo). */
  extra?: string | null;
  abierto?: boolean;
  children: ReactNode;
}) {
  return (
    <details id={id} className="pregunta ficha-acordeon" open={abierto || undefined}>
      <summary className="pregunta__titulo">
        <span>
          {titulo}
          {extra ? <span className="ficha-acordeon__extra"> · {extra}</span> : null}
        </span>
      </summary>
      <div className="ficha-acordeon__contenido">{children}</div>
    </details>
  );
}

/** Envío, devolución, cambios, garantía y pago, cada uno con su enlace a la vista. */
export function CondicionesCompra({ condiciones }: { condiciones: Condicion[] }) {
  if (condiciones.length === 0) return null;
  return (
    <section className="condiciones" aria-label={T.condiciones.titulo}>
      <ul className="condiciones__lista">
        {condiciones.map((c) => (
          <li key={c.clave} className="condiciones__item">
            <span className="condiciones__icono" aria-hidden="true">
              <IconoCondicion clave={c.clave} />
            </span>
            <span className="condiciones__texto">
              <span>{c.texto}</span>
              {c.detalle ? <small>{c.detalle}</small> : null}
              <Link href={c.href} className="condiciones__enlace">
                {c.enlace}
              </Link>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function IconoCondicion({ clave }: { clave: Condicion["clave"] | "whatsapp" }) {
  if (clave === "envio" || clave === "pago" || clave === "cambios") return <IconoConfianza clave={clave} />;
  if (clave === "whatsapp")
    return (
      <svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
        <path d="M4.5 19.5l1.2-3.6A8 8 0 1 1 8.4 18.6z" />
        <path d="M9 9.2c.3 2.6 2.2 4.6 4.8 5l1.1-1.2-1.6-.8-.8.7c-.9-.4-1.6-1.1-2-2l.7-.8-.8-1.6z" />
      </svg>
    );
  if (clave === "devolucion") return <IconoConfianza clave="cambios" />;
  // Garantía: un escudo con un tilde.
  return (
    <svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2.8l7.5 3v5.6c0 4.6-3.1 8.4-7.5 9.8-4.4-1.4-7.5-5.2-7.5-9.8V5.8z" />
      <path d="M8.7 12.2l2.3 2.3 4.4-4.6" />
    </svg>
  );
}

/** El dibujo de un anteojo de frente: A calibre, B puente, C alto, D frente. */
function DibujoMedidas() {
  return (
    <svg className="medidas-dibujo" viewBox="0 0 320 150" role="img" aria-label={T.talle.dibujo}>
      <g fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        {/* Cristales y puente */}
        <rect x="34" y="48" width="104" height="70" rx="26" />
        <rect x="182" y="48" width="104" height="70" rx="26" />
        <path d="M138 66c10-9 34-9 44 0" />
        {/* Bisagras */}
        <path d="M34 62H18M286 62h16" />
      </g>
      <g stroke="var(--verde)" strokeWidth="1.5" fill="var(--verde)" fontSize="13" fontFamily="inherit">
        {/* D: frente */}
        <path d="M18 24h284M18 18v12M302 18v12" fill="none" />
        <text x="160" y="16" textAnchor="middle" stroke="none">D</text>
        {/* A: calibre */}
        <path d="M34 134h104M34 128v12M138 128v12" fill="none" />
        <text x="86" y="148" textAnchor="middle" stroke="none">A</text>
        {/* B: puente */}
        <path d="M138 40h44M138 34v12M182 34v12" fill="none" />
        <text x="160" y="56" textAnchor="middle" stroke="none">B</text>
        {/* C: alto */}
        <path d="M300 48v70M294 48h12M294 118h12" fill="none" />
        <text x="312" y="88" textAnchor="middle" stroke="none">C</text>
      </g>
    </svg>
  );
}

/** Las medidas del modelo, el talle y la guía para elegirlo. */
export function MedidasYTalle({
  medidas,
  modelo,
  whatsapp,
}: {
  medidas: Medidas | null;
  modelo: string;
  whatsapp: string | null;
}) {
  const filas = medidasDeLaFicha(medidas);
  const patilla = numerosDeLaPatilla(medidas);
  const talle = talleDe(medidas);
  const consulta = enlaceWhatsApp(whatsapp, mensajeTalleModelo(modelo));

  return (
    <div className="medidas-talle">
      {filas.length > 0 ? (
        <>
          <DibujoMedidas />
          <dl className="medidas-tabla">
            {filas.map((f) => (
              <div key={f.nombre} className="medidas-tabla__fila">
                <dt>
                  {f.letra ? <span className="medidas-tabla__letra">{f.letra}</span> : null}
                  {f.nombre}
                  <small>{f.ayuda}</small>
                </dt>
                <dd>{f.valor} mm</dd>
              </div>
            ))}
          </dl>
          {patilla ? (
            <p className="medidas-talle__patilla">
              En la patilla dice <strong>{patilla}</strong>.
            </p>
          ) : null}
        </>
      ) : (
        <p className="medidas-talle__vacio">{T.talle.sinMedidas}</p>
      )}

      <h3 className="medidas-talle__subtitulo">{T.talle.guiaTitulo}</h3>
      <ol className="medidas-talle__guia">
        {T.talle.guia.map((paso) => (
          <li key={paso}>{paso}</li>
        ))}
      </ol>

      <h3 className="medidas-talle__subtitulo">{T.talle.tallesTitulo}</h3>
      <ul className="medidas-talle__talles">
        {TALLES.map((t) => (
          <li key={t.talle} aria-current={t.talle === talle ? "true" : undefined}>
            <strong>{t.talle}</strong> {t.texto}
            {t.talle === talle ? <span className="medidas-talle__este"> · este modelo</span> : null}
          </li>
        ))}
      </ul>
      <p className="medidas-talle__nota">{T.talle.orientativo}</p>

      {consulta ? (
        <a href={consulta} target="_blank" rel="noopener noreferrer" className="medidas-talle__consulta">
          {T.talle.consultar}
        </a>
      ) : null}
    </div>
  );
}

/** Cómo funcionan los cristales fotocromáticos, en cuatro puntos. */
export function CristalesFotocromaticos() {
  return (
    <div className="cristales">
      <p>{T.cristales.bajada}</p>
      <dl className="cristales__puntos">
        {T.cristales.puntos.map((p) => (
          <div key={p.titulo}>
            <dt>{p.titulo}</dt>
            <dd>{p.texto}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
