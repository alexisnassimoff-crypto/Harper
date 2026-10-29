import { configuracionRedis } from "./cerrojo";

/**
 * Cuotas de uso para /api/direcciones: cuántas búsquedas van en la última
 * ventana, por IP y en total, para que Google no cueste más de lo previsto.
 *
 * Google cobra por request y la ruta es pública, así que el tope tiene que
 * vivir en el servidor. Dos capas:
 *
 *  - En memoria de la instancia, SIEMPRE: es lo primero que se mira y, cuando
 *    una clave ya pasó su límite, no se toca Redis. Así una inundación no
 *    gasta comandos del plan de Upstash (que es el mismo Redis del cerrojo del
 *    webhook: si se agotara, no se confirmaría ningún pago).
 *  - En Redis (Upstash), cuando está configurado: el contador compartido entre
 *    instancias, que es el que de verdad limita. Si Redis falla, valen los
 *    contadores en memoria: el límite nunca desaparece del todo.
 *
 * La ventana va en la clave (`clave:ranura`): un vencimiento que no llegó a
 * escribirse deja una clave huérfana que nadie vuelve a leer, nunca una IP
 * bloqueada para siempre.
 */

export type Ventana = {
  /** Qué se cuenta: "ip:1.2.3.4", "total", "dia". */
  clave: string;
  ventanaMs: number;
  limite: number;
};

export type ResultadoCuota = {
  /** La clave de la primera ventana que pasó su límite, o null si todo entra. */
  excedida: string | null;
  cuentas: number[];
};

const memoria = new Map<string, number>();

const PREFIJO = "harper:cuota";

function claveRanura(v: Ventana, ahora: number) {
  return `${PREFIJO}:${v.clave}:${Math.floor(ahora / v.ventanaMs)}`;
}

/** Que el mapa no crezca sin fin con ranuras viejas e IPs que no vuelven. */
function podar(ahora: number, ventanas: Ventana[]) {
  if (memoria.size < 5_000) return;
  const vigentes = new Set(ventanas.map((v) => claveRanura(v, ahora)));
  for (const clave of memoria.keys()) {
    const ranura = Number(clave.slice(clave.lastIndexOf(":") + 1));
    const ventana = ventanas.find((v) => clave.startsWith(`${PREFIJO}:${v.clave}:`));
    if (!vigentes.has(clave) && (!ventana || ranura < Math.floor(ahora / ventana.ventanaMs))) memoria.delete(clave);
  }
}

/**
 * Suma uno a cada ventana y dice si alguna pasó su límite. Las ventanas se
 * evalúan en el orden dado: la primera excedida es la que se informa.
 *
 * Con `soloMemoria` no se toca Redis: sirve para un tope de la instancia
 * que solo cuenta, y para no gastar comandos cuando ese tope ya se pasó.
 */
export async function consumirCuota(
  ventanas: Ventana[],
  opciones: { fetchImpl?: typeof fetch; ahora?: number; soloMemoria?: boolean } = {}
): Promise<ResultadoCuota> {
  const ahora = opciones.ahora ?? Date.now();
  const claves = ventanas.map((v) => claveRanura(v, ahora));

  podar(ahora, ventanas);
  const enMemoria = claves.map((clave) => {
    const cuenta = (memoria.get(clave) ?? 0) + 1;
    memoria.set(clave, cuenta);
    return cuenta;
  });

  // Ya pasada en esta instancia: se contesta sin gastar un comando de Redis.
  const yaExcedida = ventanas.findIndex((v, i) => enMemoria[i] > v.limite);
  if (yaExcedida >= 0) return { excedida: ventanas[yaExcedida].clave, cuentas: enMemoria };

  const config = opciones.soloMemoria ? null : configuracionRedis();
  let cuentas = enMemoria;

  if (config) {
    try {
      cuentas = await contarEnRedis(config, claves, ventanas, opciones.fetchImpl ?? fetch);
    } catch (error) {
      console.warn("[cuota] Redis no contestó; valen los contadores en memoria:", error instanceof Error ? error.message : error);
    }
  }

  const excedida = ventanas.findIndex((v, i) => cuentas[i] > v.limite);
  return { excedida: excedida >= 0 ? ventanas[excedida].clave : null, cuentas };
}

/**
 * Un solo viaje a Upstash con el pipeline: INCR de cada clave y su
 * vencimiento (siempre, no solo la primera vez: así nunca queda una clave sin
 * TTL). La respuesta es una lista con `{ result }` o `{ error }` por comando.
 */
async function contarEnRedis(
  config: { url: string; token: string },
  claves: string[],
  ventanas: Ventana[],
  fetchImpl: typeof fetch
): Promise<number[]> {
  const comandos = [
    ...claves.map((clave) => ["INCR", clave]),
    // Dos ventanas de margen para que una ranura en curso no venza antes de tiempo.
    ...claves.map((clave, i) => ["PEXPIRE", clave, String(ventanas[i].ventanaMs * 2)]),
  ];

  const respuesta = await fetchImpl(`${config.url}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(comandos),
    signal: AbortSignal.timeout(3_000),
    cache: "no-store",
  });

  const cuerpo = (await respuesta.json().catch(() => null)) as { result?: unknown; error?: string }[] | null;

  if (!respuesta.ok || !Array.isArray(cuerpo) || cuerpo.length < claves.length) {
    throw new Error(`Redis ${respuesta.status} al contar: ${JSON.stringify(cuerpo)?.slice(0, 120) ?? "respuesta ilegible"}`);
  }

  return claves.map((_, i) => {
    const r = cuerpo[i];
    if (typeof r.error === "string") throw new Error(`Redis al INCR: ${r.error}`);
    return Number(r.result);
  });
}

/**
 * La clave de cuota de una IP. Con IPv6 cada cliente tiene un /64 entero, así
 * que cuenta el prefijo; con IPv4 (incluida la forma "::ffff:1.2.3.4"), la IP.
 */
export function claveDeIp(ip: string): string {
  const limpia = ip.trim().toLowerCase();
  if (!limpia) return "sin-ip";

  const v4 = /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(limpia);
  if (v4) return v4[1];
  if (!limpia.includes(":")) return limpia;

  // Expande "::" a los ocho grupos y se queda con los cuatro primeros.
  const [izquierda, derecha = ""] = limpia.split("::");
  const grupos = izquierda.split(":").filter(Boolean);
  const cola = derecha.split(":").filter(Boolean);
  const faltan = Math.max(0, 8 - grupos.length - cola.length);
  const completos = [...grupos, ...Array<string>(faltan).fill("0"), ...cola];
  return `${completos.slice(0, 4).map((g) => g.padStart(4, "0")).join(":")}::/64`;
}

/** Para las pruebas. */
export function reiniciarCuotaEnMemoria() {
  memoria.clear();
}
