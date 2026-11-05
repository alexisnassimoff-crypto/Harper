import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

process.env.HARPER_FIXTURES = "1";
process.env.HARPER_FIXTURES_COMPRAS = "1";
delete process.env.VERCEL;

import { getRecord, TABLAS, updateRecord } from "../lib/airtable";
import {
  avisarDespacho,
  avisoYaEnviado,
  claveAviso,
  porQueNoAvisar,
  renglonDeAviso,
  type FilaPedidoAviso,
  type OpcionesAviso,
} from "../lib/aviso-despacho";
import { ErrorCerrojo, type Cerrojo } from "../lib/cerrojo";
import { cerrojoEnMemoria, leerRedis, reiniciarRedis } from "../lib/fixtures/redis";
import { interceptar, reiniciar, RespuestaFixture } from "../lib/fixtures/servidor";

/**
 * El aviso de despacho (Ale, 05/11/2026): sale cuando el pedido queda
 * «enviado» con Tracking, una sola vez, y nunca cambia el Estado.
 */

const ENVIADO = "recPEDIDOANA00002"; // HARPER-PRUEBA3, «enviado», Tracking CA123456789AR
const ENTREGADO = "recPEDIDOANA00001"; // HARPER-PRUEBA2, «entregado»
const PAGADO = "recPEDIDOANA00003"; // HARPER-PRUEBA5, «pagado», sin Tracking

type Mail = { para: string; asunto: string; texto: string };
let mails: Mail[] = [];
let escrituras: { path: string; campos: Record<string, unknown> }[] = [];
let cerrojo: Cerrojo;

const mandar: OpcionesAviso["mandar"] = async (envio) => {
  mails.push({ para: envio.para, asunto: envio.asunto, texto: envio.texto });
  return { ok: true };
};
const opciones = (extra: Partial<OpcionesAviso> = {}): OpcionesAviso => ({
  sitio: "https://harper.ar",
  cerrojo,
  mandar,
  ahora: () => new Date("2026-11-05T17:03:00.000Z"),
  ...extra,
});
const fila = async (id: string) => (await getRecord<FilaPedidoAviso>(TABLAS.pedidos, id)).fields;

beforeEach(() => {
  reiniciar();
  reiniciarRedis();
  mails = [];
  escrituras = [];
  cerrojo = cerrojoEnMemoria();
  interceptar((path, { method, body }) => {
    if (method === "PATCH") escrituras.push({ path, campos: JSON.parse(body ?? "{}").fields ?? {} });
  });
});

test("aviso: solo «enviado» y con Tracking; una etiqueta recién creada no avisa", () => {
  // La etiqueta: importar-envio deja «preparando», a veces ya con el Tracking de MiCorreo.
  assert.equal(porQueNoAvisar({ Estado: "preparando", Tracking: "CA123456789AR" }), "no-enviado");
  assert.equal(porQueNoAvisar({ Estado: "pagado", Tracking: "CA123456789AR" }), "no-enviado");
  assert.equal(porQueNoAvisar({ Estado: "entregado", Tracking: "CA123456789AR" }), "no-enviado");
  assert.equal(porQueNoAvisar({ Estado: "enviado" }), "sin-tracking");
  assert.equal(porQueNoAvisar({ Estado: "enviado", Tracking: "   " }), "sin-tracking");
  assert.equal(porQueNoAvisar({ Estado: "enviado", Tracking: "AND0001234567" }), null);
  // El renglón de Notas lo frena; los otros renglones de Notas no.
  const renglon = renglonDeAviso(new Date("2026-11-05T17:03:00.000Z"), "CA123456789AR");
  assert.equal(renglon, "Aviso de despacho enviado: 05/11/2026, 14:03 (seguimiento CA123456789AR)");
  assert.equal(porQueNoAvisar({ Estado: "enviado", Tracking: "CA123456789AR", Notas: `Suscriptor: ana@ejemplo.com (rec1)\n${renglon}` }), "ya-avisado");
  assert.equal(avisoYaEnviado("Suscriptor: ana@ejemplo.com (rec1)\nCupón de bienvenida: −$ 10.000"), false);
  assert.equal(avisoYaEnviado(undefined), false);
});

test("aviso: sale una vez, con el Tracking, al mail del cliente; queda en Notas y el Estado no se toca", async () => {
  const antes = await fila(ENVIADO);
  const r = await avisarDespacho(ENVIADO, opciones());
  assert.deepEqual(r, { estado: "enviado", numero: "HARPER-PRUEBA3", para: "ana@ejemplo.com", tracking: "CA123456789AR", anotado: true });
  assert.equal(mails.length, 1);
  assert.equal(mails[0].para, "ana@ejemplo.com");
  assert.equal(mails[0].asunto, "Tu pedido HARPER-PRUEBA3 está en camino");
  assert.match(mails[0].texto, /Seguimiento: CA123456789AR/);

  const despues = await fila(ENVIADO);
  assert.equal(despues.Estado, "enviado");
  assert.equal(despues.Tracking, antes.Tracking);
  assert.equal(despues.Notas, "Aviso de despacho enviado: 05/11/2026, 14:03 (seguimiento CA123456789AR)");
  assert.deepEqual(escrituras.map((e) => Object.keys(e.campos)), [["Notas"]], "una sola escritura, solo en Notas");

  // La automatización se dispara de nuevo (preparando → enviado otra vez): no sale otro.
  await updateRecord(TABLAS.pedidos, ENVIADO, { Estado: "preparando" });
  await updateRecord(TABLAS.pedidos, ENVIADO, { Estado: "enviado" });
  assert.deepEqual(await avisarDespacho(ENVIADO, opciones()), { estado: "omitido", motivo: "ya-avisado" });
  // Aun sin Redis (vencido o vaciado), la marca de Notas alcanza.
  reiniciarRedis();
  assert.deepEqual(await avisarDespacho(ENVIADO, opciones({ cerrojo: null })), { estado: "omitido", motivo: "ya-avisado" });
  assert.equal(mails.length, 1);
});

