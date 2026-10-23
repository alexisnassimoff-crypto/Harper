import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  cerrojoDesdeEntorno,
  cerrojoRedis,
  clavePedido,
  configuracionRedis,
  ErrorCerrojo,
  tomarConEspera,
  verificarRedis,
} from "../lib/cerrojo";
import { contadorRedis, fetchRedisFalso, leerRedis, reiniciarRedis } from "../lib/fixtures/redis";
import type { Reloj } from "../lib/webhook-lock";

const AHORA = 1_761_000_000_000;

function relojFalso(inicio = AHORA): Reloj & { avanzar(ms: number): void; dormidas: number[] } {
  let t = inicio;
  const dormidas: number[] = [];
  return {
    ahora: () => t,
    async dormir(ms) {
      dormidas.push(ms);
      t += ms;
      await new Promise((r) => setImmediate(r));
    },
    avanzar: (ms) => void (t += ms),
    dormidas,
  };
}

const CONFIG = { url: "https://redis.de.prueba", token: "token-prueba" };

beforeEach(() => reiniciarRedis());

test("la llave la toma uno solo; el segundo ve ocupado; soltar solo con el nonce propio", async () => {
  const reloj = relojFalso();
  const cerrojo = cerrojoRedis(CONFIG, fetchRedisFalso(reloj));

  assert.equal(await cerrojo.tomar("k", "A", 10_000), true);
  assert.equal(await cerrojo.tomar("k", "B", 10_000), false);
  assert.equal(leerRedis("k", reloj.ahora()), "A");

  // B no puede soltar la llave de A.
  await cerrojo.soltar("k", "B");
  assert.equal(leerRedis("k", reloj.ahora()), "A");

  await cerrojo.soltar("k", "A");
  assert.equal(leerRedis("k", reloj.ahora()), null);
  assert.equal(await cerrojo.tomar("k", "B", 10_000), true);
});

test("la llave vence sola si la instancia muere sin soltarla", async () => {
  const reloj = relojFalso();
  const cerrojo = cerrojoRedis(CONFIG, fetchRedisFalso(reloj));

  assert.equal(await cerrojo.tomar("k", "A", 10_000), true);
  reloj.avanzar(9_999);
  assert.equal(await cerrojo.tomar("k", "B", 10_000), false);
  reloj.avanzar(2);
  assert.equal(await cerrojo.tomar("k", "B", 10_000), true);
  assert.equal(leerRedis("k", reloj.ahora()), "B");
});

