import type { Producto } from "./tipos";

/**
 * Lo que tienen los anteojos Harper, en un solo lugar.
 *
 * Confirmado por Ale el 25/10/2026 para los cuatro modelos publicados:
 * AMATISTA, OBSIDIANA, CUARZO y CITRINO tienen cristales con filtro de luz
 * azul, cristales fotocromáticos (se oscurecen con la luz del sol) y un
 * armazón que admite reemplazar los cristales por otros con aumento.
 * El 27/10/2026 Ale confirmó además que los cristales tienen protección UV400.
 *
 * Que el armazón admita cristales con aumento NO quiere decir que Harper
 * venda lentes recetados: la tienda no ofrece graduaciones ni configuraciones.
 *
 * La lista es por modelo y no por categoría a propósito: un anteojo nuevo que
 * se cargue en Airtable no hereda estas afirmaciones hasta que alguien las
 * confirme y lo agregue acá.
 */
const MODELOS_CONFIRMADOS = new Set(["amatista", "obsidiana", "cuarzo", "citrino"]);

/** Los puntos de la ficha, debajo del precio. */
export const CARACTERISTICAS_ANTEOJOS = [
  "Filtro de luz azul",
  "Cristales fotocromáticos que se adaptan a la luz solar",
  "Protección UV400 contra los rayos UVA y UVB",
  "Armazón apto para colocar cristales con aumento",
] as const;

/** La línea discreta de las tarjetas de la grilla. */
export const RESUMEN_ANTEOJOS = "Filtro azul · Fotocromáticos · UV400";

export type Caracteristicas = {
  lista: readonly string[];
  resumen: string;
};

/** Las características de un producto, o null si no tiene ninguna confirmada. */
export function caracteristicasDe(producto: Pick<Producto, "slug" | "categoria">): Caracteristicas | null {
  if (producto.categoria !== "Anteojos") return null;
  if (!MODELOS_CONFIRMADOS.has(producto.slug.trim().toLowerCase())) return null;
  return { lista: CARACTERISTICAS_ANTEOJOS, resumen: RESUMEN_ANTEOJOS };
}
