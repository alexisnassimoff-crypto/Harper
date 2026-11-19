import type { ConfigTienda } from "./config";
import { NOMBRE_MARCAS, type CuotasVerificadas } from "./cuotas";
import { PORCENTAJE_DINERO_MP } from "./dinero-mp";
import { precio as formatearPrecio } from "./formato";
import { TEXTOS } from "./textos";

/**
 * Los mensajes de confianza que se muestran al lado del precio y del botón.
 *
 * Cada uno sale de algo que ya es cierto en la tienda: el medio de pago que
 * realmente procesa (con el 10 % por pagar con el dinero de la cuenta de
 * Mercado Pago, lib/dinero-mp.ts), los mínimos del envío gratis que están
 * cargados en Config, los plazos de cambio y devolución que ya figuran en
 * /legales. No hay certificaciones, reseñas ni urgencias: si no está en el
 * código o en Airtable, no se dice.
 *
 * Ale, 18/11/2026: el envío se dice igual en todos lados (TEXTOS.programa):
 * gratis en AMBA desde un mínimo y, al resto del país, desde otro, con la
 * aclaración de que el mínimo se cuenta a precio de lista. Tener cuenta no
 * cambia el envío de nadie.
 *
 * Tampoco hay plazos de entrega: hasta que el operador logístico esté
 * contratado y confirmado, no se promete ningún tiempo.
 */

/**
 * Plazos de la política de cambios y devoluciones.
 *
 * Son la fuente única: los usan esta lista, la portada y las páginas de
 * /legales, así nunca dicen cosas distintas. Decisión del 04/11/2026:
 * 10 días corridos para devolver una compra online y 30 días para cambios
 * comerciales de color o modelo.
 */
// Tipadas como number: con dos literales distintos (10 y 30), TypeScript rechaza
// las comparaciones de abajo (TS2367) y `next build` falla.
export const DIAS_ARREPENTIMIENTO: number = 10;
export const DIAS_CAMBIO: number = 30;
/** La garantía legal por defectos o fallas, desde que se recibe el producto. */
export const MESES_GARANTIA = 6;

export type Confianza = {
  /** Identificador estable, para el ícono y las pruebas. */
  clave: "pago" | "cuotas" | "envio" | "cambios";
  texto: string;
  /** Segunda línea opcional, más chica. */
  detalle?: string;
  /**
   * Una aclaración debajo del detalle, donde hay lugar para leerla (la ficha,
   * la portada, la tira en escritorio): cómo se cuenta el mínimo del envío.
   */
  nota?: string;
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

  // El 10 % por pagar con el dinero de la cuenta (Ale, 18/11/2026): va con el
  // pago, que es donde el comprador elige cómo pagar. El porcentaje sale de
  // lib/dinero-mp.ts, el mismo que aplica el servidor.
  mensajes.push({
    clave: "pago",
    texto: "Pagás con Mercado Pago",
    detalle: `Tarjeta, débito o dinero en cuenta. ${TEXTOS.programa.dineroMP.barra(PORCENTAJE_DINERO_MP)}.`,
  });

  if (cuotas) {
    mensajes.push({
      clave: "cuotas",
      texto: `${TEXTOS.programa.cuotas.sinInteres(cuotas.cuotas)}${alcance ? ` ${alcance}` : ""}`,
      detalle: TEXTOS.programa.cuotas.condiciones(NOMBRE_MARCAS, cuotas.cftea),
    });
  }

  // En AMBA, el mínimo propio si es más bajo que el de todo el país. Los dos
  // importes salen de Config; donde se dice el del resto del país, la
  // aclaración de que se cuenta a precio de lista (el servidor lo mide antes
  // del Dúo y del 10 % de Mercado Pago, lib/pedidos.ts).
  const E = TEXTOS.programa.envio;
  const amba = config.envioGratisAmbaDesde ?? 0;
  const nacional = config.envioGratisDesde;
  const hayAmba = amba > 0 && (nacional <= 0 || amba < nacional);
  mensajes.push({
    clave: "envio",
    texto: hayAmba ? E.amba(formatearPrecio(amba)) : nacional > 0 ? E.unico(formatearPrecio(nacional)) : "Envío a domicilio",
    detalle: hayAmba ? (nacional > 0 ? E.resto(formatearPrecio(nacional)) : "A domicilio") : nacional > 0 ? "A domicilio" : undefined,
    ...(nacional > 0 ? { nota: E.minimo } : {}),
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
