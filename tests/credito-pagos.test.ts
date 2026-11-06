import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// Tarea 11: el Crédito Harper con los avisos de pago. Mercado Pago es uno de
// mentira (solo GET), Airtable y Redis son los de prueba. Nada de esto toca
// pagos reales, la base real ni el webhook de producción.
process.env.HARPER_FIXTURES = "1";
delete process.env.VERCEL;
delete process.env.HARPER_DUO_ACTIVO;
delete process.env.HARPER_CREDITO_ACTIVO;
for (const v of ["KV_REST_API_URL", "KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "MP_ACCESS_TOKEN"]) delete process.env[v];

import { createRecord, listRecords, TABLAS, updateRecord, type AirtableRecord } from "../lib/airtable";
import { cerrojoRedis, ErrorCerrojo } from "../lib/cerrojo";
import { dependenciasCredito, type CamposCredito } from "../lib/credito-airtable";
import {
  CobroIncierto,
  cobroDelPedido,
  dependenciasPagoCredito,
  ErrorLecturaMP,
  hayQueReintentar,
  lectorMercadoPago,
  lectorPedidosAirtable,
  MARCA_REGIMEN_NUEVO,
  MAXIMO_PAGOS_POR_PEDIDO,
  pagoDe,
  pedidoDesdeFila,
  procesarPagoParaCredito,
  regimenDelPedido,
  renglonesDeItems,
  type DependenciasPagoCredito,
  type FilaPedidoCredito,
  type PagoLeido,
} from "../lib/credito-pagos";
import { interceptar, RespuestaFixture } from "../lib/fixtures/servidor";
import { fetchRedisFalso, reiniciarRedis } from "../lib/fixtures/redis";

// ---------- Un Mercado Pago de mentira, solo lectura ----------

type PagoCrudo = { id: number; status: string; status_detail?: string; external_reference?: string; transaction_amount: number; transaction_amount_refunded?: number };

class MercadoPagoFalso {
  pagos = new Map<string, PagoCrudo>();
  /** La búsqueda puede venir atrasada: estos no aparecen todavía. */
  ocultos = new Set<string>();
  /** Lo que devolvía la búsqueda antes (estado viejo): el lector no tiene que usarlo. */
  estadoViejoEnBusqueda = new Map<string, string>();
  llamadas: { metodo: string; ruta: string }[] = [];
  falla: ((ruta: string) => number | null) | null = null;
  /** Suma al total que informa la búsqueda (para simular una búsqueda incompleta). */
  totalDeMas = 0;

  poner(p: PagoCrudo) {
    this.pagos.set(String(p.id), { ...p });
  }
  cambiar(id: number, cambios: Partial<PagoCrudo>) {
    Object.assign(this.pagos.get(String(id))!, cambios);
  }
  fetch: typeof fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = new URL(String(url));
    this.llamadas.push({ metodo: init?.method ?? "GET", ruta: u.pathname + u.search });
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer TOKEN-PRUEBA");
    const codigo = this.falla?.(u.pathname + u.search);
    if (codigo === 0) throw new TypeError("fetch failed");
    if (codigo) return new Response("{}", { status: codigo });
    if (u.pathname === "/v1/payments/search") {
      const referencia = u.searchParams.get("external_reference");
      const results = [...this.pagos.values()]
        .filter((p) => p.external_reference === referencia && !this.ocultos.has(String(p.id)))
        .map((p) => ({ ...p, status: this.estadoViejoEnBusqueda.get(String(p.id)) ?? p.status }));
      const desde = Number(u.searchParams.get("offset") ?? 0);
      const hasta = desde + Number(u.searchParams.get("limit") ?? 50);
      return Response.json({ results: results.slice(desde, hasta), paging: { total: results.length + this.totalDeMas } });
    }
    const m = /^\/v1\/payments\/(\d+)$/.exec(u.pathname);
    const pago = m ? this.pagos.get(m[1]) : undefined;
    return pago ? Response.json(pago) : new Response("{}", { status: 404 });
  }) as typeof fetch;
}

// ---------- El entorno de cada prueba ----------

let ahora = new Date("2026-11-20T15:00:00.000Z");
let mp: MercadoPagoFalso;
/** Se llama cuando alguien toma el cerrojo del crédito (para cambiar el estado justo ahí). */
let alTomarCerrojo: () => void | Promise<void> = () => {};

