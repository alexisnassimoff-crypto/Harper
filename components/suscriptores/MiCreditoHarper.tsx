import type { BilleteraCredito, MovimientoCredito } from "@/lib/credito-cuenta";
import { DIAS_PARA_LIBERAR_CREDITO, MESES_PARA_VENCER_CREDITO } from "@/lib/credito-harper";
import { precio as formatearPrecio } from "@/lib/formato";
import { fechaArgentina, fechaLegible } from "@/lib/suscriptores";
import { TEXTOS } from "@/lib/textos";

const T = TEXTOS.suscriptores.cuenta.credito;

/**
 * «Mi Crédito Harper» (paso 3): lo disponible, lo pendiente, lo que está en
 * revisión y un movimiento por pedido. Solo se muestra con
 * HARPER_CREDITO_ACTIVO=1. Va aparte del saldo de Suscriptores Harper, que
 * sigue con sus reglas. `billetera` null: no se pudo leer (nunca un $ 0).
 *
 * El vencimiento (Ale, 18/11/2026): cada crédito vence 6 meses después de
 * quedar disponible. Junto a lo disponible va el vencimiento más próximo; en
 * cada crédito disponible con algo sin usar, «Vence el …»; el que venció con
 * algo sin usar se ve «Vencido», con lo que se perdió. Todo sale de la
 * billetera del servidor (lib/credito-cuenta.ts, el mismo cálculo del
 * checkout): acá no se calcula ninguna fecha ni ningún importe. Un pendiente
 * cuyo día de liberación ya pasó (la tarea diaria lo retuvo para verificarlo)
 * no muestra una fecha pasada.
 *
 * Desde el 20/11/2026 hay un tercer tipo de movimiento, «devuelto»: lo que se
 * usó en una compra que se reembolsó entera vuelve a la cuenta como un crédito
 * aparte («Devuelto del pedido …»), con su día y su vencimiento. El uso de esa
 * compra se sigue viendo «Usado» y dice que lo usado volvió.
 *
 * `hoy` es el día en Buenos Aires ("AAAA-MM-DD"); por defecto, el de ahora.
 */
export default function MiCreditoHarper({ billetera, hoy = fechaArgentina(new Date()) }: { billetera: BilleteraCredito | null; hoy?: string }) {
  return (
    <section id="mi-credito" className="cuenta-suscriptor__credito" aria-labelledby="cuenta-credito-titulo">
      <h2 id="cuenta-credito-titulo" className="label">
        {T.titulo}
      </h2>
      <p className="apagado">{T.bajada(MESES_PARA_VENCER_CREDITO)}</p>
      {billetera === null ? (
        <p className="suscripcion__error" role="alert">
          {T.error}
        </p>
      ) : (
        <>
          <dl className="cuenta-suscriptor__numeros">
            <div className="cuenta-suscriptor__numero cuenta-suscriptor__numero--principal">
              <dt>{T.disponible}</dt>
              <dd>
                <span className="cuenta-suscriptor__monto">{formatearPrecio(billetera.disponible)}</span>
                <span className="cuenta-suscriptor__detalle">{T.disponibleDetalle}</span>
                {billetera.proximoVencimiento ? (
                  <span className="cuenta-suscriptor__detalle">
                    {T.proximoVencimiento(formatearPrecio(billetera.proximoVencimiento.monto), fechaLegible(billetera.proximoVencimiento.venceEl))}
                  </span>
                ) : null}
              </dd>
            </div>
            <div className="cuenta-suscriptor__numero">
              <dt>{T.pendiente}</dt>
              <dd>
                <span className="cuenta-suscriptor__monto">{formatearPrecio(billetera.pendiente)}</span>
                <span className="cuenta-suscriptor__detalle">{T.pendienteDetalle(DIAS_PARA_LIBERAR_CREDITO)}</span>
              </dd>
            </div>
            {billetera.enRevision > 0 ? (
              <div className="cuenta-suscriptor__numero">
                <dt>{T.enRevision}</dt>
                <dd>
                  <span className="cuenta-suscriptor__monto">{formatearPrecio(billetera.enRevision)}</span>
                  <span className="cuenta-suscriptor__detalle">{T.enRevisionDetalle}</span>
                </dd>
              </div>
            ) : null}
          </dl>

          <section className="cuenta-suscriptor__movimientos" aria-labelledby="cuenta-credito-movimientos">
            <h3 id="cuenta-credito-movimientos" className="label">
              {T.movimientos}
            </h3>
            {billetera.movimientos.length > 0 ? (
              <ul>
                {billetera.movimientos.map((m) =>
                  m.tipo === "uso" ? (
                    <li key={`uso-${m.pedido}`} className="cuenta-suscriptor__movimiento" data-estado={m.estado}>
                      <span className="cuenta-suscriptor__fecha">{m.fecha ? fechaLegible(m.fecha) : ""}</span>
                      <span className="cuenta-suscriptor__concepto">
                        {T.usadoEn(m.pedido)}
                        <small>{conDetalle(T.estado[m.estado], detalleDelUso(m))}</small>
                      </span>
                      <span className="cuenta-suscriptor__importe" data-signo="menos">
                        {`−${formatearPrecio(m.monto)}`}
                      </span>
                    </li>
                  ) : m.tipo === "devuelto" ? (
                    // Lo que se usó en una compra reembolsada entera y volvió a
                    // la cuenta (20/11/2026): un crédito aparte, con su propia
                    // key (la misma compra puede tener también su crédito
                    // ganado, anulado) y su vencimiento, como cualquier otro.
                    <li key={`devuelto-${m.pedido}`} className="cuenta-suscriptor__movimiento" data-estado={m.estado}>
                      <span className="cuenta-suscriptor__fecha">{m.fecha ? fechaLegible(m.fecha) : ""}</span>
                      <span className="cuenta-suscriptor__concepto">
                        {T.devueltoDe(m.pedido)}
                        <small>{conDetalle(T.estado[m.estado], detalleDelCredito(m, hoy))}</small>
                      </span>
                      <span className="cuenta-suscriptor__importe" data-signo="mas">
                        {`+${formatearPrecio(m.monto)}`}
                      </span>
                    </li>
                  ) : (
                    <li key={m.pedido} className="cuenta-suscriptor__movimiento" data-estado={m.estado}>
                      <span className="cuenta-suscriptor__fecha">{m.fecha ? fechaLegible(m.fecha) : ""}</span>
                      <span className="cuenta-suscriptor__concepto">
                        {T.concepto(m.pedido, m.porcentaje)}
                        <small>{conDetalle(T.estado[m.estado], detalleDelCredito(m, hoy))}</small>
                      </span>
                      <span className="cuenta-suscriptor__importe" data-signo={m.estado === "anulado" ? "anulado" : "mas"}>
                        {m.estado === "anulado" ? <s>{formatearPrecio(m.monto)}</s> : `+${formatearPrecio(m.monto)}`}
                      </span>
                    </li>
                  )
                )}
              </ul>
            ) : (
              <p className="apagado">{T.vacio}</p>
            )}
          </section>
        </>
      )}
    </section>
  );
}

