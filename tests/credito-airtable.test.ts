import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

// Tarea 10: el almacén del Crédito Harper sobre la tabla «Créditos», probado
// SOLO contra el Airtable de prueba (HARPER_FIXTURES=1, en memoria) y el Redis
// de prueba. Nada de esto toca la base real ni lo usa el webhook.
process.env.HARPER_FIXTURES = "1";
delete process.env.VERCEL;
delete process.env.HARPER_DUO_ACTIVO;
delete process.env.HARPER_CREDITO_ACTIVO;
for (const v of ["KV_REST_API_URL", "KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"]) delete process.env[v];

import { listRecords, TABLAS, updateRecord, type AirtableRecord } from "../lib/airtable";
import { cerrojoRedis, ErrorCerrojo } from "../lib/cerrojo";
import {
  almacenAirtable,
  camposDeLaFila,
  cashbackAnteriorDelPedido,
  CreditoApagado,
  dependenciasCredito,
  filaDelRegistro,
  puedeEscribirCreditos,
  type CamposCredito,
} from "../lib/credito-airtable";
import type { RenglonCobrado } from "../lib/credito-harper";
import {
  anularPorPedido,
  confirmarEntrega,
  liberarDisponibles,
  registrarCredito,
  type DependenciasCredito,
  type PedidoAcreditable,
} from "../lib/credito-persistencia";
import { fetchRedisFalso, reiniciarRedis } from "../lib/fixtures/redis";

let ahora = new Date("2026-11-05T15:00:00.000Z");
const irA = (dia: string) => (ahora = new Date(`${dia}T15:00:00.000Z`));

/** Las dependencias de verdad, salvo el Redis (el de prueba, por HTTP) y el reloj. */
function deps(): DependenciasCredito {
  let n = 0;
  return {
    ...dependenciasCredito(),
    cerrojo: cerrojoRedis({ url: "https://redis.de.prueba", token: "token-prueba" }, fetchRedisFalso({ ahora: () => ahora.getTime() })),
    ahora: () => ahora,
    nonce: () => `nonce-${++n}`,
  };
}

const anteojo = (subtotal: number): RenglonCobrado => ({ categoria: "Anteojos", cantidad: 1, subtotal });
const pedido = (numero: string, extra: Partial<PedidoAcreditable> = {}): PedidoAcreditable => ({
  numero,
  renglones: [anteojo(89_900), anteojo(67_425), { categoria: "Paños", cantidad: 1, subtotal: 4_900 }],
  pagado: true,
  regimen: "nuevo",
  email: "Cliente@Ejemplo.com",
  ...extra,
});

const filasDe = async (numero: string) =>
  (await listRecords<CamposCredito>(TABLAS.creditos, { revalidate: 0 })).filter((r) => r.fields.Pedido === numero);

beforeEach(() => {
  reiniciarRedis();
  irA("2026-11-05");
});

test("La tabla «Créditos» tiene su ID y en el Airtable de prueba arranca vacía", async () => {
  assert.equal(TABLAS.creditos, "tbljsISq3DoFBWiEF");
  assert.deepEqual(await listRecords(TABLAS.creditos), []);
});

test("Anotar, entregar y liberar, con los nombres de campo de §17.2", async () => {
  const d = deps();
  const r = await registrarCredito(pedido("HARPER-5001"), d);
  assert.equal(r.estado, "creado");
  const [fila] = await filasDe("HARPER-5001");
  const { Generado_el, Notas, ...resto } = fila.fields;
  assert.deepEqual(resto, {
    Clave: "credito-harper:HARPER-5001",
    Pedido: "HARPER-5001",
    Email: "cliente@ejemplo.com",
    Monto: 15_733,
    Porcentaje: 10,
    Base: 157_325,
    Anteojos: 2,
    Estado: "Pendiente",
    Incidencia_abierta: false,
    Reglas: "credito-harper-v1",
  });
  assert.equal(Generado_el, "2026-11-05T15:00:00.000Z");
  assert.match(Notas ?? "", /Pendiente: 10 % de \$ 157325/);
  assert.ok(!("Fecha_entrega" in fila.fields), "un campo vacío no se manda al crear");

  assert.equal((await confirmarEntrega("HARPER-5001", "2026-11-10", d)).estado, "anotada");
  irA("2026-12-10");
  assert.deepEqual(await liberarDisponibles(d), { liberados: ["HARPER-5001"], ocupados: [] });
  const [liberada] = await filasDe("HARPER-5001");
  assert.equal(liberada.fields.Estado, "Disponible");
  assert.equal(liberada.fields.Fecha_entrega, "2026-11-10");
  assert.equal(liberada.fields.Disponible_desde, "2026-12-10");
  // Un reintento del pago: nada nuevo.
  assert.equal((await registrarCredito(pedido("HARPER-5001"), d)).estado, "ya");
  assert.equal((await filasDe("HARPER-5001")).length, 1);
});

