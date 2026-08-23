/**
 * Cliente de la API pública de Mercado Libre.
 *
 * No necesita credenciales: las publicaciones y sus fotos son públicas.
 * Corre del lado del servidor, en Vercel, que sí tiene salida a internet.
 */

const API = "https://api.mercadolibre.com";
const SITIO_AR = "MLA";

export type PublicacionML = {
  id: string;
  titulo: string;
  precio: number;
  permalink: string;
  fotos: string[];
};

type ItemBusqueda = {
  id: string;
  title: string;
  price: number;
  permalink: string;
};

type ItemDetalle = {
  id: string;
  title: string;
  price: number;
  permalink: string;
  pictures?: { secure_url?: string; url?: string; max_size?: string }[];
};

async function pedir<T>(ruta: string): Promise<T> {
  const respuesta = await fetch(`${API}${ruta}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  if (!respuesta.ok) {
    throw new Error(`Mercado Libre ${respuesta.status} en ${ruta}`);
  }

  return respuesta.json() as Promise<T>;
}

/**
 * Lleva la URL de una foto a su versión original.
 *
 * Mercado Libre sirve varios tamaños con un sufijo de una letra antes de la
 * extensión (-I, -V, -F, -O…). `-O` es la original, que es la que queremos
 * para la ficha de producto.
 */
export function fotoEnMaximaCalidad(url: string) {
  return url
    .replace(/^http:/, "https:")
    .replace(/-[A-Z]\.(jpg|jpeg|png|webp)$/i, "-O.$1");
}

/** Trae todas las publicaciones activas de un vendedor, por su nickname. */
export async function publicacionesDeVendedor(
  nickname: string
): Promise<PublicacionML[]> {
  const encontrados: ItemBusqueda[] = [];
  let offset = 0;

  // La búsqueda pagina de a 50; se corta al agotar los resultados.
  while (offset < 500) {
    const pagina = await pedir<{
      results: ItemBusqueda[];
      paging: { total: number };
    }>(
      `/sites/${SITIO_AR}/search?nickname=${encodeURIComponent(
        nickname
      )}&limit=50&offset=${offset}`
    );

    encontrados.push(...pagina.results);

    if (encontrados.length >= pagina.paging.total || pagina.results.length === 0) {
      break;
    }

    offset += 50;
  }

  if (encontrados.length === 0) return [];

  // El detalle trae todas las fotos; el multiget acepta 20 ids por llamada.
  const publicaciones: PublicacionML[] = [];

  for (let i = 0; i < encontrados.length; i += 20) {
    const lote = encontrados.slice(i, i + 20).map((r) => r.id);

    const detalles = await pedir<{ code: number; body: ItemDetalle }[]>(
      `/items?ids=${lote.join(",")}&attributes=id,title,price,permalink,pictures`
    );

    for (const entrada of detalles) {
      if (entrada.code !== 200 || !entrada.body) continue;

      const item = entrada.body;
      const fotos = (item.pictures ?? [])
        .map((f) => f.secure_url ?? f.url ?? "")
        .filter(Boolean)
        .map(fotoEnMaximaCalidad);

      publicaciones.push({
        id: item.id,
        titulo: item.title,
        precio: item.price,
        permalink: item.permalink,
        fotos,
      });
    }
  }

  return publicaciones;
}

/* ==========================================================================
   Sugerencia de SKU
   ========================================================================== */

const MODELOS = ["R100", "O300", "M500"];

const COLORES: { clave: string; alias: string[] }[] = [
  { clave: "MARRON", alias: ["marron", "marrón", "cognac", "cuero", "caramelo"] },
  { clave: "NEGRO", alias: ["negro", "black"] },
  { clave: "GRIS", alias: ["gris", "grafito", "plomo"] },
  { clave: "AZUL", alias: ["azul", "petroleo", "petróleo", "navy"] },
  { clave: "ROJO", alias: ["rojo", "bordo", "bordó"] },
  { clave: "CAMEL", alias: ["camel", "mostaza", "miel", "beige"] },
];

/**
 * Adivina a qué SKU corresponde una publicación, a partir de su título.
 *
 * Es solo una sugerencia: queda escrita en la tabla para que se revise antes
 * de aplicar. Nunca asigna fotos por su cuenta.
 */
export function sugerirSku(titulo: string): string {
  const normalizado = titulo
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();

  const modelo = MODELOS.find((m) => normalizado.includes(m));
  if (!modelo) return "";

  const color = COLORES.find((c) =>
    c.alias.some((a) =>
      normalizado.includes(
        a.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase()
      )
    )
  );

  return color ? `${modelo}-${color.clave}` : modelo;
}
