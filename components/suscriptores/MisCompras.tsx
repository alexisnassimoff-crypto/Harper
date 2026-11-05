import Image from "next/image";
import Link from "next/link";
import { precio as formatearPrecio } from "@/lib/formato";
import { etapasDeCompra, seguimientoDe, type Compra } from "@/lib/mis-compras";
import { fechaArgentina, fechaLegible } from "@/lib/suscriptores";
import { TEXTOS } from "@/lib/textos";
import { enlaceWhatsApp } from "@/lib/whatsapp";
import CopiarTexto from "./CopiarTexto";

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
 *
 * El seguimiento (Ale, 05/11/2026), solo con lo que dice Airtable: el
 * recorrido Pago confirmado → En preparación → Enviado → Entregado según el
 * Estado del pedido (sin fechas ni pasos inventados), el aviso del pago en
 * revisión o de la cancelación, el número de seguimiento para copiar y
 * «Seguir mi envío» solo si el campo trae un enlace de un operador conocido.
 * Sin seguimiento, una consulta discreta por WhatsApp con el número de pedido.
 */
export default function MisCompras({
  compras,
  email,
  whatsapp,
}: {
  compras: Compra[] | null;
  email: string;
  /** El número de WhatsApp de la tienda (Config), para armar cada consulta. */
  whatsapp: string | null;
}) {
  // Sin número ni enlace de seguimiento, el pedido lleva su propia consulta por WhatsApp.
  const conConsulta = (c: Compra) => {
    const s = seguimientoDe(c.tracking);
    return !s.numero && !s.enlace;
  };
  const ayuda = enlaceWhatsApp(whatsapp, T.consultarMensaje(""));
  return (
    <section id="mis-compras" className="mis-compras" aria-labelledby="mis-compras-titulo">
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
          {compras.map((c) => {
            const etapas = etapasDeCompra(c.estado);
            const seguimiento = seguimientoDe(c.tracking);
            const consulta = conConsulta(c) ? enlaceWhatsApp(whatsapp, T.consultarMensaje(c.numero)) : null;
            return (
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

                {etapas ? (
                  <ol className="compra__etapas" aria-label={`Estado del pedido: ${T.estados[c.estado]}`}>
                    {etapas.map((e) => (
                      <li key={e.etapa} className="compra__etapa" data-paso={e.paso} aria-current={e.paso === "actual" ? "step" : undefined}>
                        <span className="compra__punto" aria-hidden="true" />
                        <span className="compra__etapa-texto">{T.etapas[e.etapa]}</span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="compra__nota" data-estado={c.estado}>
                    {c.estado === "cancelado" ? T.cancelado : T.revision}
                  </p>
                )}

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

                {seguimiento.numero || seguimiento.enlace ? (
                  <div className="compra__seguimiento">
                    {seguimiento.numero ? (
                      <p className="compra__tracking">
                        <span className="compra__tracking-etiqueta">{T.seguimiento}</span>
                        <span className="compra__tracking-numero">{seguimiento.numero}</span>
                        <CopiarTexto texto={seguimiento.numero} etiqueta={T.copiar} listo={T.copiado} que={T.seguimiento.toLowerCase()} />
                      </p>
                    ) : null}
                    {seguimiento.enlace ? (
                      <a href={seguimiento.enlace} target="_blank" rel="noopener noreferrer" className="boton boton--chico boton--contorno compra__seguir">
                        {T.seguir}
                      </a>
                    ) : null}
                  </div>
                ) : consulta ? (
                  <p className="compra__consulta">
                    <a href={consulta} target="_blank" rel="noopener noreferrer">
                      {T.consultar}
                    </a>
                  </p>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}

      {/* La ayuda general, solo si algún pedido no tiene ya su consulta (los que tienen seguimiento). */}
      {ayuda && compras && compras.some((c) => !conConsulta(c)) ? (
        <p className="mis-compras__ayuda">
          <a href={ayuda} target="_blank" rel="noopener noreferrer">
            {T.ayuda}
          </a>
        </p>
      ) : null}
    </section>
  );
}