function deps(): DependenciasPagoCredito {
  let n = 0;
  const redis = fetchRedisFalso({ ahora: () => ahora.getTime() });
  const conGancho = (async (url: string | URL | Request, init?: RequestInit) => {
    const comando = JSON.parse(String(init?.body)) as string[];
    if (comando[0] === "SET" && String(comando[1]).startsWith("harper:credito:")) await alTomarCerrojo();
    return redis(url, init);
  }) as typeof fetch;
  return {
    credito: { ...dependenciasCredito(), cerrojo: cerrojoRedis({ url: "https://redis.de.prueba", token: "t" }, conGancho), ahora: () => ahora, nonce: () => `n-${++n}` },
    mp: lectorMercadoPago({ token: "TOKEN-PRUEBA", api: "https://mp.de.prueba", fetch: mp.fetch }),
    pedidos: lectorPedidosAirtable,
  };
}

beforeEach(() => {
  mp = new MercadoPagoFalso();
  reiniciarRedis();
  alTomarCerrojo = () => {};
  interceptar(null);
});
afterEach(() => interceptar(null));

let secuencia = 0;
const ITEMS_DUO = [
  { categoria: "Anteojos", cantidad: 1, subtotal: 89_900, nombre: "AMATISTA" },
  { categoria: "Anteojos", cantidad: 1, subtotal: 67_425, nombre: "CUARZO" },
  { categoria: "Estuches", cantidad: 1, subtotal: 9_900, nombre: "M500" },
];

/** Un pedido de prueba en el Airtable en memoria, con su cliente. Devuelve el ID (external_reference). */
async function pedido(
  opciones: { notas?: string; total?: number; items?: unknown[]; email?: string; estado?: string; mpPaymentId?: string } = {}
): Promise<{ id: string; numero: string; total: number }> {
  const numero = `HARPER-T11-${++secuencia}`;
  const cliente = await createRecord(TABLAS.clientes, { Email: opciones.email ?? "Cliente@Ejemplo.com" });
  const total = opciones.total ?? 167_225;
  const fila = await createRecord(TABLAS.pedidos, {
    Numero: numero,
    Estado: opciones.estado ?? "pagado",
    Cliente: [cliente.id],
    ...(opciones.mpPaymentId ? { MP_payment_id: opciones.mpPaymentId } : {}),
    Items: JSON.stringify(opciones.items ?? ITEMS_DUO),
    Total: total,
    Notas: opciones.notas ?? MARCA_REGIMEN_NUEVO,
  });
  return { id: fila.id, numero, total };
}

const filasDe = async (numero: string) => (await listRecords<CamposCredito>(TABLAS.creditos, { revalidate: 0 })).filter((r) => r.fields.Pedido === numero);
let idPago = 900_000;
const pagoAprobado = (pedidoId: string, total: number, extra: Partial<PagoCrudo> = {}): PagoCrudo => ({
  id: ++idPago,
  status: "approved",
  external_reference: pedidoId,
  transaction_amount: total,
  ...extra,
});

// ---------- El cobro con todos los pagos (puro) ----------

const leido = (id: string, status: string, monto: number, extra: Partial<PagoLeido> = {}): PagoLeido => ({ id, status, statusDetail: "", pedidoId: "rec1", monto, reembolsado: 0, ...extra });

