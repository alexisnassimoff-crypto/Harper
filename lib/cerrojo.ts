import crypto from "node:crypto";
import type { Reloj } from "./webhook-lock";

/**
 * Cerrojo con escritura condicional sobre Redis (Upstash, por REST).
 *
 * Es lo que Airtable no puede dar: `SET clave nonce NX PX ttl` lo toma UNA
 * sola instancia, y las demás ven que está ocupado. Se usa en dos lugares:
 *
 *  - por pedido, alrededor de todo el procesamiento de una notificación de
 *    Mercado Pago, para que dos notificaciones del mismo pedido (o de dos
 *    pagos sobre el mismo pedido) nunca trabajen a la vez;
 *  - por variante, alrededor de leer y escribir el stock, para que dos pedidos
 *    DISTINTOS que se aprueban a la vez sobre el mismo color no se pisen la
 *    lectura (el "lost update" clásico de leer-modificar-escribir).
 *
 * No reemplaza a las marcas idempotentes de Airtable (lib/webhook-lock.ts,
 * lib/stock.ts): el cerrojo evita el trabajo simultáneo; las marcas evitan el
 * trabajo repetido después de una caída, que el cerrojo no puede ver. Las dos
 * capas se necesitan.
 *
 * Sin las variables (Redis no configurado), `cerrojoDesdeEntorno()` devuelve
 * null y el webhook sigue con la protección de Airtable sola, avisándolo en
 * /api/health. Si Redis está configurado pero no contesta, el cerrojo FALLA
 * CERRADO: la operación se corta como transitoria (500) y Mercado Pago
 * reintenta. Es preferible confirmar una venta 15 minutos más tarde que
 * confirmarla dos veces.
 *
 * Variables: las que carga la integración de Upstash en Vercel, con cualquiera
 * de sus dos nombres (`KV_REST_API_*` o `UPSTASH_REDIS_REST_*`).
 */

export type Cerrojo = {
  /** Toma la llave si está libre. Verdadero si la tomó. */
  tomar(clave: string, nonce: string, ttlMs: number): Promise<boolean>;
  /** Suelta la llave solo si el nonce es el nuestro (nunca la de otro). */
  soltar(clave: string, nonce: string): Promise<void>;
};

/** Redis no contestó o contestó un error. Transitorio: se reintenta. */
export class ErrorCerrojo extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = "ErrorCerrojo";
  }
}

/** Otro pedido tiene tomada la variante y no la soltó a tiempo. Transitorio. */
export class ErrorCerrojoOcupado extends Error {
  constructor(readonly clave: string) {
    super(`la llave ${clave} siguió ocupada: se reintenta`);
    this.name = "ErrorCerrojoOcupado";
  }
}

/**
 * Cuánto vive la llave de un pedido si la instancia muere sin soltarla. Igual
 * que la vigencia de la marca de reclamo: más que `maxDuration` del webhook.
 */
export const TTL_PEDIDO_MS = 120_000;

/** Cuánto vive la llave de una variante: leer y escribir el stock tarda ~1 s. */
export const TTL_VARIANTE_MS = 15_000;

/** Cuánto espera un pedido a que otro suelte la variante antes de reintentar. */
export const ESPERA_VARIANTE_MS = 5_000;

export const clavePedido = (pedidoId: string) => `harper:pedido:${pedidoId}`;
export const claveVariante = (varianteId: string) => `harper:variante:${varianteId}`;

export function configuracionRedis(): { url: string; token: string } | null {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}

export function redisConfigurado() {
  return configuracionRedis() !== null;
}

/** Borra la llave solo si todavía tiene nuestro nonce: una sola operación. */
const SOLTAR_SI_ES_MIA =
  "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";

/**
 * El cerrojo sobre la REST API de Upstash: un POST por comando, el comando
 * como lista JSON, la respuesta `{ result }` o `{ error }`.
 */
export function cerrojoRedis(config: { url: string; token: string }, fetchImpl: typeof fetch = fetch): Cerrojo {
  async function ejecutar(comando: string[]): Promise<unknown> {
    let respuesta: Response;

    try {
      respuesta = await fetchImpl(config.url, {
        method: "POST",
        headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
        body: JSON.stringify(comando),
        signal: AbortSignal.timeout(5_000),
        cache: "no-store",
      });
    } catch (error) {
      throw new ErrorCerrojo(`Redis no contestó al ${comando[0]}: ${error instanceof Error ? error.message : error}`);
    }

    const cuerpo = (await respuesta.json().catch(() => null)) as { result?: unknown; error?: string } | null;

    if (!respuesta.ok || !cuerpo || typeof cuerpo.error === "string") {
      throw new ErrorCerrojo(`Redis ${respuesta.status} al ${comando[0]}: ${cuerpo?.error ?? "respuesta ilegible"}`);
    }

    return cuerpo.result;
  }

  return {
    async tomar(clave, nonce, ttlMs) {
      const resultado = await ejecutar(["SET", clave, nonce, "NX", "PX", String(ttlMs)]);
      return resultado === "OK";
    },
    async soltar(clave, nonce) {
      await ejecutar(["EVAL", SOLTAR_SI_ES_MIA, "1", clave, nonce]);
    },
  };
}

/** El cerrojo de producción, o null si Redis no está configurado. */
export function cerrojoDesdeEntorno(): Cerrojo | null {
  const config = configuracionRedis();
  return config ? cerrojoRedis(config) : null;
}

/**
 * Intenta tomar la llave hasta `esperaMaxMs`, de a `pasoMs`. Devuelve el
 * nonce con el que la tomó, o null si siguió ocupada. Un fallo de Redis sube
 * como `ErrorCerrojo`.
 */
export async function tomarConEspera(
  cerrojo: Cerrojo,
  clave: string,
  ttlMs: number,
  opciones: { esperaMaxMs: number; pasoMs?: number; reloj: Reloj }
): Promise<string | null> {
  const nonce = crypto.randomUUID();
  const paso = opciones.pasoMs ?? 250;
  let esperado = 0;

  for (;;) {
    if (await cerrojo.tomar(clave, nonce, ttlMs)) return nonce;
    if (esperado >= opciones.esperaMaxMs) return null;

    const dormir = Math.min(paso, opciones.esperaMaxMs - esperado);
    await opciones.reloj.dormir(dormir);
    esperado += dormir;
  }
}

/** Suelta sin que un fallo de Redis tape el resultado del trabajo ya hecho. */
export async function soltarSinFallar(cerrojo: Cerrojo, clave: string, nonce: string) {
  try {
    await cerrojo.soltar(clave, nonce);
  } catch (error) {
    // La llave vence sola por TTL; solo se pierde algo de tiempo.
    console.error(`[cerrojo] no se pudo soltar ${clave}:`, error);
  }
}
