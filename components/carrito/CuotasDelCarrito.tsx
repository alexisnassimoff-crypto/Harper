"use client";

import CuotasDeLaCompra from "@/components/CuotasDeLaCompra";
import type { useCarritoResuelto } from "./useCarritoResuelto";

type Datos = NonNullable<ReturnType<typeof useCarritoResuelto>["datos"]>;

/**
 * Debajo del total del carrito y del panel lateral, para el total que se ve
 * (`monto`: los productos ya con sus descuentos, sin el envío):
 *
 *  - Las cuotas sin interés (Ale, 05/11/2026), las mismas para todos desde el
 *    18/11/2026. Solo las que Mercado Pago confirmó para ese monto exacto
 *    (/api/carrito/resolver con `cuotas`); si el monto cambió y todavía no
 *    llegó la respuesta, nada.
 *  - «o $ X con dinero en Mercado Pago» (Ale, 18/11/2026): lo que cuestan esos
 *    mismos productos con el 10 % por pagar con el dinero de la cuenta de
 *    Mercado Pago. El importe es `dineroMP.subtotal`, calculado por el
 *    servidor (después del Dúo, si lo hay) y, como el total de arriba, sin el
 *    envío, al que ese descuento no se aplica. Solo si de verdad baja el total.
 */
export default function CuotasDelCarrito({ datos, monto }: { datos: Datos; monto: number }) {
  const cuotas = [datos.cuotas, datos.cuotasSinEnvio].find((c) => c && c.monto === monto) ?? null;
  // Solo junto al total de los productos: si `monto` fuera otro, el importe no sería el suyo.
  const conDineroMP = datos.dineroMP && datos.dineroMP.ahorro > 0 && monto === datos.subtotal ? datos.dineroMP.subtotal : null;
  return <CuotasDeLaCompra cuotas={cuotas} precioContado={monto} conDineroMP={conDineroMP} className="cuotas-compra--carrito" />;
}
