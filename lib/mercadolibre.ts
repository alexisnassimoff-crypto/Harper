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


// ---------------------------------------------------------------------------
// Peso y medidas del envío
// ---------------------------------------------------------------------------

/** Lo que Correo Argentino necesita para cotizar, leído de una publicación. */
export type MedidasML = {
  id: string;
  pesoG: number | null;
  largoCm: number | null;
  anchoCm: number | null;
  altoCm: number | null;
  /** De dónde salió: los atributos de la ficha o la config de Mercado Envíos. */
  origen: "atributos" | "envios" | null;
};

type AtributoML = {
  id?: string;
  value_name?: string;
  value_struct?: { number?: number; unit?: string } | null;
};

type ItemMedidas = {
  id: string;
  attributes?: AtributoML[];
  shipping?: { dimensions?: string | null };
};

/**
 * Trae el peso y las medidas de cada publicación.
 *
 * Mercado Libre guarda lo mismo en dos lugares distintos y no siempre en los
 * dos: los atributos de la ficha (PACKAGE_WEIGHT y compañía) y la cadena
 * `shipping.dimensions` que usa Mercado Envíos, con formato "alto x ancho x
 * largo, peso". Se prueban los atributos primero porque son los que el vendedor
 * carga a mano; si no están, se cae a la de envíos.
 *
 * Un item sin ninguno de los dos vuelve con todo en `null` y el importador lo
 * reporta como faltante en vez de inventar un número.
 */
export async function medidasDePublicaciones(ids: string[]): Promise<MedidasML[]> {
  const salida: MedidasML[] = [];

  // El multiget acepta 20 ids por llamada.
  for (let i = 0; i < ids.length; i += 20) {
    const lote = ids.slice(i, i + 20);

    const detalles = await pedir<{ code: number; body: ItemMedidas }[]>(
      `/items?ids=${lote.join(",")}&attributes=id,attributes,shipping`
    );

    for (const entrada of detalles) {
      if (entrada.code !== 200 || !entrada.body) continue;
      salida.push(leerMedidas(entrada.body));
    }
  }

  return salida;
}

function leerMedidas(item: ItemMedidas): MedidasML {
  const porId = new Map<string, AtributoML>();
  for (const a of item.attributes ?? []) {
    if (a.id) porId.set(a.id, a);
  }

  const pesoG = aGramos(porId.get("PACKAGE_WEIGHT"));
  const largoCm = aCentimetros(porId.get("PACKAGE_LENGTH"));
  const anchoCm = aCentimetros(porId.get("PACKAGE_WIDTH"));
  const altoCm = aCentimetros(porId.get("PACKAGE_HEIGHT"));

  if (pesoG && largoCm && anchoCm && altoCm) {
    return { id: item.id, pesoG, largoCm, anchoCm, altoCm, origen: "atributos" };
  }

  const deEnvios = leerDimensionesDeEnvios(item.shipping?.dimensions);

  if (deEnvios) return { id: item.id, ...deEnvios, origen: "envios" };

  // Puede haber datos a medias: se devuelven igual para poder reportarlos.
  return { id: item.id, pesoG, largoCm, anchoCm, altoCm, origen: null };
}

/** `shipping.dimensions` viene como "alto x ancho x largo, peso_en_gramos". */
function leerDimensionesDeEnvios(crudo: string | null | undefined) {
  if (!crudo) return null;

  const [medidas, peso] = crudo.split(",");
  const partes = (medidas ?? "").split("x").map((n) => Number(n.trim()));

  if (partes.length !== 3 || partes.some((n) => !Number.isFinite(n) || n <= 0)) {
    return null;
  }

  const pesoG = Number((peso ?? "").trim());
  if (!Number.isFinite(pesoG) || pesoG <= 0) return null;

  const [altoCm, anchoCm, largoCm] = partes;
  return { pesoG: Math.round(pesoG), largoCm, anchoCm, altoCm };
}

/** Normaliza un atributo de peso a gramos. */
function aGramos(atributo: AtributoML | undefined): number | null {
  const valor = numeroYUnidad(atributo);
  if (!valor) return null;

  const factor: Record<string, number> = { g: 1, gr: 1, kg: 1000, mg: 0.001 };
  const multiplicador = factor[valor.unidad] ?? (valor.unidad ? 0 : 1);

  if (multiplicador === 0) return null;

  const gramos = Math.round(valor.numero * multiplicador);
  return gramos > 0 ? gramos : null;
}

/** Normaliza un atributo de longitud a centímetros. */
function aCentimetros(atributo: AtributoML | undefined): number | null {
  const valor = numeroYUnidad(atributo);
  if (!valor) return null;

  const factor: Record<string, number> = { cm: 1, mm: 0.1, m: 100 };
  const multiplicador = factor[valor.unidad] ?? (valor.unidad ? 0 : 1);

  if (multiplicador === 0) return null;

  const cm = Math.round(valor.numero * multiplicador * 10) / 10;
  return cm > 0 ? cm : null;
}

/**
 * Saca número y unidad de un atributo.
 *
 * `value_struct` es lo confiable cuando está; si no, hay que parsear el
 * `value_name`, que llega como "180 g" o "17.5 cm".
 */
function numeroYUnidad(atributo: AtributoML | undefined) {
  if (!atributo) return null;

  const struct = atributo.value_struct;
  if (struct && typeof struct.number === "number" && Number.isFinite(struct.number)) {
    return { numero: struct.number, unidad: (struct.unit ?? "").trim().toLowerCase() };
  }

  const texto = atributo.value_name?.trim();
  if (!texto) return null;

  const coincidencia = texto.match(/^([\d.,]+)\s*([a-zA-Z"]*)$/);
  if (!coincidencia) return null;

  const numero = Number(coincidencia[1].replace(",", "."));
  if (!Number.isFinite(numero)) return null;

  return { numero, unidad: coincidencia[2].trim().toLowerCase() };
}
