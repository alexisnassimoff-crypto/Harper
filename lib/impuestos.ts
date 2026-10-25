import { infoCategoria } from "./categorias";
import type { Categoria } from "./tipos";

/**
 * "Precio sin impuestos nacionales" (Res. SIyC 4/2025, art. 2 inc. c).
 *
 * Debajo del precio final, en letra más chica, va el importe sin IVA ni otros
 * impuestos nacionales indirectos, con esa leyenda. Los precios finales no
 * cambian: el neto se calcula a partir de ellos.
 *
 * Cuánto de cada precio son impuestos nacionales depende de la situación
 * fiscal de FOCUS VISION SRL, y eso lo define el contador. Por eso no hay un
 * valor por defecto: mientras Config no lo tenga, no se muestra nada.
 *
 * En Config:
 *  - `impuestos_nacionales`: el porcentaje que suman el IVA y los otros
 *    impuestos nacionales indirectos sobre el precio neto (por ejemplo, 21
 *    si solo hay IVA al 21 %). Vale para todas las categorías.
 *  - `impuestos_nacionales_<categoría>` (anteojos, estuches, panos…): el
 *    mismo dato para una categoría que tenga otra alícuota. Gana sobre el
 *    general.
 */

export type ImpuestosNacionales = {
  general: number | null;
  porCategoria: Record<string, number>;
};

export const SIN_IMPUESTOS_CARGADOS: ImpuestosNacionales = { general: null, porCategoria: {} };

/** "21", "21 %", "10,5" → número. Vacío o inválido → null. */
export function leerTasa(valor: string | null | undefined): number | null {
  const texto = (valor ?? "").replace("%", "").replace(",", ".").trim();
  if (!texto) return null;
  const n = Number(texto);
  if (!Number.isFinite(n) || n < 0 || n >= 100) return null;
  return n;
}

/** Arma las tasas a partir de las filas de Config. */
export function leerImpuestos(mapa: Map<string, string>): ImpuestosNacionales {
  const porCategoria: Record<string, number> = {};
  for (const [clave, valor] of mapa) {
    const m = /^impuestos_nacionales_([a-z0-9-]+)$/.exec(clave);
    if (!m) continue;
    const tasa = leerTasa(valor);
    if (tasa !== null) porCategoria[m[1]] = tasa;
  }
  return { general: leerTasa(mapa.get("impuestos_nacionales")), porCategoria };
}

export function tasaPara(impuestos: ImpuestosNacionales, categoria: Categoria): number | null {
  const slug = infoCategoria(categoria).slug;
  if (slug in impuestos.porCategoria) return impuestos.porCategoria[slug];
  return impuestos.general;
}

/** El neto, con centavos. 89.900 con 21 % → 74.297,52. */
export function precioSinImpuestosNacionales(precioFinal: number, tasa: number): number {
  return Math.round((precioFinal / (1 + tasa / 100)) * 100) / 100;
}

/** El neto de un producto, o null si no hay dato cargado para su categoría. */
export function netoDe(impuestos: ImpuestosNacionales, categoria: Categoria, precioFinal: number): number | null {
  const tasa = tasaPara(impuestos, categoria);
  return tasa === null ? null : precioSinImpuestosNacionales(precioFinal, tasa);
}
