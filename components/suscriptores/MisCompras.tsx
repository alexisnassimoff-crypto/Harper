import Image from "next/image";
import Link from "next/link";
import { precio as formatearPrecio } from "@/lib/formato";
import type { Compra } from "@/lib/mis-compras";
import { fechaArgentina, fechaLegible } from "@/lib/suscriptores";
import { TEXTOS } from "@/lib/textos";

const T = TEXTOS.suscriptores.cuenta.compras;

/** "2026-11-03T15:00:00.000Z" → "03/11/2026", el día en Buenos Aires. */
const diaDe = (iso: string | null) => {
  if (!iso) return "";
  const fecha = new Date(iso);
  return Number.isNaN(fecha.getTime()) ? "" : fechaLegible(fechaArgentina(fecha));
};

/**
 * «Mis compras» en Mi cuenta (Ale, 05/11/2026): cada pedido en una tarjeta,
 * con su número, la fecha, el estado, los productos, el envío y el total.
 * Las compras llegan armadas del servidor (lib/mis-compras.ts), solo las del
 * mail verificado de la cuenta. `compras` null = no se pudieron leer.
 */
export default function MisCompras({ compras, email, whatsapp }: { compras: Compra[] | null; email: string; whatsapp: string | null }) {
  return (
    <section className="mis-compras" aria-labelledby="mis-compras-titulo">
      <h2 id="mis-compras-titulo" className="mis-compras__titulo">
        {T.titulo}
      </h2>
      <p className="mis-compras__bajada">{T.bajada(email)}</p>

      {compras === null ? (
        <p className="mis-compras__aviso" role="status">
          {T.error}
        </p>
      ) : compras.length === 0 ? (
        <p className="mis-compras__aviso">{T.vacio}</p>
      ) : (
        <ol className="mis-compras__lista">
          {compras.map((c) => (
            <li key={c.id} className="compra">
              <div className="compra__cabeza">
                <div className="compra__dato">
                  {c.numero ? <p className="compra__numero">{c.numero}</p> : null}
                  <p className="compra__fecha">{diaDe(c.fecha)}</p>
                </div>
                <span className="compra__estado" data-estado={c.estado}>
                  {T.estados[c.estado]}
                </span>
              </div>

              {c.items.length > 0 ? (
                <ul className="compra__items">
                  {c.items.map((i, k) => (
                    <li key={`${c.id}-${k}`} className="compra__item">
                      <span className="compra__foto" aria-hidden="true">
                        {i.foto ? <Image src={i.foto} alt="" fill sizes="56px" className="foto-multiplicada" /> : null}
                      </span>
                      <span className="compra__producto">
                        {i.slug ? <Link href={`/producto/${i.slug}`}>{i.nombre}</Link> : i.nombre}
                        <small>{[i.color, i.cantidad > 1 ? `× ${i.cantidad}` : null].filter(Boolean).join(" · ")}</small>
                      </span>
                      <span className="compra__monto">{formatearPrecio(i.subtotal)}</span>
                    </li>
                  ))}
                </ul>
              ) : null}

              <div className="compra__pie">
                <span className="compra__envio">{c.envio > 0 ? T.envio(formatearPrecio(c.envio)) : T.envioSinCargo}</span>
                <span className="compra__total">
                  <span>{T.total}</span> {formatearPrecio(c.total)}
                </span>
              </div>
              {c.tracking ? (
                <p className="compra__seguimiento">
                  {T.seguimiento}: <span>{c.tracking}</span>
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      )}

      {compras && compras.length > 0 && whatsapp ? (
        <p className="mis-compras__ayuda">
          <a href={whatsapp} target="_blank" rel="noopener noreferrer">
            {T.ayuda}
          </a>
        </p>
      ) : null}
    </section>
  );
}