test("Cinco avisos del mismo pago a la vez, con Redis: una sola fila en la tabla", async () => {
  const d = deps();
  const r = await Promise.all(Array.from({ length: 5 }, () => registrarCredito(pedido("HARPER-5002"), d)));
  assert.equal(r.filter((x) => x.estado === "creado").length, 1);
  assert.equal(r.filter((x) => x.estado === "ocupado").length, 4);
  assert.equal((await filasDe("HARPER-5002")).length, 1);
});

test("Sin Redis configurado, las dependencias de verdad no escriben: ErrorCerrojo y la tabla queda igual", async () => {
  const reales = { ...dependenciasCredito(), ahora: () => ahora };
  assert.equal(reales.cerrojo, null, "no hay variables de Redis en esta prueba");
  await assert.rejects(registrarCredito(pedido("HARPER-5003"), reales), ErrorCerrojo);
  await assert.rejects(anularPorPedido("HARPER-5003", "reembolso", reales), ErrorCerrojo);
  assert.deepEqual(await filasDe("HARPER-5003"), []);
});

test("El cashback de hoy se lee de Saldos (solo lectura) y bloquea el crédito nuevo, anulado o no", async () => {
  // Saldos de prueba: HARPER-PRUEBA tiene cashback; HARPER-PRUEBA4 lo tiene anulado.
  assert.deepEqual(await cashbackAnteriorDelPedido("HARPER-PRUEBA"), { anulado: false });
  assert.deepEqual(await cashbackAnteriorDelPedido("HARPER-PRUEBA4"), { anulado: true });
  assert.equal(await cashbackAnteriorDelPedido("HARPER-SIN-CASHBACK"), null);
  const antes = (await listRecords(TABLAS.saldos)).map((r) => JSON.stringify(r));
  const d = deps();
  for (const numero of ["HARPER-PRUEBA", "HARPER-PRUEBA4"]) {
    assert.equal((await registrarCredito(pedido(numero), d)).estado, "ya", numero);
    assert.deepEqual(await filasDe(numero), [], numero);
  }
  assert.deepEqual((await listRecords(TABLAS.saldos)).map((r) => JSON.stringify(r)), antes, "Saldos no cambió");
});

test("Reembolso que llega antes que el pago: fila anulada sin monto ni mail, y el pago de después no anota", async () => {
  const d = deps();
  assert.equal((await anularPorPedido("HARPER-5004", "reembolso", d)).estado, "anulado-antes");
  const [fila] = await filasDe("HARPER-5004");
  assert.equal(fila.fields.Estado, "Anulado");
  assert.equal(fila.fields.Monto, 0);
  assert.equal(fila.fields.Porcentaje, 0);
  assert.ok(!("Email" in fila.fields), "sin mail: no hay a quién acreditarle");
  assert.equal((await registrarCredito(pedido("HARPER-5004"), d)).estado, "ya");
  assert.equal((await filasDe("HARPER-5004")).length, 1);
});

// ---------- Lo que se lee de la tabla ----------

const registro = (fields: CamposCredito): AirtableRecord<CamposCredito> => ({ id: "recPRUEBA00000001", createdTime: "2026-11-05T12:00:00.000Z", fields });
const sana: CamposCredito = {
  Clave: "credito-harper:HARPER-7",
  Pedido: "HARPER-7",
  Email: "A@B.com",
  Monto: 4_495,
  Porcentaje: 5,
  Base: 89_900,
  Anteojos: 1,
  Estado: "Disponible",
  Generado_el: "2026-11-01T10:00:00.000Z",
  Fecha_entrega: "2026-11-03",
  Disponible_desde: "2026-12-03",
  Reglas: "credito-harper-v1",
  Notas: "x",
};

test("Leer una fila: ida y vuelta con los mismos campos", () => {
  const fila = filaDelRegistro(registro(sana));
  assert.equal(fila.estado, "Disponible");
  assert.equal(fila.email, "a@b.com");
  assert.equal(fila.incidenciaAbierta, false, "una casilla destildada no viene");
  const { id, ...resto } = fila;
  assert.equal(id, "recPRUEBA00000001");
  assert.deepEqual(camposDeLaFila(resto), { ...sana, Email: "a@b.com", Incidencia_abierta: false });
  // Sin Generado_el (editada a mano): cuenta desde que se creó la fila.
  assert.equal(filaDelRegistro(registro({ ...sana, Generado_el: undefined })).generadoEl, "2026-11-05T12:00:00.000Z");
});

