import { esCategoriaDeAnteojos } from "./categorias";
import { rutaDeVariante } from "./variantes";
import { fotosDeVitrina, tinteDeColor } from "./vitrina";
import type { Producto } from "./tipos";

/**
 * «Mis favoritos» de Mi cuenta Harper (Ale, 05/11/2026): el corazón en los
 * anteojos guarda ese modelo en ese color en la cuenta del suscriptor, y Mi
 * cuenta los muestra con foto, modelo, color, precio y el enlace a la ficha.
 *
 * Se guardan en la fila de Suscriptores, en el campo «Favoritos»: un SKU por
 * renglón («CITRINO-CAREY»), el más reciente primero. Así viajan con la
 * cuenta (cualquier dispositivo con la sesión abierta) y se leen en Airtable
 * sin traducir nada. Este archivo no toca la red: lo usan el servidor y el
 * navegador (lib/suscriptores-cuenta.ts lee y escribe la fila).
 */

/** Cuántos favoritos guarda una cuenta como mucho: al pasarse, se va el más viejo. */
export const MAXIMO_DE_FAVORITOS = 60;

/** Un SKU como los de Variantes: letras, números y guiones. */
const ES_SKU = /^[A-Z0-9][A-Z0-9._-]{0,59}$/;

/** El SKU como se guarda y se compara: sin espacios y en mayúsculas. Null si no parece un SKU. */
export function normalizarSku(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const sku = valor.trim().toUpperCase();
  return ES_SKU.test(sku) ? sku : null;
}

/** Los favoritos guardados en la fila: un SKU por renglón, sin repetidos ni basura. */
export function leerFavoritos(texto: unknown): string[] {
  if (typeof texto !== "string") return [];
  const vistos = new Set<string>();
  for (const renglon of texto.split(/[\n,]/)) {
    const sku = normalizarSku(renglon);
    if (sku) vistos.add(sku);
    if (vistos.size >= MAXIMO_DE_FAVORITOS) break;
  }
  return [...vistos];
}

/** Lo que se escribe en el campo «Favoritos». */
export function escribirFavoritos(skus: readonly string[]): string {
  return skus.join("\n");
}

/**
 * La lista después de tocar el corazón: `quiere` lo suma (adelante, como el
 * más reciente) o lo saca. Sumar uno que ya está no lo mueve: tocar dos veces
 * no cambia el orden.
 */
export function cambiarFavorito(lista: readonly string[], sku: string, quiere: boolean): string[] {
  const s = normalizarSku(sku);
  if (!s) return [...lista];
  if (!quiere) return lista.filter((x) => x !== s);
  if (lista.includes(s)) return [...lista];
  return [s, ...lista].slice(0, MAXIMO_DE_FAVORITOS);
}

/** Un favorito listo para mostrar en Mi cuenta. */
export type FavoritoVista = {
  sku: string;
  /** «CITRINO». */
  modelo: string;
  /** «Carey». */
  color: string;
  precio: number;
  /** La foto del color (la de frente, sobre su fondo), o null. */
  foto: string | null;
  /** El fondo de ese color, como en la portada. */
  tinte: string;
  /** La ficha del modelo, abierta en ese color. */
  enlace: string;
  agotada: boolean;
};

/**
 * Los favoritos de la cuenta contra el catálogo, en el orden guardado. Solo
 * anteojos publicados: un color que se dio de baja del catálogo no se
 * muestra (queda guardado, por si vuelve).
 */
export function favoritosDelCatalogo(skus: readonly string[], productos: readonly Producto[]): FavoritoVista[] {
  const porSku = new Map<string, FavoritoVista>();
  for (const producto of productos) {
    if (!esCategoriaDeAnteojos(producto.categoria)) continue;
    producto.variantes.forEach((v, i) => {
      const sku = normalizarSku(v.sku);
      if (!sku) return;
      const respaldo = v.fotos[0] ?? producto.fotoPrincipal ?? "";
      const foto = respaldo || v.fotoPortada ? fotosDeVitrina(v, respaldo).adentro : null;
      porSku.set(sku, {
        sku,
        modelo: producto.nombre,
        color: v.color,
        precio: producto.precio,
        foto: foto || null,
        tinte: tinteDeColor(producto.slug, v.color, i),
        enlace: rutaDeVariante(producto, i),
        agotada: v.agotada,
      });
    });
  }
  return skus.flatMap((sku) => porSku.get(sku) ?? []);
}

/** Los SKU de anteojos del catálogo: los únicos que se pueden sumar a favoritos. */
export function skusDeAnteojos(productos: readonly Producto[]): Set<string> {
  const skus = new Set<string>();
  for (const p of productos) {
    if (!esCategoriaDeAnteojos(p.categoria)) continue;
    for (const v of p.variantes) {
      const sku = normalizarSku(v.sku);
      if (sku) skus.add(sku);
    }
  }
  return skus;
}
