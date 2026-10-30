import { unstable_cache } from "next/cache";
import { listRecords } from "./airtable";
import { getProductosParaCobrar } from "./catalogo";
import { guardarDatosML, leerDatosML, registrarIntentoML } from "./estado-ml";
import { mlConfigurado, tokenVigente } from "./ml-auth";
import {
  combinarOpiniones,
  etiquetaDeProducto,
  leerPublicacionesDeLaCuenta,
  leerReputacion,
  leerResenasDeItem,
  type DatosMercadoLibre,
  type OpinionesML,
  type ReputacionML,
  TABLA_IMPORTACION_ML,
  unirPublicaciones,
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
    ruta: string,
    detalle: string
  ) {
    super(`Mercado Libre ${status} en ${ruta}${detalle ? ` (${detalle})` : ""}`);
  }
}

/**
 * Sin permiso para ese dato (403): no se arregla reintentando, se arregla en
 * la aplicación de Mercado Libre. Un 401 no entra: puede ser un token que
 * venció en el medio, y eso sí se arregla en el próximo intento.
 */
const esSinPermiso = (error: unknown) =>
  (error instanceof ErrorML && error.status === 403) || (error instanceof ErrorOpiniones && error.sinPermiso);

/**
 * El motivo que da Mercado Libre, para /api/health: "PolicyAgent:
 * PA_UNAUTHORIZED_RESULT_FROM_POLICIES: …". Sus respuestas de error no
 * traen el token.
 */
async function motivoML(respuesta: Response): Promise<string> {
  const cuerpo = (await respuesta.json().catch(() => null)) as Record<string, unknown> | null;
  if (!cuerpo) return "";
  return ["blocked_by", "code", "error", "message"]
    .map((k) => (typeof cuerpo[k] === "string" ? (cuerpo[k] as string) : ""))
    .filter(Boolean)
    .join(": ")
    .slice(0, 200);
}

async function pedirML(ruta: string, token: string): Promise<unknown> {
  const respuesta = await fetch(`${API}${ruta}`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(5_000),
  });
  if (!respuesta.ok) throw new ErrorML(respuesta.status, ruta, await motivoML(respuesta));
  return respuesta.json();
}

type FilaImportacion = { ML_id?: string; Variante?: string[] };
type Publicacion = { id: string; producto: string | null };

/**
 * Todas las publicaciones de Mercado Libre de la tabla "Importacion ML"
 * (anteojos, estuches y paños), con lo que se compró en cada una cuando
 * están enlazadas a un producto publicado. El catálogo se lee con
 * `getProductosParaCobrar`, que explota si Airtable falla (`getProductos`
 * devolvería una lista vacía): un catálogo vacío por un error no puede
 * quedar guardado 6 horas sin las etiquetas.
 */
async function publicacionesDeLaTabla(): Promise<Publicacion[]> {
  const [filas, productos] = await Promise.all([
    listRecords<FilaImportacion>(TABLA_IMPORTACION_ML, { revalidate: SEIS_HORAS }),
    getProductosParaCobrar(),
  ]);
  const productoDeVariante = new Map(
    productos.flatMap((p) => p.variantes.map((v) => [v.id, etiquetaDeProducto(p.nombre, p.categoria)] as const))
  );
  const publicaciones = filas.flatMap((f) => {
    const id = f.fields.ML_id?.trim();
    const producto = (f.fields.Variante ?? []).map((v) => productoDeVariante.get(v)).find(Boolean) ?? null;
    return id ? [{ id, producto }] : [];
  });
  if (publicaciones.length === 0) throw new Error("La tabla Importacion ML no tiene publicaciones");
  return publicaciones;
}

/** Hasta 500 publicaciones de la cuenta: de sobra para Harper. */
const MAXIMO_DE_LA_CUENTA = 500;

/**
 * Las publicaciones de la cuenta de Harper en Mercado Libre, también las que
 * no están en la tabla (otro color, otro paño). Si Mercado Libre no las da,
 * se sigue con las de la tabla: es un agregado, no una condición.
 */
async function publicacionesDeLaCuenta(usuario: unknown, token: string): Promise<string[]> {
  const id = (usuario as { id?: unknown } | null)?.id;
  if (typeof id !== "number" && typeof id !== "string") return [];
  const ids: string[] = [];
  for (let desde = 0; desde < MAXIMO_DE_LA_CUENTA; desde += 100) {
    const pagina = leerPublicacionesDeLaCuenta(
      await pedirML(`/users/${encodeURIComponent(String(id))}/items/search?limit=100&offset=${desde}`, token)
    );
    ids.push(...pagina.ids);
    if (pagina.ids.length === 0 || desde + 100 >= pagina.total) break;
  }
  return ids;
}

