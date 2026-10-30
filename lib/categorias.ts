/**
 * Las categorías de la tienda, en un solo lugar.
 *
 * Una categoría aparece en el menú, en la portada y en el sitemap recién
 * cuando tiene al menos un producto publicado en Airtable: hoy se ven
 * Anteojos, Estuches y Paños; Anteojos de sol, Clip-On y Anteojos de receta
 * están previstas, sin productos, sin fechas y sin nada publicado. Cuando se
 * carguen productos con esa categoría en Airtable, aparecen solas.
 *
 * Que una categoría sea "de anteojos" solo ordena la tienda (secciones de la
 * portada, "pares" en la promoción). NO le da características a sus
 * productos: eso es por modelo y confirmado (lib/caracteristicas.ts).
 *
 * Para agregar una categoría nueva: sumarla acá con su nombre exacto de
 * Airtable y su slug, y agregar esa opción al campo Categoria de Productos.
 *
 * «Membresía» es Socios Harper (lib/socios.ts): se vende como un producto
 * más, pero no es una sección de la tienda. No va al menú ni a la grilla ni
 * tiene ficha: tiene su página, /socios.
 */

export const CATEGORIAS = [
  { nombre: "Anteojos", slug: "anteojos", tipo: "anteojos" },
  { nombre: "Anteojos de sol", slug: "anteojos-de-sol", tipo: "anteojos" },
  { nombre: "Clip-On", slug: "clip-on", tipo: "anteojos" },
  { nombre: "Anteojos de receta", slug: "anteojos-de-receta", tipo: "anteojos" },
  { nombre: "Estuches", slug: "estuches", tipo: "complemento" },
  { nombre: "Paños", slug: "panos", tipo: "complemento" },
  { nombre: "Membresía", slug: "socios", tipo: "membresia" },
] as const;

export type Categoria = (typeof CATEGORIAS)[number]["nombre"];
export type InfoCategoria = (typeof CATEGORIAS)[number];

const normalizar = (texto: string) =>
  texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * La categoría de un producto según lo que dice Airtable, tolerando
 * mayúsculas, tildes y guiones ("Clip On", "clip-on", "Anteojos de Sol").
 * Null si no es ninguna conocida: ese producto no se publica en vez de
 * mostrarse en una sección equivocada.
 */
export function categoriaDesdeTexto(texto: string | undefined | null): Categoria | null {
  if (!texto) return null;
  const buscado = normalizar(texto);
  return CATEGORIAS.find((c) => normalizar(c.nombre) === buscado || normalizar(c.slug) === buscado)?.nombre ?? null;
}

export function infoCategoria(nombre: Categoria): InfoCategoria {
  return CATEGORIAS.find((c) => c.nombre === nombre) ?? CATEGORIAS[0];
}

export function categoriaPorSlug(slug: string): InfoCategoria | null {
  return CATEGORIAS.find((c) => c.slug === slug) ?? null;
}

export function rutaDeCategoria(nombre: Categoria): string {
  return `/${infoCategoria(nombre).slug}`;
}

/** Anteojos, de sol, Clip-On, de receta: se cuentan en pares y van primero. */
export function esCategoriaDeAnteojos(nombre: Categoria): boolean {
  return infoCategoria(nombre).tipo === "anteojos";
}

/** Socios Harper: se vende como producto, pero no es una sección de la tienda. */
export function esMembresia(nombre: Categoria): boolean {
  return infoCategoria(nombre).tipo === "membresia";
}

/** Las categorías con productos publicados, en el orden del registro. Sin la membresía. */
export function categoriasConProductos(productos: { categoria: Categoria }[]): InfoCategoria[] {
  const presentes = new Set(productos.map((p) => p.categoria));
  return CATEGORIAS.filter((c) => presentes.has(c.nombre) && c.tipo !== "membresia");
}