test("El cobro del pedido se mide con todos sus pagos, no con el del aviso", () => {
  const T = 100_000;
  const casos: [string, PagoLeido[], string, Partial<ReturnType<typeof cobroDelPedido>>][] = [
    ["un pago aprobado", [leido("a", "approved", T)], "cobrado", { repetidos: 0 }],
    ["pagó dos veces", [leido("a", "approved", T), leido("b", "approved", T)], "cobrado", { repetidos: 1 }],
    ["se devolvió el repetido", [leido("a", "approved", T), leido("b", "refunded", T, { reembolsado: T })], "cobrado", { repetidos: 0 }],
    ["se devolvió el original y queda el repetido", [leido("a", "refunded", T, { reembolsado: T }), leido("b", "approved", T)], "cobrado", {}],
    ["se devolvieron los dos", [leido("a", "refunded", T, { reembolsado: T }), leido("b", "refunded", T, { reembolsado: T })], "sin-cobro", {}],
    ["reembolso parcial", [leido("a", "approved", T, { reembolsado: 30_000 })], "parcial", { neto: 70_000 }],
    ["reclamo abierto", [leido("a", "in_mediation", T)], "cobrado", { incidenciaAbierta: true, cubiertoSinDisputa: false }],
    ["reclamo abierto en uno y otro pago válido (revisión del PR #70)", [leido("a", "in_mediation", T), leido("b", "approved", T)], "cobrado", { incidenciaAbierta: true, cubiertoSinDisputa: true }],
    ["contracargo en curso", [leido("a", "charged_back", T, { statusDetail: "in_process" })], "cobrado", { incidenciaAbierta: true }],
    ["contracargo ganado", [leido("a", "charged_back", T, { statusDetail: "reimbursed" })], "cobrado", { incidenciaAbierta: false }],
    ["contracargo perdido", [leido("a", "charged_back", T, { statusDetail: "settled" })], "sin-cobro", { contracargoPerdido: true }],
    ["en curso", [leido("a", "in_process", T)], "pendiente", {}],
    ["rechazado y cancelado", [leido("a", "rejected", T), leido("b", "cancelled", T)], "sin-pago", {}],
    ["sin pagos", [], "sin-pago", {}],
    ["un estado que no se conoce (revisión del PR #69)", [leido("a", "estado_nuevo", T)], "indeterminado", { desconocidos: ["a: estado_nuevo"] }],
    ["uno aprobado y otro desconocido: tampoco se decide", [leido("a", "approved", T), leido("b", "estado_nuevo", T)], "indeterminado", {}],
    ["contracargo con un detalle que no se conoce: en curso, nunca sin cobro", [leido("a", "charged_back", T, { statusDetail: "detalle_nuevo" })], "cobrado", { incidenciaAbierta: true }],
  ];
  for (const [que, pagos, estado, extra] of casos) {
    const c = cobroDelPedido(pagos, T);
    assert.equal(c.estado, estado, que);
    for (const [k, v] of Object.entries(extra)) assert.deepEqual(c[k as keyof typeof c], v, `${que}: ${k}`);
  }
  // Un pedido de $ 0 (pagado entero con saldo) cuenta como cobrado; el motor después no da crédito.
  assert.equal(cobroDelPedido([], 0).estado, "cobrado");
  assert.throws(() => cobroDelPedido([], -1), RangeError);
});

test("El régimen sale de las Notas del pedido: sin marca o con el cashback de hoy, las reglas de hoy", () => {
  assert.deepEqual(regimenDelPedido(MARCA_REGIMEN_NUEVO), { regimen: "nuevo", motivo: "marca-nueva" });
  assert.deepEqual(regimenDelPedido(`Suscriptor: a@b.com (recAAAAAAAAAAAAAA)\nCashback a acreditar: $ 8.990`), { regimen: "anterior", motivo: "cashback-anterior" });
  assert.deepEqual(regimenDelPedido(`${MARCA_REGIMEN_NUEVO}\nCashback a acreditar: $ 8.990`), { regimen: "anterior", motivo: "conflicto" });
  for (const nada of [undefined, "", "Promoción: Dúo 25 %", "Crédito Harper: otra cosa"]) {
    assert.deepEqual(regimenDelPedido(nada), { regimen: "anterior", motivo: "sin-marca" }, String(nada));
  }
});

test("Los renglones salen de Items; un pedido ilegible no se acredita", () => {
  assert.deepEqual(renglonesDeItems(JSON.stringify(ITEMS_DUO)).map((r) => r.subtotal), [89_900, 67_425, 9_900]);
  assert.deepEqual(renglonesDeItems(JSON.stringify([{ categoria: "Anteojos", cantidad: 1, subtotal: 77_900, saldo: 12_000 }])), [
    { categoria: "Anteojos", cantidad: 1, subtotal: 77_900, saldo: 12_000 },
  ]);
  for (const malo of ["", "{", "{}", JSON.stringify([{ categoria: "Anteojos" }])]) assert.throws(() => renglonesDeItems(malo), RangeError, malo);
  const fila = (fields: FilaPedidoCredito): AirtableRecord<FilaPedidoCredito> => ({ id: "recP", createdTime: "", fields });
  assert.throws(() => pedidoDesdeFila(fila({ Total: 1, Items: "[]" }), null), RangeError, "sin número");
  assert.throws(() => pedidoDesdeFila(fila({ Numero: "H-1", Items: "[]" }), null), RangeError, "sin total");
  assert.equal(pedidoDesdeFila(fila({ Numero: " H-1 ", Total: 5, Items: "[]" }), " A@B.com ").email, "a@b.com");
  assert.throws(() => pagoDe({ status: "approved" }), ErrorLecturaMP);
});

// ---------- El lector de Mercado Pago ----------

