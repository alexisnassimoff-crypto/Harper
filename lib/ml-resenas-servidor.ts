import { unstable_cache } from "next/cache";
import { listRecords } from "./airtable";
import { getProductosParaCobrar } from "./catalogo";
import { esCategoriaDeAnteojos } from "./categorias";
import { registrarIntentoML } from "./estado-ml";
import { mlConfigurado, tokenVigente } from "./ml-auth";
import {
  combinarOpiniones,
  leerReputacion,
  leerResenasDeItem,
  type OpinionesML,
  type ReputacionML,
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
    signal: AbortSignal.timeout(5_000),
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
  const resultados = await Promise.allSettled(
    publicaciones.map(async (p) =>
      leerResenasDeItem(await pedirML(`/reviews/item/${encodeURIComponent(p.id)}?limit=50`, token), p.modelo)
    )
  );

  // Una publicación que ya no existe (404) no tiene opiniones que sumar.
  // Cualquier otro error corta todo: mejor reintentar que guardar 6 horas un
  // total que se quedó corto. El mensaje junta lo que pasó con cada una, para
  // /api/health.
  const errores = resultados.flatMap((r) =>
    r.status === "rejected" && !(r.reason instanceof ErrorML && r.reason.status === 404) ? [r.reason] : []
  );
  if (errores.length > 0) {
    const bien = resultados.filter((r) => r.status === "fulfilled").length;
    const primero = errores[0] instanceof Error ? errores[0].message : String(errores[0]);
    throw new Error(
      `Opiniones: ${bien} de ${resultados.length} publicaciones bien, ${errores.length} con error (el primero: ${primero})`
    );
  }

  const items = resultados.flatMap((r) => (r.status === "fulfilled" && r.value ? [r.value] : []));
  return combinarOpiniones(items);
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
    let opiniones: OpinionesML | null;
    let reputacion: ReputacionML | null;
    try {
      const [token, publicaciones] = await Promise.all([tokenVigente(), publicacionesDeAnteojos()]);
      [opiniones, reputacion] = await Promise.all([
        opinionesDe(publicaciones, token),
        pedirML("/users/me", token).then(leerReputacion),
      ]);
    } catch (error) {
      // La falla se anota acá adentro: cuando ya hay un dato viejo, Next lo
      // sigue sirviendo y se traga el error, y afuera nunca se enteraría.
      await registrarFalla(error instanceof Error ? error.message : String(error));
      throw error;
    }
    await registrarIntentoML({
      ok: true,
      cuando: new Date().toISOString(),
      opiniones: opiniones?.total ?? 0,
      destacadas: opiniones?.destacadas.length ?? 0,
      medalla: reputacion?.medalla ?? null,
      ventas: reputacion?.ventas ?? null,
    });
    return { opiniones, reputacion };
  },
  ["ml-portada-v1"],
  { revalidate: SEIS_HORAS }
);

/**
 * Lo último que se trajo bien, en esta instancia: si una regeneración de la
 * portada se queda sin tiempo esperando a Mercado Libre, muestra esto en vez
 * de nada.
 */
let ultimoBueno: DatosMercadoLibre | null = null;

/** Lo último que se trajo bien de Mercado Libre en esta instancia, o null. */
export function ultimoDeMercadoLibre(): DatosMercadoLibre | null {
  return ultimoBueno;
}

/**
 * Las opiniones de los anteojos Harper en Mercado Libre y la reputación de
 * Harper como vendedor. Null si la cuenta no está conectada o Mercado Libre
 * no contesta.
 *
 * La usa solo la portada, a propósito: el cache de Next distingue cada
 * llamada por el código de la función, y otra ruta (un bundle distinto)
 * podría tener su propia copia y renovar el token por su lado.
 */
export async function datosDeMercadoLibre(): Promise<DatosMercadoLibre | null> {
  if (!mlConfigurado()) return null;
  try {
    const datos = await mercadoLibreCacheado();
    ultimoBueno = datos;
    return datos;
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : String(error);
    console.warn("[mercadolibre] no se pudieron traer las opiniones:", mensaje);
    await registrarFalla(mensaje);
    return ultimoBueno;
  }
}

/**
 * Mientras Mercado Libre falla, cada regeneración de la portada lo vuelve a
 * intentar: el mismo error se guarda a lo sumo cada 10 minutos por instancia.
 */
let ultimaFalla = { mensaje: "", cuando: 0 };
async function registrarFalla(mensaje: string) {
  const ahora = Date.now();
  if (mensaje === ultimaFalla.mensaje && ahora - ultimaFalla.cuando < 10 * 60 * 1000) return;
  ultimaFalla = { mensaje, cuando: ahora };
  await registrarIntentoML({ ok: false, cuando: new Date(ahora).toISOString(), error: mensaje.slice(0, 500) });
}
