import { test, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

// Tarea 11: pruebas de integración del Crédito Harper contra una base de
// Airtable AISLADA y un Redis real (Upstash). No usan pedidos ni créditos de
// clientes: todo lo que crean lleva el prefijo SANDBOX-… y se borra al final.
//
// Se saltean solas si faltan las variables (así corren en la suite de
// siempre sin tocar nada). Se niegan a correr contra la base real. Cómo
// prepararlas: docs/plan-programa-harper.md §17.10.
//
//   HARPER_SANDBOX_AIRTABLE_TOKEN  token con acceso SOLO a la base de pruebas
//   HARPER_SANDBOX_AIRTABLE_BASE   app… de la base de pruebas
//   HARPER_SANDBOX_TABLAS          {"creditos":"tbl…","pedidos":"tbl…","clientes":"tbl…","saldos":"tbl…"}
//   HARPER_SANDBOX_REDIS_URL       REST URL de un Redis de pruebas (Upstash)
//   HARPER_SANDBOX_REDIS_TOKEN     su token
//
//   npm run test:credito-sandbox

const BASE_REAL = "appcFfhxM8uVdVKoP";
/** Las tablas de la base real: ninguna puede aparecer en la configuración de pruebas. */
const TABLAS_REALES = ["tblrhgsHP6oJLa5C2", "tblSgqs3hK8Xk8W8N", "tbl4HkvPUGzjbdWAe", "tblsaNGzIXaeK8aJM", "tblMyAedM5pvVijLf", "tblYkgJW6Bi0Fx048", "tblgag8YwduSiTWfx", "tblvaaoydP0pnIwuq", "tblRUhR5fI1ZAmC9Z", "tbljsISq3DoFBWiEF"];

const S = {
  token: process.env.HARPER_SANDBOX_AIRTABLE_TOKEN?.trim() ?? "",
  base: process.env.HARPER_SANDBOX_AIRTABLE_BASE?.trim() ?? "",
  tablas: process.env.HARPER_SANDBOX_TABLAS?.trim() ?? "",
  redisUrl: process.env.HARPER_SANDBOX_REDIS_URL?.trim() ?? "",
  redisToken: process.env.HARPER_SANDBOX_REDIS_TOKEN?.trim() ?? "",
};
const configurado = Object.values(S).every(Boolean);
const SALTEAR = configurado ? false : "falta la base de pruebas aislada (HARPER_SANDBOX_*): ver docs/plan-programa-harper.md §17.10";

if (configurado) {
  if (S.base === BASE_REAL) throw new Error("HARPER_SANDBOX_AIRTABLE_BASE es la base REAL de Harper: estas pruebas nunca corren ahí");
  const tablas = JSON.parse(S.tablas) as Record<string, string>;
  for (const clave of ["creditos", "pedidos", "clientes", "saldos"]) {
    if (!/^tbl[A-Za-z0-9]{14}$/.test(tablas[clave] ?? "")) throw new Error(`HARPER_SANDBOX_TABLAS no tiene la tabla «${clave}» de la base de pruebas`);
  }
  if (Object.values(tablas).some((t) => TABLAS_REALES.includes(t))) throw new Error("HARPER_SANDBOX_TABLAS tiene una tabla de la base real");
  process.env.AIRTABLE_TOKEN = S.token;
  process.env.AIRTABLE_BASE_ID = S.base;
  process.env.AIRTABLE_TABLAS = S.tablas;
  process.env.HARPER_CREDITO_SANDBOX = "1";
  delete process.env.HARPER_FIXTURES;
} else {
  // Sin la base de pruebas, nada puede salir a la red.
  process.env.HARPER_FIXTURES = "1";
}
delete process.env.VERCEL;
delete process.env.HARPER_CREDITO_ACTIVO;
delete process.env.HARPER_DUO_ACTIVO;

import { createRecord, escaparFormula, listRecords, TABLAS } from "../../lib/airtable";
import { cerrojoRedis, ErrorCerrojo } from "../../lib/cerrojo";
import { almacenAirtable, cashbackAnteriorDelPedido, type CamposCredito } from "../../lib/credito-airtable";
import { lectorMercadoPago, lectorPedidosAirtable, MARCA_REGIMEN_NUEVO, procesarPagoParaCredito } from "../../lib/credito-pagos";
import { anularPorPedido, claveCerrojoCredito, registrarCredito, type DependenciasCredito, type PedidoAcreditable } from "../../lib/credito-persistencia";

const PREFIJO = `SANDBOX-${Date.now().toString(36).toUpperCase()}`;
let n = 0;
const nuevoNumero = () => `${PREFIJO}-${++n}`;
const creados: { tabla: string; id: string }[] = [];
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Una «instancia»: su propio cliente de Redis y sus propios nonces, como otra función de Vercel. */
function instancia(redisUrl = S.redisUrl): DependenciasCredito {
  return {
    almacen: almacenAirtable,
    cerrojo: cerrojoRedis({ url: redisUrl, token: S.redisToken }),
    cashbackAnterior: cashbackAnteriorDelPedido,
    ahora: () => new Date(),
    nonce: () => crypto.randomUUID(),
  };
}

const pedido = (numero: string): PedidoAcreditable => ({
  numero,
  renglones: [
    { categoria: "Anteojos", cantidad: 1, subtotal: 89_900 },
    { categoria: "Anteojos", cantidad: 1, subtotal: 67_425 },
  ],
  pagado: true,
  regimen: "nuevo",
  email: "sandbox@harper.ar",
});

const filasDe = async (numero: string) =>
  listRecords<CamposCredito>(TABLAS.creditos, { filterByFormula: `{Pedido} = '${escaparFormula(numero)}'`, revalidate: 0 });

/** Un comando directo al Redis de pruebas (para tomar una llave «de otra instancia»). */
async function redis(comando: string[]) {
  const r = await fetch(S.redisUrl, { method: "POST", headers: { Authorization: `Bearer ${S.redisToken}`, "Content-Type": "application/json" }, body: JSON.stringify(comando) });
  return (await r.json()) as { result?: unknown; error?: string };
}

/** Como reintenta Mercado Pago: ocupado o error transitorio → otra vez, con espera. */
async function conReintentos<T extends { estado: string }>(hacer: () => Promise<T>, veces = 8): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      const r = await hacer();
      if (r.estado !== "ocupado" || i >= veces) return r;
    } catch (error) {
      if (i >= veces) throw error;
    }
    await esperar(400 * i);
  }
}