test("El lector de Mercado Pago solo hace GET, y lee cada pago por su ID aunque la búsqueda venga atrasada", async () => {
  const lector = lectorMercadoPago({ token: "TOKEN-PRUEBA", api: "https://mp.de.prueba", fetch: mp.fetch });
  mp.poner({ id: 1, status: "approved", external_reference: "recX", transaction_amount: 100 });
  mp.poner({ id: 2, status: "refunded", external_reference: "recX", transaction_amount: 100, transaction_amount_refunded: 100 });
  mp.poner({ id: 3, status: "approved", external_reference: "recOTRO", transaction_amount: 100 });
  // La búsqueda todavía dice que el 2 está aprobado: el lector usa lo que dice el pago.
  mp.estadoViejoEnBusqueda.set("2", "approved");
  const pagos = await lector.pagosDelPedido("recX");
  assert.deepEqual(pagos.map((p) => [p.id, p.status]), [["1", "approved"], ["2", "refunded"]]);
  assert.ok(mp.llamadas.every((l) => l.metodo === "GET"));

  mp.falla = () => 500;
  await assert.rejects(lector.pago("1"), (e: unknown) => e instanceof ErrorLecturaMP && e.status === 500);
  mp.falla = () => 0;
  await assert.rejects(lector.pagosDelPedido("recX"), (e: unknown) => e instanceof ErrorLecturaMP && e.status === 0);
  mp.falla = null;
  await assert.rejects(lector.pago("999"), (e: unknown) => e instanceof ErrorLecturaMP && e.status === 404);
});

// ---------- El aviso de un pago ----------

test("Pago aprobado de un pedido con el régimen nuevo: crédito Pendiente con el mail del cliente; el aviso repetido no suma", async () => {
  const p = await pedido();
  const pago = pagoAprobado(p.id, p.total);
  mp.poner(pago);
  const d = deps();
  const r = await procesarPagoParaCredito(String(pago.id), d);
  assert.equal(r.accion, "registrar");
  assert.equal(r.accion === "registrar" && r.resultado.estado, "creado");
  const [fila] = await filasDe(p.numero);
  assert.deepEqual([fila.fields.Monto, fila.fields.Porcentaje, fila.fields.Base, fila.fields.Email, fila.fields.Estado], [15_733, 10, 157_325, "cliente@ejemplo.com", "Pendiente"]);
  for (let i = 0; i < 3; i++) {
    const otra = await procesarPagoParaCredito(String(pago.id), d);
    assert.equal(otra.accion === "registrar" && otra.resultado.estado, "ya");
  }
  assert.equal((await filasDe(p.numero)).length, 1);
});

test("Régimen anterior (cashback de hoy, sin marca o en conflicto): no se anota nada", async () => {
  for (const notas of ["Suscriptor: a@b.com (recAAAAAAAAAAAAAA)\nCashback a acreditar: $ 16.722", "", `${MARCA_REGIMEN_NUEVO}\nCashback a acreditar: $ 1`]) {
    const p = await pedido({ notas });
    const pago = pagoAprobado(p.id, p.total);
    mp.poner(pago);
    const r = await procesarPagoParaCredito(String(pago.id), deps());
    assert.equal(r.accion, "nada");
    assert.equal(r.accion === "nada" && r.motivo, "regimen-anterior");
    assert.deepEqual(await filasDe(p.numero), []);
  }
});

test("Pago repetido: un solo crédito; reembolsar el repetido (o el original) con el otro vigente no anula", async () => {
  const p = await pedido();
  const a = pagoAprobado(p.id, p.total);
  const b = pagoAprobado(p.id, p.total);
  mp.poner(a);
  mp.poner(b);
  const d = deps();
  const ra = await procesarPagoParaCredito(String(a.id), d);
  assert.equal(ra.accion === "registrar" && ra.cobro.repetidos, 1, "avisa que pagó dos veces");
  const rb = await procesarPagoParaCredito(String(b.id), d);
  assert.equal(rb.accion === "registrar" && rb.resultado.estado, "ya");
  assert.equal((await filasDe(p.numero)).length, 1);

  // Harper devuelve el ORIGINAL y se queda con el repetido: el pedido sigue cobrado.
  mp.cambiar(a.id, { status: "refunded", transaction_amount_refunded: p.total });
  const devuelto = await procesarPagoParaCredito(String(a.id), d);
  assert.equal(devuelto.accion, "registrar", "sigue cobrado: no es una anulación");
  assert.equal((await filasDe(p.numero))[0].fields.Estado, "Pendiente");

  // Devuelve también el otro: ahora sí, sin cobro.
  mp.cambiar(b.id, { status: "refunded", transaction_amount_refunded: p.total });
  const sinCobro = await procesarPagoParaCredito(String(b.id), d);
  assert.equal(sinCobro.accion, "anular");
  assert.equal(sinCobro.accion === "anular" && sinCobro.resultado.estado, "anulado");
  assert.equal((await filasDe(p.numero))[0].fields.Estado, "Anulado");
});

