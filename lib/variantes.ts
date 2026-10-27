import type { Producto } from "./tipos";

/**
 * Qué color abre la ficha y cómo se nombra en la URL.
 *
 * Vive aparte de lib/catalogo.ts a propósito: lo usan componentes del
 * navegador, y el catálogo arrastra el cliente de Airtable.
 */

/**
 * La variante con la que abre la ficha.
 *
 * Si la URL pide un color —por SKU o por ID— y existe, manda ese aunque esté
 * agotado: el visitante tocó exactamente ese color en la grilla y tiene que
 * ver que no hay, no otro color distinto sin explicación. Si no pide ninguno,
 * el primero con stock que tenga foto de portada (la de al sol y adentro, la
 * que explica el producto); si ninguno la tiene, el primero con stock; si
 * están todos agotados, el primero.
 */
export function indiceVarianteInicial(producto: Producto, color?: string | null): number {
  const pedido = color?.trim().toLowerCase();

  if (pedido) {
    const indice = producto.variantes.findIndex(
      (v) => v.sku.toLowerCase() === pedido || v.id.toLowerCase() === pedido
    );
    if (indice >= 0) return indice;
  }

  const conPortada = producto.variantes.findIndex((v) => !v.agotada && Boolean(v.fotoPortada?.trim()));
  if (conPortada >= 0) return conPortada;

  return Math.max(0, producto.variantes.findIndex((v) => !v.agotada));
}

/**
 * La ruta de la ficha para un color dado: el SKU en minúsculas como último tramo.
 *
 * Se usa en los enlaces de la grilla y en la ruta /producto/[slug]/[color].
 * Cuando la variante es la que la ficha elegiría sola devuelve la ruta base,
 * para no ensuciar la URL sin necesidad.
 */
export function rutaDeVariante(producto: Producto, indice: number): string {
  const base = `/producto/${producto.slug}`;
  if (indice === indiceVarianteInicial(producto)) return base;

  const variante = producto.variantes[indice];
  if (!variante) return base;

  return `${base}/${encodeURIComponent(variante.sku.toLowerCase())}`;
}