test("los comandos van a la REST API de Upstash con el token y la forma esperada", async () => {
  const llamadas: { url: string; auth: string | undefined; cuerpo: unknown }[] = [];
  const fetchEspia = (async (url: string | URL | Request, init?: RequestInit) => {
    llamadas.push({ url: String(url), auth: (init?.headers as Record<string, string>).Authorization, cuerpo: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify({ result: "OK" }), { status: 200 });
  }) as typeof fetch;

  const cerrojo = cerrojoRedis(CONFIG, fetchEspia);
  await cerrojo.tomar(clavePedido("recX"), "nonce1", 120_000);
  await cerrojo.soltar(clavePedido("recX"), "nonce1");

  assert.equal(llamadas[0].url, "https://redis.de.prueba");
  assert.equal(llamadas[0].auth, "Bearer token-prueba");
  assert.deepEqual(llamadas[0].cuerpo, ["SET", "harper:pedido:recX", "nonce1", "NX", "PX", "120000"]);
  assert.equal((llamadas[1].cuerpo as string[])[0], "EVAL");
  assert.equal((llamadas[1].cuerpo as string[])[2], "1");
  assert.equal((llamadas[1].cuerpo as string[])[3], "harper:pedido:recX");
  assert.equal((llamadas[1].cuerpo as string[])[4], "nonce1");
});

test("si Redis no contesta o contesta error, el cerrojo falla cerrado (ErrorCerrojo)", async () => {
  const roto = cerrojoRedis(CONFIG, (async () => {
    throw new Error("ECONNRESET");
  }) as unknown as typeof fetch);
  await assert.rejects(roto.tomar("k", "A", 1000), ErrorCerrojo);

  const conError = cerrojoRedis(CONFIG, (async () => new Response(JSON.stringify({ error: "WRONGPASS" }), { status: 401 })) as typeof fetch);
  await assert.rejects(conError.tomar("k", "A", 1000), /401.*WRONGPASS/);

  const ilegible = cerrojoRedis(CONFIG, (async () => new Response("<html>", { status: 200 })) as typeof fetch);
  await assert.rejects(ilegible.tomar("k", "A", 1000), ErrorCerrojo);
});

test("tomarConEspera espera a que la suelten y, si no, devuelve null", async () => {
  const reloj = relojFalso();
  const cerrojo = cerrojoRedis(CONFIG, fetchRedisFalso(reloj));

  assert.ok(await cerrojo.tomar("k", "A", 60_000));

  // Ocupada todo el tiempo: null después de la espera máxima, de a pasos.
  const nada = await tomarConEspera(cerrojo, "k", 60_000, { esperaMaxMs: 1_000, pasoMs: 250, reloj });
  assert.equal(nada, null);
  assert.deepEqual(reloj.dormidas, [250, 250, 250, 250]);

  // La sueltan a mitad de la espera: la toma.
  const promesa = tomarConEspera(cerrojo, "k", 60_000, { esperaMaxMs: 5_000, pasoMs: 250, reloj });
  await new Promise((r) => setImmediate(r));
  await cerrojo.soltar("k", "A");
  const nonce = await promesa;
  assert.ok(nonce);
  assert.equal(leerRedis("k", reloj.ahora()), nonce);
  assert.ok((contadorRedis.get("SET") ?? 0) >= 6);
});

test("verificarRedis: PING más un ciclo completo del cerrojo sobre el Redis configurado", async () => {
  for (const v of ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"]) delete process.env[v];
  process.env.KV_REST_API_URL = "https://redis.de.prueba";
  process.env.KV_REST_API_TOKEN = "t";

  const sano = await verificarRedis(fetchRedisFalso());
  assert.deepEqual(sano, { configurado: true, responde: true, cerrojo: true, detalle: null });
  // La comprobación no deja llaves colgadas.
  assert.equal((contadorRedis.get("EVAL") ?? 0) >= 3, true);

  const caido = await verificarRedis((async () => {
    throw new Error("ECONNREFUSED");
  }) as unknown as typeof fetch);
  assert.equal(caido.configurado, true);
  assert.equal(caido.responde, false);
  assert.equal(caido.cerrojo, false);
  assert.match(caido.detalle ?? "", /no contestó/);

  // Un Redis que contesta PING pero donde SET NX siempre "toma" (sin exclusión): se detecta.
  const sinExclusion = (async (_url: string | URL | Request, init?: RequestInit) => {
    const comando = JSON.parse(String(init?.body)) as string[];
    const result = comando[0] === "PING" ? "PONG" : comando[0] === "SET" ? "OK" : 1;
    return new Response(JSON.stringify({ result }), { status: 200 });
  }) as typeof fetch;
  const roto = await verificarRedis(sinExclusion);
  assert.equal(roto.responde, true);
  assert.equal(roto.cerrojo, false);
  assert.match(roto.detalle ?? "", /no se comporta/);

  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  const sinConfig = await verificarRedis(fetchRedisFalso());
  assert.equal(sinConfig.configurado, false);
});

test("la configuración sale de las variables de la integración, con cualquiera de los dos nombres", () => {
  for (const v of ["KV_REST_API_URL", "KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"]) delete process.env[v];
  assert.equal(configuracionRedis(), null);
  assert.equal(cerrojoDesdeEntorno(), null);

  process.env.UPSTASH_REDIS_REST_URL = "https://a.upstash.io/";
  process.env.UPSTASH_REDIS_REST_TOKEN = "t1";
  assert.deepEqual(configuracionRedis(), { url: "https://a.upstash.io", token: "t1" });

  process.env.KV_REST_API_URL = "https://b.upstash.io";
  process.env.KV_REST_API_TOKEN = "t2";
  assert.deepEqual(configuracionRedis(), { url: "https://b.upstash.io", token: "t2" });
  assert.ok(cerrojoDesdeEntorno());

  for (const v of ["KV_REST_API_URL", "KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"]) delete process.env[v];
});
