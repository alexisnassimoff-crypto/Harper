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
 * Son la fuente única: los usa esta lista y la página /legales/devoluciones,
 * así nunca dicen cosas distintas.
 */
export const DIAS_ARREPENTIMIENTO = 10;
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

export type DatosConfianza = Pick<ConfigTienda, "envioGratisDesde">;

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

  mensajes.push({
    clave: "envio",
    texto:
      config.envioGratisDesde > 0
        ? `Envío gratis desde ${formatearPrecio(config.envioGratisDesde)}`
        : "Envío a domicilio",
    detalle: config.envioGratisDesde > 0 ? "A domicilio" : undefined,
  });

  mensajes.push({
    clave: "cambios",
    texto: `Cambios hasta ${DIAS_CAMBIO} días`,
    detalle: `Devolución sin costo dentro de los ${DIAS_ARREPENTIMIENTO} días`,
    href: "/legales/devoluciones",
  });

  return mensajes;
}
