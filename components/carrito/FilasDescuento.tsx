"use client";

import { precio as formatearPrecio } from "@/lib/formato";
import { filasDeDescuento } from "@/lib/promocion-anteojos";
import type { ItemResuelto } from "@/lib/tipos";

/**
 * Las filas de descuento del resumen (carrito, panel lateral y checkout). Sin
 * Dúo, la de siempre («Cupón X» o «Descuento»); con el Dúo, en su propia fila
 * («Dúo · 25% OFF»). Los montos son los del servidor (lib/promocion-anteojos.ts).
 */
export default function FilasDescuento({
  ahorro,
  items,
  cupon,
}: {
  ahorro: number;
  items: ItemResuelto[];
  cupon: { codigo: string; estado: string } | null | undefined;
}) {
  return (
    <>
      {filasDeDescuento({ ahorro, items, cupon }).map((f) => (
        <div key={f.etiqueta} className="fila" style={{ color: "var(--verde)" }}>
          <span>{f.etiqueta}</span>
          <span>−{formatearPrecio(f.monto)}</span>
        </div>
      ))}
    </>
  );
}
