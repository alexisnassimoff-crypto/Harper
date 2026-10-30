import { esCategoriaDeAnteojos, type Categoria } from "./categorias";

/**
 * Las opiniones y la reputación de Harper en Mercado Libre, para la portada
 * y las fichas: las de todos los productos juntas (anteojos, estuches y
 * paños), así ningún producto queda con dos opiniones sueltas.
 *
 * Todo sale de la API de Mercado Libre, con la cuenta de Harper (la misma
 * conexión OAuth que usa la importación de fotos): nada se carga a mano ni
 * se inventa. Si Mercado Libre no contesta, o la cuenta no está conectada,
 * la portada no muestra el bloque: nunca un número de relleno.
 *
 * Acá está la lectura de las respuestas, sin nada de servidor; la consulta
 * está en lib/ml-resenas-servidor.ts.
 */

/** La tabla "Importacion ML": cada publicación de Mercado Libre, enlazada a su variante. */
export const TABLA_IMPORTACION_ML = "tblOh2HN0cORWCPPb";

export type ResenaML = {
  id: string;
  estrellas: number;
  titulo: string;
  texto: string;
  /** ISO, como la manda Mercado Libre. */
  fecha: string;
  /** Qué compró, dicho para la tarjeta: "Modelo CUARZO", "Estuche R100". Null si no se sabe. */
  producto: string | null;
};

export type OpinionesML = {
  /** Promedio de estrellas, con un decimal. */
  promedio: number;
  /** Cuántas opiniones hay en total. */
  total: number;
  /** Las que se muestran: con texto, de 4 o 5 estrellas, las más recientes. */
  destacadas: ResenaML[];
};

export type Medalla = "platinum" | "gold" | "silver";

/** Las opiniones y la reputación, como las guarda el servidor y las muestran la portada y las fichas. */
export type DatosMercadoLibre = { opiniones: OpinionesML | null; reputacion: ReputacionML | null };

export type ReputacionML = {
  medalla: Medalla | null;
  /** El termómetro de Mercado Libre, de 1 (rojo) a 5 (verde); null si no viene. */
  nivel: number | null;
  /** Ventas concretadas, según Mercado Libre. */
  ventas: number;
  /** Calificaciones positivas, en %; null si no viene. */
  positivas: number | null;
};

export type ResenasDeItem = {
  total: number;
  /** Cantidad de opiniones de 1 a 5 estrellas (índice 0 = 1 estrella). */
  niveles: [number, number, number, number, number];
  resenas: ResenaML[];
  /** Para no contar dos veces publicaciones que comparten las mismas opiniones. */
  firma: string;
};

const numero = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const texto = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");

/** Lo que contesta `GET /reviews/item/{id}`, ya validado. Null si no tiene la forma esperada. */
export function leerResenasDeItem(json: unknown, producto: string | null = null): ResenasDeItem | null {
  if (!json || typeof json !== "object") return null;
  const d = json as {
    paging?: { total?: unknown };
    reviews?: unknown;
    rating_levels?: Record<string, unknown>;
  };
  const niveles: ResenasDeItem["niveles"] = [
    numero(d.rating_levels?.one_star),
    numero(d.rating_levels?.two_star),
    numero(d.rating_levels?.three_star),
    numero(d.rating_levels?.four_star),
    numero(d.rating_levels?.five_star),
  ];
  const sumaNiveles = niveles.reduce((a, b) => a + b, 0);
  const total = sumaNiveles || numero(d.paging?.total);

  const resenas: ResenaML[] = (Array.isArray(d.reviews) ? d.reviews : [])
    .map((r: Record<string, unknown>) => ({
      id: String(r?.id ?? ""),
      estrellas: numero(r?.rate),
      titulo: texto(r?.title),
      texto: texto(r?.content),
      fecha: texto(r?.date_created),
      producto,
    }))
    .filter((r) => r.id && r.estrellas >= 1 && r.estrellas <= 5);

  const firma = `${niveles.join("-")}/${total}:${resenas
    .map((r) => r.id)
    .sort()
    .slice(0, 5)
    .join(",")}`;

  return { total, niveles, resenas, firma };
}

/**
 * Junta las opiniones de varias publicaciones (un color por publicación).
 * Si dos publicaciones devuelven las mismas opiniones (Mercado Libre las
 * agrupa por producto), se cuentan una sola vez.
 */
export function combinarOpiniones(items: ResenasDeItem[], maximo = 20): OpinionesML | null {
  const vistos = new Set<string>();
  const niveles = [0, 0, 0, 0, 0];
  const porId = new Map<string, ResenaML>();

  for (const resenas of items) {
    if (!vistos.has(resenas.firma)) {
      vistos.add(resenas.firma);
      resenas.niveles.forEach((n, i) => (niveles[i] += n));
    }
    for (const r of resenas.resenas) if (!porId.has(r.id)) porId.set(r.id, r);
  }

  const total = niveles.reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  const promedio = Math.round((niveles.reduce((suma, n, i) => suma + n * (i + 1), 0) / total) * 10) / 10;

  const destacadas = [...porId.values()]
    .filter((r) => r.estrellas >= 4 && r.texto.length >= 12)
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
    .slice(0, maximo);

  return { promedio, total, destacadas };
}

