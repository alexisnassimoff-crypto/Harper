"use client";

import { precio as formatearPrecio } from "@/lib/formato";
import { TEXTOS } from "@/lib/textos";

const T = TEXTOS.suscriptores.cuenta.credito;

/**
 * Crédito Harper en el checkout (paso 4). Solo existe si el servidor dijo que
 * la cuenta verificada tiene crédito para usar, cosa que pasa solo con
 * HARPER_CREDITO_ACTIVO=1. Los montos son los del servidor; acá solo se
 * elige usarlo o no.
 */
export default function CreditoEnCheckout({
  credito,
  usar,
  alCambiar,
  bloqueado,
}: {
  credito: { usado: number; usable: number; elegible: number };
  usar: boolean;
  alCambiar: (usar: boolean) => void;
  bloqueado: boolean;
}) {
  return (
    <section className="checkout__suscriptor checkout__credito" aria-label={T.titulo}>
      <p className="etiqueta-mono">{T.titulo}</p>
      <label className="checkout__promos checkout__saldo">
        <input id="usarCredito" type="checkbox" checked={usar} disabled={bloqueado} onChange={(e) => alCambiar(e.target.checked)} />
        <span>{T.usar(formatearPrecio(credito.usable))}</span>
      </label>
      <p className="checkout__suscriptor-texto apagado">{T.usarDetalle}</p>
      {usar && credito.usado > 0 ? <p className="checkout__suscriptor-texto">{T.usado(formatearPrecio(credito.usado))}</p> : null}
    </section>
  );
}
