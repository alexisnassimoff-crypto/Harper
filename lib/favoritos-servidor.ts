import { getProductos } from "./catalogo";
import { normalizarSku, skusDeAnteojos } from "./favoritos";
import { guardarFavorito, type CuentaSuscriptor } from "./suscriptores-cuenta";
import type { Producto } from "./tipos";

/**
 * Lo que hace POST /api/suscriptores/favoritos con la cuenta de la sesión
 * (Ale, 05/11/2026), aparte de la ruta para poder probarlo.
 */

export type PedidoDeFavorito = { sku: string; quiere: boolean };

/** El cuerpo del pedido: `{ sku, favorito: true | false }`. Null si no es eso. */
export function leerPedidoDeFavorito(cuerpo: unknown): PedidoDeFavorito | null {
  if (!cuerpo || typeof cuerpo !== "object") return null;
  const { sku, favorito } = cuerpo as { sku?: unknown; favorito?: unknown };
  const s = normalizarSku(sku);
  return s && typeof favorito === "boolean" ? { sku: s, quiere: favorito } : null;
}

export type ResultadoFavorito =
  | { estado: "ok"; favoritos: string[] }
  /** Para sumar hace falta el catálogo, y no se pudo leer. */
  | { estado: "sin-catalogo" }
  /** Ese SKU no es de un anteojo publicado: no se suma. */
  | { estado: "no-es-anteojo" };

/**
 * Suma o saca el favorito en la fila de esa cuenta. Sumar pide que sea un
 * anteojo del catálogo; sacar vale con cualquiera (así se limpia uno que ya
 * no se vende). Un error de Airtable al escribir sube tal cual.
 */
export async function aplicarFavorito(
  cuenta: CuentaSuscriptor,
  pedido: PedidoDeFavorito,
  catalogo: () => Promise<Producto[]> = getProductos
): Promise<ResultadoFavorito> {
  if (pedido.quiere) {
    const productos = await catalogo();
    if (productos.length === 0) return { estado: "sin-catalogo" };
    if (!skusDeAnteojos(productos).has(pedido.sku)) return { estado: "no-es-anteojo" };
  }
  return { estado: "ok", favoritos: await guardarFavorito(cuenta, pedido.sku, pedido.quiere) };
}
