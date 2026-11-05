import Link from "next/link";
import { NOMBRE_MARCAS, type CuotasVerificadas } from "@/lib/cuotas";
import { precio as formatearPrecio, precioConCentavos } from "@/lib/formato";
import { CUOTAS_TODOS } from "@/lib/suscriptores";
import { TEXTOS } from "@/lib/textos";

const T = TEXTOS.suscriptores.cuotasBeneficio;

/**
 * Las cuotas de una compra (Ale, 05/11/2026), en la ficha y en el carrito:
 * las de este comprador y, a quien no es suscriptor, las que tendría
 * siéndolo, como beneficio exclusivo. Todo viene verificado con Mercado
 * Pago para `precioContado` (lib/cuotas-servidor.ts): sin eso, no se dice
 * «sin interés». Res. SIyC 4/2025: cantidad y monto de cada cuota, precio de
 * contado y CFTEA (el mismo para las dos cantidades).
 */
export default function CuotasDeLaCompra({
  suyas,
  deSuscriptor,
  esSuscriptor,
  precioContado,
  enlace,
  className = "",
}: {
  /** Las de este comprador: hasta 3, o hasta 6 si es suscriptor. */
  suyas: CuotasVerificadas | null;
  /** Solo a quien no es suscriptor: las que tendría siéndolo, si son más. */
  deSuscriptor: CuotasVerificadas | null;
  esSuscriptor: boolean;
  /** El importe para el que Mercado Pago las confirmó. */
  precioContado: number;
  /** A dónde lleva «suscriptores Harper». */
  enlace: string;
  className?: string;
}) {
  const cftea = (suyas ?? deSuscriptor)?.cftea;
  if (!cftea) return null;
  return (
    <div className={`cuotas-compra ${className}`.trim()}>
      {suyas ? (
        <p className="cuotas-compra__suyas">
          {suyas.cuotas} cuotas sin interés de {precioConCentavos(suyas.montoCuota)}
          {esSuscriptor && suyas.cuotas > CUOTAS_TODOS ? <span className="cuotas-compra__etiqueta">{T.tuyo}</span> : null}
        </p>
      ) : null}
      {deSuscriptor ? (
        <p className="cuotas-suscriptor">
          {suyas ? "O " : ""}
          {deSuscriptor.cuotas} cuotas sin interés de {precioConCentavos(deSuscriptor.montoCuota)},{" "}
          <Link href={enlace}>{T.exclusivo}</Link>.
        </p>
      ) : null}
      <p className="cuotas-condiciones">
        Precio de contado {formatearPrecio(precioContado)} · CFTEA {cftea} · {NOMBRE_MARCAS}
      </p>
    </div>
  );
}
