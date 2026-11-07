import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

// Crédito Harper, paso 6: el recorrido completo, de punta a punta, con las
// piezas reales encadenadas (carrito, sesión de la cuenta, reserva, webhook
// de Mercado Pago, ruta diaria, arrepentimiento, pedido en $ 0).
//
// Entorno aislado: el Airtable y el Redis son los de prueba (en memoria) y
// Mercado Pago es uno de mentira, solo lectura. Los interruptores se prenden
// SOLO en este proceso de prueba (node --test corre cada archivo aparte): en
// producción siguen apagados. No hay compras, pagos, mails ni clientes reales.
//
// Lo que no se puede ejecutar acá (las rutas de app/, que el compilador de
// las pruebas no incluye) se reemplaza por las mismas funciones de lib/ que
// esas rutas llaman, en el mismo orden.
process.env.HARPER_FIXTURES = "1";
process.env.HARPER_CREDITO_ACTIVO = "1";
process.env.HARPER_DUO_ACTIVO = "1";
process.env.MP_WEBHOOK_SECRET = "secreto-de-prueba-del-paso-6";
delete process.env.VERCEL;
for (const v of ["KV_REST_API_URL", "KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "MP_ACCESS_TOKEN", "RESEND_API_KEY"]) delete process.env[v];

import { createRecord, getRecord, listRecords, TABLAS, updateRecord } from "../lib/airtable";
import { normalizarSolicitud } from "../lib/arrepentimiento";
import { registrarArrepentimiento } from "../lib/arrepentimiento-servidor";
import { getProductos } from "../lib/catalogo";
import type { Cerrojo } from "../lib/cerrojo";
import { getConfig } from "../lib/config";
import { almacenAirtable, dependenciasCredito, type CamposCredito } from "../lib/credito-airtable";
import { billeteraDeLaCuenta, creditoParaElCarrito } from "../lib/credito-cuenta";
import { lectorPedidosPorNumeroAirtable, procesarCreditosDelDia, type DependenciasDiario } from "../lib/credito-diario";
import { dependenciasIncidenciaReales, incidenciaPorArrepentimiento, type DependenciasIncidencia } from "../lib/credito-incidencias";
import { lectorPedidosAirtable, notasConRegimen, pagoDe, type DependenciasPagoCredito, type LectorMercadoPago } from "../lib/credito-pagos";
import type { DependenciasCredito } from "../lib/credito-persistencia";
import {
  abrirCuentaDeCredito,
  almacenUsosAirtable,
  CreditoInsuficiente,
  leerSaldoDeCredito,
  lectorPedidosDeUsosAirtable,
  notaDeUso,
  VENTANA_RESERVA_MS,
  type DependenciasUso,
} from "../lib/credito-uso";
import { cerrojoEnMemoria, reiniciarRedis } from "../lib/fixtures/redis";
import { interceptar, reiniciar, RespuestaFixture } from "../lib/fixtures/servidor";
import type { PagoMP } from "../lib/mercadopago";
import { itemsDelPedido, notasDelPedido, resolverCarrito } from "../lib/pedidos";
import { fechaArgentina, sumarDias } from "../lib/suscriptores";
import { COOKIE_CUENTA, claveDeSesionCuenta, crearSesionCuenta } from "../lib/suscriptores-sesion";
import { confirmarPedidoSinPago } from "../lib/suscriptores-sin-pago";
import type { DatosCliente, ItemCarrito } from "../lib/tipos";
import { procesarNotificacion, type Dependencias } from "../lib/webhook-proceso";

const MAIL = "compradora@ejemplo.com";
type Mail = { para: string; asunto: string; texto: string };

/** 10:00 de ese día en Buenos Aires. */
const alas10 = (dia: string) => new Date(`${dia}T13:00:00.000Z`).getTime();

/**
 * La tienda de prueba: un reloj, un Mercado Pago de mentira (solo lectura),
 * el cerrojo en memoria y las dependencias de verdad de cada pieza.
 */
function tienda(o: { cerrojoCredito?: Cerrojo | null } = {}) {
  const reloj = {
    t: Date.now(),
    ahora: () => reloj.t,
    dormir: async (ms: number) => {
      reloj.t += ms;
      await new Promise<void>((listo) => setImmediate(listo));
    },
  };
  const pagos = new Map<string, PagoMP>();
  const mails: Mail[] = [];
  const leer = (id: string) => {
    const p = pagos.get(id);
    if (!p) throw new Error(`pago ${id} desconocido`);
    return pagoDe(p);
  };
  const mp: LectorMercadoPago = { pago: async (id) => leer(id), pagosDelPedido: async (pedidoId) => [...pagos.keys()].map(leer).filter((p) => p.pedidoId === pedidoId) };
  const cerrojo = o.cerrojoCredito === undefined ? cerrojoEnMemoria({ ahora: () => reloj.t }) : o.cerrojoCredito;
  let n = 0;
  const credito: DependenciasCredito = { ...dependenciasCredito(), cerrojo, ahora: () => new Date(reloj.t), nonce: () => `n-${++n}` };
  const uso: DependenciasUso = { almacen: almacenUsosAirtable, pedidos: lectorPedidosDeUsosAirtable, cerrojo, reloj, esperaOcupadoMs: 5_000 };
  const pagoCredito: DependenciasPagoCredito = { credito, mp, pedidos: lectorPedidosAirtable, uso };
  const webhook: Dependencias = {
    obtenerPago: async (id) => pagos.get(id)!,
    lectorPagos: mp,
    cerrojo: cerrojoEnMemoria({ ahora: () => reloj.t }),
    enviarMail: async (m) => {
      mails.push({ para: m.para, asunto: m.asunto, texto: m.texto });
      return true;
    },
    mailsConfigurados: () => true,
    reloj,
    esperaReclamoMs: 50,
    esperaOcupadoMs: 30_000,
    sitio: "https://harper.ar",
    credito: pagoCredito,
  };
  const diario: DependenciasDiario = { credito, mp, pedidos: lectorPedidosPorNumeroAirtable };
  const incidencias: DependenciasIncidencia = { ...dependenciasIncidenciaReales(), credito, uso, esperar: () => new Promise<void>((listo) => setTimeout(listo, 5)) };
  return { reloj, pagos, mails, mp, credito, uso, webhook, diario, incidencias };
}
type Tienda = ReturnType<typeof tienda>;

let secuencia = 0;
let idPago = 700_000;
const clientes = new Map<string, string>();

async function lineas() {
  const productos = await getProductos();
  const p = (slug: string) => productos.find((x) => x.slug === slug)!;
  return (slug: string, n = 0, cantidad = 1): ItemCarrito => ({ productoSlug: slug, varianteId: p(slug).variantes[n].id, cantidad });
}

/** La cookie de la cuenta verificada (la que da /api/cuenta/entrar con el código). */
const peticionCon = (email: string) =>
  new Request("https://harper.ar/api/checkout", { method: "POST", headers: { cookie: `${COOKIE_CUENTA}=${crearSesionCuenta(claveDeSesionCuenta()!, email)}` } });

/**
 * Lo que hace el checkout (app/api/checkout/route.ts), con las mismas
 * funciones: el crédito que ofrece el carrito a la cuenta verificada, el
 * carrito del servidor, la reserva con la cuenta tomada ANTES de crear el
 * pedido y el pedido en «pendiente» con la marca del régimen nuevo.
 */
async function comprar(t: Tienda, items: ItemCarrito[], o: { email?: string; conCredito?: boolean } = {}) {
  const email = o.email ?? MAIL;
  const creditoHarper = o.conCredito ? await creditoParaElCarrito(peticionCon(email), true) : null;
  const carrito = await resolverCarrito(items, { paraCobrar: true, ...(creditoHarper ? { creditoHarper } : {}) });
  const numero = `HARPER-R${++secuencia}`;
  const usado = carrito.creditoHarper?.usado ?? 0;
  const abierta = usado > 0 ? await abrirCuentaDeCredito(email, t.uso) : null;
  if (abierta && "estado" in abierta) throw new Error("la cuenta está ocupada");
  try {
    if (abierta) await abierta.cuenta.reservar(numero, usado);
    if (!clientes.has(email)) clientes.set(email, (await createRecord<{ Email?: string }>(TABLAS.clientes, { Email: email })).id);
    const notas = [usado > 0 ? notaDeUso(usado, email) : null, notasConRegimen(notasDelPedido(null, carrito.items))].filter(Boolean).join("\n\n");
    const pedido = await createRecord<Record<string, unknown>>(TABLAS.pedidos, {
      Numero: numero,
      Estado: "pendiente",
      Cliente: [clientes.get(email)!],
      Items: itemsDelPedido(carrito.items),
      Subtotal: carrito.subtotal,
      Envio: carrito.envio,
      Total: carrito.total,
      Notas: notas,
    });
    return { numero, pedido, carrito, usado, cuenta: abierta?.cuenta ?? null, hoy: fechaArgentina(new Date(pedido.createdTime)) };
  } finally {
    if (abierta) await abierta.cerrar();
  }
}
type Compra = Awaited<ReturnType<typeof comprar>>;

/** Mercado Pago avisa un pago (aprobado, rechazado...): pasa por el webhook de verdad. */
async function pagar(t: Tienda, c: Compra, extra: Partial<PagoMP> = {}) {
  const id = String(++idPago);
  t.pagos.set(id, { id: Number(id), status: "approved", external_reference: c.pedido.id, transaction_amount: c.carrito.total, payer: { email: MAIL }, ...extra } as PagoMP);
  return { id, r: await procesarNotificacion(id, t.webhook) };
}
const avisar = (t: Tienda, id: string, deps: Dependencias = t.webhook) => procesarNotificacion(id, deps);

/** Harper marca «entregado» y la automatización de Airtable anota Fecha_entrega. */
const entregar = (c: Compra, dia = c.hoy) => updateRecord(TABLAS.pedidos, c.pedido.id, { Estado: "entregado", Fecha_entrega: dia });
/** La ruta diaria de ese día (/api/credito/diario, sin cron). */
async function diaDeControl(t: Tienda, dia: string) {
  t.reloj.t = alas10(dia);
  return procesarCreditosDelDia(t.diario);
}

const ganadoDe = async (numero: string) => (await almacenAirtable.delPedido(numero))[0] ?? null;
const usoDe = async (numero: string) => (await almacenUsosAirtable.delPedido(numero))[0] ?? null;
const estadoDe = async (c: Compra) => (await getRecord<{ Estado?: string }>(TABLAS.pedidos, c.pedido.id)).fields.Estado;
const stockDe = async (varianteId: string) => (await getRecord<{ Stock?: number }>(TABLAS.variantes, varianteId)).fields.Stock ?? 0;
const pagadoEnAnteojos = (c: Compra) => c.carrito.items.filter((i) => i.categoria === "Anteojos").reduce((s, i) => s + i.subtotal, 0);

/** El crédito de una compra ya liberado: compra, pago, entrega y 30 días, todo por el camino real. */
async function creditoDisponible(t: Tienda, items: ItemCarrito[]) {
  const c = await comprar(t, items);
  await pagar(t, c);
  await entregar(c);
  await diaDeControl(t, sumarDias(c.hoy, 30));
  const fila = await ganadoDe(c.numero);
  assert.equal(fila?.estado, "Disponible");
  return { c, monto: fila!.monto };
}

beforeEach(() => {
  reiniciar();
  reiniciarRedis();
  interceptar(null);
  clientes.clear();
});

// ---------- 1. El recorrido feliz ----------

test("Recorrido completo: compra con Dúo → pago → pendiente → entrega → 30 días → disponible → compra con crédito → reserva → pago → usado", async () => {
  const t = tienda();
  const linea = await lineas();

  // 1. Compra con el Dúo: dos anteojos y un estuche.
  const a = await comprar(t, [linea("amatista"), linea("cuarzo"), linea("m500")]);
  assert.ok(a.carrito.duo, "el Dúo se aplicó");
  const stockAntes = await stockDe(a.carrito.items[0].varianteId);

  // 2. Pago aprobado: el webhook confirma el pedido y anota el crédito PENDIENTE.
  const pagoA = await pagar(t, a);
  assert.equal(pagoA.r.status, 200);
  assert.deepEqual(pagoA.r.cuerpo.credito, { accion: "registrar", estado: "creado" });
  assert.equal(await estadoDe(a), "pagado");
  assert.equal(await stockDe(a.carrito.items[0].varianteId), stockAntes - 1);
  const pendiente = (await ganadoDe(a.numero))!;
  assert.equal(pendiente.estado, "Pendiente");
  assert.equal(pendiente.base, pagadoEnAnteojos(a), "sobre lo pagado en anteojos, con el Dúo y sin el estuche");
  assert.equal(pendiente.monto, Math.round(pagadoEnAnteojos(a) * 0.1), "10 % con dos anteojos");
  assert.equal((await creditoParaElCarrito(peticionCon(MAIL), true)), null, "pendiente: el carrito no ofrece nada");

  // 3. Entrega confirmada y la ruta diaria: a los 10 días anota la entrega y espera.
  await entregar(a);
  const dia10 = await diaDeControl(t, sumarDias(a.hoy, 10));
  assert.deepEqual(dia10.liberados, []);
  assert.deepEqual(dia10.fechasAnotadas.map((f) => [f.pedido, f.disponibleDesde]), [[a.numero, sumarDias(a.hoy, 30)]]);
  assert.equal((await ganadoDe(a.numero))!.estado, "Pendiente");
  // Un día antes, todavía no.
  assert.deepEqual((await diaDeControl(t, sumarDias(a.hoy, 29))).liberados, []);

  // 4. A los 30 días de la entrega: disponible, y la billetera lo muestra.
  const dia30 = await diaDeControl(t, sumarDias(a.hoy, 30));
  assert.deepEqual(dia30.liberados, [{ pedido: a.numero, monto: pendiente.monto, fechaEntrega: a.hoy }]);
  assert.equal((await ganadoDe(a.numero))!.estado, "Disponible");
  const billetera = await billeteraDeLaCuenta({ tipo: "comprador", email: MAIL }, { hoy: new Date(t.reloj.t) });
  assert.equal(billetera.disponible, pendiente.monto);

  // 5. Compra nueva con el crédito: solo sobre el anteojo, nunca el paño.
  const b = await comprar(t, [linea("obsidiana"), linea("pano-alta-densidad")], { conCredito: true });
  assert.equal(b.usado, pendiente.monto, "lo usa entero");
  const anteojoB = b.carrito.items.find((i) => i.categoria === "Anteojos")!;
  assert.equal(anteojoB.credito, pendiente.monto);
  for (const i of b.carrito.items.filter((x) => x.categoria !== "Anteojos")) assert.equal(i.credito ?? 0, 0);
  assert.equal((await usoDe(b.numero))!.estado, "Reservado");
  assert.equal((await leerSaldoDeCredito(MAIL, t.uso)).usable, 0, "reservado mientras paga");

  // 6. Pago aprobado de la compra B: el uso queda «Usado» y el crédito nuevo sale de lo pagado.
  const pagoB = await pagar(t, b);
  assert.equal(pagoB.r.status, 200);
  assert.deepEqual(pagoB.r.cuerpo.creditoUsado, { accion: "confirmar", estado: "confirmado" });
  assert.equal((await usoDe(b.numero))!.estado, "Usado");
  const nuevo = (await ganadoDe(b.numero))!;
  assert.equal(nuevo.estado, "Pendiente");
  assert.equal(nuevo.base, pagadoEnAnteojos(b), "sin el crédito usado");
  assert.equal(nuevo.monto, Math.round(pagadoEnAnteojos(b) * 0.05), "5 % con un anteojo");
  const saldo = await leerSaldoDeCredito(MAIL, t.uso);
  assert.deepEqual([saldo.ganado, saldo.usado, saldo.reservado, saldo.usable, saldo.sobregiro], [pendiente.monto, pendiente.monto, 0, 0, 0]);
});

// ---------- 2. Pagos repetidos ----------

test("Avisos repetidos y un segundo pago del mismo pedido, en cada tramo: un crédito, un uso y el stock una sola vez", async () => {
  const t = tienda();
  const linea = await lineas();
  const a = await comprar(t, [linea("amatista"), linea("cuarzo")]);
  const pagoA = await pagar(t, a);
  const stock = await stockDe(a.carrito.items[0].varianteId);
  for (let i = 0; i < 3; i++) assert.deepEqual((await avisar(t, pagoA.id)).cuerpo.credito, { accion: "registrar", estado: "ya" });
  // El cliente pagó dos veces el mismo pedido.
  await pagar(t, a);
  assert.equal((await almacenAirtable.delPedido(a.numero)).length, 1);
  assert.equal(await stockDe(a.carrito.items[0].varianteId), stock, "el stock no se descuenta dos veces");

  await entregar(a);
  await diaDeControl(t, sumarDias(a.hoy, 30));
  await diaDeControl(t, sumarDias(a.hoy, 31));
  assert.equal((await ganadoDe(a.numero))!.estado, "Disponible");

  const b = await comprar(t, [linea("obsidiana")], { conCredito: true });
  const pagoB = await pagar(t, b);
  for (let i = 0; i < 3; i++) assert.deepEqual((await avisar(t, pagoB.id)).cuerpo.creditoUsado, { accion: "confirmar", estado: "ya" });
  await pagar(t, b);
  assert.equal((await almacenUsosAirtable.delPedido(b.numero)).length, 1);
  assert.equal((await usoDe(b.numero))!.estado, "Usado");
  assert.equal((await almacenAirtable.delPedido(b.numero)).length, 1);
  const s = await leerSaldoDeCredito(MAIL, t.uso);
  assert.equal(s.usado, b.usado, "descontado una sola vez");
  assert.equal(s.sobregiro, 0);
});

// ---------- 3. Compra de $ 0 ----------

test("Compra de $ 0 pagada entera con el crédito: sin Mercado Pago, «Usado», stock descontado y sin crédito nuevo; si la confirmación falla, nada queda usado", async () => {
  const t = tienda();
  const linea = await lineas();
  // Un crédito ganado por el camino real, y otro más grande para cubrir un anteojo entero.
  await creditoDisponible(t, [linea("amatista"), linea("cuarzo")]);
  await createRecord<CamposCredito>(TABLAS.creditos, {
    Clave: "credito-harper:HARPER-VIEJO",
    Pedido: "HARPER-VIEJO",
    Email: MAIL,
    Monto: 200_000,
    Porcentaje: 10,
    Base: 2_000_000,
    Anteojos: 2,
    Estado: "Disponible",
    Generado_el: "2026-01-01T12:00:00.000Z",
    Reglas: "credito-harper-v1",
    Notas: "",
  });
  const config = await getConfig();
  const cliente: DatosCliente = { nombre: "Ana Pérez", email: MAIL, telefono: "1155555555", dni: "30111222", direccion: "Núñez 2422", ciudad: "CABA", provincia: "Ciudad Autónoma de Buenos Aires", cp: "1429", aceptaPromos: false };

  /** El camino de $ 0 del checkout: confirmarPedidoSinPago con la cuenta todavía tomada. */
  async function sinPago(fallar: boolean) {
    const creditoHarper = await creditoParaElCarrito(peticionCon(MAIL), true);
    const carrito = await resolverCarrito([linea("obsidiana")], { paraCobrar: true, creditoHarper });
    assert.equal(carrito.total, 0);
    const numero = `HARPER-Z${++secuencia}`;
    const abierta = await abrirCuentaDeCredito(MAIL, t.uso);
    if ("estado" in abierta) throw new Error("ocupado");
    try {
      await abierta.cuenta.reservar(numero, carrito.creditoHarper!.usado);
      const resultado = await confirmarPedidoSinPago({
        suscriptor: null,
        credito: {
          monto: carrito.creditoHarper!.usado,
          confirmar: () => (fallar ? Promise.resolve({ estado: "sin-uso" }) : abierta.cuenta.confirmar(numero)),
          liberar: () => abierta.cuenta.liberar(numero, "prueba", { tambienUsado: true }),
        },
        numero,
        cupon: 0,
        saldoUsado: 0,
        clienteId: clientes.get(MAIL)!,
        crearPedido: () => createRecord(TABLAS.pedidos, { Numero: numero, Estado: "pendiente", Total: 0, Items: itemsDelPedido(carrito.items), Notas: notasConRegimen(null) }),
        marcarPagado: async (id) => {
          await updateRecord(TABLAS.pedidos, id, { Estado: "pagado" });
        },
        anularPedido: async (id) => {
          await updateRecord(TABLAS.pedidos, id, { Estado: "cancelado" });
        },
        datosMail: { numero, items: carrito.items, subtotal: 0, envio: 0, total: 0, cliente, config, sitio: "https://harper.ar" },
        cerrojo: cerrojoEnMemoria(),
        enviarMail: async (m) => {
          t.mails.push({ para: m.para, asunto: m.asunto, texto: m.texto });
          return true;
        },
      });
      return { numero, resultado, carrito };
    } finally {
      await abierta.cerrar();
    }
  }

  const antes = await leerSaldoDeCredito(MAIL, t.uso);
  const stock = await stockDe((await resolverCarrito([linea("obsidiana")], { paraCobrar: true })).items[0].varianteId);
  const ok = await sinPago(false);
  assert.deepEqual(ok.resultado, { ok: true });
  const pedidoOk = (await listRecords<{ Estado?: string }>(TABLAS.pedidos, { filterByFormula: `{Numero} = '${ok.numero}'` }))[0];
  assert.equal(pedidoOk.fields.Estado, "pagado");
  assert.equal((await usoDe(ok.numero))!.estado, "Usado");
  assert.equal(await stockDe(ok.carrito.items[0].varianteId), stock - 1);
  assert.equal(await ganadoDe(ok.numero), null, "lo pagado en dinero es $ 0: no hay crédito nuevo");
  assert.equal((await leerSaldoDeCredito(MAIL, t.uso)).usable, antes.usable - ok.carrito.creditoHarper!.usado);

  // Si la confirmación no da lo reservado: ni pagado, ni stock, ni crédito usado; se avisa.
  const usableAntes = (await leerSaldoDeCredito(MAIL, t.uso)).usable;
  const mal = await sinPago(true);
  assert.equal(mal.resultado.ok, false);
  const pedidoMal = (await listRecords<{ Estado?: string }>(TABLAS.pedidos, { filterByFormula: `{Numero} = '${mal.numero}'` }))[0];
  assert.equal(pedidoMal.fields.Estado, "cancelado");
  assert.equal((await usoDe(mal.numero))!.estado, "Liberado");
  assert.equal(await stockDe(mal.carrito.items[0].varianteId), stock - 1, "no se descontó otra vez");
  assert.equal((await leerSaldoDeCredito(MAIL, t.uso)).usable, usableAntes);
  assert.ok(t.mails.some((m) => m.asunto === `REVISAR Crédito Harper — pedido ${mal.numero} en $ 0 sin confirmar`));
});

// ---------- 4. Concurrencia ----------

test("Dos compras a la vez con el mismo crédito, por el carrito y el checkout de verdad: una lo usa y la otra no; nunca negativo", async () => {
  const t = tienda();
  const linea = await lineas();
  const { monto } = await creditoDisponible(t, [linea("amatista"), linea("cuarzo")]);
  const resultados = await Promise.allSettled([
    comprar(t, [linea("obsidiana")], { conCredito: true }),
    comprar(t, [linea("amatista")], { conCredito: true }),
    comprar(t, [linea("cuarzo")], { conCredito: true }),
  ]);
  const hechas = resultados.filter((r): r is PromiseFulfilledResult<Compra> => r.status === "fulfilled");
  const rechazadas = resultados.filter((r): r is PromiseRejectedResult => r.status === "rejected");
  assert.equal(hechas.length, 1, "una sola reserva");
  assert.equal(rechazadas.length, 2);
  for (const r of rechazadas) assert.ok(r.reason instanceof CreditoInsuficiente, String(r.reason));
  assert.equal(hechas[0].value.usado, monto);
  const s = await leerSaldoDeCredito(MAIL, t.uso);
  assert.deepEqual([s.reservado, s.usable, s.sobregiro], [monto, 0, 0]);
  // La que reservó paga; las otras dos no dejaron ningún uso.
  await pagar(t, hechas[0].value);
  assert.equal((await leerSaldoDeCredito(MAIL, t.uso)).usado, monto);
  assert.equal((await listRecords<CamposCredito>(TABLAS.creditos, { revalidate: 0 })).filter((r) => (r.fields.Clave ?? "").startsWith("uso-credito-harper:")).length, 1);
});

// ---------- 5. Rechazado y abandonado ----------

test("Pago rechazado y compra abandonada: la reserva sigue mientras el link cobra, después se libera sola y el crédito se vuelve a usar", async () => {
  const t = tienda();
  const linea = await lineas();
  const { monto } = await creditoDisponible(t, [linea("amatista"), linea("cuarzo")]);
  const b = await comprar(t, [linea("obsidiana")], { conCredito: true });
  const rechazo = await pagar(t, b, { status: "rejected", status_detail: "cc_rejected_other_reason" });
  assert.equal(rechazo.r.status, 200);
  assert.equal(await estadoDe(b), "rechazado");
  assert.equal(await ganadoDe(b.numero), null, "sin pago no hay crédito nuevo");
  assert.equal((await usoDe(b.numero))!.estado, "Reservado");
  assert.equal((await leerSaldoDeCredito(MAIL, t.uso)).usable, 0, "puede reintentar con otra tarjeta");

  // Abandonó: pasada la ventana del link, la próxima compra la encuentra vencida y la libera.
  t.reloj.t += VENTANA_RESERVA_MS + 60_000;
  const abierta = await abrirCuentaDeCredito(MAIL, t.uso);
  if ("estado" in abierta) throw new Error("ocupado");
  assert.equal(abierta.cuenta.saldo.usable, monto);
  await abierta.cerrar();
  assert.equal((await usoDe(b.numero))!.estado, "Liberado");
  const c = await comprar(t, [linea("cuarzo")], { conCredito: true });
  assert.equal(c.usado, monto);
  await pagar(t, c);
  assert.equal((await usoDe(c.numero))!.estado, "Usado");
});

// ---------- 6. Reembolsos ----------

test("Reembolsos: la compra con crédito se reembolsa (su crédito se anula, el uso queda «A revisar» y se avisa); la primera, con el crédito ya gastado (no se recupera solo, nunca negativo)", async () => {
  const t = tienda();
  const linea = await lineas();
  const { c: a, monto } = await creditoDisponible(t, [linea("amatista"), linea("cuarzo")]);
  const b = await comprar(t, [linea("obsidiana")], { conCredito: true });
  const pagoB = await pagar(t, b);
  assert.equal((await usoDe(b.numero))!.estado, "Usado");

  // Reembolso total de B.
  t.pagos.set(pagoB.id, { ...t.pagos.get(pagoB.id)!, status: "refunded", transaction_amount_refunded: b.carrito.total } as PagoMP);
  const reembolsoB = await avisar(t, pagoB.id);
  assert.equal(reembolsoB.status, 200);
  assert.deepEqual(reembolsoB.cuerpo.credito, { accion: "anular", estado: "anulado" });
  assert.equal((await ganadoDe(b.numero))!.estado, "Anulado", "el crédito de B no nace");
  assert.equal((await usoDe(b.numero))!.estado, "A revisar", "el crédito usado no vuelve solo (regla pendiente)");
  assert.ok(t.mails.some((m) => m.asunto === `REVISAR Crédito Harper usado — pedido ${b.numero}`));
  assert.equal((await leerSaldoDeCredito(MAIL, t.uso)).usable, 0);

  // Reembolso total de A, cuyo crédito ya se gastó en B.
  const pagoA = [...t.pagos.entries()].find(([, p]) => p.external_reference === a.pedido.id)![0];
  t.pagos.set(pagoA, { ...t.pagos.get(pagoA)!, status: "refunded", transaction_amount_refunded: a.carrito.total } as PagoMP);
  const reembolsoA = await avisar(t, pagoA);
  assert.deepEqual(reembolsoA.cuerpo.credito, { accion: "anular", estado: "a-revisar" }, "ya disponible: «A revisar», no se anula solo");
  const s = await leerSaldoDeCredito(MAIL, t.uso);
  assert.deepEqual([s.ganado, s.usado, s.usable, s.sobregiro], [0, monto, 0, monto], "nunca negativo; el gastado no se recupera solo");
});

// ---------- 7. Arrepentimiento e incidencias internas ----------

test("Arrepentimiento e incidencia interna en el recorrido: retienen el crédito, sobreviven a los avisos y a la ruta diaria, y Harper los cierra", async () => {
  const t = tienda();
  const linea = await lineas();
  const config = await getConfig();
  const a = await comprar(t, [linea("amatista"), linea("cuarzo")]);
  const pagoA = await pagar(t, a);

  // El arrepentimiento por el botón (sin cuenta), verificado contra el pedido.
  const enviados: { para: string; texto: string }[] = [];
  const r = await registrarArrepentimiento(normalizarSolicitud({ nombre: "Ana Pérez", email: MAIL, pedido: a.numero, producto: "", motivo: "" }), {
    config,
    ahora: new Date(t.reloj.t),
    azar: new Uint8Array([9, 8, 7, 6, 5]),
    enviar: async (e) => {
      enviados.push({ para: e.para, texto: e.texto });
      return { ok: true as const };
    },
    credito: (solicitud, codigo) => incidenciaPorArrepentimiento(solicitud, codigo, t.incidencias),
  });
  assert.equal(r.ok, true);
  assert.match(enviados.find((e) => e.para === config.emailPedidos)?.texto ?? "", /queda retenido por el arrepentimiento/);
  assert.equal((await ganadoDe(a.numero))!.incidenciaAbierta, true);

  // Avisos de Mercado Pago aprobados de nuevo y la ruta diaria con la entrega y los 30 días: sigue retenido.
  await avisar(t, pagoA.id);
  await avisar(t, pagoA.id);
  await entregar(a);
  await diaDeControl(t, sumarDias(a.hoy, 10));
  const dia30 = await diaDeControl(t, sumarDias(a.hoy, 30));
  assert.deepEqual(dia30.liberados, []);
  assert.ok(dia30.atencion.some((x) => x.pedido === a.numero && /incidencia abierta/.test(x.motivo)));
  assert.equal((await ganadoDe(a.numero))!.estado, "Pendiente");

  // Harper lo resuelve (el arrepentimiento no siguió) y la cierra: se libera en el control siguiente.
  await updateRecord<CamposCredito>(TABLAS.creditos, (await ganadoDe(a.numero))!.id, { Incidencia_abierta: false });
  assert.deepEqual((await diaDeControl(t, sumarDias(a.hoy, 31))).liberados.map((l) => l.pedido), [a.numero]);
  assert.ok((await creditoParaElCarrito(peticionCon(MAIL), true))?.usable);

  // Un cambio o reclamo interno: Harper marca la incidencia en el crédito ya disponible. No se ofrece ni se usa.
  await updateRecord<CamposCredito>(TABLAS.creditos, (await ganadoDe(a.numero))!.id, { Incidencia_abierta: true });
  assert.equal(await creditoParaElCarrito(peticionCon(MAIL), true), null);
  await avisar(t, pagoA.id);
  assert.equal((await ganadoDe(a.numero))!.incidenciaAbierta, true, "el aviso de Mercado Pago no la cierra");
  const b = await comprar(t, [linea("obsidiana")], { conCredito: true });
  assert.equal(b.usado, 0);
  // La cierra: vuelve a ofrecerse.
  await updateRecord<CamposCredito>(TABLAS.creditos, (await ganadoDe(a.numero))!.id, { Incidencia_abierta: false });
  assert.ok((await creditoParaElCarrito(peticionCon(MAIL), true))?.usable);
});

// ---------- 8. Fallos y recuperación ----------

test("Fallos y recuperación: sin Redis, Airtable caído al anotar y Mercado Pago caído en la ruta diaria; al volver se completa una sola vez", async () => {
  const linea = await lineas();

  // a) El cerrojo del crédito no está (Redis caído): el pago queda registrado, el crédito no, y se pide reintento.
  const sinRedis = tienda({ cerrojoCredito: null });
  const a = await comprar(sinRedis, [linea("amatista"), linea("cuarzo")]);
  const pagoA = await pagar(sinRedis, a);
  assert.equal(pagoA.r.status, 503);
  assert.equal(await estadoDe(a), "pagado", "el pedido de siempre no espera al crédito");
  assert.equal(await ganadoDe(a.numero), null);
  // Vuelve Redis: el reintento de Mercado Pago lo anota, una sola vez.
  const t = tienda();
  t.pagos.set(pagoA.id, sinRedis.pagos.get(pagoA.id)!);
  assert.deepEqual((await avisar(t, pagoA.id)).cuerpo.credito, { accion: "registrar", estado: "creado" });
  assert.deepEqual((await avisar(t, pagoA.id)).cuerpo.credito, { accion: "registrar", estado: "ya" });
  assert.equal((await almacenAirtable.delPedido(a.numero)).length, 1);

  // b) Airtable no deja escribir el crédito: 503 y reintento; después, una sola fila.
  const b = await comprar(t, [linea("obsidiana")]);
  let fallas = 1;
  interceptar((ruta, { method }) => {
    if (method === "POST" && ruta.startsWith(TABLAS.creditos) && fallas-- > 0) throw new RespuestaFixture(503, "Airtable caído");
  });
  const pagoB = await pagar(t, b);
  assert.equal(pagoB.r.status, 503);
  interceptar(null);
  assert.deepEqual((await avisar(t, pagoB.id)).cuerpo.credito, { accion: "registrar", estado: "creado" });
  assert.equal((await almacenAirtable.delPedido(b.numero)).length, 1);

  // c) La ruta diaria con Mercado Pago caído: no libera nada y lo anota; al día siguiente, libera.
  await entregar(a);
  await diaDeControl(t, sumarDias(a.hoy, 10));
  const mpReal = t.diario.mp;
  t.diario.mp = { pago: async () => Promise.reject(new Error("Mercado Pago 503")), pagosDelPedido: async () => Promise.reject(new Error("Mercado Pago 503")) };
  const caido = await diaDeControl(t, sumarDias(a.hoy, 30));
  assert.deepEqual(caido.liberados, []);
  assert.ok(caido.errores.some((e) => e.pedido === a.numero));
  assert.equal((await ganadoDe(a.numero))!.estado, "Pendiente");
  t.diario.mp = mpReal;
  assert.deepEqual((await diaDeControl(t, sumarDias(a.hoy, 31))).liberados.map((l) => l.pedido), [a.numero]);
  assert.equal((await ganadoDe(a.numero))!.estado, "Disponible");
});
