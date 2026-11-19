import { NOMBRE_MARCAS, type CuotasVerificadas } from "@/lib/cuotas";
import { precio as formatearPrecio, precioConCentavos } from "@/lib/formato";
import { TEXTOS } from "@/lib/textos";

/**
 * Las cuotas de una compra, debajo del total del carrito (Ale, 05/11/2026).
 * Desde el 18/11/2026 son las mismas para todos, hasta 3: no hay cuotas de
 * suscriptor, ni etiqueta, ni invitación a suscribirse.
 *
 * Solo se anuncian las que Mercado Pago confirmó para `precioContado`
 * (lib/cuotas-servidor.ts): sin eso, no se dice «sin interés». Res. SIyC
 * 4/2025: cantidad y monto de cada cuota, precio de contado y CFTEA.
 *
 * Debajo, como en la ficha, lo que cuesta la misma compra con el dinero de la
 * cuenta de Mercado Pago («o $ X con dinero en Mercado Pago»). El importe
 * llega calculado del servidor; null no lo muestra.
 */
export default function CuotasDeLaCompra({
  cuotas,
  precioContado,
  conDineroMP = null,
  className = "",
}: {
  /** Las confirmadas por Mercado Pago para `precioContado`; null no las anuncia. */
  cuotas: CuotasVerificadas | null;
  /** El importe para el que Mercado Pago las confirmó. */
  precioContado: number;
  /** El mismo total pagado con dinero en Mercado Pago, del servidor; null si no hay nada que decir. */
  conDineroMP?: number | null;
  className?: string;
}) {
  // Sin el CFTEA de Mercado Pago no se anuncian: van siempre con sus condiciones.
  const confirmadas = cuotas?.cftea ? cuotas : null;
  if (!confirmadas && conDineroMP === null) return null;
  return (
    <div className={`cuotas-compra ${className}`.trim()}>
      {confirmadas ? (
        <>
          <p className="cuotas-compra__suyas">
            {TEXTOS.programa.cuotas.sinInteres(confirmadas.cuotas)} de {precioConCentavos(confirmadas.montoCuota)}
          </p>
          <p className="cuotas-condiciones">
            Precio de contado {formatearPrecio(precioContado)} · CFTEA {confirmadas.cftea} · {NOMBRE_MARCAS}
          </p>
        </>
      ) : null}
      {conDineroMP !== null ? (
        <p style={{ fontSize: "0.8125rem", color: "var(--verde)" }}>{TEXTOS.programa.dineroMP.precio(formatearPrecio(conDineroMP))}</p>
      ) : null}
    </div>
  );
}
