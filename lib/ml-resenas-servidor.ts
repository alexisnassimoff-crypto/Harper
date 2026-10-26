import { unstable_cache } from "next/cache";
import { listRecords } from "./airtable";
import { getProductos } from "./catalogo";
import { esCategoriaDeAnteojos } from "./categorias";
import { mlConfigurado, tokenVigente } from "./ml-auth";
import {
  combinarOpiniones,
  leerReputacion,
  leerResenasDeItem,
  type OpinionesML,
  type ReputacionML,
  type ResenasDeItem,
  TABLA_IMPORTACION_ML,
} from "./ml-resenas";

/**
 * La consulta a Mercado Libre de las opiniones y la reputación (ver
 * lib/ml-resenas.ts). Se guarda 6 horas: la portada no le pregunta a Mercado
 * Libre en cada visita.
 */

/**
 * La API real. `ML_API_URL` la reemplaza SOLO fuera de Vercel, para la prueba
 * de punta a punta local contra un Mercado Libre de mentira.
 */
const API = (!process.env.VERCEL && process.env.ML_API_URL?.replace(/\/$/, "")) || "https://api.mercadolibre.com";

const SEIS_HORAS = 6 * 60 * 60;

class ErrorML extends Error {
  constructor(
    readonly status: number,
    ruta: string
  ) {
    super(`Mercado Libre ${status} en ${ruta}`);
  }
}

async function pedirML(ruta: string, token: string): Promise<unknown> {
  const respuesta = await fetch(`${API}${ruta}`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!respuesta.ok) throw new ErrorML(respuesta.status, ruta);
  return respuesta.json();
}

type FilaImportacion = { ML_id?: string; Variante?: string[] };

/** Las publicaciones de Mercado Libre de los anteojos publicados en la tienda, con su modelo. */
async function publicacionesDeAnteojos(): Promise<{ id: string; modelo: string }[]> {
  const [filas, productos] = await Promise.all([
    listRecords<FilaImportacion>(TABLA_IMPORTACION_ML, { revalidate: SEIS_HORAS }),
    getProductos(),
  ]);
  const modeloDeVariante = new Map(
    productos
      .filter((p) => esCategoriaDeAnteojos(p.categoria))
      .flatMap((p) => p.variantes.map((v) => [v.id, p.nombre] as const))
  );
  return filas.flatMap((f) => {
    const id = f.fields.ML_id?.trim();
    const modelo = (f.fields.Variante ?? []).map((v) => modeloDeVariante.get(v)).find(Boolean);
    return id && modelo ? [{ id, modelo }] : [];
  });
}

const opinionesCacheadas = unstable_cache(
  async (): Promise<OpinionesML | null> => {
    const token = await tokenVigente();
    const publicaciones = await publicacionesDeAnteojos();
    const items = await Promise.all(
      publicaciones.map(async (p) => {
        try {
          return leerResenasDeItem(await pedirML(`/reviews/item/${encodeURIComponent(p.id)}?limit=50`, token), p.modelo);
        } catch (error) {
          // Una publicación que ya no existe no tiene opiniones que sumar.
          // Cualquier otro error corta todo: mejor reintentar que guardar
          // 6 horas un total que se quedó corto.
          if (error instanceof ErrorML && error.status === 404) return null;
          throw error;
        }
      })
    );
    return combinarOpiniones(items.filter((i): i is ResenasDeItem => i !== null));
  },
  ["ml-opiniones-anteojos-v1"],
  { revalidate: SEIS_HORAS }
);

const reputacionCacheada = unstable_cache(
  async (): Promise<ReputacionML | null> => leerReputacion(await pedirML("/users/me", await tokenVigente())),
  ["ml-reputacion-v1"],
  { revalidate: SEIS_HORAS }
);

/**
 * Las opiniones de los anteojos Harper en Mercado Libre. Null si no hay o si
 * Mercado Libre no contesta: el error no se guarda, así el próximo intento
 * vuelve a preguntar.
 */
export async function opinionesDeAnteojos(): Promise<OpinionesML | null> {
  if (!mlConfigurado()) return null;
  try {
    return await opinionesCacheadas();
  } catch (error) {
    console.warn("[mercadolibre] no se pudieron traer las opiniones:", error instanceof Error ? error.message : error);
    return null;
  }
}

/** La reputación de Harper como vendedor en Mercado Libre, o null. */
export async function reputacionEnMercadoLibre(): Promise<ReputacionML | null> {
  if (!mlConfigurado()) return null;
  try {
    return await reputacionCacheada();
  } catch (error) {
    console.warn("[mercadolibre] no se pudo traer la reputación:", error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Para /api/health: si la portada puede mostrar las opiniones y la
 * reputación, y si no, por qué (el mensaje de Mercado Libre, sin tokens).
 */
export async function diagnosticarMercadoLibre() {
  if (!mlConfigurado()) return { configurado: false };
  const motivo = (error: unknown) => ({ error: error instanceof Error ? error.message : String(error) });
  const [opiniones, reputacion] = await Promise.all([
    opinionesCacheadas().then(
      (o) => (o ? { total: o.total, promedio: o.promedio, destacadas: o.destacadas.length } : null),
      motivo
    ),
    reputacionCacheada().catch(motivo),
  ]);
  return { configurado: true, opiniones, reputacion };
}
