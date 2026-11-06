import type { BilleteraCredito } from "@/lib/credito-cuenta";
import { precio as formatearPrecio } from "@/lib/formato";
import { fechaLegible } from "@/lib/suscriptores";
import { TEXTOS } from "@/lib/textos";

const T = TEXTOS.suscriptores.cuenta.credito;

/**
 * «Mi Crédito Harper» (paso 3): lo disponible, lo pendiente, lo que está en
 * revisión y un movimiento por pedido. Solo se muestra con
 * HARPER_CREDITO_ACTIVO=1. Va aparte del saldo de Suscriptores Harper, que
 * sigue con sus reglas. `billetera` null: no se pudo leer (nunca un $ 0).
 */
export default function MiCreditoHarper({ billetera }: { billetera: BilleteraCredito | null }) {
  return (
    <section id="mi-credito" className="cuenta-suscriptor__credito" aria-labelledby="cuenta-credito-titulo">
      <h2 id="cuenta-credito-titulo" className="label">
        {T.titulo}
      </h2>
      <p className="apagado">{T.bajada}</p>
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
                {billetera.movimientos.map((m) => (
                  <li key={m.pedido} className="cuenta-suscriptor__movimiento" data-estado={m.estado}>
                    <span className="cuenta-suscriptor__fecha">{m.fecha ? fechaLegible(m.fecha) : ""}</span>
                    <span className="cuenta-suscriptor__concepto">
                      {T.concepto(m.pedido, m.porcentaje)}
                      <small>
                        {T.estado[m.estado]}
                        {" · "}
                        {m.estado === "pendiente"
                          ? m.conGestionAbierta
                            ? T.conGestion
                            : m.disponibleDesde
                              ? T.desde(fechaLegible(m.disponibleDesde))
                              : T.sinEntrega
                          : m.estado === "anulado"
                            ? T.anulado
                            : m.estado === "en-revision"
                              ? T.enRevisionNota
                              : m.disponibleDesde
                                ? T.liberado(fechaLegible(m.disponibleDesde))
                                : ""}
                      </small>
                    </span>
                    <span className="cuenta-suscriptor__importe" data-signo={m.estado === "anulado" ? "anulado" : "mas"}>
                      {m.estado === "anulado" ? <s>{formatearPrecio(m.monto)}</s> : `+${formatearPrecio(m.monto)}`}
                    </span>
                  </li>
                ))}
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