async function opinionesDe(publicaciones: Publicacion[], token: string): Promise<OpinionesML | null> {
  const resultados = await Promise.allSettled(
    publicaciones.map(async (p) =>
      leerResenasDeItem(await pedirML(`/reviews/item/${encodeURIComponent(p.id)}?limit=50`, token), p.producto)
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
    throw new ErrorOpiniones(
      `Opiniones: ${bien} de ${resultados.length} publicaciones bien, ${errores.length} con error (el primero: ${primero})`,
      // "Sin permiso" solo si no cargó ninguna: con algunas bien y otra en
      // 403 se reintenta, en vez de guardar 6 horas un total que se quedó corto.
      bien === 0 && errores.every(esSinPermiso)
    );
  }

  const items = resultados.flatMap((r) => (r.status === "fulfilled" && r.value ? [r.value] : []));
  return combinarOpiniones(items);
}

class ErrorOpiniones extends Error {
  constructor(
    mensaje: string,
    /** Todas las publicaciones contestaron "sin permiso" (403). */
    readonly sinPermiso: boolean
  ) {
    super(mensaje);
  }
}

export type { DatosMercadoLibre };

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
    let aviso: string | undefined;
    try {
      const [token, deLaTabla] = await Promise.all([tokenVigente(), publicacionesDeLaTabla()]);
      const usuario = pedirML("/users/me", token);
      let avisoCuenta: string | undefined;
      const [deOpiniones, deReputacion] = await Promise.allSettled([
        usuario
          .then((u) => publicacionesDeLaCuenta(u, token))
          .catch((error) => {
            // Sin la lista de la cuenta, las de la tabla alcanzan.
            avisoCuenta = `Publicaciones de la cuenta: ${error instanceof Error ? error.message : String(error)}`;
            return [] as string[];
          })
          .then((deLaCuenta) => opinionesDe(unirPublicaciones(deLaTabla, deLaCuenta), token)),
        usuario.then(leerReputacion),
      ]);
      // Las opiniones y la reputación van por separado: si Mercado Libre no
      // da permiso para una (403, no cambia reintentando), se guarda sin ella
      // y la otra se muestra igual. Cualquier otra falla corta todo y se
      // reintenta en la próxima regeneración.
      for (const r of [deOpiniones, deReputacion]) {
        if (r.status === "rejected" && !esSinPermiso(r.reason)) throw r.reason;
      }
      opiniones = deOpiniones.status === "fulfilled" ? deOpiniones.value : null;
      reputacion = deReputacion.status === "fulfilled" ? deReputacion.value : null;
      const sinPermiso = [deOpiniones, deReputacion].flatMap((r) =>
        r.status === "rejected" ? [r.reason instanceof Error ? r.reason.message : String(r.reason)] : []
      );
      if (sinPermiso.length > 0) aviso = `Sin permiso: ${sinPermiso.join(" | ")}`;
      if (avisoCuenta) aviso = [aviso, avisoCuenta].filter(Boolean).join(" | ");
    } catch (error) {
      // La falla se anota acá adentro: cuando ya hay un dato viejo, Next lo
      // sigue sirviendo y se traga el error, y afuera nunca se enteraría.
      await registrarFalla(error instanceof Error ? error.message : String(error));
      throw error;
    }
    // La copia para las fichas, que no le preguntan a Mercado Libre.
    if (opiniones || reputacion) await guardarDatosML({ opiniones, reputacion });
    await registrarIntentoML({
      ok: true,
      cuando: new Date().toISOString(),
      opiniones: opiniones?.total ?? 0,
      destacadas: opiniones?.destacadas.length ?? 0,
      medalla: reputacion?.medalla ?? null,
      ventas: reputacion?.ventas ?? null,
      ...(aviso ? { aviso: aviso.slice(0, 500) } : {}),
    });
    return { opiniones, reputacion };
  },
  ["ml-portada-v3"],
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
 * Las opiniones de todos los productos Harper en Mercado Libre y la
 * reputación de Harper como vendedor. Null si la cuenta no está conectada o
 * Mercado Libre no contesta.
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

/**
 * Para las fichas: la copia que guardó la portada la última vez que le
 * preguntó bien a Mercado Libre (en Redis), sin consultar a Mercado Libre.
 * Null si todavía no hay copia o Redis no contesta.
 */
export async function datosGuardadosDeMercadoLibre(): Promise<DatosMercadoLibre | null> {
  if (!mlConfigurado()) return null;
  return (await leerDatosML()) ?? ultimoBueno;
}