test("aviso: dos corridas a la vez mandan un solo mail", async () => {
  const resultados = await Promise.all([avisarDespacho(ENVIADO, opciones()), avisarDespacho(ENVIADO, opciones())]);
  assert.equal(mails.length, 1);
  assert.deepEqual(resultados.map((r) => r.estado).sort(), ["enviado", "omitido"]);
});

test("aviso: de la etiqueta al despacho, con el Tracking cargado a mano antes o después", async () => {
  // La etiqueta: «preparando» con Tracking (de MiCorreo o escrito a mano). Nada.
  await updateRecord(TABLAS.pedidos, PAGADO, { Estado: "preparando", Tracking: "CA987654321AR" });
  assert.deepEqual(await avisarDespacho(PAGADO, opciones()), { estado: "omitido", motivo: "no-enviado" });
  // Otro operador: Ale pasa a «enviado» y todavía no escribió el número. Nada.
  await updateRecord(TABLAS.pedidos, PAGADO, { Estado: "enviado", Tracking: "" });
  assert.deepEqual(await avisarDespacho(PAGADO, opciones()), { estado: "omitido", motivo: "sin-tracking" });
  assert.equal(mails.length, 0);
  // Escribe el número de Andreani a mano: ahora sí, con ese número.
  await updateRecord(TABLAS.pedidos, PAGADO, { Tracking: " AND0009876543 " });
  const r = await avisarDespacho(PAGADO, opciones());
  assert.equal(r.estado, "enviado");
  assert.equal(mails.length, 1);
  assert.match(mails[0].texto, /Seguimiento: AND0009876543\n/);
});

test("aviso: un pedido «entregado» no avisa ni cambia nada", async () => {
  assert.deepEqual(await avisarDespacho(ENTREGADO, opciones()), { estado: "omitido", motivo: "no-enviado" });
  assert.equal((await fila(ENTREGADO)).Estado, "entregado");
  assert.deepEqual(escrituras, []);
  assert.equal(mails.length, 0);
});

test("aviso: si el mail no sale, no queda marcado y el próximo intento lo manda", async () => {
  const r = await avisarDespacho(ENVIADO, opciones({ mandar: async () => ({ ok: false, error: "Resend 500" }) }));
  assert.deepEqual(r, { estado: "fallo-mail", error: "Resend 500" });
  assert.equal((await fila(ENVIADO)).Notas, undefined);
  assert.equal(leerRedis(claveAviso(ENVIADO)), null, "la llave se soltó");
  assert.equal((await avisarDespacho(ENVIADO, opciones())).estado, "enviado");
  assert.equal(mails.length, 1);
});

test("aviso: si Airtable no deja anotar después de mandar, Redis evita el segundo mail", async () => {
  interceptar((_path, { method }) => {
    if (method === "PATCH") throw new RespuestaFixture(503, "Airtable caído");
  });
  const r = await avisarDespacho(ENVIADO, opciones());
  assert.equal(r.estado, "enviado");
  assert.equal(r.estado === "enviado" && r.anotado, false);
  interceptar(null);
  assert.deepEqual(await avisarDespacho(ENVIADO, opciones()), { estado: "omitido", motivo: "en-otra-corrida" });
  assert.equal(mails.length, 1);
});

test("aviso: con Redis caído no se manda (sin saber si es la única corrida)", async () => {
  const caido: Cerrojo = {
    tomar: async () => {
      throw new ErrorCerrojo("Redis no contestó");
    },
    soltar: async () => {},
  };
  await assert.rejects(avisarDespacho(ENVIADO, opciones({ cerrojo: caido })), ErrorCerrojo);
  assert.equal(mails.length, 0);
  assert.equal((await fila(ENVIADO)).Notas, undefined);
});

test("aviso: sin Redis configurado no se manda; es un error para reintentar y después sale una sola vez", async () => {
  for (const variable of ["KV_REST_API_URL", "KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"]) delete process.env[variable];
  // Pasado como null y tomado de las variables (que no están): las dos veces, ErrorCerrojo.
  await assert.rejects(avisarDespacho(ENVIADO, opciones({ cerrojo: null })), ErrorCerrojo);
  await assert.rejects(avisarDespacho(ENVIADO, { sitio: "https://harper.ar", mandar }), /Redis sin configurar/);
  assert.equal(mails.length, 0);
  assert.equal((await fila(ENVIADO)).Notas, undefined, "nada anotado: el reintento puede mandarlo");
  assert.deepEqual(escrituras, []);
  // Con Redis de vuelta, el reintento manda el aviso, una vez.
  assert.equal((await avisarDespacho(ENVIADO, opciones())).estado, "enviado");
  assert.equal((await avisarDespacho(ENVIADO, opciones())).estado, "omitido");
  assert.equal(mails.length, 1);
});
