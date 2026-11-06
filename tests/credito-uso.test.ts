import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// Crédito Harper, paso 4: usar el crédito Disponible en el checkout
// (lib/credito-uso.ts). Todo contra el Airtable en memoria, un Redis en
// memoria y pagos de mentira: nada toca pagos ni compradores reales.
process.env.HARPER_FIXTURES = "1";
delete process.env.VERCEL;
delete process.env.HARPER_DUO_ACTIVO;
delete process.env.HARPER_CREDITO_ACTIVO;
for (const v of ["KV_REST_API_URL", "KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "MP_ACCESS_TOKEN"]) delete process.env[v];

import { createRecord, getRecord, listRecords, TABLAS, updateRecord } from "../lib/airtable";
import { ErrorCerrojo, type Cerrojo } from "../lib/cerrojo";
import { getProductos } from "../lib/catalogo";
import { getConfig } from "../lib/config";
import { calcularCredito } from "../lib/credito-harper";
import { creditosPorEmail, dependenciasCredito, filaDelRegistro, type CamposCredito } from "../lib/credito-airtable";
import { creditoParaElCarrito } from "../lib/credito-cuenta";
import { lectorPedidosAirtable, MARCA_REGIMEN_NUEVO, pagoDe, renglonesDeItems, type DependenciasPagoCredito, type LectorMercadoPago } from "../lib/credito-pagos";
import { liberarDisponibles } from "../lib/credito-persistencia";
import {
  abrirCuentaDeCredito,
  almacenUsosAirtable,
  aplicarCreditoHarper,
  claveDelUso,
  CreditoInsuficiente,
  leerSaldoDeCredito,
  lectorPedidosDeUsosAirtable,
  procesarUsoDelPago,
  reservaVigente,
  VENTANA_RESERVA_MS,
  type DependenciasUso,
  type FilaUso,
  type PedidoDeUnUso,
} from "../lib/credito-uso";
import { aplicarDineroMP } from "../lib/dinero-mp";
import { cerrojoEnMemoria, reiniciarRedis } from "../lib/fixtures/redis";
import { interceptar, reiniciar } from "../lib/fixtures/servidor";
import type { PagoMP } from "../lib/mercadopago";
import { itemsDelPedido, resolverCarrito } from "../lib/pedidos";
import type { SuscriptorDelCarrito } from "../lib/suscriptores";
import { confirmarPedidoSinPago } from "../lib/suscriptores-sin-pago";
import type { DatosCliente, ItemCarrito } from "../lib/tipos";
import { procesarNotificacion, type Dependencias, type FilaPedido } from "../lib/webhook-proceso";

const AHORA = Date.parse("2026-12-10T15:00:00.000Z");
const MAIL = "compradora@ejemplo.com";

function reloj(inicio = AHORA) {
  const r = {
    t: inicio,
    ahora: () => r.t,
    dormir: async (ms: number) => {
      r.t += ms;
      await new Promise<void>((s) => setImmediate(s));
    },
  };
  return r;
}

function armarUso(o: { cerrojo?: Cerrojo | null } = {}) {
  const r = reloj();
  const deps: DependenciasUso = {
    almacen: almacenUsosAirtable,
    pedidos: lectorPedidosDeUsosAirtable,
    cerrojo: o.cerrojo === undefined ? cerrojoEnMemoria({ ahora: () => r.t }) : o.cerrojo,
    reloj: r,
    esperaOcupadoMs: 2_000,
  };
  return { deps, reloj: r };
}

let secuencia = 0;
async function ganado(email: string, campos: Partial<CamposCredito> = {}) {
  const pedido = `HARPER-G${++secuencia}`;
  return createRecord<CamposCredito>(TABLAS.creditos, {
    Clave: `credito-harper:${pedido}`,
    Pedido: pedido,
    Email: email,
    Monto: 10_000,
    Porcentaje: 10,
    Base: 100_000,
    Anteojos: 2,
    Estado: "Disponible",
    Generado_el: "2026-10-01T12:00:00.000Z",
    Reglas: "credito-harper-v1",
    Notas: "",
    ...campos,
  });
}
async function uso(email: string, numero: string, monto: number, estado: string, generadoEl = new Date(AHORA).toISOString()) {
  return createRecord<CamposCredito>(TABLAS.creditos, {
    Clave: claveDelUso(numero),
    Pedido: numero,
    Email: email,
    Monto: monto,
    Porcentaje: 0,
    Base: 0,
    Anteojos: 0,
    Estado: estado,
    Generado_el: generadoEl,
    Reglas: "uso-credito-harper-v1",
    Notas: "",
  });
}
async function pedido(numero: string, campos: Record<string, unknown> = {}) {
  return createRecord<Record<string, unknown>>(TABLAS.pedidos, { Numero: numero, Estado: "pendiente", Total: 50_000, Fecha: new Date(AHORA).toISOString(), ...campos });
}
const usoDe = async (numero: string) => (await almacenUsosAirtable.delPedido(numero))[0];

/** Mercado Pago de mentira, solo lectura. */
function mpDe(pagos: Map<string, PagoMP>): LectorMercadoPago {
  const leer = (id: string) => {
    const p = pagos.get(id);
    if (!p) throw new Error(`pago ${id} desconocido`);
    return pagoDe(p);
  };
  return { pago: async (id) => leer(id), pagosDelPedido: async (pedidoId) => [...pagos.keys()].map(leer).filter((p) => p.pedidoId === pedidoId) };
}

async function lineas() {
  const productos = await getProductos();
  const p = (slug: string) => productos.find((x) => x.slug === slug)!;
  return (slug: string, n = 0, cantidad = 1): ItemCarrito => ({ productoSlug: slug, varianteId: p(slug).variantes[n].id, cantidad });
}

beforeEach(() => {
  reiniciar();
  reiniciarRedis();
  interceptar(null);
});

// ---------- Cuánto se puede usar ----------

test("Solo el crédito Disponible del mail cuenta; lo usado, en revisión y las reservas vigentes lo descuentan", async () => {
  const { deps } = armarUso();
  await ganado(MAIL, { Monto: 10_000 });
  await ganado(MAIL, { Monto: 5_000, Estado: "Pendiente" });
  await ganado(MAIL, { Monto: 3_000, Estado: "Anulado" });
  await ganado(MAIL, { Monto: 2_000, Estado: "A revisar" });
  await ganado("otra@ejemplo.com", { Monto: 99_999 });
  await uso(MAIL, "HARPER-U1", 1_000, "Usado");
  await uso(MAIL, "HARPER-U2", 500, "A revisar");
  await pedido("HARPER-U3");
  await uso(MAIL, "HARPER-U3", 700, "Reservado");
  await pedido("HARPER-U4", { Fecha: new Date(AHORA - 2 * VENTANA_RESERVA_MS).toISOString() });
  await uso(MAIL, "HARPER-U4", 300, "Reservado", new Date(AHORA - 2 * VENTANA_RESERVA_MS).toISOString());
  await uso(MAIL, "HARPER-U5", 400, "Liberado");
  await uso(MAIL, "HARPER-U6", 200, "Devuelto");

  const s = await leerSaldoDeCredito(MAIL, deps);
  assert.deepEqual([s.ganado, s.usado, s.reservado, s.usable, s.bloqueado], [10_000, 1_500, 700, 7_800, false]);
  assert.deepEqual(s.vencidas.map((u) => u.pedido), ["HARPER-U4"]);
  // Los usos no aparecen como créditos ganados (ni en Mi Cuenta ni en la liberación).
  assert.ok((await creditosPorEmail(MAIL)).every((c) => c.clave.startsWith("credito-harper:")));
  assert.deepEqual(await liberarDisponibles(dependenciasCredito()).catch((e) => e.name), "ErrorCerrojo");

  // Al tomar la cuenta, la reserva vencida queda Liberado.
  const abierta = await abrirCuentaDeCredito(MAIL, deps);
  assert.ok(!("estado" in abierta));
  if ("estado" in abierta) return;
  assert.equal(abierta.cuenta.saldo.usable, 7_800);
  await abierta.cerrar();
  assert.equal((await usoDe("HARPER-U4")).estado, "Liberado");
});

test("Reservas: vigentes mientras el link cobra o el pago está en revisión; libres si el pedido se canceló o venció", () => {
  const reserva = (generado: number): FilaUso => ({ id: "recU", clave: claveDelUso("H-1"), pedido: "H-1", email: MAIL, monto: 1, estado: "Reservado", generadoEl: new Date(generado).toISOString(), notas: "", rota: false });
  const ped = (estado: string, mpStatus = "", fecha = AHORA): PedidoDeUnUso => ({ id: "recP", numero: "H-1", estado, mpStatus, total: 1, pagoRegistrado: null, fecha });
  const viejo = AHORA - VENTANA_RESERVA_MS - 1;
  assert.equal(reservaVigente(reserva(AHORA), null, AHORA), true, "el pedido todavía se está creando");
  assert.equal(reservaVigente(reserva(viejo), null, AHORA), false, "nunca se creó");
  assert.equal(reservaVigente(reserva(AHORA), ped("pendiente"), AHORA), true);
  assert.equal(reservaVigente(reserva(AHORA), ped("rechazado"), AHORA), true, "puede reintentar con otra tarjeta mientras el link cobra");
  assert.equal(reservaVigente(reserva(viejo), ped("pendiente"), AHORA), false, "abandonado");
  assert.equal(reservaVigente(reserva(viejo), ped("rechazado"), AHORA), false);
  assert.equal(reservaVigente(reserva(viejo), ped("pendiente", "in_process"), AHORA), true, "pago en revisión: se puede aprobar después");
  assert.equal(reservaVigente(reserva(viejo), ped("pagado", "approved"), AHORA), true, "pagado: el webhook lo confirma");
  assert.equal(reservaVigente(reserva(AHORA), ped("cancelado"), AHORA), false);
  assert.equal(reservaVigente({ ...reserva(AHORA), estado: "Usado" }, ped("pagado"), AHORA), false, "lo usado se cuenta aparte");
});

test("Una fila de uso que no se entiende (editada a mano) bloquea la cuenta: no se usa crédito", async () => {
  const { deps } = armarUso();
  await ganado(MAIL, { Monto: 10_000 });
  await uso(MAIL, "HARPER-R1", 1_000, "Cualquiera");
  const s = await leerSaldoDeCredito(MAIL, deps);
  assert.equal(s.bloqueado, true);
  assert.equal(s.usable, 0);
});

// ---------- Concurrencia ----------

test("Dos compras a la vez con el mismo crédito: una lo reserva y la otra ve que ya no alcanza (nunca negativo)", async () => {
  const { deps } = armarUso();
  await ganado(MAIL, { Monto: 10_000 });
  const comprar = async (numero: string, monto: number) => {
    const abierta = await abrirCuentaDeCredito(MAIL, deps);
    if ("estado" in abierta) return "ocupado";
    try {
      await new Promise<void>((s) => setImmediate(s)); // la otra compra intenta en el medio
      await abierta.cuenta.reservar(numero, monto);
      return "reservado";
    } catch (error) {
      if (error instanceof CreditoInsuficiente) return "insuficiente";
      throw error;
    } finally {
      await abierta.cerrar();
    }
  };
  const r = await Promise.all([comprar("HARPER-C1", 8_000), comprar("HARPER-C2", 8_000)]);
  assert.deepEqual([...r].sort(), ["insuficiente", "reservado"]);
  const s = await leerSaldoDeCredito(MAIL, deps);
  assert.deepEqual([s.reservado, s.usable], [8_000, 2_000]);

  // Cinco a la vez, $ 3.000 cada una, con $ 2.000 libres: ninguna pasa; y con $ 10.000 más, pasan tres.
  await ganado(MAIL, { Monto: 10_000 });
  const cinco = await Promise.all([1, 2, 3, 4, 5].map((i) => comprar(`HARPER-C${10 + i}`, 3_000)));
  assert.equal(cinco.filter((x) => x === "reservado").length, 4, "12.000 libres: entran cuatro de 3.000");
  const fin = await leerSaldoDeCredito(MAIL, deps);
  assert.equal(fin.usable, 0);
  assert.equal(fin.reservado, 8_000 + 12_000);
  assert.equal(fin.sobregiro, 0);
});

test("Sin Redis no se usa crédito: no se lee ni se escribe nada", async () => {
  const { deps } = armarUso({ cerrojo: null });
  await ganado(MAIL, { Monto: 10_000 });
  await assert.rejects(abrirCuentaDeCredito(MAIL, deps), ErrorCerrojo);
  assert.deepEqual(await almacenUsosAirtable.delPedido("HARPER-X"), []);
});

test("Una reserva no puede pasar de lo usable ni repetirse para el mismo pedido", async () => {
  const { deps } = armarUso();
  await ganado(MAIL, { Monto: 10_000 });
  const abierta = await abrirCuentaDeCredito(MAIL, deps);
  if ("estado" in abierta) throw new Error("ocupado");
  try {
    await assert.rejects(abierta.cuenta.reservar("HARPER-M1", 10_001), CreditoInsuficiente);
    await assert.rejects(abierta.cuenta.reservar("HARPER-M1", 0), RangeError);
    await assert.rejects(abierta.cuenta.reservar("HARPER-M1", 1.5), RangeError);
    await abierta.cuenta.reservar("HARPER-M1", 4_000);
    await assert.rejects(abierta.cuenta.reservar("HARPER-M1", 1_000), RangeError);
  } finally {
    await abierta.cerrar();
  }
});

// ---------- En el carrito ----------

test("En el carrito: solo sobre anteojos, parcial o total; no paga estuches, paños ni envío; antes del 10 % de Mercado Pago", async () => {
  const linea = await lineas();
  const carrito = [linea("amatista"), linea("m500"), linea("pano-alta-densidad")];
  const sin = await resolverCarrito(carrito, { paraCobrar: true });
  const anteojo = sin.items.find((i) => i.categoria === "Anteojos")!;
  const resto = sin.items.filter((i) => i.categoria !== "Anteojos");

  // Parcial.
  const parcial = await resolverCarrito(carrito, { paraCobrar: true, creditoHarper: { usable: 50_000, pedido: 5_000 } });
  assert.deepEqual(parcial.creditoHarper, { usado: 5_000, usable: 50_000, elegible: anteojo.subtotal });
  assert.equal(parcial.subtotal, sin.subtotal - 5_000);
  assert.equal(parcial.envio, sin.envio, "el envío no cambia");
  assert.equal(parcial.items.find((i) => i.categoria === "Anteojos")!.credito, 5_000);
  for (const r of parcial.items.filter((i) => i.categoria !== "Anteojos")) {
    assert.equal(r.credito, undefined);
    assert.equal(r.subtotal, resto.find((x) => x.varianteId === r.varianteId)!.subtotal, "estuches y paños pagan entero");
  }
  // El 10 % por dinero en Mercado Pago corre sobre lo que queda después del crédito.
  assert.equal(parcial.dineroMP!.subtotal, aplicarDineroMP(parcial.items).subtotal);
  // Total (todo lo usable que entra): hasta lo que queda por pagar en anteojos.
  const total = await resolverCarrito(carrito, { paraCobrar: true, creditoHarper: { usable: 1_000_000, pedido: null } });
  assert.equal(total.creditoHarper!.usado, anteojo.subtotal);
  assert.equal(total.subtotal, sin.subtotal - anteojo.subtotal);
  // Pedir más de lo usable: lo usable.
  assert.equal((await resolverCarrito(carrito, { paraCobrar: true, creditoHarper: { usable: 3_000, pedido: 9_000 } })).creditoHarper!.usado, 3_000);
  // Sin pedirlo, el carrito es el de siempre (sin la clave creditoHarper).
  assert.equal("creditoHarper" in sin, false);

  // El crédito nuevo se calcula sobre lo pagado en anteojos, sin el crédito usado.
  const renglones = renglonesDeItems(itemsDelPedido(parcial.items));
  assert.equal(calcularCredito(renglones).base, anteojo.subtotal - 5_000);
  // Y la función sola: solo anteojos.
  const solo = aplicarCreditoHarper(resto, 10_000);
  assert.deepEqual([solo.credito, solo.elegible], [0, 0]);
});

test("Con el saldo de Suscriptores: primero el saldo de siempre (sin cambios) y el crédito después, sobre lo que queda en anteojos", async () => {
  const linea = await lineas();
  const carrito = [linea("amatista"), linea("m500")];
  const suscriptor: SuscriptorDelCarrito = { id: "recSUSCANA0000001", email: "ana@ejemplo.com", cuponDisponible: false, saldoDisponible: 20_000, saldoReservado: 0, activo: true };
  const soloSaldo = await resolverCarrito(carrito, { paraCobrar: true, suscriptor, usarSaldo: true });
  const conCredito = await resolverCarrito(carrito, { paraCobrar: true, suscriptor, usarSaldo: true, creditoHarper: { usable: 10_000, pedido: null } });
  assert.equal(conCredito.suscriptor!.saldoUsado, soloSaldo.suscriptor!.saldoUsado, "el saldo usado es el mismo");
  assert.equal(conCredito.subtotal, soloSaldo.subtotal - 10_000);
  const anteojo = conCredito.items.find((i) => i.categoria === "Anteojos")!;
  assert.equal(anteojo.credito, 10_000);
  assert.ok((anteojo.saldo ?? 0) > 0, "el saldo también cayó en el anteojo");
  assert.equal(conCredito.items.find((i) => i.categoria !== "Anteojos")!.credito, undefined);
});

test("Apagado: el carrito no ofrece crédito aunque se pida", async () => {
  const pedido = new Request("https://harper.ar/api/carrito/resolver", { method: "POST" });
  assert.equal(await creditoParaElCarrito(pedido, true), null);
});

// ---------- Con el pago real ----------

async function compraConCredito(monto: number, campos: Record<string, unknown> = {}) {
  const ctx = armarUso();
  await ganado(MAIL, { Monto: 10_000 });
  const numero = `HARPER-P${++secuencia}`;
  const abierta = await abrirCuentaDeCredito(MAIL, ctx.deps);
  if ("estado" in abierta) throw new Error("ocupado");
  await abierta.cuenta.reservar(numero, monto);
  await abierta.cerrar();
  const fila = await pedido(numero, { Total: 50_000, ...campos });
  const pagos = new Map<string, PagoMP>();
  const agregar = (p: Partial<PagoMP>) => {
    const id = String(900_000 + pagos.size + secuencia * 10);
    pagos.set(id, { id: Number(id), status: "approved", external_reference: fila.id, transaction_amount: 50_000, ...p } as PagoMP);
    return id;
  };
  const dp = { uso: ctx.deps, mp: mpDe(pagos) };
  return { ...ctx, numero, fila, pagos, agregar, dp };
}

test("Pago aprobado: la reserva queda «Usado» una sola vez, aunque el pago llegue repetido o haya dos pagos", async () => {
  const c = await compraConCredito(4_000);
  const pago = c.agregar({});
  await updateRecord(TABLAS.pedidos, c.fila.id, { Estado: "pagado", MP_payment_id: pago, MP_status: "approved" });
  const r1 = await procesarUsoDelPago(pago, c.dp);
  assert.equal(r1.accion, "confirmar");
  assert.equal(r1.accion === "confirmar" && r1.resultado.estado, "confirmado");
  const r2 = await procesarUsoDelPago(pago, c.dp);
  assert.equal(r2.accion === "confirmar" && r2.resultado.estado, "ya");
  // Un segundo pago aprobado del mismo pedido (el cliente pagó dos veces).
  const otro = c.agregar({});
  assert.equal((await procesarUsoDelPago(otro, c.dp)).accion === "confirmar", true);
  assert.equal((await usoDe(c.numero)).estado, "Usado");
  const s = await leerSaldoDeCredito(MAIL, c.deps);
  assert.deepEqual([s.usado, s.reservado, s.usable], [4_000, 0, 6_000]);
  assert.equal((await almacenUsosAirtable.delPedido(c.numero)).length, 1, "una sola fila de uso");
});

test("Pago rechazado o abandonado: la reserva sigue mientras el link cobra y después se libera sola", async () => {
  const c = await compraConCredito(4_000);
  const pago = c.agregar({ status: "rejected", status_detail: "cc_rejected_other_reason" });
  await updateRecord(TABLAS.pedidos, c.fila.id, { Estado: "rechazado", MP_status: "rejected" });
  assert.deepEqual(await procesarUsoDelPago(pago, c.dp), { accion: "nada", motivo: "sin-pago", numero: c.numero });
  assert.equal((await leerSaldoDeCredito(MAIL, c.deps)).usable, 6_000, "todavía puede reintentar con otra tarjeta");
  // Pasada la ventana del link, la próxima compra la encuentra vencida y la libera.
  c.reloj.t += VENTANA_RESERVA_MS + 1;
  const abierta = await abrirCuentaDeCredito(MAIL, c.deps);
  if ("estado" in abierta) throw new Error("ocupado");
  assert.equal(abierta.cuenta.saldo.usable, 10_000);
  await abierta.cerrar();
  assert.equal((await usoDe(c.numero)).estado, "Liberado");
});

test("Un pago en revisión mantiene la reserva aunque pase la ventana; un pedido cancelado la libera enseguida", async () => {
  const c = await compraConCredito(4_000);
  const pago = c.agregar({ status: "in_process" });
  await updateRecord(TABLAS.pedidos, c.fila.id, { MP_status: "in_process" });
  assert.equal((await procesarUsoDelPago(pago, c.dp)).accion, "nada");
  c.reloj.t += 3 * VENTANA_RESERVA_MS;
  assert.equal((await leerSaldoDeCredito(MAIL, c.deps)).usable, 6_000);
  await updateRecord(TABLAS.pedidos, c.fila.id, { Estado: "cancelado" });
  assert.equal((await leerSaldoDeCredito(MAIL, c.deps)).usable, 10_000);
});

test("Reembolso total o contracargo perdido: el uso queda «A revisar», sigue descontado y se avisa; nunca se devuelve solo", async () => {
  const c = await compraConCredito(4_000);
  const pago = c.agregar({});
  await updateRecord(TABLAS.pedidos, c.fila.id, { Estado: "pagado", MP_payment_id: pago, MP_status: "approved" });
  await procesarUsoDelPago(pago, c.dp);
  c.pagos.set(pago, { ...c.pagos.get(pago)!, status: "refunded", transaction_amount_refunded: 50_000 } as PagoMP);
  const r = await procesarUsoDelPago(pago, c.dp);
  assert.equal(r.accion, "revisar");
  assert.match(r.accion === "revisar" ? (r.alerta ?? "") : "", /quedó «A revisar» y sigue descontado/);
  assert.equal((await usoDe(c.numero)).estado, "A revisar");
  assert.equal((await leerSaldoDeCredito(MAIL, c.deps)).usable, 6_000, "no se devolvió solo");
  // El aviso se repite mientras siga «A revisar» (si un mail no salió, el reintento lo manda).
  const otra = await procesarUsoDelPago(pago, c.dp);
  assert.ok(otra.accion === "revisar" && otra.alerta);
});

test("Un pago cobrado no confirma el uso si el pedido no está confirmado, ni pisa lo que Harper ya decidió («A revisar», «Devuelto»)", async () => {
  // El pago está aprobado pero el pedido sigue «pendiente» (todavía no lo confirmó el webhook): no se toca.
  const c = await compraConCredito(4_000);
  const pago = c.agregar({});
  assert.deepEqual(await procesarUsoDelPago(pago, c.dp), { accion: "nada", motivo: "pedido-no-confirmado", numero: c.numero });
  assert.equal((await usoDe(c.numero)).estado, "Reservado");

  // Harper lo marcó «Devuelto» (o quedó «A revisar» por un reembolso): un segundo pago aprobado no lo vuelve a «Usado».
  await updateRecord(TABLAS.pedidos, c.fila.id, { Estado: "pagado", MP_payment_id: pago, MP_status: "approved" });
  for (const decidido of ["A revisar", "Devuelto"]) {
    await updateRecord(TABLAS.creditos, (await usoDe(c.numero)).id, { Estado: decidido });
    const r = await procesarUsoDelPago(c.agregar({}), c.dp);
    assert.equal(r.accion === "confirmar" && r.resultado.estado, "decidido");
    assert.equal((await usoDe(c.numero)).estado, decidido);
  }
});

test("Reembolso parcial: el uso no cambia y se avisa (la regla de la devolución parcial está pendiente)", async () => {
  const c = await compraConCredito(4_000);
  const pago = c.agregar({});
  await updateRecord(TABLAS.pedidos, c.fila.id, { Estado: "pagado", MP_payment_id: pago, MP_status: "approved" });
  await procesarUsoDelPago(pago, c.dp);
  c.pagos.set(pago, { ...c.pagos.get(pago)!, transaction_amount_refunded: 20_000 } as PagoMP);
  const r = await procesarUsoDelPago(pago, c.dp);
  assert.equal(r.accion, "parcial");
  assert.equal((await usoDe(c.numero)).estado, "Usado");
});

test("Un pago que llega después de liberar la reserva se anota igual y avisa el sobregiro", async () => {
  const c = await compraConCredito(8_000);
  // Vence sin pago y se libera; otra compra usa el crédito.
  c.reloj.t += VENTANA_RESERVA_MS + 1;
  const otra = await abrirCuentaDeCredito(MAIL, c.deps);
  if ("estado" in otra) throw new Error("ocupado");
  await otra.cuenta.reservar("HARPER-OTRA", 8_000);
  await otra.cuenta.confirmar("HARPER-OTRA");
  await otra.cerrar();
  // Llega el pago aprobado del primer pedido (empezado antes de vencer).
  const pago = c.agregar({});
  await updateRecord(TABLAS.pedidos, c.fila.id, { Estado: "pagado", MP_payment_id: pago, MP_status: "approved" });
  const r = await procesarUsoDelPago(pago, c.dp);
  assert.equal(r.accion === "confirmar" && r.resultado.estado, "confirmado");
  assert.match(r.accion === "confirmar" ? (r.alerta ?? "") : "", /\$ 6000 más usado que ganado/);
  assert.equal((await leerSaldoDeCredito(MAIL, c.deps)).usable, 0, "nunca negativo");
});

// ---------- El pedido en $ 0 ----------

const CLIENTE: DatosCliente = {
  email: MAIL,
  nombre: "Compradora",
  telefono: "1144445555",
  dni: "30111222",
  direccion: "Núñez 2422",
  ciudad: "CABA",
  provincia: "Ciudad Autónoma de Buenos Aires",
  cp: "1429",
  aceptaPromos: false,
};

test("Pedido en $ 0 pagado con crédito, sin suscripción: se confirma sin Mercado Pago; si algo falla, el crédito se libera", async () => {
  const { deps } = armarUso();
  await ganado(MAIL, { Monto: 200_000 });
  const linea = await lineas();
  const carrito = await resolverCarrito([linea("amatista")], { paraCobrar: true, creditoHarper: { usable: 200_000, pedido: null } });
  assert.equal(carrito.subtotal, 0);
  const sinPago = async (numero: string, fallar: boolean) => {
    const abierta = await abrirCuentaDeCredito(MAIL, deps);
    if ("estado" in abierta) throw new Error("ocupado");
    try {
      await abierta.cuenta.reservar(numero, carrito.creditoHarper!.usado);
      return await confirmarPedidoSinPago({
        suscriptor: null,
        credito: {
          monto: carrito.creditoHarper!.usado,
          confirmar: () => abierta.cuenta.confirmar(numero),
          liberar: () => abierta.cuenta.liberar(numero, "prueba", { tambienUsado: true }),
        },
        numero,
        cupon: 0,
        saldoUsado: 0,
        clienteId: "recFIXCLIENTE0001",
        crearPedido: () => createRecord(TABLAS.pedidos, { Numero: numero, Estado: "pendiente", Total: 0, Items: JSON.stringify(carrito.items) }),
        marcarPagado: async (id) => {
          if (fallar) throw new Error("Airtable caído");
          await updateRecord(TABLAS.pedidos, id, { Estado: "pagado" });
        },
        anularPedido: async (id) => {
          await updateRecord(TABLAS.pedidos, id, { Estado: "cancelado" });
        },
        datosMail: { numero, items: carrito.items, subtotal: 0, envio: 0, total: 0, cliente: CLIENTE, config: await getConfig(), sitio: "https://harper.ar" },
        cerrojo: cerrojoEnMemoria(),
      });
    } finally {
      await abierta.cerrar();
    }
  };
  assert.deepEqual(await sinPago("HARPER-Z1", false), { ok: true });
  assert.equal((await usoDe("HARPER-Z1")).estado, "Usado");
  const z1 = (await listRecords<{ Estado?: string }>(TABLAS.pedidos, { filterByFormula: "{Numero} = 'HARPER-Z1'" }))[0];
  assert.equal(z1.fields.Estado, "pagado");
  // Liberar sin `tambienUsado` (lo que hace el checkout con una reserva que no se pagó) no toca un uso confirmado.
  const otra = await abrirCuentaDeCredito(MAIL, deps);
  if ("estado" in otra) throw new Error("ocupado");
  await otra.cuenta.liberar("HARPER-Z1", "prueba");
  await otra.cerrar();
  assert.equal((await usoDe("HARPER-Z1")).estado, "Usado");

  await assert.rejects(sinPago("HARPER-Z2", true));
  assert.equal((await usoDe("HARPER-Z2")).estado, "Liberado", "falló: el crédito vuelve");
  const z2 = (await listRecords<{ Estado?: string }>(TABLAS.pedidos, { filterByFormula: "{Numero} = 'HARPER-Z2'" }))[0];
  assert.equal(z2.fields.Estado, "cancelado");
  assert.equal((await leerSaldoDeCredito(MAIL, deps)).usable, 200_000 - carrito.creditoHarper!.usado);
});

// ---------- El webhook ----------

test("Webhook: el pago aprobado confirma el uso y el crédito nuevo sale de lo pagado en anteojos, sin el crédito usado", async () => {
  const ctx = armarUso();
  await ganado(MAIL, { Monto: 20_000 });
  const linea = await lineas();
  const carrito = await resolverCarrito([linea("amatista"), linea("cuarzo")], { paraCobrar: true, creditoHarper: { usable: 20_000, pedido: null } });
  const numero = "HARPER-W1";
  const abierta = await abrirCuentaDeCredito(MAIL, ctx.deps);
  if ("estado" in abierta) throw new Error("ocupado");
  await abierta.cuenta.reservar(numero, carrito.creditoHarper!.usado);
  await abierta.cerrar();
  const cliente = await createRecord<{ Email?: string }>(TABLAS.clientes, { Email: MAIL });
  const fila = await createRecord<FilaPedido>(TABLAS.pedidos, {
    Numero: numero,
    Estado: "pendiente",
    Cliente: [cliente.id],
    Items: itemsDelPedido(carrito.items),
    Subtotal: carrito.subtotal,
    Envio: carrito.envio,
    Total: carrito.total,
    Notas: MARCA_REGIMEN_NUEVO,
  });
  const pagos = new Map<string, PagoMP>();
  const pagoId = "950001";
  pagos.set(pagoId, { id: 950001, status: "approved", external_reference: fila.id, transaction_amount: carrito.total, payer: { email: MAIL } } as PagoMP);
  const mp = mpDe(pagos);
  const real = dependenciasCredito();
  let n = 0;
  const credito: DependenciasPagoCredito = {
    credito: { ...real, cerrojo: cerrojoEnMemoria(), ahora: () => new Date(AHORA), nonce: () => `n-${++n}` },
    mp,
    pedidos: lectorPedidosAirtable,
    uso: ctx.deps,
  };
  const r = reloj();
  const deps: Dependencias = {
    obtenerPago: async (id) => pagos.get(id)!,
    lectorPagos: mp,
    cerrojo: cerrojoEnMemoria({ ahora: () => r.t }),
    enviarMail: async () => true,
    mailsConfigurados: () => true,
    reloj: r,
    esperaReclamoMs: 50,
    esperaOcupadoMs: 30_000,
    sitio: "https://harper.ar",
    credito,
  };
  const res = await procesarNotificacion(pagoId, deps);
  assert.equal(res.status, 200);
  assert.deepEqual(res.cuerpo.credito, { accion: "registrar", estado: "creado" });
  assert.deepEqual(res.cuerpo.creditoUsado, { accion: "confirmar", estado: "confirmado" });
  assert.equal((await usoDe(numero)).estado, "Usado");
  const nuevo = (await creditosPorEmail(MAIL)).find((c) => c.pedido === numero)!;
  const pagadoEnAnteojos = carrito.items.filter((i) => i.categoria === "Anteojos").reduce((t, i) => t + i.subtotal, 0);
  assert.equal(nuevo.base, pagadoEnAnteojos, "sin el crédito usado");
  assert.equal(nuevo.monto, Math.round(pagadoEnAnteojos * 0.1));
  // Un aviso repetido no confirma dos veces.
  const otra = await procesarNotificacion(pagoId, deps);
  assert.deepEqual(otra.cuerpo.creditoUsado, { accion: "confirmar", estado: "ya" });
  assert.equal((await getRecord<CamposCredito>(TABLAS.creditos, (await usoDe(numero)).id)).fields.Estado, "Usado");
});

// ---------- Protecciones ----------

test("El checkout usa el crédito solo con el interruptor y la cuenta verificada, y lo reserva antes de crear el pedido", () => {
  const raiz = path.resolve(__dirname, "..", "..");
  const ruta = fs.readFileSync(path.join(raiz, "app", "api", "checkout", "route.ts"), "utf8");
  assert.match(ruta, /if \(pidioCredito && cuentaConCredito\(\)\) \{/);
  assert.match(ruta, /const visita = await visitaDeLaPeticion\(request\);/);
  assert.match(ruta, /if \(cliente\.email\.trim\(\)\.toLowerCase\(\) !== visita\.email\)/);
  const reserva = ruta.indexOf("await cuentaCredito.reservar(numero, creditoUsado);");
  const crear = ruta.indexOf("const pedido = await crearPedido(campos");
  assert.ok(reserva > 0 && crear > reserva, "la reserva va antes de crear el pedido");
  assert.match(ruta, /\|\| reservaCredito \? \{ venceEnMinutos: MINUTOS_RESERVA \}/);
  assert.match(ruta, /await cuentaCredito\.liberar\(reservaCredito, "no se pudo iniciar el pago"\)/);
  // Solo el pedido en $ 0 (sin pago de Mercado Pago) deshace un uso ya confirmado.
  assert.equal((ruta.match(/tambienUsado: true/g) ?? []).length, 2);
  // Los usos no se leen como créditos ganados.
  const fila = filaDelRegistro({ id: "recX", createdTime: new Date(AHORA).toISOString(), fields: { Clave: claveDelUso("H-1"), Pedido: "H-1", Monto: 1, Porcentaje: 0, Base: 0, Anteojos: 0, Estado: "Usado" } });
  assert.equal(fila.estado, "A revisar", "si alguna vez se leyera como crédito, no se podría usar");
});
