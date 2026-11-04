"use client";

import { useState } from "react";
import FormularioSuscripcion from "@/components/suscriptores/FormularioSuscripcion";
import { refrescarSuscriptor } from "@/components/suscriptores/useSuscriptor";
import { cfteaSinCortar, NOMBRE_MARCAS, type CuotasVerificadas } from "@/lib/cuotas";
import { precio as formatearPrecio } from "@/lib/formato";
import { CUPON_BIENVENIDA, MINUTOS_RESERVA, type ResumenSuscriptor } from "@/lib/suscriptores";
import { TEXTOS } from "@/lib/textos";
import { emailValido } from "@/lib/validacion";

const T = TEXTOS.suscriptores;

/**
 * Suscriptores Harper en el checkout (Ale, 03/11/2026).
 *
 *  - Sin sesión: la invitación a suscribirse con el mail que ya escribió,
 *    con el código ahí mismo (sin salir del checkout). Al confirmar, el
 *    carrito se vuelve a pedir y aparecen el cupón, el envío gratis y las 6
 *    cuotas: los montos los pone siempre el servidor.
 *  - Con sesión: con qué mail compra, la casilla para usar el saldo (marcada
 *    de entrada; viaja al servidor como `usarSaldo`) y «salir».
 *
 * Va dentro del formulario del checkout: el de suscripción no lleva su propio
 * <form>.
 */
export default function SuscriptorEnCheckout({
  suscriptor,
  email,
  nombre,
  cuotasSuscriptor,
  usarSaldo,
  alCambiarSaldo,
  alCambiarSesion,
  bloqueado,
}: {
  suscriptor: ResumenSuscriptor | null;
  /** El mail del checkout. */
  email: string;
  nombre: string;
  /** Las 6 cuotas confirmadas para los anteojos, para nombrarlas en la invitación; null no las nombra. */
  cuotasSuscriptor: CuotasVerificadas | null;
  usarSaldo: boolean;
  alCambiarSaldo: (usar: boolean) => void;
  /** Entró o salió: el carrito y el envío se vuelven a pedir con la cookie nueva. */
  alCambiarSesion: () => void;
  /** Mientras se manda el pedido, nada cambia. */
  bloqueado: boolean;
}) {
  const [recien, setRecien] = useState(false);
  const [saliendo, setSaliendo] = useState(false);

  async function salir() {
    setSaliendo(true);
    await fetch("/api/suscriptores/salir", { method: "POST" }).catch(() => null);
    setRecien(false);
    await refrescarSuscriptor();
    alCambiarSesion();
    setSaliendo(false);
  }

  if (suscriptor) {
    return (
      <section className="checkout__suscriptor" aria-label={T.etiqueta}>
        <p className="etiqueta-mono">{T.etiqueta}</p>
        {recien ? (
          <p className="checkout__suscriptor-listo" role="status">
            {T.form.listo.nueva}
          </p>
        ) : null}
        <p className="checkout__suscriptor-texto">
          {suscriptor.activo === false ? T.checkoutBaja(suscriptor.email) : T.checkout(suscriptor.email)}{" "}
          <button type="button" className="suscripcion__enlace" onClick={salir} disabled={saliendo || bloqueado}>
            {T.checkoutCaja.salir}
          </button>
        </p>
        {suscriptor.saldoDisponible > 0 ? (
          <label className="checkout__promos checkout__saldo">
            <input
              id="usarSaldo"
              type="checkbox"
              checked={usarSaldo}
              disabled={bloqueado}
              onChange={(e) => alCambiarSaldo(e.target.checked)}
            />
            <span>{T.checkoutCaja.usarSaldo(formatearPrecio(suscriptor.saldoDisponible))}</span>
          </label>
        ) : null}
        {suscriptor.saldoReservado > 0 ? (
          <p className="checkout__suscriptor-texto apagado">{T.saldoReservado(formatearPrecio(suscriptor.saldoReservado), MINUTOS_RESERVA)}</p>
        ) : null}
      </section>
    );
  }

  const listo = emailValido(email);
  return (
    <section className="checkout__suscriptor checkout__suscriptor--invitacion" aria-labelledby="checkout-suscribite">
      <p className="etiqueta-mono">{T.etiqueta}</p>
      <p id="checkout-suscribite" className="checkout__suscriptor-titulo">
        {T.checkoutCaja.invitacion(formatearPrecio(CUPON_BIENVENIDA), cuotasSuscriptor?.cuotas ?? null)}
      </p>
      <p className="checkout__suscriptor-nota">
        {T.checkoutCaja.nota}
        {cuotasSuscriptor ? ` Cuotas con ${NOMBRE_MARCAS} · CFTEA ${cfteaSinCortar(cuotasSuscriptor.cftea)}.` : ""}
      </p>
      {listo ? (
        <FormularioSuscripcion
          // Otro mail, otro formulario: no se arrastra un código pedido para el anterior.
          key={email.trim().toLowerCase()}
          origen="Checkout"
          email={email}
          nombre={nombre}
          conNombre={false}
          anidado
          mostrarListo={false}
          textoBoton={T.checkoutCaja.suscribirme}
          alListo={() => {
            setRecien(true);
            alCambiarSesion();
          }}
        />
      ) : (
        <p className="checkout__suscriptor-nota">{T.checkoutCaja.escribiMail}</p>
      )}
    </section>
  );
}
