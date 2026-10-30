import type { ConfigTienda } from "./config";
import { NOMBRE_MARCAS, type CuotasVerificadas } from "./cuotas";
import { precio as formatearPrecio } from "./formato";

/**
 * Los mensajes de confianza que se muestran al lado del precio y del botón.
 *
 * Cada uno sale de algo que ya es cierto en la tienda: el medio de pago que
 * realmente procesa, la promoción de envío que está cargada en Config, los
 * plazos de cambio y devolución que ya figuran en /legales. No hay
 * certificaciones, reseñas ni urgencias: si no está en el código o en Airtable,
 * no se dice.
 *
 * Tampoco hay plazos de entrega: hasta que el operador logístico esté
 * contratado y confirmado, no se promete ningún tiempo.
 */

/**
 * Plazos de la política de cambios y devoluciones.
 *
 * Son la fuente única: los usan esta lista, la portada y las páginas de
 * /legales, así nunca dicen cosas distintas. 30 días para devolver y para
 * cambiar, como Mercado Libre (decisión de Ale, 30/10/2026): la ley pide al
 * menos 10 para arrepentirse, y dar más está permitido.
 */
export const DIAS_ARREPENTIMIENTO = 30;
export const DIAS_CAMBIO = 30;
/** La garantía legal por defectos o fallas, desde que se recibe el producto. */
export const MESES_GARANTIA = 6;

export type Confianza = {
  /** Identificador estable, para el ícono y las pruebas. */
  clave: "pago" | "cuotas" | "envio" | "cambios";
  texto: string;
  /** Segunda línea opcional, más chica. */
  detalle?: string;
  href?: string;
};

export type DatosConfianza = Pick<ConfigTienda, "envioGratisDesde"> & Partial<Pick<ConfigTienda, "envioGratisAmbaDesde">>;

/**
 * `cuotas`: solo las que Mercado Pago confirmó sin interés y con CFT 0 (ver
 * lib/cuotas.ts). Sin eso, no se anuncian cuotas.
 * `alcance`: a qué valen, cuando no es todo lo que se ve (por ejemplo, "en
 * anteojos" en la portada, donde también hay complementos sin esas cuotas).
 */
export function mensajesDeConfianza(
  config: DatosConfianza,
  cuotas: CuotasVerificadas | null = null,
  alcance = ""
): Confianza[] {
  const mensajes: Confianza[] = [];

  mensajes.push({
    clave: "pago",
    texto: "Pagás con Mercado Pago",
    detalle: "Tarjeta, débito o dinero en cuenta",
  });

  if (cuotas) {
    mensajes.push({
      clave: "cuotas",
      texto: `${cuotas.cuotas} cuotas sin interés${alcance ? ` ${alcance}` : ""}`,
      detalle: `${NOMBRE_MARCAS} · CFTEA ${cuotas.cftea}`,
    });
  }

  // En AMBA, el mínimo propio si es más bajo que el de todo el país.
  const amba = config.envioGratisAmbaDesde ?? 0;
  const hayAmba = amba > 0 && (config.envioGratisDesde <= 0 || amba < config.envioGratisDesde);
  mensajes.push({
    clave: "envio",
    texto: hayAmba
      ? `Envío gratis en AMBA desde ${formatearPrecio(amba)}`
      : config.envioGratisDesde > 0
        ? `Envío gratis desde ${formatearPrecio(config.envioGratisDesde)}`
        : "Envío a domicilio",
    detalle: hayAmba
      ? config.envioGratisDesde > 0
        ? `En todo el país desde ${formatearPrecio(config.envioGratisDesde)}`
        : "A domicilio"
      : config.envioGratisDesde > 0
        ? "A domicilio"
        : undefined,
  });

  mensajes.push({
    clave: "cambios",
    texto:
      DIAS_CAMBIO === DIAS_ARREPENTIMIENTO
        ? `Cambios y devoluciones hasta ${DIAS_CAMBIO} días`
        : `Cambios hasta ${DIAS_CAMBIO} días`,
    detalle:
      DIAS_CAMBIO === DIAS_ARREPENTIMIENTO
        ? "Devolución sin costo, sin uso y en su empaque"
        : `Devolución sin costo dentro de los ${DIAS_ARREPENTIMIENTO} días`,
    href: "/legales/devoluciones",
  });

  return mensajes;
}