/** «Disponible · Se liberó el …»; sin detalle, solo el estado (antes quedaba un « · » suelto). */
function conDetalle(estado: string, detalle: string): string {
  return detalle ? `${estado} · ${detalle}` : estado;
}

/**
 * El detalle de lo usado en una compra: apartado mientras se paga, en revisión
 * (un contracargo, o una fila que Harper tiene que corregir) o devuelto a la
 * cuenta porque esa compra se reembolsó entera (20/11/2026: se sigue viendo
 * «Usado» y justo arriba está el crédito que volvió).
 */
function detalleDelUso(m: MovimientoCredito): string {
  if (m.estado === "reservado") return T.reservadoNota;
  if (m.devuelto) return T.usoDevuelto;
  return m.conGestionAbierta ? T.usoEnRevision : "";
}

/**
 * El detalle de un crédito, ganado o devuelto, según su estado (Ale,
 * 18/11/2026: con el vencimiento). Las fechas y lo que queda salen de la
 * billetera del servidor (lib/credito-cuenta.ts): desde el 20/11/2026 uno al
 * que no le queda nada se ve «Usado» (lo usó entero) o «Apartado» (lo que le
 * quedaba lo tomó una compra que todavía se está pagando), nunca «Disponible».
 * El ganado «se liberó»; el devuelto «volvió a tu cuenta». Uno devuelto que
 * Harper marcó a mano sin fecha no dice ni desde cuándo ni hasta cuándo.
 */
function detalleDelCredito(m: MovimientoCredito, hoy: string): string {
  const desde = m.disponibleDesde ? (m.tipo === "devuelto" ? T.volvio : T.liberado)(fechaLegible(m.disponibleDesde)) : "";
  switch (m.estado) {
    case "pendiente":
      if (m.conGestionAbierta) return T.conGestion;
      if (!m.disponibleDesde) return T.sinEntrega(DIAS_PARA_LIBERAR_CREDITO);
      // El día ya pasó y sigue pendiente: la tarea diaria lo retuvo. No se promete una fecha pasada.
      return m.disponibleDesde < hoy ? T.retenido : T.desde(fechaLegible(m.disponibleDesde));
    case "anulado":
      return T.anulado;
    case "en-revision":
      return T.enRevisionNota;
    case "vencido":
      return m.venceEl ? T.vencio(fechaLegible(m.venceEl), formatearPrecio(m.restante ?? m.monto)) : "";
    case "disponible":
      // Con algo sin usar: hasta qué día se puede usar.
      return juntar(desde, m.venceEl ? T.vence(fechaLegible(m.venceEl)) : "");
    case "reservado":
      return juntar(desde, T.apartado);
    case "usado":
      // Usado entero, antes de vencer: no queda nada por vencer.
      return juntar(desde, T.usadoEntero);
    default:
      return "";
  }
}

/** Las frases del detalle, en una línea; las vacías no dejan espacios sueltos. */
function juntar(...frases: string[]): string {
  return frases.filter(Boolean).join(" ");
}
