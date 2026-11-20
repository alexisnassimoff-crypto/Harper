"use client";

import { precio as formatearPrecio } from "@/lib/formato";
import { TEXTOS } from "@/lib/textos";

/**
 * Crédito Harper (Ale, 18/11/2026: «Orienta a que vuelvan a comprar»), debajo
 * del total del carrito, del panel lateral y del checkout: «Con esta compra
 * sumás $ X de Crédito Harper para tu próxima compra de anteojos.»
 *
 * El importe llega del servidor (`creditoPrevisto` de /api/carrito/resolver,
 * que es `creditoQueSuma` sobre los renglones que se van a cobrar): acá no se
 * calcula nada ni se mira el interruptor. Sin importe (apagado, o la compra no
 * suma nada) no se dibuja.
 */
export default function CreditoQueSuma({ monto }: { monto: number | null | undefined }) {
  if (!monto || monto <= 0) return null;
  return (
    <p className="credito-que-suma" style={{ fontSize: "0.8125rem", color: "var(--verde)" }}>
      {TEXTOS.programa.credito.carrito(formatearPrecio(monto))}
    </p>
  );
}
