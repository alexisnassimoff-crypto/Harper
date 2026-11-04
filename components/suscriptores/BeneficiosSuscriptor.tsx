import { cfteaSinCortar, NOMBRE_MARCAS, type CuotasVerificadas } from "@/lib/cuotas";
import { precio as formatearPrecio } from "@/lib/formato";
import { CASHBACK_PORCENTAJE, CUPON_BIENVENIDA, DIAS_PARA_USAR_CASHBACK } from "@/lib/suscriptores";
import { TEXTOS } from "@/lib/textos";
import Cifras from "@/components/Cifras";

const { tarjetas: T } = TEXTOS.suscriptores;

/**
 * Los cuatro beneficios de Suscriptores Harper (Ale, 03/11/2026), con las
 * reglas de lib/suscriptores.ts dichas simple. Las cuotas van solo si Mercado
 * Pago confirmó las de suscriptor (con el CFTEA al lado); si no, son tres.
 * Lo usan la portada, /suscriptores y la ficha.
 */
export function beneficiosDeSuscriptor(cuotas: CuotasVerificadas | null, cuotasTodos: number | null) {
  return [
    { clave: "cupon", ...T.cupon(formatearPrecio(CUPON_BIENVENIDA)) },
    { clave: "cashback", ...T.cashback(CASHBACK_PORCENTAJE, DIAS_PARA_USAR_CASHBACK) },
    { clave: "envio", ...T.envio },
    ...(cuotas ? [{ clave: "cuotas", ...T.cuotas(cuotas.cuotas, NOMBRE_MARCAS, cfteaSinCortar(cuotas.cftea), cuotasTodos) }] : []),
  ];
}

export default function BeneficiosSuscriptor({
  cuotas,
  cuotasTodos = null,
  compacta = false,
}: {
  /** Las cuotas de suscriptor confirmadas por Mercado Pago; null no las nombra. */
  cuotas: CuotasVerificadas | null;
  /** Las de cualquier comprador, confirmadas también, para decir «sin suscribirte, 3». */
  cuotasTodos?: number | null;
  compacta?: boolean;
}) {
  return (
    <ul className={`beneficios-suscriptor${compacta ? " beneficios-suscriptor--compacta" : ""}`}>
      {beneficiosDeSuscriptor(cuotas, cuotasTodos).map((b) => (
        <li key={b.clave} className="beneficios-suscriptor__item">
          <strong className="beneficios-suscriptor__titulo">
            <Cifras>{b.titulo}</Cifras>
          </strong>
          <span className="beneficios-suscriptor__detalle">{b.detalle}</span>
        </li>
      ))}
    </ul>
  );
}