test("Si entre el aviso y el cerrojo se reembolsa el otro pago, la anulación lo ve y no anula de más (y al revés)", async () => {
  // Dos pagos; llega el reembolso de A. Afuera del cerrojo se ve B vigente → se intenta registrar.
  const p = await pedido();
  const a = pagoAprobado(p.id, p.total, { status: "refunded", transaction_amount_refunded: p.total });
  const b = pagoAprobado(p.id, p.total);
  mp.poner(a);
  mp.poner(b);
  const d = deps();
  // Justo cuando se toma el cerrojo, B también se reembolsa: adentro se lee sin cobro.
  alTomarCerrojo = () => mp.cambiar(b.id, { status: "refunded", transaction_amount_refunded: p.total });
  const r = await procesarPagoParaCredito(String(a.id), d);
  assert.equal(r.accion === "registrar" && r.resultado.estado, "nada", "adentro del cerrojo ya no estaba pagado");
  assert.deepEqual(await filasDe(p.numero), []);

  // Al revés: afuera se ve sin cobro, y adentro del cerrojo apareció un pago nuevo.
  const q = await pedido();
  const c = pagoAprobado(q.id, q.total, { status: "refunded", transaction_amount_refunded: q.total });
  mp.poner(c);
  const nuevo = pagoAprobado(q.id, q.total);
  alTomarCerrojo = () => mp.poner(nuevo);
  const r2 = await procesarPagoParaCredito(String(c.id), d);
  assert.equal(r2.accion === "anular" && r2.resultado.estado, "sigue-cobrado");
  assert.deepEqual(await filasDe(q.numero), [], "no dejó una fila anulada que bloquee el crédito");
});

test("Reembolso anticipado: el reembolso se procesa antes que la aprobación y el crédito nunca nace", async () => {
  const p = await pedido();
  const a = pagoAprobado(p.id, p.total, { status: "refunded", transaction_amount_refunded: p.total });
  mp.poner(a);
  const d = deps();
  const r = await procesarPagoParaCredito(String(a.id), d);
  assert.equal(r.accion === "anular" && r.resultado.estado, "anulado-antes");
  // El aviso de «aprobado» llega tarde: Mercado Pago dice reembolsado. Nada nuevo.
  const tarde = await procesarPagoParaCredito(String(a.id), d);
  assert.equal(tarde.accion === "anular" && tarde.resultado.estado, "ya-anulado");
  const filas = await filasDe(p.numero);
  assert.deepEqual(filas.map((f) => [f.fields.Estado, f.fields.Monto]), [["Anulado", 0]]);
});

test("Contracargo: nace con la incidencia; ganado la cierra; un aviso viejo de «reclamo» no la vuelve a abrir; perdido anula", async () => {
  const p = await pedido();
  const a = pagoAprobado(p.id, p.total, { status: "in_mediation" });
  mp.poner(a);
  const d = deps();
  await procesarPagoParaCredito(String(a.id), d);
  assert.equal((await filasDe(p.numero))[0].fields.Incidencia_abierta, true);

  mp.cambiar(a.id, { status: "charged_back", status_detail: "reimbursed" });
  const ganado = await procesarPagoParaCredito(String(a.id), d);
  assert.equal(ganado.accion === "registrar" && ganado.incidencia?.estado, "incidencia-cerrada");
  assert.equal((await filasDe(p.numero))[0].fields.Incidencia_abierta, false);

  // El aviso viejo de «in_mediation» llega ahora: se lee el pago, que dice ganado.
  const viejo = await procesarPagoParaCredito(String(a.id), d);
  assert.equal(viejo.accion === "registrar" && viejo.incidencia, null);
  assert.equal((await filasDe(p.numero))[0].fields.Incidencia_abierta, false);

  const q = await pedido();
  const b = pagoAprobado(q.id, q.total, { status: "charged_back", status_detail: "in_process" });
  mp.poner(b);
  await procesarPagoParaCredito(String(b.id), d);
  mp.cambiar(b.id, { status: "charged_back", status_detail: "settled" });
  const perdido = await procesarPagoParaCredito(String(b.id), d);
  assert.equal(perdido.accion === "anular" && perdido.resultado.estado, "anulado");
  assert.match((await filasDe(q.numero))[0].fields.Notas ?? "", /contracargo perdido/);
});

