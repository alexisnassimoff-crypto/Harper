import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

// Crédito Harper, paso 1 (§17.9): la generación del crédito conectada al
// webhook de Mercado Pago, detrás de HARPER_CREDITO_ACTIVO (apagado).
// Todo contra el Airtable en memoria, un Redis en memoria y pagos de mentira:
// nada toca pagos reales, la base real ni compradores reales.
process.env.HARPER_FIXTURES = "1";
delete process.env.VERCEL;
delete process.env.HARPER_DUO_ACTIVO;
delete process.env.HARPER_CREDITO_ACTIVO;
for (const v of ["KV_REST_API_URL", "KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "MP_ACCESS_TOKEN"]) delete process.env[v];

import { createRecord, ErrorAirtable, getRecord, listRecords, TABLAS } from "../lib/airtable";
import { clavePedido, type Cerrojo } from "../lib/cerrojo";
import { dependenciasCredito, type CamposCredito } from "../lib/credito-airtable";
import { lectorPedidosAirtable, MARCA_REGIMEN_NUEVO, notasConRegimen, regimenDelPedido, type DependenciasPagoCredito } from "../lib/credito-pagos";
import type { AlmacenCreditos } from "../lib/credito-persistencia";
import { cerrojoEnMemoria, reiniciarRedis } from "../lib/fixtures/redis";
import { interceptar, reiniciar } from "../lib/fixtures/servidor";
import type { PagoMP } from "../lib/mercadopago";
import { pagoDe, type LectorMercadoPago } from "../lib/mp-cobro";
import { notasDeBeneficios } from "../lib/suscriptores";
import type { ItemResuelto } from "../lib/tipos";
import { creditoDesdeEntorno, dependenciasReales, procesarNotificacion, type Dependencias, type FilaPedido, type Resultado } from "../lib/webhook-proceso";

type Mail = Parameters<Dependencias["enviarMail"]>[0];

const AMATISTA_NEGRO = "recLvS1Rce368QVeX";
const OBSIDIANA_NEGRO = "rect8rgXzLjIGbTge";
const AHORA = 1_763_000_000_000;

function item(varianteId: string, sku: string, subtotal: number): ItemResuelto {
  return {
    productoId: "recPJzzJFhyEF0DMw",
    productoSlug: "amatista",
    nombre: sku.split("-")[0],
    categoria: "Anteojos",
    varianteId,
    sku,
    color: "Negro",
    foto: null,
    precioLista: 89_900,
    precioUnitario: subtotal,
    descuento: 89_900 - subtotal,
    cantidad: 1,
    subtotal,
    stockDisponible: 12,
  };
}

/** Un Dúo ya cobrado: 89.900 + 67.425 (el de menor precio con 25 %). */
const DUO = [item(AMATISTA_NEGRO, "AMATISTA-NEGRO", 89_900), item(OBSIDIANA_NEGRO, "OBSIDIANA-NEGRO", 67_425)];
const UNO = [item(AMATISTA_NEGRO, "AMATISTA-NEGRO", 89_900)];

let secuencia = 0;
let idPago = 700_000;

async function crearPedido(opciones: { items?: ItemResuelto[]; notas?: string | null; email?: string | null } = {}) {
  const items = opciones.items ?? DUO;
  const total = items.reduce((s, i) => s + i.subtotal, 0);
  const cliente = await createRecord<{ Email?: string; Nombre?: string }>(TABLAS.clientes, opciones.email === null ? { Nombre: "Sin mail" } : { Email: opciones.email ?? "Cliente@Ejemplo.com", Nombre: "Cliente" });
  const numero = `HARPER-CW${++secuencia}`;
  const notas = opciones.notas === undefined ? MARCA_REGIMEN_NUEVO : opciones.notas;
  const pedido = await createRecord<FilaPedido>(TABLAS.pedidos, {
    Numero: numero,
    Estado: "pendiente",
    Cliente: [cliente.id],
    Items: JSON.stringify(items),
    Subtotal: total,
    Envio: 0,
    Total: total,
    Direccion: "Núñez 2422",
    Ciudad: "CABA",
    Provincia: "CABA",
    CP: "1429",
    ...(notas ? { Notas: notas } : {}),
  });
  return { pedidoId: pedido.id, numero, total };
}

function pagoDelPedido(pedidoId: string, total: number, extra: Partial<PagoMP> = {}): PagoMP {
  return { id: ++idPago, status: "approved", external_reference: pedidoId, transaction_amount: total, payer: { email: "cliente@ejemplo.com" }, ...extra };
}

/** El mismo pago, reembolsado entero (Mercado Pago informa el monto devuelto). */
const reembolsado = (p: PagoMP): PagoMP => ({ ...p, status: "refunded", transaction_amount_refunded: p.transaction_amount }) as PagoMP;

/** Mercado Pago de mentira: solo lectura, sobre los pagos de la prueba. */
function lectorDe(pagos: Map<string, PagoMP>, cuenta: { lecturas: number; busquedas?: number }): LectorMercadoPago {
  const leer = (id: string) => {
    const p = pagos.get(id);
    if (!p) throw new Error(`pago ${id} desconocido`);
    return pagoDe(p);
  };
  return {
    pago: async (id) => {
      cuenta.lecturas += 1;
      return leer(id);
    },
    pagosDelPedido: async (pedidoId) => {
      cuenta.busquedas = (cuenta.busquedas ?? 0) + 1;
      return [...pagos.keys()].map(leer).filter((p) => p.pedidoId === pedidoId);
    },
  };
}

function armar(opciones: { credito?: boolean; almacen?: (real: AlmacenCreditos) => AlmacenCreditos } = {}) {
  const pagos = new Map<string, PagoMP>();
  const mails: Mail[] = [];
  const cuenta = { lecturas: 0, busquedas: 0 };
  let t = AHORA;
  let n = 0;
  const real = dependenciasCredito();
  const credito: DependenciasPagoCredito = {
    credito: {
      ...real,
      almacen: opciones.almacen ? opciones.almacen(real.almacen) : real.almacen,
      cerrojo: cerrojoEnMemoria(),
      ahora: () => new Date(AHORA),
      nonce: () => `n-${++n}`,
    },
    mp: lectorDe(pagos, cuenta),
    pedidos: lectorPedidosAirtable,
  };
  const cerrojoPedido: Cerrojo = cerrojoEnMemoria({ ahora: () => t });
  const deps: Dependencias = {
    obtenerPago: async (id) => {
      const p = pagos.get(id);
      if (!p) throw new Error(`pago ${id} desconocido`);
      return p;
    },
    lectorPagos: lectorDe(pagos, { lecturas: 0 }),
    cerrojo: cerrojoPedido,
    enviarMail: async (mail) => {
      mails.push(mail);
      return true;
    },
    mailsConfigurados: () => true,
    reloj: {
      ahora: () => t,
      dormir: async (ms: number) => {
        t += ms;
        await new Promise<void>((r) => setImmediate(r));
      },
    },
    esperaReclamoMs: 50,
    esperaOcupadoMs: 30_000,
    sitio: "https://harper.ar",
    credito: opciones.credito === false ? null : credito,
  };
  const agregar = (p: PagoMP) => {
    pagos.set(String(p.id), p);
    return String(p.id);
  };
  const avanzar = (ms: number) => {
    t += ms;
  };
  return { deps, mails, pagos, agregar, cuenta, cerrojoPedido, credito, avanzar };
}

const creditosDe = async (numero: string) => (await listRecords<CamposCredito>(TABLAS.creditos, { revalidate: 0 })).filter((r) => r.fields.Pedido === numero);
const todosLosCreditos = async () => listRecords<CamposCredito>(TABLAS.creditos, { revalidate: 0 });
const estadoDe = async (pedidoId: string) => {
  const p = await getRecord<FilaPedido>(TABLAS.pedidos, pedidoId);
  return { estado: p.fields.Estado, mpStatus: p.fields.MP_status, pagoId: p.fields.MP_payment_id };
};
/** La respuesta del flujo de siempre, sin lo que agrega el crédito. */
const sinCredito = (r: Resultado) => {
  const { credito: _credito, ...resto } = r.cuerpo;
  return { status: r.status, cuerpo: resto };
};

beforeEach(() => {
  reiniciar();
  reiniciarRedis();
  interceptar(null);
});

// ---------- Apagado: todo igual ----------

test("APAGADO: sin HARPER_CREDITO_ACTIVO el webhook no arma el crédito, no lo llama y no escribe créditos", async () => {
  assert.equal(dependenciasReales("https://harper.ar").credito, null);

  const { deps, mails, agregar, cuenta } = armar({ credito: false });
  const { pedidoId } = await crearPedido();
  const pagoId = agregar(pagoDelPedido(pedidoId, 157_325));
  const r = await procesarNotificacion(pagoId, deps);

  assert.equal(r.status, 200);
  assert.equal(r.cuerpo.estado, "pagado");
  assert.equal("credito" in r.cuerpo, false);
  assert.equal(cuenta.lecturas, 0, "el lector del crédito no se usó");
  assert.equal(mails.length, 2);
  assert.deepEqual(await todosLosCreditos(), []);
});

test("APAGADO: el checkout deja las Notas idénticas", () => {
  const casos = [null, "", "Promoción: Dúo 25 % · AMATISTA", notasDeBeneficios({ suscriptorId: "recAAAAAAAAAAAAAA", email: "a@b.com", cupon: 0, saldoUsado: 0, cashback: 8_990 }).join("\n")];
  for (const notas of casos) assert.equal(notasConRegimen(notas, false), notas, String(notas));
  // Sin la variable, apagado.
  assert.equal(notasConRegimen(null), null);
});

test("Checkout con el interruptor: marca el régimen solo en pedidos sin el cashback de hoy, una sola vez", () => {
  assert.equal(notasConRegimen(null, true), MARCA_REGIMEN_NUEVO);
  const conDuo = notasConRegimen("Promoción: Dúo 25 % · AMATISTA", true);
  assert.equal(conDuo, `Promoción: Dúo 25 % · AMATISTA\n\n${MARCA_REGIMEN_NUEVO}`);
  assert.equal(regimenDelPedido(conDuo).regimen, "nuevo");
  // Ya marcado: no se repite.
  assert.equal(notasConRegimen(conDuo, true), conDuo);
  // Con el cashback de hoy: las reglas de hoy, sin marca.
  const conCashback = notasDeBeneficios({ suscriptorId: "recAAAAAAAAAAAAAA", email: "a@b.com", cupon: 0, saldoUsado: 0, cashback: 8_990 }).join("\n");
  assert.equal(notasConRegimen(conCashback, true), conCashback);
  // Un suscriptor sin cashback (por ejemplo, de baja que usa su saldo): va con el crédito nuevo.
  const sinCashback = notasDeBeneficios({ suscriptorId: "recAAAAAAAAAAAAAA", email: "a@b.com", cupon: 0, saldoUsado: 5_000, cashback: 0 }).join("\n");
  assert.equal(regimenDelPedido(notasConRegimen(sinCashback, true)).regimen, "nuevo");
  // La variable de entorno manda cuando no se pasa nada.
  process.env.HARPER_CREDITO_ACTIVO = "1";
  try {
    assert.equal(notasConRegimen(null), MARCA_REGIMEN_NUEVO);
  } finally {
    delete process.env.HARPER_CREDITO_ACTIVO;
  }
});

// ---------- Pago aprobado ----------

test("Pago aprobado con dos anteojos: el flujo de siempre y después un crédito pendiente del 10 %", async () => {
  const { deps, mails, agregar } = armar();
  const { pedidoId, numero } = await crearPedido();
  const pagoId = agregar(pagoDelPedido(pedidoId, 157_325));

  const r = await procesarNotificacion(pagoId, deps);

  assert.equal(r.status, 200);
  assert.equal(r.cuerpo.estado, "pagado");
  assert.equal(r.cuerpo.stockDescontado, 2);
  assert.deepEqual(r.cuerpo.credito, { accion: "registrar", estado: "creado" });
  assert.deepEqual(await estadoDe(pedidoId), { estado: "pagado", mpStatus: "approved", pagoId });
  assert.equal(mails.length, 2, "los dos mails de siempre, ninguno más");

  const filas = await creditosDe(numero);
  assert.equal(filas.length, 1);
  const f = filas[0].fields;
  assert.equal(f.Estado, "Pendiente");
  assert.equal(f.Monto, 15_733);
  assert.equal(f.Porcentaje, 10);
  assert.equal(f.Base, 157_325);
  assert.equal(f.Anteojos, 2);
  assert.equal(f.Email, "cliente@ejemplo.com");
  assert.equal(f.Reglas, "credito-harper-v1");
  assert.equal(f.Disponible_desde ?? null, null, "pendiente: todavía sin fecha de disponibilidad");
});

test("Pago aprobado con un anteojo: crédito pendiente del 5 %", async () => {
  const { deps, agregar } = armar();
  const { pedidoId, numero } = await crearPedido({ items: UNO });
  const r = await procesarNotificacion(agregar(pagoDelPedido(pedidoId, 89_900)), deps);

  assert.equal(r.status, 200);
  const filas = await creditosDe(numero);
  assert.equal(filas.length, 1);
  assert.equal(filas[0].fields.Monto, 4_495);
  assert.equal(filas[0].fields.Porcentaje, 5);
});

test("El flujo de siempre contesta lo mismo con y sin el crédito: aprobado, rechazado y reembolsado", async () => {
  const correr = async (conCredito: boolean) => {
    const { deps, mails, agregar, pagos } = armar({ credito: conCredito });
    const aprobado = await crearPedido();
    const pa = agregar(pagoDelPedido(aprobado.pedidoId, 157_325));
    const r1 = await procesarNotificacion(pa, deps);
    // El mismo pago, después reembolsado entero.
    pagos.set(pa, reembolsado(pagos.get(pa)!));
    const r2 = await procesarNotificacion(pa, deps);
    const rechazado = await crearPedido();
    const r3 = await procesarNotificacion(agregar(pagoDelPedido(rechazado.pedidoId, 157_325, { status: "rejected", status_detail: "cc_rejected_other_reason" })), deps);
    return {
      respuestas: [r1, r2, r3].map(sinCredito),
      pedidos: [await estadoDe(aprobado.pedidoId), await estadoDe(rechazado.pedidoId)].map((e) => ({ ...e, pagoId: Boolean(e.pagoId) })),
      mails: mails.length,
      credito: [r1, r2, r3].map((r) => r.cuerpo.credito ?? null),
    };
  };
  const sin = await correr(false);
  const con = await correr(true);
  assert.deepEqual(con.respuestas, sin.respuestas);
  assert.deepEqual(con.pedidos, sin.pedidos);
  assert.equal(con.mails, sin.mails);
  assert.deepEqual(sin.credito, [null, null, null]);
  assert.deepEqual(con.credito, [
    { accion: "registrar", estado: "creado" },
    { accion: "anular", estado: "anulado" },
    { accion: "nada", motivo: "sin-pago" },
  ]);
});

// ---------- Duplicados ----------

test("Duplicado: el mismo aviso dos veces, y dos a la vez, dejan un solo crédito", async () => {
  const { deps, mails, agregar } = armar();
  const uno = await crearPedido();
  const pagoId = agregar(pagoDelPedido(uno.pedidoId, 157_325));
  const r1 = await procesarNotificacion(pagoId, deps);
  const r2 = await procesarNotificacion(pagoId, deps);
  assert.deepEqual(r1.cuerpo.credito, { accion: "registrar", estado: "creado" });
  assert.equal(r2.status, 200);
  assert.equal(r2.cuerpo.duplicado, true);
  assert.deepEqual(r2.cuerpo.credito, { accion: "registrar", estado: "ya" });
  assert.equal((await creditosDe(uno.numero)).length, 1);
  assert.equal(mails.length, 2);

  // Dos avisos del mismo pago a la vez (payment.created y payment.updated).
  const dos = await crearPedido();
  const otroPago = agregar(pagoDelPedido(dos.pedidoId, 157_325));
  const juntos = await Promise.all([procesarNotificacion(otroPago, deps), procesarNotificacion(otroPago, deps)]);
  for (const r of juntos) assert.ok(r.status === 200 || r.status === 503, `status ${r.status}`);
  // Mercado Pago reintenta los que pidieron reintento.
  for (const r of juntos) if (r.status === 503) assert.equal((await procesarNotificacion(otroPago, deps)).status, 200);
  const filas = await creditosDe(dos.numero);
  assert.equal(filas.length, 1);
  assert.equal(filas[0].fields.Estado, "Pendiente");
});

// ---------- Rechazo y reembolso ----------

test("Pago rechazado: el pedido queda rechazado como siempre y no hay crédito", async () => {
  const { deps, agregar } = armar();
  const { pedidoId, numero } = await crearPedido();
  const r = await procesarNotificacion(agregar(pagoDelPedido(pedidoId, 157_325, { status: "rejected", status_detail: "cc_rejected_other_reason" })), deps);

  assert.equal(r.status, 200);
  assert.equal((await estadoDe(pedidoId)).estado, "rechazado");
  assert.deepEqual(r.cuerpo.credito, { accion: "nada", motivo: "sin-pago" });
  assert.deepEqual(await creditosDe(numero), []);
});

test("Reembolso total: el crédito pendiente queda anulado; nunca se borra la fila", async () => {
  const { deps, agregar, pagos } = armar();
  const { pedidoId, numero } = await crearPedido();
  const pagoId = agregar(pagoDelPedido(pedidoId, 157_325));
  await procesarNotificacion(pagoId, deps);
  assert.equal((await creditosDe(numero))[0].fields.Estado, "Pendiente");

  pagos.set(pagoId, reembolsado(pagos.get(pagoId)!));
  const r = await procesarNotificacion(pagoId, deps);

  assert.equal(r.status, 200);
  assert.deepEqual(r.cuerpo.credito, { accion: "anular", estado: "anulado" });
  const filas = await creditosDe(numero);
  assert.equal(filas.length, 1);
  assert.equal(filas[0].fields.Estado, "Anulado");
});

// ---------- Errores de persistencia ----------

test("Error pasajero al escribir el crédito: 503 sin tocar el pago; el reintento lo anota una vez", async () => {
  let fallas = 1;
  const { deps, mails, agregar } = armar({
    almacen: (real) => ({
      ...real,
      crear: async (fila) => {
        if (fallas-- > 0) throw new ErrorAirtable(503, "/Creditos", "Service Unavailable");
        return real.crear(fila);
      },
    }),
  });
  const { pedidoId, numero } = await crearPedido();
  const pagoId = agregar(pagoDelPedido(pedidoId, 157_325));

  const r1 = await procesarNotificacion(pagoId, deps);
  assert.equal(r1.status, 503);
  assert.deepEqual(r1.cuerpo.credito, { reintentar: true });
  assert.equal(r1.cuerpo.estado, "pagado", "el pago quedó registrado como siempre");
  assert.equal((await estadoDe(pedidoId)).estado, "pagado");
  assert.deepEqual(await creditosDe(numero), []);

  const r2 = await procesarNotificacion(pagoId, deps);
  assert.equal(r2.status, 200);
  assert.equal(r2.cuerpo.duplicado, true, "el flujo de siempre no se repite");
  assert.deepEqual(r2.cuerpo.credito, { accion: "registrar", estado: "creado" });
  assert.equal((await creditosDe(numero)).length, 1);
  assert.equal(mails.length, 2, "ni el pago ni los mails se repiten");
});

test("Sin Redis para el crédito: no se escribe nada y se pide reintento", async () => {
  const { deps, agregar, credito } = armar();
  deps.credito = { ...credito, credito: { ...credito.credito, cerrojo: null } };
  const { pedidoId, numero } = await crearPedido();
  const r = await procesarNotificacion(agregar(pagoDelPedido(pedidoId, 157_325)), deps);
  assert.equal(r.status, 503);
  assert.equal((await estadoDe(pedidoId)).estado, "pagado");
  assert.deepEqual(await creditosDe(numero), []);
});

test("Error que reintentar no arregla: 200, aviso interno a Harper y ningún crédito", async () => {
  // Airtable rechaza la escritura (4xx).
  const a = armar({
    almacen: (real) => ({
      ...real,
      crear: async () => {
        throw new ErrorAirtable(422, "/Creditos", "INVALID_VALUE_FOR_COLUMN");
      },
    }),
  });
  const p1 = await crearPedido();
  const r1 = await procesarNotificacion(a.agregar(pagoDelPedido(p1.pedidoId, 157_325)), a.deps);
  assert.equal(r1.status, 200);
  assert.equal((r1.cuerpo.credito as { revisar?: boolean }).revisar, true);
  assert.equal((await estadoDe(p1.pedidoId)).estado, "pagado");
  assert.deepEqual(await creditosDe(p1.numero), []);
  assert.equal(a.mails.length, 3);
  assert.match(a.mails[2].asunto, /^REVISAR Crédito Harper — pago \d+: no se pudo anotar$/);

  // Un pedido sin mail para la cuenta del crédito: dato que no sirve.
  const b = armar();
  const p2 = await crearPedido({ email: null });
  const r2 = await procesarNotificacion(b.agregar(pagoDelPedido(p2.pedidoId, 157_325)), b.deps);
  assert.equal(r2.status, 200);
  assert.equal((r2.cuerpo.credito as { revisar?: boolean }).revisar, true);
  assert.equal((await estadoDe(p2.pedidoId)).estado, "pagado");
  assert.deepEqual(await creditosDe(p2.numero), []);
  assert.ok(b.mails.some((m) => m.asunto.startsWith("REVISAR Crédito Harper")));
});

/** Un crédito que no se puede anotar nunca: Airtable rechaza la escritura. */
const siempreRechaza = (real: AlmacenCreditos): AlmacenCreditos => ({
  ...real,
  crear: async () => {
    throw new ErrorAirtable(422, "/Creditos", "INVALID_VALUE_FOR_COLUMN");
  },
});
const esRevisar = (m: Mail) => m.asunto.startsWith("REVISAR Crédito Harper");

test("Error que reintentar no arregla y el aviso NO sale (enviarMail devuelve false): 503 para volver a avisar; el reintento avisa sin repetir el pago ni sus mails", async () => {
  const { deps, mails, agregar } = armar({ almacen: siempreRechaza });
  let avisosQueFallan = 1;
  const enviar = deps.enviarMail;
  deps.enviarMail = async (mail) => (esRevisar(mail) && avisosQueFallan-- > 0 ? false : enviar(mail));
  const { pedidoId, numero } = await crearPedido();
  const pagoId = agregar(pagoDelPedido(pedidoId, 157_325));

  const r1 = await procesarNotificacion(pagoId, deps);
  assert.equal(r1.status, 503, "sin aviso, Mercado Pago reintenta");
  assert.deepEqual(r1.cuerpo.credito, { revisar: true, avisoEnviado: false });
  assert.equal(r1.cuerpo.estado, "pagado", "el pago quedó registrado como siempre");
  assert.equal((await estadoDe(pedidoId)).estado, "pagado");
  assert.equal(mails.length, 2, "los dos mails del pedido; el aviso no salió");
  assert.equal(mails.some(esRevisar), false);

  const r2 = await procesarNotificacion(pagoId, deps);
  assert.equal(r2.status, 200);
  assert.equal(r2.cuerpo.duplicado, true, "el flujo de siempre no se repite");
  assert.equal((r2.cuerpo.credito as { revisar?: boolean }).revisar, true);
  assert.equal(mails.length, 3, "solo se suma el aviso: ni el pago ni sus mails se repiten");
  assert.ok(esRevisar(mails[2]));
  assert.equal((await estadoDe(pedidoId)).pagoId, pagoId);
  assert.deepEqual(await creditosDe(numero), []);

  // Si mandar el aviso tira (Resend caído, la config que no se lee): también 503.
  const b = armar({ almacen: siempreRechaza });
  const enviarB = b.deps.enviarMail;
  b.deps.enviarMail = async (mail) => {
    if (esRevisar(mail)) throw new Error("Resend 500");
    return enviarB(mail);
  };
  const p2 = await crearPedido();
  const rb = await procesarNotificacion(b.agregar(pagoDelPedido(p2.pedidoId, 157_325)), b.deps);
  assert.equal(rb.status, 503);
  assert.deepEqual(rb.cuerpo.credito, { revisar: true, avisoEnviado: false });
  assert.equal((await estadoDe(p2.pedidoId)).estado, "pagado");

  // Con los mails apagados a propósito (como en local) no hay a quién avisar: 200, igual que los mails del pedido.
  const c = armar({ almacen: siempreRechaza });
  c.deps.mailsConfigurados = () => false;
  c.deps.enviarMail = async () => false;
  const p3 = await crearPedido();
  const rc = await procesarNotificacion(c.agregar(pagoDelPedido(p3.pedidoId, 157_325)), c.deps);
  assert.equal(rc.status, 200);
  assert.equal((rc.cuerpo.credito as { revisar?: boolean }).revisar, true);
});

// ---------- Prendido sin configurar ----------

test("Prendido sin lo indispensable: creditoDesdeEntorno no devuelve null, dice qué falta", () => {
  const variables = ["HARPER_CREDITO_ACTIVO", "MP_ACCESS_TOKEN", "KV_REST_API_URL", "KV_REST_API_TOKEN"];
  try {
    process.env.HARPER_CREDITO_ACTIVO = "1";
    assert.deepEqual(creditoDesdeEntorno(), { sinConfigurar: ["MP_ACCESS_TOKEN", "Redis (cerrojo)"] });
    assert.deepEqual(dependenciasReales("https://harper.ar").credito, { sinConfigurar: ["MP_ACCESS_TOKEN", "Redis (cerrojo)"] });

    // Valores de mentira: nada se conecta al armar las dependencias.
    process.env.MP_ACCESS_TOKEN = "prueba-no-es-un-token";
    assert.deepEqual(creditoDesdeEntorno(), { sinConfigurar: ["Redis (cerrojo)"] });

    process.env.KV_REST_API_URL = "https://redis.invalid";
    process.env.KV_REST_API_TOKEN = "prueba-no-es-un-token";
    const listo = creditoDesdeEntorno();
    assert.ok(listo && !("sinConfigurar" in listo) && listo.mp && listo.credito.cerrojo, "con todo, las dependencias de verdad");

    delete process.env.MP_ACCESS_TOKEN;
    assert.deepEqual(creditoDesdeEntorno(), { sinConfigurar: ["MP_ACCESS_TOKEN"] });

    // Apagado: null, falte lo que falte.
    delete process.env.HARPER_CREDITO_ACTIVO;
    assert.equal(creditoDesdeEntorno(), null);
  } finally {
    for (const v of variables) delete process.env[v];
  }
});

test("Prendido sin configurar: el pedido del crédito nuevo pide reintento y avisa a Harper (una vez por hora); el del régimen anterior queda igual", async () => {
  const { deps, mails, agregar, cuenta, credito, avanzar } = armar();
  deps.credito = { sinConfigurar: ["MP_ACCESS_TOKEN"] };
  const esAlerta = (m: Mail) => m.asunto === "ALERTA Harper — Crédito Harper prendido sin configurar: falta MP_ACCESS_TOKEN";

  const p1 = await crearPedido();
  const pago1 = agregar(pagoDelPedido(p1.pedidoId, 157_325));
  const r1 = await procesarNotificacion(pago1, deps);
  assert.equal(r1.status, 503, "no se saltea en silencio: Mercado Pago reintenta");
  assert.deepEqual(r1.cuerpo.credito, { sinConfigurar: ["MP_ACCESS_TOKEN"] });
  assert.equal(r1.cuerpo.estado, "pagado", "el pago quedó registrado como siempre");
  assert.equal((await estadoDe(p1.pedidoId)).estado, "pagado");
  assert.equal(mails.length, 3, "los dos mails del pedido y la alerta");
  assert.ok(esAlerta(mails[2]));
  assert.deepEqual(await creditosDe(p1.numero), []);
  assert.equal(cuenta.lecturas, 0, "sin configurar, el crédito no se procesa");

  // El reintento: el flujo de siempre ve un duplicado y la alerta no se repite en la hora.
  const r1b = await procesarNotificacion(pago1, deps);
  assert.equal(r1b.status, 503);
  assert.equal(r1b.cuerpo.duplicado, true);
  assert.equal(mails.length, 3);

  // Un pedido del régimen anterior: la respuesta de siempre, sin crédito ni alerta.
  const p2 = await crearPedido({ notas: null });
  const r2 = await procesarNotificacion(agregar(pagoDelPedido(p2.pedidoId, 157_325)), deps);
  assert.equal(r2.status, 200);
  assert.equal("credito" in r2.cuerpo, false);
  assert.equal(r2.cuerpo.estado, "pagado");
  assert.equal(mails.filter(esAlerta).length, 1);
  assert.equal(mails.length, 5, "solo los dos mails de su pedido");

  // Una hora después vuelve a avisar; si ese aviso no sale, lo intenta en el próximo.
  avanzar(60 * 60 * 1000);
  let alertasQueFallan = 1;
  const enviar = deps.enviarMail;
  deps.enviarMail = async (mail) => (esAlerta(mail) && alertasQueFallan-- > 0 ? false : enviar(mail));
  const p3 = await crearPedido();
  const pago3 = agregar(pagoDelPedido(p3.pedidoId, 157_325));
  assert.equal((await procesarNotificacion(pago3, deps)).status, 503);
  assert.equal(mails.filter(esAlerta).length, 1, "esa alerta no salió");
  assert.equal((await procesarNotificacion(pago3, deps)).status, 503);
  assert.equal(mails.filter(esAlerta).length, 2, "salió en el reintento");

  // Configurado: el reintento anota el crédito una vez, sin repetir el pago ni sus mails.
  deps.credito = credito;
  const antes = mails.length;
  const r1c = await procesarNotificacion(pago1, deps);
  assert.equal(r1c.status, 200);
  assert.equal(r1c.cuerpo.duplicado, true);
  assert.deepEqual(r1c.cuerpo.credito, { accion: "registrar", estado: "creado" });
  assert.equal((await creditosDe(p1.numero)).length, 1);
  assert.equal(mails.length, antes);
});

test("Si el flujo de siempre pide reintento, el crédito no se procesa en ese aviso", async () => {
  const { deps, agregar, cuenta, cerrojoPedido } = armar();
  deps.esperaOcupadoMs = 2_000;
  const { pedidoId, numero } = await crearPedido();
  const pagoId = agregar(pagoDelPedido(pedidoId, 157_325));
  // Otra instancia tiene el pedido.
  await cerrojoPedido.tomar(clavePedido(pedidoId), "otra", 60_000);

  const r1 = await procesarNotificacion(pagoId, deps);
  assert.equal(r1.status, 503);
  assert.equal("credito" in r1.cuerpo, false);
  assert.equal(cuenta.lecturas, 0);
  assert.deepEqual(await creditosDe(numero), []);

  await cerrojoPedido.soltar(clavePedido(pedidoId), "otra");
  const r2 = await procesarNotificacion(pagoId, deps);
  assert.equal(r2.status, 200);
  assert.deepEqual(r2.cuerpo.credito, { accion: "registrar", estado: "creado" });
});

// ---------- El régimen anterior ----------

test("Régimen anterior: el pedido con el cashback de hoy sigue igual y no recibe crédito nuevo; uno sin marca tampoco", async () => {
  const { deps, agregar } = armar();
  const suscriptor = await createRecord(TABLAS.suscriptores, { Email: "cliente@ejemplo.com", Cupon: "Usado" });
  const notas = notasDeBeneficios({ suscriptorId: suscriptor.id, email: "cliente@ejemplo.com", cupon: 0, saldoUsado: 0, cashback: 15_733 }).join("\n");
  const conCashback = await crearPedido({ notas });
  const r1 = await procesarNotificacion(agregar(pagoDelPedido(conCashback.pedidoId, 157_325)), deps);

  assert.equal(r1.status, 200);
  assert.equal(r1.cuerpo.estado, "pagado");
  assert.deepEqual(r1.cuerpo.credito, { accion: "nada", motivo: "regimen-anterior" });
  assert.deepEqual(await creditosDe(conCashback.numero), []);
  // El cashback de hoy, como siempre, en Saldos.
  const saldos = (await listRecords<{ Pedido?: string; Tipo?: string; Monto?: number }>(TABLAS.saldos, { revalidate: 0 })).filter(
    (s) => s.fields.Pedido === conCashback.numero
  );
  assert.deepEqual(
    saldos.map((s) => [s.fields.Tipo, s.fields.Monto]),
    [["Cashback", 15_733]]
  );

  // Un pedido de antes, sin marca: las reglas de hoy.
  const deAntes = await crearPedido({ notas: null });
  const r2 = await procesarNotificacion(agregar(pagoDelPedido(deAntes.pedidoId, 157_325)), deps);
  assert.deepEqual(r2.cuerpo.credito, { accion: "nada", motivo: "regimen-anterior" });
  assert.deepEqual(await creditosDe(deAntes.numero), []);
});

test("Régimen anterior: no se le piden a Mercado Pago los otros pagos ni se leen sus Items (un pedido de antes con otro formato sigue igual)", async () => {
  const { deps, mails, agregar, cuenta } = armar();
  // Items de antes, sin categoría: el flujo de siempre los usa igual; el crédito no los necesita.
  const viejos = DUO.map(({ categoria: _c, ...resto }) => resto) as unknown as ItemResuelto[];
  const deAntes = await crearPedido({ notas: null, items: viejos });
  const r = await procesarNotificacion(agregar(pagoDelPedido(deAntes.pedidoId, 157_325)), deps);

  assert.equal(r.status, 200);
  assert.equal(r.cuerpo.estado, "pagado");
  assert.deepEqual(r.cuerpo.credito, { accion: "nada", motivo: "regimen-anterior" });
  assert.equal(cuenta.busquedas, 0, "no se buscaron sus pagos en Mercado Pago");
  assert.equal(mails.length, 2, "ningún aviso de más");
  assert.deepEqual(await creditosDe(deAntes.numero), []);
});
