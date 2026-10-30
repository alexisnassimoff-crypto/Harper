import { configuracionRedis } from "./cerrojo";
import { leerDatosGuardados, type DatosMercadoLibre } from "./ml-resenas";

/**
 * El resultado del último intento de traer las opiniones de Mercado Libre,
 * guardado en Redis para que /api/health lo muestre.
 *
 * La portada es la única que le pregunta a Mercado Libre (ver
 * lib/ml-resenas-servidor.ts); si /api/health preguntara por su cuenta sería
 * otro consumidor del token. Así, health cuenta lo que le pasó a la portada:
 * si salió bien, o el error tal como lo contestó Mercado Libre. Nunca un token.
 */

const CLAVE = "harper:ml:ultimo-intento";
/** Una semana: si la portada deja de preguntar, el dato viejo se va solo. */
const DURA_SEGUNDOS = 7 * 24 * 60 * 60;

export type IntentoML =
  | {
      ok: true;
      cuando: string;
      opiniones: number;
      destacadas: number;
      medalla: string | null;
      ventas: number | null;
      /** Lo que no se pudo traer (por ejemplo, sin permiso para las opiniones). */
      aviso?: string;
    }
  | { ok: false; cuando: string; error: string };

async function redis(comando: string[]): Promise<unknown> {
  const config = configuracionRedis();
  if (!config) return null;
  // Sin `cache: "no-store"` a propósito: esto corre mientras se arma la
  // portada, y en Next un fetch "no-store" la saca de estática (pasaría a
  // armarse en cada visita justo cuando Mercado Libre falla). Un POST sin
  // opción de cache no la cambia.
  const respuesta = await fetch(config.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(comando),
    signal: AbortSignal.timeout(2_000),
  });
  const cuerpo = (await respuesta.json().catch(() => null)) as { result?: unknown } | null;
  return cuerpo?.result ?? null;
}

/** Guarda el intento. Nunca falla: es un dato para diagnosticar. */
export async function registrarIntentoML(intento: IntentoML): Promise<void> {
  try {
    await redis(["SET", CLAVE, JSON.stringify(intento), "EX", String(DURA_SEGUNDOS)]);
  } catch {
    // Sin Redis no hay diagnóstico, y nada más.
  }
}

/** El último intento guardado, o null. */
export async function leerIntentoML(): Promise<IntentoML | null> {
  try {
    const crudo = await redis(["GET", CLAVE]);
    return typeof crudo === "string" ? (JSON.parse(crudo) as IntentoML) : null;
  } catch {
    return null;
  }
}

/**
 * Las opiniones y la reputación de la última consulta que salió bien, para
 * las fichas. Solo la portada le pregunta a Mercado Libre (un solo
 * consumidor del token); las fichas leen esta copia.
 */
const CLAVE_DATOS = "harper:ml:opiniones";
/** Un mes: si la portada deja de preguntar, las opiniones viejas siguen siendo reales. */
const DATOS_DURAN_SEGUNDOS = 30 * 24 * 60 * 60;

/** Guarda la copia. Nunca falla: sin Redis, las fichas no muestran opiniones y nada más. */
export async function guardarDatosML(datos: DatosMercadoLibre): Promise<void> {
  try {
    await redis(["SET", CLAVE_DATOS, JSON.stringify(datos), "EX", String(DATOS_DURAN_SEGUNDOS)]);
  } catch {
    // Sin Redis no hay copia para las fichas.
  }
}

/** La copia guardada, o null (sin Redis, sin datos todavía o con otra forma). */
export async function leerDatosML(): Promise<DatosMercadoLibre | null> {
  try {
    const crudo = await redis(["GET", CLAVE_DATOS]);
    return typeof crudo === "string" ? leerDatosGuardados(JSON.parse(crudo)) : null;
  } catch {
    return null;
  }
}
