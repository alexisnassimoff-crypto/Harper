import type { ConfigTienda } from "./config";
import { cuotasActivas } from "./cuotas";
import { precio as formatearPrecio } from "./formato";

/**
 * Los mensajes de confianza que se muestran al lado del precio y del botón.
 *
 * Cada uno sale de algo que ya es cierto en la tienda: el medio de pago que
 * realmente procesa, la promoción de envío que está cargada en Config, los
 * plazos de cambio y devolución que ya figuran en /legales. No hay
 * certificaciones, reseñas ni urgencias: si no está en el código o en Airtable,
 * no se dice.
 */

/**
 * Plazos de la política de cambios y devoluciones.
 *
 * Son la fuente única: los usa esta lista y la página /legales/devoluciones,
 * así nunca dicen cosas distintas.
 */
export const DIAS_ARREPENTIMIENTO = 10;
export const DIAS_CAMBIO = 30;

export type Confianza = {
  /** Identificador estable, para el ícono y las pruebas. */
  clave: "pago" | "cuotas" | "envio" | "cambios";
  texto: string;
  /** Segunda línea opcional, más chica. */
  detalle?: string;
  href?: string;
};

export type DatosConfianza = Pick<ConfigTienda, "envioGratisDesde" | "plazoEntrega">;

export function mensajesDeConfianza(config: DatosConfianza): Confianza[] {
  const mensajes: Confianza[] = [];
  const cuotas = cuotasActivas();

  mensajes.push({
    clave: "pago",
    texto: "Pagás con Mercado Pago",
    detalle: "Tarjeta, débito o dinero en cuenta",
  });

  if (cuotas) {
    mensajes.push({
      clave: "cuotas",
      texto: `${cuotas} cuotas sin interés`,
      detalle: "Con tarjeta de crédito",
    });
  }

  mensajes.push({
    clave: "envio",
    texto:
      config.envioGratisDesde > 0
        ? `Envío gratis desde ${formatearPrecio(config.envioGratisDesde)}`
        : "Envío a domicilio",
    detalle: config.plazoEntrega ? `Entrega en ${config.plazoEntrega}` : undefined,
  });

  mensajes.push({
    clave: "cambios",
    texto: `Cambios hasta ${DIAS_CAMBIO} días`,
    detalle: `Devolución sin costo dentro de los ${DIAS_ARREPENTIMIENTO} días`,
    href: "/legales/devoluciones",
  });

  return mensajes;
}
