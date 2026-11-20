import type { BilleteraCredito, MovimientoCredito } from "@/lib/credito-cuenta";
import { MESES_PARA_VENCER_CREDITO } from "@/lib/credito-harper";
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
                <span className="cuenta-suscriptor__detalle">{T.pendienteDetalle}</span>
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
                        <small>{conDetalle(T.estado[m.estado], m.estado === "reservado" ? T.reservadoNota : m.conGestionAbierta ? T.usoEnRevision : "")}</small>
                      </span>
                      <span className="cuenta-suscriptor__importe" data-signo="menos">
                        {`−${formatearPrecio(m.monto)}`}
                      </span>
                    </li>
                  ) : (
                    <li key={m.pedido} className="cuenta-suscriptor__movimiento" data-estado={m.estado}>
                      <span className="cuenta-suscriptor__fecha">{m.fecha ? fechaLegible(m.fecha) : ""}</span>
                      <span className="cuenta-suscriptor__concepto">
                        {T.concepto(m.pedido, m.porcentaje)}
                        <small>{conDetalle(T.estado[m.estado], detalleDelGanado(m, hoy))}</small>
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
 * El detalle de un crédito ganado, según su estado (Ale, 18/11/2026: con el
 * vencimiento). Las fechas y lo que queda salen de la billetera del servidor.
 */
function detalleDelGanado(m: MovimientoCredito, hoy: string): string {
  switch (m.estado) {
    case "pendiente":
      if (m.conGestionAbierta) return T.conGestion;
      if (!m.disponibleDesde) return T.sinEntrega;
      // El día ya pasó y sigue pendiente: la tarea diaria lo retuvo. No se promete una fecha pasada.
      return m.disponibleDesde < hoy ? T.retenido : T.desde(fechaLegible(m.disponibleDesde));
    case "anulado":
      return T.anulado;
    case "en-revision":
      return T.enRevisionNota;
    case "vencido":
      return m.venceEl ? T.vencio(fechaLegible(m.venceEl), formatearPrecio(m.restante ?? m.monto)) : "";
    case "disponible": {
      const liberado = m.disponibleDesde ? T.liberado(fechaLegible(m.disponibleDesde)) : "";
      // Usado entero: no queda nada por vencer. Con algo sin usar, hasta qué día se puede usar.
      const vence = m.restante === 0 ? T.usadoEntero : m.venceEl ? T.vence(fechaLegible(m.venceEl)) : "";
      return [liberado, vence].filter(Boolean).join(" ");
    }
    default:
      // «Usado»: venció después de usarse entero.
      return "";
  }
}
