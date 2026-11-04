import { CANALES, esCanal, type Canal } from "./canales";
import { configuracionRedis } from "./cerrojo";
import { EVENTOS_MEDIDOS, esEventoMedido, type EventoMedido } from "./medir";
import { fechaArgentina } from "./suscriptores";

/**
 * Los contadores del panel (lib/medir.ts), en el mismo Redis (Upstash) del
 * cerrojo del webhook. Una clave por día (un hash), con un número por paso y
 * canal («carrito:meta»), y nada más.
 *
 * Gasta lo menos posible del plan de Upstash, porque es el mismo Redis con el
 * que se confirman los pagos: un HINCRBY por evento, y el vencimiento solo
 * la primera vez de cada número en el día (si no llegara a escribirse, queda
 * una clave chica sin vencer, nunca un contador equivocado). El panel lee
 * todo el período en un solo viaje: un HGETALL por día, en un pipeline.
 */

const PREFIJO = "harper:medir";

/** Cuánto se guardan los contadores: más de un año, para poder elegir cualquier fecha del último año. */
export const DIAS_GUARDADOS = 400;

export function claveDelDia(dia: string) {
  return `${PREFIJO}:${dia}`;
}

type Redis = { url: string; token: string };
type Respuesta = { result?: unknown; error?: string };

async function pedir(redis: Redis, ruta: string, cuerpo: unknown, fetchImpl: typeof fetch): Promise<unknown> {
  const respuesta = await fetchImpl(`${redis.url}${ruta}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${redis.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo),
    signal: AbortSignal.timeout(3_000),
    cache: "no-store",
  });
  const datos = (await respuesta.json().catch(() => null)) as unknown;
  if (!respuesta.ok || datos === null) throw new Error(`Redis ${respuesta.status}: respuesta ilegible`);
  return datos;
}

async function comando(redis: Redis, cmd: string[], fetchImpl: typeof fetch): Promise<unknown> {
  const datos = (await pedir(redis, "", cmd, fetchImpl)) as Respuesta;
  if (typeof datos.error === "string") throw new Error(`Redis: ${datos.error}`);
  return datos.result;
}

/** Suma uno al paso y canal de hoy (en Buenos Aires). Falso si no hay Redis o no contestó. */
export async function contarEvento(
  evento: EventoMedido,
  canal: Canal,
  opciones: { ahora?: number; fetchImpl?: typeof fetch; redis?: Redis | null } = {}
): Promise<boolean> {
  const redis = opciones.redis === undefined ? configuracionRedis() : opciones.redis;
  if (!redis) return false;
  const fetchImpl = opciones.fetchImpl ?? fetch;
  const clave = claveDelDia(fechaArgentina(new Date(opciones.ahora ?? Date.now())));
  try {
    const cuenta = Number(await comando(redis, ["HINCRBY", clave, `${evento}:${canal}`, "1"], fetchImpl));
    if (cuenta === 1) await comando(redis, ["PEXPIRE", clave, String(DIAS_GUARDADOS * 24 * 60 * 60_000)], fetchImpl);
    return true;
  } catch (error) {
    console.warn("[medir] no se pudo contar:", error instanceof Error ? error.message : error);
    return false;
  }
}

export type Conteo = Record<EventoMedido, number>;

export type ConteosDelPanel = {
  /** Por día, todos los canales juntos. */
  porDia: Record<string, Conteo>;
  /** Por canal, todo el período. */
  porCanal: Record<Canal, Conteo>;
};

export function conteoVacio(): Conteo {
  return Object.fromEntries(EVENTOS_MEDIDOS.map((e) => [e, 0])) as Conteo;
}

/** Lo contado en esos días. Null si no hay Redis o no contestó. */
export async function leerConteos(
  dias: string[],
  opciones: { fetchImpl?: typeof fetch; redis?: Redis | null } = {}
): Promise<ConteosDelPanel | null> {
  const redis = opciones.redis === undefined ? configuracionRedis() : opciones.redis;
  if (!redis) return null;
  const conteos: ConteosDelPanel = {
    porDia: {},
    porCanal: Object.fromEntries(CANALES.map((c) => [c, conteoVacio()])) as Record<Canal, Conteo>,
  };
  if (dias.length === 0) return conteos;

  try {
    const respuestas = await pedir(redis, "/pipeline", dias.map((dia) => ["HGETALL", claveDelDia(dia)]), opciones.fetchImpl ?? fetch);
    if (!Array.isArray(respuestas) || respuestas.length !== dias.length) throw new Error("el pipeline no devolvió un resultado por día");
    dias.forEach((dia, i) => {
      const r = respuestas[i] as Respuesta;
      if (typeof r?.error === "string") throw new Error(r.error);
      const delDia = (conteos.porDia[dia] = conteoVacio());
      const lista = Array.isArray(r?.result) ? (r.result as unknown[]) : [];
      for (let j = 0; j + 1 < lista.length; j += 2) {
        const [evento, canal] = String(lista[j]).split(":");
        const n = Number(lista[j + 1]);
        if (!esEventoMedido(evento) || !esCanal(canal) || !Number.isFinite(n) || n <= 0) continue;
        delDia[evento] += n;
        conteos.porCanal[canal][evento] += n;
      }
    });
    return conteos;
  } catch (error) {
    console.warn("[medir] no se pudieron leer los contadores:", error instanceof Error ? error.message : error);
    return null;
  }
}