test("Reembolso parcial: abre la incidencia del crédito; si no hay crédito, no anota nada solo", async () => {
  const p = await pedido();
  const a = pagoAprobado(p.id, p.total);
  mp.poner(a);
  const d = deps();
  await procesarPagoParaCredito(String(a.id), d);
  mp.cambiar(a.id, { transaction_amount_refunded: 67_425 });
  const r = await procesarPagoParaCredito(String(a.id), d);
  assert.equal(r.accion === "incidencia" && r.resultado.estado, "incidencia-abierta");
  const [fila] = await filasDe(p.numero);
  assert.equal(fila.fields.Incidencia_abierta, true);
  assert.equal(fila.fields.Monto, 15_733, "el monto lo corrige Harper al registrar la devolución");

  const q = await pedido();
  const b = pagoAprobado(q.id, q.total, { transaction_amount_refunded: 9_900 });
  mp.poner(b);
  assert.deepEqual(await procesarPagoParaCredito(String(b.id), d), { accion: "nada", motivo: "parcial-sin-credito", numero: q.numero });
  assert.deepEqual(await filasDe(q.numero), []);
});

test("Pagos en curso, rechazados, sin pedido o de un pedido que no existe: nada, ni una fila de bloqueo", async () => {
  const p = await pedido();
  const d = deps();
  const enCurso = pagoAprobado(p.id, p.total, { status: "in_process" });
  const rechazado = pagoAprobado(p.id, p.total, { status: "rejected" });
  mp.poner(enCurso);
  assert.equal((await procesarPagoParaCredito(String(enCurso.id), d)).accion === "nada", true);
  mp.cambiar(enCurso.id, { status: "cancelled" });
  mp.poner(rechazado);
  const r = await procesarPagoParaCredito(String(rechazado.id), d);
  assert.equal(r.accion === "nada" && r.motivo, "sin-pago");
  assert.deepEqual(await filasDe(p.numero), [], "un pedido nunca cobrado no queda bloqueado: puede pagar después");

  const sinReferencia = { id: ++idPago, status: "approved", transaction_amount: 1 };
  mp.poner(sinReferencia);
  assert.deepEqual(await procesarPagoParaCredito(String(sinReferencia.id), d), { accion: "nada", motivo: "pago-sin-pedido" });
  const deOtro = pagoAprobado("recNOEXISTE000001", 100);
  mp.poner(deOtro);
  assert.deepEqual(await procesarPagoParaCredito(String(deOtro.id), d), { accion: "nada", motivo: "pedido-inexistente" });
});

test("La búsqueda de Mercado Pago todavía no trae el pago del aviso: se suma igual, leído por su ID", async () => {
  const p = await pedido();
  const a = pagoAprobado(p.id, p.total);
  mp.poner(a);
  mp.ocultos.add(String(a.id));
  const r = await procesarPagoParaCredito(String(a.id), deps());
  assert.equal(r.accion === "registrar" && r.resultado.estado, "creado");
});

// ---------- Revisión del PR #69 ----------

test("1. El pago registrado en Pedidos siempre cuenta: si la búsqueda solo trae el repetido reembolsado, no se anula", async () => {
  const principal = pagoAprobado("", 0);
  const p = await pedido({ mpPaymentId: String(principal.id) });
  mp.poner({ ...principal, external_reference: p.id, transaction_amount: p.total });
  const repetido = pagoAprobado(p.id, p.total);
  mp.poner(repetido);
  const d = deps();
  await procesarPagoParaCredito(String(repetido.id), d);
  assert.equal((await filasDe(p.numero))[0].fields.Estado, "Pendiente");

  // La búsqueda de Mercado Pago todavía no trae el principal; se reembolsa el repetido.
  mp.ocultos.add(String(principal.id));
  mp.cambiar(repetido.id, { status: "refunded", transaction_amount_refunded: p.total });
  const r = await procesarPagoParaCredito(String(repetido.id), d);
  assert.equal(r.accion, "registrar", "el principal (MP_payment_id) sigue aprobado: el pedido está cobrado");
  assert.ok(mp.llamadas.some((l) => l.ruta === `/v1/payments/${principal.id}`), "se leyó el pago registrado por su ID");
  const [fila] = await filasDe(p.numero);
  assert.equal(fila.fields.Estado, "Pendiente");
  assert.equal(fila.fields.Monto, 15_733);
});