/** Cómo se nombra en la tarjeta lo que compró: "Modelo CUARZO", "Estuche R100", "Paño Premium Alta Densidad". */
export function etiquetaDeProducto(nombre: string, categoria: Categoria): string {
  if (esCategoriaDeAnteojos(categoria)) return `Modelo ${nombre}`;
  const tipo = categoria === "Estuches" ? "Estuche" : categoria === "Paños" ? "Paño" : null;
  return tipo && !nombre.toLowerCase().startsWith(tipo.toLowerCase()) ? `${tipo} ${nombre}` : nombre;
}

/**
 * Las publicaciones de las que se leen opiniones: las de la tabla
 * "Importacion ML" (con lo que se compró, si están enlazadas a un producto)
 * más las de la cuenta que no estén en la tabla (sin etiqueta). Sin repetir.
 */
export function unirPublicaciones(
  deLaTabla: { id: string; producto: string | null }[],
  deLaCuenta: string[]
): { id: string; producto: string | null }[] {
  const porId = new Map<string, string | null>();
  for (const p of deLaTabla) if (!porId.has(p.id) || (p.producto && !porId.get(p.id))) porId.set(p.id, p.producto);
  for (const id of deLaCuenta) if (!porId.has(id)) porId.set(id, null);
  return [...porId].map(([id, producto]) => ({ id, producto }));
}

/** Lo que contesta `GET /users/{id}/items/search`: los ID de las publicaciones y cuántas hay en total. */
export function leerPublicacionesDeLaCuenta(json: unknown): { ids: string[]; total: number } {
  const d = (json && typeof json === "object" ? json : {}) as { results?: unknown; paging?: { total?: unknown } };
  const ids = (Array.isArray(d.results) ? d.results : []).filter((id): id is string => typeof id === "string" && /^MLA\d+$/.test(id));
  return { ids, total: numero(d.paging?.total) };
}

/** Valida lo que vuelve de Redis: la forma de `DatosMercadoLibre`, o null. */
export function leerDatosGuardados(json: unknown): DatosMercadoLibre | null {
  if (!json || typeof json !== "object") return null;
  const d = json as Partial<DatosMercadoLibre>;
  const o = d.opiniones;
  const opiniones =
    o && typeof o.promedio === "number" && typeof o.total === "number" && o.total > 0 && Array.isArray(o.destacadas) ? o : null;
  const r = d.reputacion;
  const reputacion = r && typeof r.ventas === "number" ? r : null;
  return opiniones || reputacion ? { opiniones, reputacion } : null;
}

/** Lo que contesta `GET /users/me` (o `/users/{id}`): la reputación de vendedor. */
export function leerReputacion(json: unknown): ReputacionML | null {
  if (!json || typeof json !== "object") return null;
  const rep = (json as { seller_reputation?: Record<string, unknown> }).seller_reputation;
  if (!rep || typeof rep !== "object") return null;

  const estado = typeof rep.power_seller_status === "string" ? rep.power_seller_status.toLowerCase() : "";
  const medalla = estado === "platinum" || estado === "gold" || estado === "silver" ? estado : null;
  const transacciones = (rep.transactions ?? {}) as { completed?: unknown; ratings?: { positive?: unknown } };
  const ventas = numero(transacciones.completed);
  const positiva = transacciones.ratings?.positive;
  const positivas = typeof positiva === "number" && positiva >= 0 && positiva <= 1 ? Math.round(positiva * 100) : null;
  // "5_green", "4_light_green"… el número es la posición en el termómetro.
  const nivelCrudo = typeof rep.level_id === "string" ? Number.parseInt(rep.level_id, 10) : NaN;
  const nivel = nivelCrudo >= 1 && nivelCrudo <= 5 ? nivelCrudo : null;

  if (!medalla && ventas === 0) return null;
  return { medalla, nivel, ventas, positivas };
}

export function nombreMedalla(medalla: Medalla): string {
  return `MercadoLíder ${medalla === "platinum" ? "Platinum" : medalla === "gold" ? "Gold" : "Silver"}`;
}

/** "+500 ventas" (redondeado para abajo a la centena), o el número exacto si son menos de 100. */
export function textoVentas(ventas: number): string {
  if (ventas >= 100) return `+${Math.floor(ventas / 100) * 100} ventas`;
  return `${ventas} ${ventas === 1 ? "venta" : "ventas"}`;
}