after(async () => {
  if (!configurado) return;
  if (S.base === BASE_REAL) return;
  // Todo lo que crearon estas pruebas, y nada más.
  const creditos = await listRecords(TABLAS.creditos, { filterByFormula: `FIND('${PREFIJO}', {Pedido})`, revalidate: 0 });
  const porTabla = new Map<string, string[]>();
  for (const { tabla, id } of [...creditos.map((c) => ({ tabla: TABLAS.creditos, id: c.id })), ...creados]) {
    porTabla.set(tabla, [...(porTabla.get(tabla) ?? []), id]);
  }
  for (const [tabla, ids] of porTabla) {
    for (let i = 0; i < ids.length; i += 10) {
      const query = ids.slice(i, i + 10).map((id) => `records[]=${id}`).join("&");
      await fetch(`https://api.airtable.com/v0/${S.base}/${tabla}?${query}`, { method: "DELETE", headers: { Authorization: `Bearer ${S.token}` } });
    }
  }
});

test("Varias instancias a la vez, con Redis y Airtable reales: una sola fila", { skip: SALTEAR }, async () => {
  const numero = nuevoNumero();
  const instancias = Array.from({ length: 4 }, () => instancia());
  const primeros = await Promise.allSettled(instancias.map((d) => registrarCredito(pedido(numero), d)));
  const estados = primeros.map((r) => (r.status === "fulfilled" ? r.value.estado : "error"));
  assert.ok(estados.filter((e) => e === "creado").length <= 1, `más de una creó: ${estados}`);
  // Los que quedaron ocupados (o con error transitorio) reintentan, como Mercado Pago.
  const finales = await Promise.all(instancias.map((d) => conReintentos(() => registrarCredito(pedido(numero), d))));
  assert.ok(finales.every((r) => r.estado === "ya" || r.estado === "creado"), JSON.stringify(finales.map((r) => r.estado)));
  const filas = await filasDe(numero);
  assert.equal(filas.filter((f) => f.fields.Estado !== "Anulado").length, 1, "una sola vigente");
  assert.equal(filas.length, 1, "y sin duplicados anulados: el cerrojo alcanzó");
});

test("Una llave tomada por otra instancia vence sola (TTL): ocupado hasta que vence", { skip: SALTEAR }, async () => {
  const numero = nuevoNumero();
  assert.equal((await redis(["SET", claveCerrojoCredito(numero), "otra-instancia", "NX", "PX", "1500"])).result, "OK");
  assert.deepEqual(await registrarCredito(pedido(numero), instancia()), { estado: "ocupado" });
  assert.deepEqual(await filasDe(numero), []);
  await esperar(2_000);
  assert.equal((await registrarCredito(pedido(numero), instancia())).estado, "creado");
});

