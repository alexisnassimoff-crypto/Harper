import type { Cerrojo } from "../cerrojo";

/**
 * Un Redis de mentira, en memoria, con lo que usa el cerrojo: SET con NX/PX,
 * GET, DEL, el EVAL de "borrar si es mía" y PING. Contesta con la forma de la
 * REST API de Upstash (`{ result }` o `{ error }`), así `cerrojoRedis` se
 * prueba tal cual, y la prueba de punta a punta lo sirve por HTTP.
 *
 * El tiempo se pasa por parámetro para que los vencimientos se puedan probar
 * sin esperar.
 */

type Entrada = { valor: string; vence: number | null };

const datos = new Map<string, Entrada>();
/** Los hashes, aparte: los contadores del panel (lib/medir-servidor.ts). */
const hashes = new Map<string, { campos: Map<string, string>; vence: number | null }>();

/** Cuántos comandos atendió, por nombre. Para asegurar que el cerrojo se usó. */
export const contadorRedis = new Map<string, number>();

export function reiniciarRedis() {
  datos.clear();
  hashes.clear();
  contadorRedis.clear();
}

function vigente(entrada: Entrada | undefined, ahora: number): entrada is Entrada {
  return entrada !== undefined && (entrada.vence === null || entrada.vence > ahora);
}

export function atenderRedis(comando: unknown[], ahora: number = Date.now()): { result: unknown } | { error: string } {
  const [nombre, ...args] = comando.map(String);
  const op = nombre.toUpperCase();
  contadorRedis.set(op, (contadorRedis.get(op) ?? 0) + 1);

  if (op === "PING") return { result: "PONG" };

  if (op === "GET") {
    const entrada = datos.get(args[0]);
    return { result: vigente(entrada, ahora) ? entrada.valor : null };
  }

  if (op === "DEL") {
    const existia = vigente(datos.get(args[0]), ahora);
    datos.delete(args[0]);
    return { result: existia ? 1 : 0 };
  }

  if (op === "SET") {
    const [clave, valor, ...opciones] = args;
    let soloSiNoExiste = false;
    let ttlMs: number | null = null;

    for (let i = 0; i < opciones.length; i++) {
      const o = opciones[i].toUpperCase();
      if (o === "NX") soloSiNoExiste = true;
      else if (o === "PX") ttlMs = Number(opciones[++i]);
      else if (o === "EX") ttlMs = Number(opciones[++i]) * 1000;
    }

    if (soloSiNoExiste && vigente(datos.get(clave), ahora)) return { result: null };

    datos.set(clave, { valor, vence: ttlMs !== null ? ahora + ttlMs : null });
    return { result: "OK" };
  }

  // INCR y PEXPIRE: los usa el límite de búsquedas por IP de /api/direcciones.
  if (op === "INCR") {
    const entrada = datos.get(args[0]);
    const actual = vigente(entrada, ahora) ? Number(entrada.valor) : 0;
    const nuevo = actual + 1;
    datos.set(args[0], { valor: String(nuevo), vence: vigente(entrada, ahora) ? entrada.vence : null });
    return { result: nuevo };
  }

  if (op === "PEXPIRE") {
    const hash = hashes.get(args[0]);
    if (hash && (hash.vence === null || hash.vence > ahora)) {
      hash.vence = ahora + Number(args[1]);
      return { result: 1 };
    }
    const entrada = datos.get(args[0]);
    if (!vigente(entrada, ahora)) return { result: 0 };
    entrada.vence = ahora + Number(args[1]);
    return { result: 1 };
  }

  // HINCRBY y HGETALL: los contadores del panel (lib/medir-servidor.ts).
  if (op === "HINCRBY") {
    const [clave, campo, cuanto] = args;
    let hash = hashes.get(clave);
    if (!hash || (hash.vence !== null && hash.vence <= ahora)) {
      hash = { campos: new Map(), vence: null };
      hashes.set(clave, hash);
    }
    const nuevo = Number(hash.campos.get(campo) ?? 0) + Number(cuanto);
    hash.campos.set(campo, String(nuevo));
    return { result: nuevo };
  }

  if (op === "HGETALL") {
    const hash = hashes.get(args[0]);
    if (!hash || (hash.vence !== null && hash.vence <= ahora)) return { result: [] };
    return { result: [...hash.campos].flat() };
  }

  if (op === "EVAL") {
    const [script, , clave, argumento] = args;

    if (/get.*del/s.test(script)) {
      const entrada = datos.get(clave);
      if (vigente(entrada, ahora) && entrada.valor === argumento) {
        datos.delete(clave);
        return { result: 1 };
      }
      return { result: 0 };
    }

    return { error: "ERR script no soportado en el Redis de prueba" };
  }

  return { error: `ERR comando no soportado en el Redis de prueba: ${op}` };
}

/** Lo que hay guardado (para mirar en las pruebas). */
export function leerRedis(clave: string, ahora: number = Date.now()) {
  const entrada = datos.get(clave);
  return vigente(entrada, ahora) ? entrada.valor : null;
}

/**
 * Un `fetch` que contesta como la REST API de Upstash, sobre el Redis de
 * prueba: un comando por POST, o una lista de comandos en `/pipeline` (que
 * contesta una lista de resultados, en el mismo orden).
 */
export function fetchRedisFalso(reloj?: { ahora(): number }): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    const cuerpo = JSON.parse(String(init?.body)) as unknown[];
    const destino = url instanceof Request ? url.url : String(url);
    const respuesta = destino.endsWith("/pipeline")
      ? (cuerpo as unknown[][]).map((comando) => atenderRedis(comando, reloj?.ahora()))
      : atenderRedis(cuerpo, reloj?.ahora());
    return new Response(JSON.stringify(respuesta), { status: 200 });
  }) as typeof fetch;
}

/** Un `Cerrojo` directo sobre el Redis de prueba, sin HTTP, que cuenta los intentos. */
export function cerrojoEnMemoria(reloj?: { ahora(): number }): Cerrojo & { intentos: number } {
  const cerrojo = {
    intentos: 0,
    async tomar(clave: string, nonce: string, ttlMs: number) {
      cerrojo.intentos += 1;
      const r = atenderRedis(["SET", clave, nonce, "NX", "PX", String(ttlMs)], reloj?.ahora());
      return "result" in r && r.result === "OK";
    },
    async soltar(clave: string, nonce: string) {
      atenderRedis(["EVAL", "if get then del", "1", clave, nonce], reloj?.ahora());
    },
  };
  return cerrojo;
}