test("1. «Sin cobro» con una búsqueda atrasada no se decide: no anula ni bloquea, y se reintenta", async () => {
  const unico = pagoAprobado("", 0);
  const p = await pedido({ mpPaymentId: String(unico.id) });
  mp.poner({ ...unico, external_reference: p.id, transaction_amount: p.total, status: "refunded", transaction_amount_refunded: p.total });
  mp.ocultos.add(String(unico.id));
  const d = deps();
  await assert.rejects(procesarPagoParaCredito(String(unico.id), d), CobroIncierto);
  assert.deepEqual(await filasDe(p.numero), [], "ni una fila de bloqueo");

  // Cuando la búsqueda se pone al día, el reintento decide.
  mp.ocultos.clear();
  const r = await procesarPagoParaCredito(String(unico.id), d);
  assert.equal(r.accion === "anular" && r.resultado.estado, "anulado-antes");
});

test("1. Una búsqueda incompleta o con demasiados pagos no se trunca en silencio: CobroIncierto y nada escrito", async () => {
  const p = await pedido();
  const a = pagoAprobado(p.id, p.total, { status: "refunded", transaction_amount_refunded: p.total });
  mp.poner(a);
  const lector = lectorMercadoPago({ token: "TOKEN-PRUEBA", api: "https://mp.de.prueba", fetch: mp.fetch });
  // Dice que hay 3 y trae 1.
  mp.totalDeMas = 2;
  await assert.rejects(lector.pagosDelPedido(p.id), CobroIncierto);
  await assert.rejects(procesarPagoParaCredito(String(a.id), deps()), CobroIncierto);
  // Más de los razonables.
  mp.totalDeMas = MAXIMO_PAGOS_POR_PEDIDO;
  await assert.rejects(lector.pagosDelPedido(p.id), CobroIncierto);
  assert.deepEqual(await filasDe(p.numero), []);
  // Más de una página, completa: se leen todas.
  mp.totalDeMas = 0;
  for (let i = 0; i < 60; i++) mp.poner(pagoAprobado(p.id, 1, { status: "rejected" }));
  assert.equal((await lector.pagosDelPedido(p.id)).length, 61);
});

test("2. Solo un pedido confirmado genera crédito: cancelado, rechazado o sin confirmar, aunque el pago esté aprobado, no", async () => {
  const d = deps();
  for (const estado of ["cancelado", "rechazado", "pendiente", ""]) {
    const p = await pedido({ estado });
    const a = pagoAprobado(p.id, p.total);
    mp.poner(a);
    const r = await procesarPagoParaCredito(String(a.id), d);
    assert.deepEqual(r, { accion: "nada", motivo: "pedido-no-confirmado", numero: p.numero, estadoPedido: estado }, estado);
    assert.deepEqual(await filasDe(p.numero), [], estado);
  }
  for (const estado of ["preparando", "enviado", "entregado"]) {
    const p = await pedido({ estado });
    const a = pagoAprobado(p.id, p.total);
    mp.poner(a);
    const r = await procesarPagoParaCredito(String(a.id), d);
    assert.equal(r.accion === "registrar" && r.resultado.estado, "creado", estado);
  }
});

test("2. Si el pedido se cancela entre el aviso y el cerrojo, se relee adentro y no nace el crédito", async () => {
  const p = await pedido();
  const a = pagoAprobado(p.id, p.total);
  mp.poner(a);
  alTomarCerrojo = async () => {
    await updateRecord(TABLAS.pedidos, p.id, { Estado: "cancelado" });
  };
  const r = await procesarPagoParaCredito(String(a.id), deps());
  assert.equal(r.accion === "registrar" && r.resultado.estado, "nada");
  assert.deepEqual(await filasDe(p.numero), []);
});

test("3. Un estado de Mercado Pago que no se conoce no es «sin cobro»: no anula, no crea, y se reintenta", async () => {
  const p = await pedido();
  const a = pagoAprobado(p.id, p.total);
  mp.poner(a);
  const d = deps();
  await procesarPagoParaCredito(String(a.id), d);
  // Mercado Pago estrena un estado: el crédito queda como estaba.
  mp.cambiar(a.id, { status: "estado_nuevo_de_mp" });
  await assert.rejects(procesarPagoParaCredito(String(a.id), d), CobroIncierto);
  const [fila] = await filasDe(p.numero);
  assert.equal(fila.fields.Estado, "Pendiente");

  // Un pedido sin crédito con ese estado: tampoco deja una fila de bloqueo.
  const q = await pedido();
  const b = pagoAprobado(q.id, q.total, { status: "estado_nuevo_de_mp" });
  mp.poner(b);
  await assert.rejects(procesarPagoParaCredito(String(b.id), d), CobroIncierto);
  assert.deepEqual(await filasDe(q.numero), []);
});

