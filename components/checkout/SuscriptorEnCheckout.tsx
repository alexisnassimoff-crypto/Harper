"use client";

import { useState } from "react";
import { refrescarSuscriptor } from "@/components/suscriptores/useSuscriptor";
import { precio as formatearPrecio } from "@/lib/formato";
import { MINUTOS_RESERVA, type ResumenSuscriptor } from "@/lib/suscriptores";
import { TEXTOS } from "@/lib/textos";

const T = TEXTOS.suscriptores;

/**
 * La cuenta Harper en el checkout.
 *
 * Ale, 18/11/2026: los beneficios en plata de la suscripción terminaron para
 * todos, así que tener cuenta no cambia el precio, el envío ni las cuotas. Por
 * eso acá ya no se invita a suscribirse a cambio de un descuento (sin sesión
 * no se muestra nada) y, con la cuenta abierta, queda una sola línea: con qué
 * mail compra y «¿No sos vos? Salir». La sesión sigue sirviendo para lo que el
 * checkout hace con ella: completar el mail y ofrecer los datos y las
 * direcciones guardadas (FormularioCheckout).
 *
 * El saldo a favor de antes de ese día no se genera más. La casilla para
 * usarlo (marcada de entrada; viaja al servidor como `usarSaldo`) y el aviso
 * del saldo apartado se muestran solo en la cuenta que de verdad lo tiene, y
 * hoy no hay ninguna: es un camino que queda dormido.
 */
export default function SuscriptorEnCheckout({
  cuenta,
  usarSaldo,
  alCambiarSaldo,
  alCambiarSesion,
  bloqueado,
}: {
  /** La cuenta de la sesión, como la contesta el servidor con el carrito; null sin sesión. */
  cuenta: ResumenSuscriptor | null;
  usarSaldo: boolean;
  alCambiarSaldo: (usar: boolean) => void;
  /** Salió: el carrito y el envío se vuelven a pedir con la cookie nueva. */
  alCambiarSesion: () => void;
  /** Mientras se manda el pedido, nada cambia. */
  bloqueado: boolean;
}) {
  const [saliendo, setSaliendo] = useState(false);

  async function salir() {
    setSaliendo(true);
    await fetch("/api/suscriptores/salir", { method: "POST" }).catch(() => null);
    await refrescarSuscriptor();
    alCambiarSesion();
    setSaliendo(false);
  }

  if (!cuenta) return null;

  return (
    <section className="checkout__suscriptor" aria-label={T.etiqueta}>
      <p className="checkout__suscriptor-texto">
        {T.checkout(cuenta.email)}{" "}
        <button type="button" className="suscripcion__enlace" onClick={salir} disabled={saliendo || bloqueado}>
          {T.checkoutCaja.salir}
        </button>
      </p>
      {/* Solo la cuenta con saldo a favor de antes del 18/11/2026. */}
      {cuenta.saldoDisponible > 0 ? (
        <label className="checkout__promos checkout__saldo">
          <input
            id="usarSaldo"
            type="checkbox"
            checked={usarSaldo}
            disabled={bloqueado}
            onChange={(e) => alCambiarSaldo(e.target.checked)}
          />
          <span>{T.checkoutCaja.usarSaldo(formatearPrecio(cuenta.saldoDisponible))}</span>
        </label>
      ) : null}
      {cuenta.saldoReservado > 0 ? (
        <p className="checkout__suscriptor-texto apagado">{T.saldoReservado(formatearPrecio(cuenta.saldoReservado), MINUTOS_RESERVA)}</p>
      ) : null}
    </section>
  );
}
