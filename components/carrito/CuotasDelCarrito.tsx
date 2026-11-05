"use client";

import CuotasDeLaCompra from "@/components/CuotasDeLaCompra";
import { tieneCuotasDeSuscriptor } from "@/lib/suscriptores";
import type { useCarritoResuelto } from "./useCarritoResuelto";

type Datos = NonNullable<ReturnType<typeof useCarritoResuelto>["datos"]>;

/**
 * Las cuotas del carrito (Ale, 05/11/2026), para el total que se ve: ya con
 * los descuentos y el cupón, y con el envío si ya se sabe. Solo las que
 * Mercado Pago confirmó para ese monto exacto (/api/carrito/resolver con
 * `cuotas`); si el monto cambió y todavía no llegó la respuesta, nada.
 */
export default function CuotasDelCarrito({ datos, monto }: { datos: Datos; monto: number }) {
  const suyas = [datos.cuotas, datos.cuotasSinEnvio].find((c) => c && c.monto === monto) ?? null;
  const deSuscriptor = datos.cuotasSuscriptor?.find((c) => c.monto === monto) ?? null;
  return (
    <CuotasDeLaCompra
      suyas={suyas}
      deSuscriptor={deSuscriptor}
      esSuscriptor={tieneCuotasDeSuscriptor(datos.suscriptor)}
      precioContado={monto}
      enlace="/suscriptores"
      className="cuotas-compra--carrito"
    />
  );
}
