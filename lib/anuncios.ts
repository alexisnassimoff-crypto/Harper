import { CUPON_BIENVENIDA, HAY_CUPONES } from "./cupones";
import { nombreDelTramo, type Tramo } from "./descuentos";
import { NOMBRE_MARCAS, type CuotasVerificadas } from "./cuotas";
import { PORCENTAJE_DINERO_MP } from "./dinero-mp";

/**
 * Los mensajes de la barra verde de arriba, que pasan uno detrás del otro.
 *
 * El primero es `banner_texto` de Config (el envío gratis), como siempre. Los
 * demás son promociones que ya existen: las cuotas solo si Mercado Pago las
 * confirmó (aclarando que son en anteojos, con qué tarjetas y el CFTEA), el
 * 10% por dinero en Mercado Pago y, si hay, el cupón de primera compra. Con
 * la escala de anteojos («llevá 3, pagá 2 · llevá 5, pagá 3»), va segunda.
 */
export function anunciosDelHeader(datos: { banner: string; cuotas: CuotasVerificadas | null; escala?: Tramo[] }): string[] {
  const escala = datos.escala ?? [];
  return [
    datos.banner.trim(),
    escala.length > 0 ? `${escala.map((t) => nombreDelTramo(t)).join(" · ")} en anteojos` : "",
    datos.cuotas
      ? `${datos.cuotas.cuotas} cuotas sin interés en anteojos con ${NOMBRE_MARCAS} · CFTEA ${datos.cuotas.cftea}`
      : "",
    `${PORCENTAJE_DINERO_MP}% OFF extra pagando con dinero en Mercado Pago`,
    HAY_CUPONES ? `${CUPON_BIENVENIDA.codigo}: ${CUPON_BIENVENIDA.porcentaje}% OFF en tu primera compra` : "",
  ].filter(Boolean);
}
