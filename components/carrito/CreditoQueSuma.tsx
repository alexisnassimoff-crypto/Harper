"use client";

import { DIAS_PARA_LIBERAR_CREDITO, MESES_PARA_VENCER_CREDITO } from "@/lib/credito-harper";
import { precio as formatearPrecio } from "@/lib/formato";
import { TEXTOS } from "@/lib/textos";

/**
 * Crédito Harper (Ale, 18/11/2026: «Orienta a que vuelvan a comprar»), debajo
 * del total del carrito, del panel lateral y del checkout: «Con esta compra
 * sumás $ X de Crédito Harper para tu próxima compra de anteojos ($ Y si pagás
 * con dinero en Mercado Pago).»
 *
 * Los importes llegan del servidor (`creditoPrevisto` de /api/carrito/resolver,
 * que es `creditoQueSuma` sobre los renglones que se van a cobrar): acá no se
 * calcula nada ni se mira el interruptor. Sin importe (apagado, o la compra no
 * suma nada) no se dibuja.
 *
 * `conDineroMP` (revisión de textos, 20/11/2026): lo que suma pagando con
 * dinero en Mercado Pago, que es menos porque se paga menos. El carrito y el
 * panel lo pasan porque justo arriba dicen «o $ X con dinero en Mercado Pago»
 * y todavía no se eligió cómo pagar; el checkout no (null), porque `monto` ya
 * es el del medio de pago elegido. Solo se nombra si es otro importe y mayor
 * que cero.
 *
 * Los plazos y las condiciones (revisión del 20/11/2026): junto a lo que suma
 * va cuándo queda disponible y cuándo vence, con el enlace a las condiciones,
 * para que quien compra lo sepa antes de pagar (Ley 24.240, art. 7: la oferta
 * dice sus condiciones y limitaciones). Los días y los meses son los del motor
 * (lib/credito-harper.ts, que se puede usar en el navegador). El enlace abre
 * aparte, como los legales del checkout, para no perder lo que ya se cargó.
 */
export default function CreditoQueSuma({ monto, conDineroMP = null }: { monto: number | null | undefined; conDineroMP?: number | null }) {
  if (!monto || monto <= 0) return null;
  const otro = conDineroMP && conDineroMP > 0 && conDineroMP !== monto ? formatearPrecio(conDineroMP) : null;
  return (
    <p className="credito-que-suma" style={{ fontSize: "0.8125rem", color: "var(--verde)" }}>
      {TEXTOS.programa.credito.carrito(formatearPrecio(monto), otro)}{" "}
      {TEXTOS.programa.credito.plazos(DIAS_PARA_LIBERAR_CREDITO, MESES_PARA_VENCER_CREDITO)}{" "}
      <a href="/legales/suscriptores#credito" target="_blank" rel="noopener" className="checkout__enlace">
        {TEXTOS.programa.credito.condiciones}
      </a>
    </p>
  );
}