test("Se pierde la respuesta de Airtable después de escribir: el reintento ve la fila y no crea otra", { skip: SALTEAR }, async () => {
  const numero = nuevoNumero();
  const original = globalThis.fetch;
  let cortadas = 0;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const respuesta = await original(url, init);
    if (init?.method === "POST" && String(url).includes(`/${TABLAS.creditos}`) && cortadas++ === 0) throw new TypeError("se cortó la conexión");
    return respuesta;
  }) as typeof fetch;
  try {
    await assert.rejects(registrarCredito(pedido(numero), instancia()));
  } finally {
    globalThis.fetch = original;
  }
  assert.equal((await registrarCredito(pedido(numero), instancia())).estado, "ya");
  assert.equal((await filasDe(numero)).length, 1);
});

test("Redis inalcanzable: falla cerrado y no escribe", { skip: SALTEAR }, async () => {
  const numero = nuevoNumero();
  await assert.rejects(registrarCredito(pedido(numero), instancia("https://redis-de-pruebas.invalid")), ErrorCerrojo);
  assert.deepEqual(await filasDe(numero), []);
});

test("Reembolso antes que el pago, con las tablas de prueba: fila anulada y el pago de después no anota", { skip: SALTEAR }, async () => {
  const numero = nuevoNumero();
  const d = instancia();
  assert.equal((await anularPorPedido(numero, "reembolso", d, { quedoSinCobro: async () => true })).estado, "anulado-antes");
  assert.equal((await registrarCredito(pedido(numero), d)).estado, "ya");
  assert.deepEqual((await filasDe(numero)).map((f) => f.fields.Estado), ["Anulado"]);
});

test("Aviso de pago de punta a punta: Pedido y Cliente en la base de prueba, Mercado Pago de mentira", { skip: SALTEAR }, async () => {
  const numero = nuevoNumero();
  const cliente = await createRecord(TABLAS.clientes, { Email: "sandbox@harper.ar" });
  creados.push({ tabla: TABLAS.clientes, id: cliente.id });
  const fila = await createRecord(TABLAS.pedidos, {
    Numero: numero,
    Estado: "pagado",
    Cliente: [cliente.id],
    Items: JSON.stringify(pedido(numero).renglones),
    Total: 157_325,
    Notas: MARCA_REGIMEN_NUEVO,
  });
  creados.push({ tabla: TABLAS.pedidos, id: fila.id });

  // Dos pagos del mismo pedido (el cliente pagó dos veces).
  const pagos = new Map<string, Record<string, unknown>>([
    ["1", { id: 1, status: "approved", external_reference: fila.id, transaction_amount: 157_325 }],
    ["2", { id: 2, status: "approved", external_reference: fila.id, transaction_amount: 157_325 }],
  ]);
  const mpFalso = (async (url: string | URL | Request) => {
    const u = new URL(String(url));
    if (u.pathname === "/v1/payments/search") return Response.json({ results: [...pagos.values()], paging: { total: pagos.size } });
    const pago = pagos.get(u.pathname.split("/").pop() ?? "");
    return pago ? Response.json(pago) : new Response("{}", { status: 404 });
  }) as typeof fetch;
  const deps = { credito: instancia(), mp: lectorMercadoPago({ token: "x", api: "https://mp.de.prueba", fetch: mpFalso }), pedidos: lectorPedidosAirtable };

  const r = await procesarPagoParaCredito("1", deps);
  assert.equal(r.accion === "registrar" && r.resultado.estado, "creado");
  assert.equal(r.accion === "registrar" && r.cobro.repetidos, 1);
  // Se devuelve el repetido: el crédito sigue.
  pagos.set("2", { ...pagos.get("2"), status: "refunded", transaction_amount_refunded: 157_325 });
  assert.equal((await procesarPagoParaCredito("2", deps)).accion, "registrar");
  assert.equal((await filasDe(numero))[0].fields.Estado, "Pendiente");
  // Se devuelve el otro: se anula.
  pagos.set("1", { ...pagos.get("1"), status: "refunded", transaction_amount_refunded: 157_325 });
  const anulado = await procesarPagoParaCredito("1", deps);
  assert.equal(anulado.accion === "anular" && anulado.resultado.estado, "anulado");
});

test("Sin la base de pruebas configurada, esta suite no sale a la red", { skip: configurado ? "hay base de pruebas" : false }, () => {
  assert.equal(process.env.HARPER_FIXTURES, "1");
  assert.equal(process.env.HARPER_CREDITO_SANDBOX, undefined);
});
