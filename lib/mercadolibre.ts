import { tokenVigente } from "./ml-auth";

/**
 * Cliente de la API de Mercado Libre.
 *
 * ML cerró los endpoints públicos de búsqueda: todos los pedidos van
 * autenticados con el token OAuth de la cuenta del vendedor (ver ml-auth.ts).
 */

const API = "https://api.mercadolibre.com";

export type PublicacionML = {
  id: string;
  titulo: string;
  precio: number;
  permalink: string;
  fotos: string[];
};

type ItemDetalle = {
  id: string;
  title: string;
  price: number;
  permalink: string;
  status?: string;
  pictures?: { secure_url?: string; url?: string; max_size?: string }[];
};

async function pedir<T>(ruta: string): Promise<T> {
  const token = await tokenVigente();

  const respuesta = await fetch(`${API}${ruta}`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  if (!respuesta.ok) {
    throw new Error(`Mercado Libre ${respuesta.status} en ${ruta}`);
  }

  return respuesta.json() as Promise<T>;
}

/**
 * Candidatas de una foto, de mayor a menor calidad.
 *
 * La API de ítems entrega la variante estándar de ~500 px. La versión que
 * usa el zoom del sitio es el doble de resolución: prefijo `D_NQ_NP_2X_` y
 * sufijo `-F`. No todas las publicaciones la tienen generada, así que se
 * arma la lista y quien la use verifica cuál existe.
 */
export function candidatasDeFoto(url: string): string[] {
  const segura = url.replace(/^http:/, "https:");

  const base = segura
    .replace("D_NQ_NP_2X_", "D_NQ_NP_")
    .replace(/-[A-Z]\.(jpg|jpeg|png|webp)$/i, "-F.$1");

  const dobleResolucion = base.replace("D_NQ_NP_", "D_NQ_NP_2X_");

  // Sin duplicados y siempre con la original como último recurso.
  return [...new Set([dobleResolucion, base, segura])];
}

/**
 * Devuelve la mejor variante de la foto que realmente exista,
 * verificando con un HEAD contra el CDN de Mercado Libre.
 */
export async function fotoEnMaximaCalidad(url: string): Promise<string> {
  for (const candidata of candidatasDeFoto(url)) {
    try {
      const r = await fetch(candidata, { method: "HEAD", cache: "no-store" });
      if (r.ok) return candidata;
    } catch {
      // El CDN no respondió esa variante: se prueba la siguiente.
    }
  }

  return url.replace(/^http:/, "https:");
}

/**
 * Trae todas las publicaciones activas de la cuenta conectada.
 *
 * Usa /users/me: no depende del nickname, sino de la cuenta que autorizó
 * la aplicación. El parámetro nickname se conserva por compatibilidad pero
 * ya no se usa.
 */
export async function publicacionesDeVendedor(
  _nickname?: string
): Promise<PublicacionML[]> {
  const yo = await pedir<{ id: number; nickname: string }>("/users/me");

  const ids: string[] = [];
  let offset = 0;

  // El listado propio pagina de a 50.
  while (offset < 1000) {
    const pagina = await pedir<{
      results: string[];
      paging: { total: number };
    }>(`/users/${yo.id}/items/search?limit=50&offset=${offset}`);

    ids.push(...pagina.results);

    if (ids.length >= pagina.paging.total || pagina.results.length === 0) {
      break;
    }

    offset += 50;
  }

  const encontrados = ids;

  if (encontrados.length === 0) return [];

  // El detalle trae todas las fotos; el multiget acepta 20 ids por llamada.
  const publicaciones: PublicacionML[] = [];

  for (let i = 0; i < encontrados.length; i += 20) {
    const lote = encontrados.slice(i, i + 20);

    const detalles = await pedir<{ code: number; body: ItemDetalle }[]>(
      `/items?ids=${lote.join(",")}&attributes=id,title,price,permalink,pictures,status`
    );

    for (const entrada of detalles) {
      if (entrada.code !== 200 || !entrada.body) continue;

      const item = entrada.body;

      // Solo las publicaciones activas: las pausadas o cerradas no suman.
      if (item.status && item.status !== "active") continue;
      const fotos = await Promise.all(
        (item.pictures ?? [])
          .map((f) => f.secure_url ?? f.url ?? "")
          .filter(Boolean)
          .map(fotoEnMaximaCalidad)
      );

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
