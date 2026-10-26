import { unstable_cache } from "next/cache";
import { listRecords } from "./airtable";
import { getProductosParaCobrar } from "./catalogo";
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

/**
 * Las publicaciones de Mercado Libre de los anteojos publicados en la tienda,
 * con su modelo. El catálogo se lee con `getProductosParaCobrar`, que explota
 * si Airtable falla (`getProductos` devolvería una lista vacía): un catálogo
 * vacío por un error no puede quedar guardado 6 horas como "sin opiniones".
 */
async function publicacionesDeAnteojos(): Promise<{ id: string; modelo: string }[]> {
  const [filas, productos] = await Promise.all([
    listRecords<FilaImportacion>(TABLA_IMPORTACION_ML, { revalidate: SEIS_HORAS }),
    getProductosParaCobrar(),
  ]);
  const modeloDeVariante = new Map(
    productos
      .filter((p) => esCategoriaDeAnteojos(p.categoria))
      .flatMap((p) => p.variantes.map((v) => [v.id, p.nombre] as const))
  );
  const publicaciones = filas.flatMap((f) => {
    const id = f.fields.ML_id?.trim();
    const modelo = (f.fields.Variante ?? []).map((v) => modeloDeVariante.get(v)).find(Boolean);
    return id && modelo ? [{ id, modelo }] : [];
  });
  if (publicaciones.length === 0) throw new Error("Ninguna publicación de Importacion ML enlazada a un anteojo publicado");
  return publicaciones;
}

async function opinionesDe(publicaciones: { id: string; modelo: string }[], token: string): Promise<OpinionesML | null> {
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
}

export type DatosMercadoLibre = { opiniones: OpinionesML | null; reputacion: ReputacionML | null };

/**
 * Las opiniones y la reputación, juntas y con un solo token: si se pidieran
 * por separado, al vencer el token las dos lo renovarían a la vez con el
 * mismo refresh token, que Mercado Libre acepta una sola vez.
 *
 * Si algo falla, explota: el error no se guarda y el próximo intento vuelve
 * a preguntar.
 */
const mercadoLibreCacheado = unstable_cache(
  async (): Promise<DatosMercadoLibre> => {
    const [token, publicaciones] = await Promise.all([tokenVigente(), publicacionesDeAnteojos()]);
    const [opiniones, reputacion] = await Promise.all([
      opinionesDe(publicaciones, token),
      pedirML("/users/me", token).then(leerReputacion),
    ]);
    return { opiniones, reputacion };
  },
  ["ml-portada-v1"],
  { revalidate: SEIS_HORAS }
);

/**
 * Las opiniones de los anteojos Harper en Mercado Libre y la reputación de
 * Harper como vendedor. Null si la cuenta no está conectada o Mercado Libre
 * no contesta.
 */
export async function datosDeMercadoLibre(): Promise<DatosMercadoLibre | null> {
  if (!mlConfigurado()) return null;
  try {
    return await mercadoLibreCacheado();
  } catch (error) {
    console.warn("[mercadolibre] no se pudieron traer las opiniones:", error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Para /api/health: si la portada puede mostrar las opiniones y la
 * reputación, y si no, por qué (el mensaje de Mercado Libre, sin tokens).
 */
export async function diagnosticarMercadoLibre() {
  if (!mlConfigurado()) return { configurado: false };
  try {
    const { opiniones, reputacion } = await mercadoLibreCacheado();
    return {
      configurado: true,
      opiniones: opiniones ? { total: opiniones.total, promedio: opiniones.promedio, destacadas: opiniones.destacadas.length } : null,
      reputacion,
    };
  } catch (error) {
    return { configurado: true, error: error instanceof Error ? error.message : String(error) };
  }
}