// ---------- Fallas y reintentos ----------

test("Fallas: Mercado Pago, Airtable o Redis caídos no escriben nada; el reintento anota una sola vez", async () => {
  const p = await pedido();
  const a = pagoAprobado(p.id, p.total);
  mp.poner(a);
  const d = deps();

  mp.falla = (ruta) => (ruta.startsWith("/v1/payments/") ? 503 : null);
  await assert.rejects(procesarPagoParaCredito(String(a.id), d), ErrorLecturaMP);

  // La búsqueda falla recién adentro del cerrojo (la segunda vez).
  let busquedas = 0;
  mp.falla = (ruta) => (ruta.startsWith("/v1/payments/search") && ++busquedas === 2 ? 500 : null);
  await assert.rejects(procesarPagoParaCredito(String(a.id), d), ErrorLecturaMP);
  mp.falla = null;

  // Airtable no contesta al leer el pedido.
  interceptar((ruta, { method }) => {
    if (method === "GET" && ruta.startsWith(TABLAS.pedidos)) throw new RespuestaFixture(503, "Airtable caído");
  });
  await assert.rejects(procesarPagoParaCredito(String(a.id), d));
  interceptar(null);

  // Sin Redis.
  const sinRedis = { ...d, credito: { ...d.credito, cerrojo: null } };
  await assert.rejects(procesarPagoParaCredito(String(a.id), sinRedis), ErrorCerrojo);

  assert.deepEqual(await filasDe(p.numero), [], "ninguna falla escribió");
  // Vuelve todo: el reintento anota, y otro reintento no suma.
  assert.equal((await procesarPagoParaCredito(String(a.id), d)).accion, "registrar");
  await procesarPagoParaCredito(String(a.id), d);
  assert.equal((await filasDe(p.numero)).length, 1);
});

test("Cinco avisos del mismo pago a la vez: uno anota, los ocupados piden reintento y al reintentar ven «ya»", async () => {
  const p = await pedido();
  const a = pagoAprobado(p.id, p.total);
  mp.poner(a);
  const d = deps();
  const r = await Promise.all(Array.from({ length: 5 }, () => procesarPagoParaCredito(String(a.id), d)));
  const estados = r.map((x) => (x.accion === "registrar" ? x.resultado.estado : x.accion));
  assert.equal(estados.filter((e) => e === "creado").length, 1);
  assert.equal(r.filter(hayQueReintentar).length, estados.filter((e) => e === "ocupado").length);
  for (const x of r.filter(hayQueReintentar)) {
    void x;
    const otra = await procesarPagoParaCredito(String(a.id), d);
    assert.equal(otra.accion === "registrar" && otra.resultado.estado, "ya");
  }
  assert.equal((await filasDe(p.numero)).length, 1);
});

// ---------- Sin conectar ----------

test("Sin conectar: sin MP_ACCESS_TOKEN no hay lector; el módulo no escribe en Airtable ni le pide nada a Mercado Pago que no sea leer", () => {
  assert.equal(dependenciasPagoCredito({ ...dependenciasCredito() }), null);
  const raiz = path.resolve(__dirname, "..", "..");
  // El crédito y la lectura de Mercado Pago (lib/mp-cobro.ts, Tarea 12) solo leen.
  for (const archivo of ["credito-pagos.ts", "mp-cobro.ts"]) {
    const fuente = fs.readFileSync(path.join(raiz, "lib", archivo), "utf8");
    assert.doesNotMatch(fuente, /createRecord|updateRecord|updateRecords/, archivo);
    assert.doesNotMatch(fuente, /method:\s*["'](?:POST|PUT|PATCH|DELETE)/i, archivo);
    assert.doesNotMatch(fuente, /\/refunds|\/checkout\/preferences/, archivo);
  }
  // lib/mp-cobro.ts no sabe nada del crédito: el webhook lo usa para el cashback de hoy sin traer el crédito.
  assert.doesNotMatch(fs.readFileSync(path.join(raiz, "lib", "mp-cobro.ts"), "utf8"), /from\s+["']\.\/credito-/);
  const webhook = fs.readFileSync(path.join(raiz, "lib", "webhook-proceso.ts"), "utf8");
  assert.doesNotMatch(webhook, /credito-/, "el webhook de producción no usa el crédito");
});
