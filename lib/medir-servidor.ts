import { configuracionRedis } from "./cerrojo";
import { EVENTOS_MEDIDOS, type EventoMedido } from "./medir";
import { fechaArgentina } from "./suscriptores";

/**
 * Los contadores del embudo (lib/medir.ts), en el mismo Redis (Upstash) del
 * cerrojo del webhook. Una clave por día y por paso, con el número y nada más.
 *
 * Gasta lo menos posible del plan de Upstash, porque es el mismo Redis con el
 * que se confirman los pagos: un INCR por evento, y el vencimiento solo la
 * primera vez de cada clave en el día (si no llegara a escribirse, queda una
 * clave chica sin vencer, nunca un contador equivocado). El panel lee todo el
 * período con un solo MGET.
 */

const PREFIJO = "harper:medir";

/** Cuánto se guardan los contadores: más que el período más largo del panel (90 días). */
export const DIAS_GUARDADOS = 120;

export function claveDeConteo(dia: string, evento: EventoMedido) {
  return `${PREFIJO}:${dia}:${evento}`;
}

type Redis = { url: string; token: string };

async function comando(redis: Redis, cuerpo: unknown, fetchImpl: typeof fetch): Promise<unknown> {
  const respuesta = await fetchImpl(redis.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${redis.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo),
    signal: AbortSignal.timeout(3_000),
    cache: "no-store",
  });
  const datos = (await respuesta.json().catch(() => null)) as { result?: unknown; error?: string } | null;
  if (!respuesta.ok || !datos || typeof datos.error === "string") {
    throw new Error(`Redis ${respuesta.status}: ${datos?.error ?? "respuesta ilegible"}`);
  }
  return datos.result;
}

/** Suma uno al paso de hoy (en Buenos Aires). Falso si no hay Redis o no contestó. */
export async function contarEvento(
  evento: EventoMedido,
  opciones: { ahora?: number; fetchImpl?: typeof fetch; redis?: Redis | null } = {}
): Promise<boolean> {
  const redis = opciones.redis === undefined ? configuracionRedis() : opciones.redis;
  if (!redis) return false;
  const fetchImpl = opciones.fetchImpl ?? fetch;
  const clave = claveDeConteo(fechaArgentina(new Date(opciones.ahora ?? Date.now())), evento);
  try {
    const cuenta = Number(await comando(redis, ["INCR", clave], fetchImpl));
    if (cuenta === 1) await comando(redis, ["PEXPIRE", clave, String(DIAS_GUARDADOS * 24 * 60 * 60_000)], fetchImpl);
    return true;
  } catch (error) {
    console.warn("[medir] no se pudo contar:", error instanceof Error ? error.message : error);
    return false;
  }
}

export type ConteosDelEmbudo = Record<EventoMedido, number> & { porDia: Record<string, Record<EventoMedido, number>> };

/** Lo contado en esos días. Null si no hay Redis o no contestó. */
export async function leerConteos(
  dias: string[],
  opciones: { fetchImpl?: typeof fetch; redis?: Redis | null } = {}
): Promise<ConteosDelEmbudo | null> {
  const redis = opciones.redis === undefined ? configuracionRedis() : opciones.redis;
  if (!redis) return null;
  const vacio = () => Object.fromEntries(EVENTOS_MEDIDOS.map((e) => [e, 0])) as Record<EventoMedido, number>;
  const totales: ConteosDelEmbudo = { ...vacio(), porDia: {} };
  if (dias.length === 0) return totales;

  const pares = dias.flatMap((dia) => EVENTOS_MEDIDOS.map((evento) => ({ dia, evento })));
  try {
    const valores = await comando(redis, ["MGET", ...pares.map((p) => claveDeConteo(p.dia, p.evento))], opciones.fetchImpl ?? fetch);
    if (!Array.isArray(valores)) throw new Error("MGET no devolvió una lista");
    pares.forEach(({ dia, evento }, i) => {
      const n = Number(valores[i] ?? 0);
      const valor = Number.isFinite(n) && n > 0 ? n : 0;
      totales[evento] += valor;
      (totales.porDia[dia] ??= vacio())[evento] += valor;
    });
    return totales;
  } catch (error) {
    console.warn("[medir] no se pudieron leer los contadores:", error instanceof Error ? error.message : error);
    return null;
  }
}