test("Una fila editada a mano con datos que no tienen sentido se lee «A revisar»: nunca se usa ni se libera sola", () => {
  const rotas: [string, CamposCredito][] = [
    ["estado desconocido", { ...sana, Estado: "Usado" }],
    ["sin estado", { ...sana, Estado: undefined }],
    ["monto con decimales", { ...sana, Monto: 4_495.5 }],
    ["monto negativo", { ...sana, Monto: -1 }],
    ["sin monto", { ...sana, Monto: undefined }],
    ["porcentaje raro", { ...sana, Porcentaje: 7 }],
    ["clave de otro pedido", { ...sana, Clave: "credito-harper:HARPER-8" }],
    ["fecha imposible", { ...sana, Fecha_entrega: "2026-02-30" }],
  ];
  for (const [que, campos] of rotas) assert.equal(filaDelRegistro(registro(campos)).estado, "A revisar", que);
  // Una anulada sigue anulada aunque le falten datos.
  assert.equal(filaDelRegistro(registro({ ...sana, Estado: "Anulado", Monto: undefined })).estado, "Anulado");
});

test("pendientes() no devuelve una fila Pendiente con datos rotos", async () => {
  const d = deps();
  await registrarCredito(pedido("HARPER-5005"), d);
  const [fila] = await filasDe("HARPER-5005");
  // Alguien le cambia la clave a mano.
  await updateRecord(TABLAS.creditos, fila.id, { Clave: "otra-cosa" });
  assert.ok(!(await almacenAirtable.pendientes()).some((f) => f.pedido === "HARPER-5005"));
});

// ---------- Fuera del Airtable de prueba, no escribe ----------

test("Solo escribe en el Airtable de prueba o con HARPER_CREDITO_ACTIVO=1 (apagado)", () => {
  assert.equal(puedeEscribirCreditos({ HARPER_FIXTURES: "1" }), true);
  assert.equal(puedeEscribirCreditos({}), false);
  assert.equal(puedeEscribirCreditos({ HARPER_FIXTURES: "1", VERCEL: "1" }), false, "en Vercel el modo de prueba no cuenta");
  assert.equal(puedeEscribirCreditos({ VERCEL: "1", HARPER_CREDITO_ACTIVO: "0" }), false);
  assert.equal(puedeEscribirCreditos({ VERCEL: "1", HARPER_CREDITO_ACTIVO: "1" }), true, "recién cuando se prenda");
});

test("Con el crédito apagado y fuera del modo de prueba, crear y actualizar tiran antes de llamar a Airtable", async () => {
  const fetchOriginal = globalThis.fetch;
  const guardado = { fixtures: process.env.HARPER_FIXTURES, token: process.env.AIRTABLE_TOKEN, base: process.env.AIRTABLE_BASE_ID };
  let llamadas = 0;
  globalThis.fetch = (async () => {
    llamadas++;
    throw new Error("no debería salir a la red");
  }) as typeof fetch;
  delete process.env.HARPER_FIXTURES;
  delete process.env.AIRTABLE_TOKEN;
  delete process.env.AIRTABLE_BASE_ID;
  try {
    const fila = {
      clave: "credito-harper:HARPER-9",
      pedido: "HARPER-9",
      email: "a@b.com",
      monto: 1,
      porcentaje: 5 as const,
      base: 20,
      anteojos: 1,
      estado: "Pendiente" as const,
      generadoEl: ahora.toISOString(),
      fechaEntrega: null,
      disponibleDesde: null,
      incidenciaAbierta: false,
      reglas: "credito-harper-v1",
      notas: "",
    };
    await assert.rejects(almacenAirtable.crear(fila), CreditoApagado);
    await assert.rejects(almacenAirtable.actualizar("recPRUEBA00000001", { estado: "Disponible" }), CreditoApagado);
    assert.equal(llamadas, 0);
  } finally {
    globalThis.fetch = fetchOriginal;
    process.env.HARPER_FIXTURES = guardado.fixtures;
    if (guardado.token !== undefined) process.env.AIRTABLE_TOKEN = guardado.token;
    if (guardado.base !== undefined) process.env.AIRTABLE_BASE_ID = guardado.base;
  }
});
