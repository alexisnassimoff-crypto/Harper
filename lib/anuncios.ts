import { CUPON_BIENVENIDA } from "./cupones";
import { NOMBRE_MARCAS, type CuotasVerificadas } from "./cuotas";
import { PORCENTAJE_DINERO_MP } from "./dinero-mp";

/**
 * Los mensajes de la barra verde de arriba, que pasan uno detrás del otro.
 *
 * El primero es `banner_texto` de Config (el envío gratis), como siempre. Los
 * demás son promociones que ya existen: las cuotas solo si Mercado Pago las
 * confirmó (aclarando que son en anteojos, con qué tarjetas y el CFTEA), el
 * 10% por dinero en Mercado Pago y el cupón de primera compra.
 */
export function anunciosDelHeader(datos: { banner: string; cuotas: CuotasVerificadas | null }): string[] {
  return [
    datos.banner.trim(),
    datos.cuotas
      ? `${datos.cuotas.cuotas} cuotas sin interés en anteojos con ${NOMBRE_MARCAS} · CFTEA ${datos.cuotas.cftea}`
      : "",
    `${PORCENTAJE_DINERO_MP}% OFF extra pagando con dinero en Mercado Pago`,
    `${CUPON_BIENVENIDA.codigo}: ${CUPON_BIENVENIDA.porcentaje}% OFF en tu primera compra`,
  ].filter(Boolean);
}
