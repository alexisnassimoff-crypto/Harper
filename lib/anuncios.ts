import { CUPON_BIENVENIDA, HAY_CUPONES } from "./cupones";
import { nombreDelTramo, type Tramo } from "./descuentos";
import { NOMBRE_MARCAS, type CuotasVerificadas } from "./cuotas";
import { PORCENTAJE_DINERO_MP } from "./dinero-mp";
import { precio as formatearPrecio } from "./formato";
import { CUPON_BIENVENIDA as CUPON_SUSCRIPTOR } from "./suscriptores";
import { TEXTOS } from "./textos";

/**
 * Los mensajes de la barra verde de arriba, que pasan uno detrás del otro.
 *
 * El primero es `banner_texto` de Config (el envío gratis), como siempre. Los
 * demás son promociones que ya existen: Suscriptores Harper (Ale,
 * 03/11/2026: la suscripción gratis con el mail), las cuotas solo si Mercado
 * Pago las confirmó (aclarando que son en anteojos, con qué tarjetas y el
 * CFTEA; 3 para todos y, si también las confirmó, 6 para suscriptores), el
 * 10% por dinero en Mercado Pago y, si hay, el cupón de primera compra. Con
 * la escala de anteojos («llevá 3, pagá 2 · llevá 5, pagá 3»), va segunda.
 */
export function anunciosDelHeader(datos: {
  banner: string;
  cuotas: CuotasVerificadas | null;
  escala?: Tramo[];
  /** Las cuotas de suscriptor confirmadas, si son más que las de todos. */
  cuotasSuscriptor?: CuotasVerificadas | null;
  /** Suscriptores Harper abierto: la invitación va en la barra. */
  suscriptores?: boolean;
}): string[] {
  const escala = datos.escala ?? [];
  const deSuscriptor = datos.cuotasSuscriptor ?? null;
  return [
    datos.banner.trim(),
    escala.length > 0 ? `${escala.map((t) => nombreDelTramo(t)).join(" · ")} en anteojos` : "",
    datos.suscriptores ? TEXTOS.suscriptores.anuncio(formatearPrecio(CUPON_SUSCRIPTOR)) : "",
    datos.cuotas
      ? `${datos.cuotas.cuotas} cuotas sin interés en anteojos con ${NOMBRE_MARCAS}${
          deSuscriptor ? ` · ${TEXTOS.suscriptores.cuotasSuscriptor(deSuscriptor.cuotas)}` : ""
        } · CFTEA ${datos.cuotas.cftea}`
      : deSuscriptor
        ? `${deSuscriptor.cuotas} cuotas sin interés en anteojos para suscriptores, con ${NOMBRE_MARCAS} · CFTEA ${deSuscriptor.cftea}`
        : "",
    `${PORCENTAJE_DINERO_MP}% OFF extra pagando con dinero en Mercado Pago`,
    HAY_CUPONES ? `${CUPON_BIENVENIDA.codigo}: ${CUPON_BIENVENIDA.porcentaje}% OFF en tu primera compra` : "",
  ].filter(Boolean);
}
