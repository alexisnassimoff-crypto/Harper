import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

// Crédito Harper, paso 2: el control diario que libera el crédito 30 días
// después de la entrega confirmada (lib/credito-diario.ts). Todo contra el
// Airtable en memoria, un Redis en memoria y pagos de mentira: nada toca
// pagos reales, la base real ni compradores reales.
process.env.HARPER_FIXTURES = "1";
delete process.env.VERCEL;
delete process.env.HARPER_DUO_ACTIVO;
delete process.env.HARPER_CREDITO_ACTIVO;
for (const v of ["KV_REST_API_URL", "KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "MP_ACCESS_TOKEN", "CRON_SECRET"]) delete process.env[v];

import { createRecord, getRecord, listRecords, TABLAS, updateRecord } from "../lib/airtable";
import { getConfig } from "../lib/config";
import { dependenciasCredito, filaDelRegistro, type CamposCredito } from "../lib/credito-airtable";
import {
  CLAVE_CORRIDA_DIARIA,
  controlDiarioActivo,
  correrDiario,
  cronAutorizado,
  dependenciasCorridaReales,
  entregaDelPedido,
  lectorPedidosPorNumeroAirtable,
  procesarCreditosDelDia,
  type DependenciasCorrida,
  type DependenciasDiario,
  type PedidoDelCredito,
} from "../lib/credito-diario";
import { MARCA_REGIMEN_NUEVO, pagoDe, type LectorMercadoPago } from "../lib/credito-pagos";
import { liberarDisponibles, saldosDeLaCuenta } from "../lib/credito-persistencia";
import { cerrojoEnMemoria, reiniciarRedis } from "../lib/fixtures/redis";
import { interceptar, reiniciar, RespuestaFixture } from "../lib/fixtures/servidor";
import type { PagoMP } from "../lib/mercadopago";
import { fechaArgentina, notasDeBeneficios, saldoDe, sumarDias, type MovimientoSaldo } from "../lib/suscriptores";

type Mail = Parameters<DependenciasCorrida["enviarMail"]>[0];

const ITEMS = JSON.stringify([
  { categoria: "Anteojos", cantidad: 1, subtotal: 89_900, sku: "AMATISTA-NEGRO" },
  { categoria: "Anteojos", cantidad: 1, subtotal: 67_425, sku: "OBSIDIANA-NEGRO" },
]);
const TOTAL = 157_325;
const MONTO = 15_733;

let secuencia = 0;
let idPago = 900_000;

type Caso = { numero: string; pedidoId: string; pagoId: string; creditoId: string; compra: string };

/** Medianoche (00:00) de ese día en Buenos Aires: 03:00 UTC (la Argentina no tiene horario de verano). */
const medianocheAR = (dia: string) => new Date(`${dia}T03:00:00.000Z`).getTime();

function armar() {
  const pagos = new Map<string, PagoMP>();
  const mails: Mail[] = [];
  const cuenta = { lecturas: 0, busquedas: 0 };
  const reloj = { t: Date.now() };
  let n = 0;
  const mp: LectorMercadoPago = {
    async pago(id) {
      cuenta.lecturas += 1;
      const p = pagos.get(id);
      if (!p) throw new Error(`pago ${id} desconocido`);
      return pagoDe(p);
    },
    async pagosDelPedido(pedidoId) {
      cuenta.busquedas += 1;
      return [...pagos.values()].map(pagoDe).filter((p) => p.pedidoId === pedidoId);
    },
  };
  const real = dependenciasCredito();
  const diario: DependenciasDiario = {
    credito: { ...real, cerrojo: cerrojoEnMemoria(), ahora: () => new Date(reloj.t), nonce: () => `n-${++n}` },
    mp,
    pedidos: lectorPedidosPorNumeroAirtable,
  };
  const corrida: DependenciasCorrida = {
    diario,
    enviarMail: async (mail) => {
      mails.push(mail);
      return true;
    },
    mailsConfigurados: () => true,
    config: getConfig,
  };

  /** Un pedido del crédito nuevo, cobrado, con su crédito Pendiente (como lo deja el paso 1). */
  async function caso(o: { estado?: string; fechaEntrega?: string | null; notas?: string; credito?: Partial<CamposCredito>; pago?: Partial<PagoMP> } = {}): Promise<Caso> {
    const numero = `HARPER-CD${++secuencia}`;
    const pagoId = String(++idPago);
    const pedido = await createRecord<Record<string, unknown>>(TABLAS.pedidos, {
      Numero: numero,
      Estado: o.estado ?? "entregado",
      Items: ITEMS,
      Subtotal: TOTAL,
      Envio: 0,
      Total: TOTAL,
      Notas: o.notas ?? MARCA_REGIMEN_NUEVO,
      MP_payment_id: pagoId,
      ...(o.fechaEntrega ? { Fecha_entrega: o.fechaEntrega } : {}),
    });
    pagos.set(pagoId, { id: Number(pagoId), status: "approved", external_reference: pedido.id, transaction_amount: TOTAL, ...o.pago } as PagoMP);
    const credito = await createRecord<CamposCredito>(TABLAS.creditos, {
      Clave: `credito-harper:${numero}`,
      Pedido: numero,
      Email: "cliente@ejemplo.com",
      Monto: MONTO,
      Porcentaje: 10,
      Base: TOTAL,
      Anteojos: 2,
      Estado: "Pendiente",
      Generado_el: new Date().toISOString(),
      Reglas: "credito-harper-v1",
      Notas: "Pendiente: 10 % de $ 157325 pagados en 2 anteojo(s).",
      ...o.credito,
    });
    return { numero, pedidoId: pedido.id, pagoId, creditoId: credito.id, compra: fechaArgentina(new Date(pedido.createdTime)) };
  }

  return { diario, corrida, mails, pagos, cuenta, reloj, caso };
}

const creditoDe = async (c: Caso) => (await getRecord<CamposCredito>(TABLAS.creditos, c.creditoId)).fields;
const pedidoDe = async (c: Caso) => (await getRecord<Record<string, unknown>>(TABLAS.pedidos, c.pedidoId)).fields;
const veces = (texto: string | undefined, que: string) => (texto ?? "").split(que).length - 1;

/** Registra cada escritura en Airtable: el control diario solo escribe en Créditos. */
function anotarEscrituras() {
  const escrituras: string[] = [];
  interceptar((ruta, { method }) => {
    if (method !== "GET") escrituras.push(`${method} ${ruta.split("/")[0]}`);
  });
  return escrituras;
}

beforeEach(() => {
  reiniciar();
  reiniciarRedis();
  interceptar(null);
});

// ---------- Entrega confirmada y 30 días cumplidos ----------

test("Entrega confirmada y 30 días cumplidos: anota la entrega, relee pedido y Mercado Pago, libera una vez y lo registra", async () => {
  const { corrida, mails, reloj, caso, cuenta } = armar();
  const c = await caso({ fechaEntrega: fechaArgentina(new Date()) });
  const entrega = c.compra;
  const libera = sumarDias(entrega, 30);
  reloj.t = medianocheAR(libera);
  const pedidoAntes = await pedidoDe(c);
  const escrituras = anotarEscrituras();

  const r = await correrDiario(corrida);

  assert.equal(r.status, 200);
  assert.deepEqual(r.cuerpo.liberados, [{ pedido: c.numero, monto: MONTO, fechaEntrega: entrega }]);
  assert.deepEqual(r.cuerpo.fechasAnotadas, [{ pedido: c.numero, fechaEntrega: entrega, disponibleDesde: libera }]);
  assert.deepEqual(r.cuerpo.atencion, []);
  assert.deepEqual(r.cuerpo.errores, []);
  const f = await creditoDe(c);
  assert.equal(f.Estado, "Disponible");
  assert.equal(f.Fecha_entrega, entrega);
  assert.equal(f.Disponible_desde, libera);
  assert.equal(f.Monto, MONTO, "el monto no cambia");
  assert.match(f.Notas ?? "", /Entrega confirmada el .*: disponible desde el /);
  assert.match(f.Notas ?? "", /Disponible: entregado el .* y 30 días cumplidos; pedido «entregado», cobrado en Mercado Pago y sin incidencias \(control diario\)\./);
  assert.ok(cuenta.busquedas >= 1, "se leyó el cobro en Mercado Pago antes de liberar");
  // Solo escribió en Créditos; el pedido quedó igual.
  assert.ok(escrituras.length > 0 && escrituras.every((e) => e === `PATCH ${TABLAS.creditos}`), escrituras.join(", "));
  assert.deepEqual(await pedidoDe(c), pedidoAntes);
  // El registro: un mail a Harper con lo liberado.
  assert.equal(mails.length, 1);
  assert.match(mails[0].asunto, /^Crédito Harper — control diario del \d{4}-\d{2}-\d{2}: 1 liberado\(s\), 0 a revisar, 0 error\(es\)$/);
  assert.match(mails[0].texto ?? "", new RegExp(`Liberados \\(pasaron a Disponible\\): ${c.numero} \\(\\$\\s15\\.733, entregado el ${entrega}\\)`));
  // En la cuenta: disponible para anteojos, sin tocar el saldo de hoy.
  const filas = (await listRecords<CamposCredito>(TABLAS.creditos, { revalidate: 0 })).map(filaDelRegistro);
  assert.deepEqual(saldosDeLaCuenta([], filas, libera).credito, { disponible: MONTO, pendiente: 0, aRevisar: 0 });
});

// ---------- Antes de los 30 días ----------

test("Antes de cumplir los 30 días: anota la entrega y sigue pendiente, sin consultar Mercado Pago", async () => {
  const { corrida, mails, reloj, caso, cuenta } = armar();
  const c = await caso({ fechaEntrega: fechaArgentina(new Date()) });
  const libera = sumarDias(c.compra, 30);
  reloj.t = medianocheAR(sumarDias(libera, -1)) + 12 * 3_600_000; // el día 29, al mediodía

  const r = await correrDiario(corrida);

  assert.equal(r.status, 200);
  assert.deepEqual(r.cuerpo.liberados, []);
  assert.deepEqual(r.cuerpo.esperando, [{ pedido: c.numero, motivo: `disponible desde el ${libera}` }]);
  const f = await creditoDe(c);
  assert.equal(f.Estado, "Pendiente");
  assert.equal(f.Disponible_desde, libera);
  assert.equal(cuenta.busquedas + cuenta.lecturas, 0);
  assert.equal(mails.length, 1, "avisa la entrega anotada");
  assert.match(mails[0].texto ?? "", /Entregas anotadas: /);
});

// ---------- Sin fecha de entrega ----------

test("Sin fecha de entrega: nunca se libera solo, aunque pasen meses; lo que no cierra va a «atención» sin usarse", async () => {
  const { corrida, reloj, caso } = armar();
  const hoyReal = fechaArgentina(new Date());
  const enviado = await caso({ estado: "enviado" });
  const entregadoSinFecha = await caso({ estado: "entregado" });
  const futura = await caso({ fechaEntrega: sumarDias(hoyReal, 400) });
  const antesDeLaCompra = await caso({ fechaEntrega: sumarDias(hoyReal, -5) });
  const enviadoConFecha = await caso({ estado: "enviado", fechaEntrega: hoyReal });
  reloj.t = medianocheAR(sumarDias(hoyReal, 200));
  const escrituras = anotarEscrituras();

  const r = await correrDiario(corrida);

  assert.equal(r.status, 200);
  assert.deepEqual(r.cuerpo.liberados, []);
  assert.deepEqual(r.cuerpo.fechasAnotadas, []);
  assert.deepEqual(r.cuerpo.esperando, [{ pedido: enviado.numero, motivo: "sin entrega confirmada" }]);
  const atencion = new Map((r.cuerpo.atencion as { pedido: string; motivo: string }[]).map((a) => [a.pedido, a.motivo]));
  assert.match(atencion.get(entregadoSinFecha.numero) ?? "", /está «entregado» sin Fecha_entrega/);
  assert.match(atencion.get(futura.numero) ?? "", /es posterior a hoy/);
  assert.match(atencion.get(antesDeLaCompra.numero) ?? "", /es anterior a la compra/);
  assert.match(atencion.get(enviadoConFecha.numero) ?? "", /tiene Fecha_entrega pero está «enviado»/);
  for (const c of [enviado, entregadoSinFecha, futura, antesDeLaCompra, enviadoConFecha]) {
    const f = await creditoDe(c);
    assert.equal(f.Estado, "Pendiente", c.numero);
    assert.equal(f.Fecha_entrega ?? null, null, `${c.numero}: no se usó la fecha`);
  }
  assert.deepEqual(escrituras, [], "no se escribió nada");
});

// ---------- Cancelado o reembolsado ----------

test("Pedido cancelado o reembolsado: no se libera, no se anula desde acá y se avisa", async () => {
  const { corrida, mails, reloj, caso, pagos } = armar();
  const hoyReal = fechaArgentina(new Date());
  const cancelado = await caso({ estado: "cancelado", credito: { Fecha_entrega: hoyReal, Disponible_desde: sumarDias(hoyReal, 30) } });
  const reembolsado = await caso({ fechaEntrega: hoyReal });
  const parcial = await caso({ fechaEntrega: hoyReal });
  pagos.set(reembolsado.pagoId, { ...pagos.get(reembolsado.pagoId)!, status: "refunded", transaction_amount_refunded: TOTAL } as PagoMP);
  pagos.set(parcial.pagoId, { ...pagos.get(parcial.pagoId)!, transaction_amount_refunded: 67_425 } as PagoMP);
  reloj.t = medianocheAR(sumarDias(hoyReal, 31));

  const r = await correrDiario(corrida);

  assert.equal(r.status, 200);
  assert.deepEqual(r.cuerpo.liberados, []);
  const atencion = new Map((r.cuerpo.atencion as { pedido: string; motivo: string }[]).map((a) => [a.pedido, a.motivo]));
  assert.match(atencion.get(cancelado.numero) ?? "", /el pedido está «cancelado» y tiene un crédito pendiente/);
  assert.equal(atencion.get(reembolsado.numero), "reembolsado en Mercado Pago: no queda cobro vigente");
  assert.equal(atencion.get(parcial.numero), "reembolso parcial en Mercado Pago: registrar la devolución");
  for (const c of [cancelado, reembolsado, parcial]) assert.equal((await creditoDe(c)).Estado, "Pendiente", c.numero);
  assert.equal(mails.length, 1);
  assert.match(mails[0].asunto, /0 liberado\(s\), 3 a revisar/);
});

// ---------- Reclamo o contracargo ----------

test("Reclamo o contracargo abierto: no se libera; con la incidencia marcada ni se consulta Mercado Pago; resuelto, se libera", async () => {
  const { corrida, reloj, caso, pagos, cuenta } = armar();
  const hoyReal = fechaArgentina(new Date());
  const reclamo = await caso({ fechaEntrega: hoyReal, pago: { status: "in_mediation" } });
  const contracargo = await caso({ fechaEntrega: hoyReal, pago: { status: "charged_back", status_detail: "in_process" } });
  const marcada = await caso({ fechaEntrega: hoyReal, credito: { Fecha_entrega: hoyReal, Disponible_desde: sumarDias(hoyReal, 30), Incidencia_abierta: true } });
  reloj.t = medianocheAR(sumarDias(hoyReal, 30));

  const r = await correrDiario(corrida);

  assert.deepEqual(r.cuerpo.liberados, []);
  const atencion = new Map((r.cuerpo.atencion as { pedido: string; motivo: string }[]).map((a) => [a.pedido, a.motivo]));
  assert.equal(atencion.get(reclamo.numero), "reclamo o contracargo abierto en Mercado Pago");
  assert.equal(atencion.get(contracargo.numero), "reclamo o contracargo abierto en Mercado Pago");
  assert.equal(atencion.get(marcada.numero), "cumplió los 30 días con una incidencia abierta: se libera cuando Harper la cierre");
  for (const c of [reclamo, contracargo, marcada]) assert.equal((await creditoDe(c)).Estado, "Pendiente", c.numero);
  assert.equal(cuenta.busquedas, 2, "solo se consultó Mercado Pago para los dos sin incidencia marcada");

  // Harper gana el contracargo: al día siguiente se libera.
  pagos.set(contracargo.pagoId, { ...pagos.get(contracargo.pagoId)!, status: "charged_back", status_detail: "reimbursed" } as PagoMP);
  reloj.t += 24 * 3_600_000;
  const r2 = await correrDiario(corrida);
  assert.deepEqual((r2.cuerpo.liberados as { pedido: string }[]).map((l) => l.pedido), [contracargo.numero]);
  assert.equal((await creditoDe(contracargo)).Estado, "Disponible");
  assert.equal((await creditoDe(reclamo)).Estado, "Pendiente");
});

test("La Fecha_entrega cambia después de que el crédito la tomó (antes o durante la corrida): no se libera y decide Harper", async () => {
  const { corrida, diario, reloj, caso } = armar();
  const hoyReal = fechaArgentina(new Date());
  const antes = await caso({ fechaEntrega: sumarDias(hoyReal, 1), credito: { Fecha_entrega: hoyReal, Disponible_desde: sumarDias(hoyReal, 30) } });
  const durante = await caso({ fechaEntrega: hoyReal, credito: { Fecha_entrega: hoyReal, Disponible_desde: sumarDias(hoyReal, 30) } });
  reloj.t = medianocheAR(sumarDias(hoyReal, 31));
  // Harper corrige la fecha de `durante` justo cuando el control ya lo estaba mirando.
  const lector = diario.pedidos;
  let lecturas = 0;
  diario.pedidos = {
    porNumero: async (n) => {
      const pedidos = await lector.porNumero(n);
      if (n === durante.numero && ++lecturas > 1) return pedidos.map((p) => ({ ...p, fechaEntrega: sumarDias(hoyReal, 2) }));
      return pedidos;
    },
  };

  const r = await correrDiario(corrida);

  assert.deepEqual(r.cuerpo.liberados, []);
  const atencion = new Map((r.cuerpo.atencion as { pedido: string; motivo: string }[]).map((a) => [a.pedido, a.motivo]));
  assert.match(atencion.get(antes.numero) ?? "", /no es la que tomó el crédito/);
  assert.match(atencion.get(durante.numero) ?? "", /no es la que tomó el crédito/);
  for (const c of [antes, durante]) {
    const f = await creditoDe(c);
    assert.equal(f.Estado, "Pendiente");
    assert.equal(f.Fecha_entrega, hoyReal, "la primera fecha no se pisa");
  }
});

// ---------- Repetida y simultánea ----------

test("Ejecución repetida: la segunda corrida no cambia nada ni repite el aviso", async () => {
  const { corrida, mails, reloj, caso } = armar();
  const c = await caso({ fechaEntrega: fechaArgentina(new Date()) });
  reloj.t = medianocheAR(sumarDias(c.compra, 30));
  await correrDiario(corrida);
  const despues = await creditoDe(c);
  const escrituras = anotarEscrituras();

  const r2 = await correrDiario(corrida);

  assert.equal(r2.status, 200);
  assert.equal(r2.cuerpo.revisados, 0, "ya no está pendiente");
  assert.deepEqual(r2.cuerpo.liberados, []);
  assert.deepEqual(await creditoDe(c), despues);
  assert.deepEqual(escrituras, []);
  assert.equal(mails.length, 1, "sin nada nuevo, sin mail");
});

test("Ejecución simultánea: dos corridas a la vez liberan una sola vez (cerrojo de la corrida y de cada crédito)", async () => {
  const { corrida, diario, reloj, caso } = armar();
  const a = await caso({ fechaEntrega: fechaArgentina(new Date()) });
  const b = await caso({ fechaEntrega: fechaArgentina(new Date()) });
  reloj.t = medianocheAR(sumarDias(a.compra, 30));

  const juntas = await Promise.all([correrDiario(corrida), correrDiario(corrida)]);
  assert.deepEqual(juntas.map((r) => r.status).sort(), [200, 409]);
  assert.equal(juntas.find((r) => r.status === 409)!.cuerpo.ocupado, true);
  for (const c of [a, b]) {
    const f = await creditoDe(c);
    assert.equal(f.Estado, "Disponible");
    assert.equal(veces(f.Notas, "Disponible: entregado"), 1, `${c.numero}: una sola liberación`);
    assert.equal(veces(f.Notas, "Entrega confirmada"), 1);
  }
  // La llave de la corrida quedó suelta.
  assert.equal(await diario.credito.cerrojo!.tomar(CLAVE_CORRIDA_DIARIA, "otra", 1_000), true);

  // Aunque la llave de la corrida hubiera vencido: dos controles a la vez sobre los mismos créditos.
  const c = await caso({ fechaEntrega: fechaArgentina(new Date()) });
  const dos = await Promise.all([procesarCreditosDelDia(diario), procesarCreditosDelDia(diario)]);
  assert.equal(dos.flatMap((r) => r.liberados).filter((l) => l.pedido === c.numero).length, 1);
  assert.deepEqual(dos.flatMap((r) => r.errores), []);
  const f = await creditoDe(c);
  assert.equal(f.Estado, "Disponible");
  assert.equal(veces(f.Notas, "Disponible: entregado"), 1);
  assert.equal(veces(f.Notas, "Entrega confirmada"), 1);
});

// ---------- Error transitorio de Airtable ----------

test("Error transitorio de Airtable: no libera, lo registra y la próxima corrida lo libera una vez; un crédito con error no frena a los demás", async () => {
  const { corrida, mails, reloj, caso } = armar();
  const a = await caso({ fechaEntrega: fechaArgentina(new Date()) });
  const b = await caso({ fechaEntrega: fechaArgentina(new Date()) });
  reloj.t = medianocheAR(sumarDias(a.compra, 30));

  // Airtable no deja escribir en Créditos.
  interceptar((ruta, { method }) => {
    if (method === "PATCH" && ruta.startsWith(TABLAS.creditos)) throw new RespuestaFixture(503, "Airtable caído");
  });
  const r1 = await correrDiario(corrida);
  assert.equal(r1.status, 500);
  assert.deepEqual((r1.cuerpo.errores as { pedido: string }[]).map((e) => e.pedido), [a.numero, b.numero]);
  assert.deepEqual(r1.cuerpo.liberados, []);
  for (const c of [a, b]) assert.equal((await creditoDe(c)).Estado, "Pendiente");
  assert.match(mails.at(-1)!.texto ?? "", /Errores, se reintenta en la próxima corrida: /);

  // La lectura del pedido falla una vez: ese crédito queda para mañana, el otro sigue.
  interceptar(null);
  let fallas = 1;
  interceptar((ruta, { method }) => {
    if (method === "GET" && ruta.startsWith(TABLAS.pedidos) && fallas-- > 0) throw new RespuestaFixture(503, "Airtable caído");
  });
  const r2 = await correrDiario(corrida);
  assert.deepEqual((r2.cuerpo.errores as { pedido: string }[]).map((e) => e.pedido), [a.numero]);
  assert.deepEqual((r2.cuerpo.liberados as { pedido: string }[]).map((l) => l.pedido), [b.numero]);

  interceptar(null);
  const r3 = await correrDiario(corrida);
  assert.equal(r3.status, 200);
  assert.deepEqual((r3.cuerpo.liberados as { pedido: string }[]).map((l) => l.pedido), [a.numero]);
  for (const c of [a, b]) {
    const f = await creditoDe(c);
    assert.equal(f.Estado, "Disponible");
    assert.equal(veces(f.Notas, "Disponible: entregado"), 1);
  }

  // Si ni siquiera se pueden leer los pendientes: 500, aviso y nada escrito.
  const c = await caso({ fechaEntrega: fechaArgentina(new Date()) });
  interceptar((ruta, { method }) => {
    if (method === "GET" && ruta.startsWith(TABLAS.creditos)) throw new RespuestaFixture(503, "Airtable caído");
  });
  const r4 = await correrDiario(corrida);
  interceptar(null);
  assert.equal(r4.status, 500);
  assert.equal(mails.at(-1)!.asunto, "ALERTA Harper — el control diario del Crédito Harper no pudo correr");
  assert.equal((await creditoDe(c)).Estado, "Pendiente");
});

test("Mercado Pago no contesta antes de liberar: no se libera, queda como error y se reintenta mañana", async () => {
  const { corrida, diario, reloj, caso } = armar();
  const c = await caso({ fechaEntrega: fechaArgentina(new Date()) });
  reloj.t = medianocheAR(sumarDias(c.compra, 30));
  const mp = diario.mp;
  diario.mp = { ...mp, pagosDelPedido: async () => Promise.reject(new Error("Mercado Pago 502")) };
  const r = await correrDiario(corrida);
  assert.equal(r.status, 500);
  assert.equal((await creditoDe(c)).Estado, "Pendiente");
  assert.equal((await creditoDe(c)).Fecha_entrega, c.compra, "la entrega sí quedó anotada");
  diario.mp = mp;
  assert.equal((await correrDiario(corrida)).status, 200);
  assert.equal((await creditoDe(c)).Estado, "Disponible");
});

// ---------- El régimen anterior ----------

test("Régimen anterior: los saldos y el cashback de hoy quedan idénticos; un pedido que volvió a las reglas de hoy no se libera", async () => {
  const { corrida, reloj, caso } = armar();
  const hoyReal = fechaArgentina(new Date());
  // Un pedido de hoy, con su cashback en Saldos y entregado: no tiene Crédito Harper.
  const suscriptor = await createRecord(TABLAS.suscriptores, { Email: "socia@ejemplo.com", Cupon: "Usado" });
  const notasHoy = notasDeBeneficios({ suscriptorId: suscriptor.id, email: "socia@ejemplo.com", cupon: 0, saldoUsado: 0, cashback: 8_091 }).join("\n");
  await createRecord(TABLAS.pedidos, { Numero: "HARPER-ANTERIOR1", Estado: "entregado", Items: ITEMS, Total: TOTAL, Notas: notasHoy, Fecha_entrega: hoyReal });
  await createRecord(TABLAS.saldos, { Suscriptor: [suscriptor.id], Tipo: "Cashback", Monto: 8_091, Pedido: "HARPER-ANTERIOR1", Disponible_desde: sumarDias(hoyReal, 30) });
  await createRecord(TABLAS.saldos, { Suscriptor: [suscriptor.id], Tipo: "Uso", Monto: -2_000, Pedido: "HARPER-ANTERIOR0" });
  // Un crédito cuyo pedido ahora tiene la línea del cashback de hoy (conflicto): gana lo de hoy.
  const conflicto = await caso({ fechaEntrega: hoyReal });
  await updateRecord(TABLAS.pedidos, conflicto.pedidoId, { Notas: `${notasHoy}\n\n${MARCA_REGIMEN_NUEVO}` });
  // Y uno del crédito nuevo, normal.
  const nuevo = await caso({ fechaEntrega: hoyReal });
  reloj.t = medianocheAR(sumarDias(hoyReal, 45));
  type FilaSaldo = { Tipo?: string; Monto?: number; Pedido?: string; Disponible_desde?: string; Anulado?: boolean };
  const leerSaldos = async () => (await listRecords<FilaSaldo>(TABLAS.saldos, { revalidate: 0 })).map((s) => ({ id: s.id, fields: s.fields }));
  const movimientos = (filas: { id: string; fields: FilaSaldo }[]): MovimientoSaldo[] =>
    filas.map((s) => ({
      id: s.id,
      tipo: s.fields.Tipo as MovimientoSaldo["tipo"],
      monto: s.fields.Monto ?? 0,
      pedido: s.fields.Pedido ?? "",
      fecha: "",
      disponibleDesde: s.fields.Disponible_desde ?? null,
      anulado: s.fields.Anulado === true,
    }));
  const saldosAntes = await leerSaldos();
  const escrituras = anotarEscrituras();

  const r = await correrDiario(corrida);

  assert.equal(r.cuerpo.revisados, 2, "solo los pedidos con Crédito Harper");
  assert.deepEqual((r.cuerpo.liberados as { pedido: string }[]).map((l) => l.pedido), [nuevo.numero]);
  assert.deepEqual(r.cuerpo.atencion, [{ pedido: conflicto.numero, motivo: "el pedido ya no figura con las reglas del Crédito Harper (Notas)" }]);
  assert.equal((await creditoDe(conflicto)).Estado, "Pendiente");
  const saldosDespues = await leerSaldos();
  assert.deepEqual(saldosDespues, saldosAntes, "Saldos idéntico");
  assert.deepEqual(saldoDe(movimientos(saldosDespues), sumarDias(hoyReal, 45)), saldoDe(movimientos(saldosAntes), sumarDias(hoyReal, 45)));
  assert.ok(escrituras.every((e) => e === `PATCH ${TABLAS.creditos}`), escrituras.join(", "));
});

// ---------- Zona horaria argentina ----------

test("Cambio de día en Buenos Aires: a las 23:59 del día 29 sigue pendiente; a las 00:00 del día 30 se libera", async () => {
  const { corrida, reloj, caso } = armar();
  const c = await caso({ fechaEntrega: fechaArgentina(new Date()) });
  const libera = sumarDias(c.compra, 30);
  reloj.t = medianocheAR(libera) - 1_000; // 23:59:59 del día 29 en la Argentina; 02:59:59 del día 30 en UTC
  const r1 = await correrDiario(corrida);
  assert.deepEqual(r1.cuerpo.liberados, []);
  assert.deepEqual(r1.cuerpo.esperando, [{ pedido: c.numero, motivo: `disponible desde el ${libera}` }]);
  assert.equal(new Date(reloj.t).toISOString().slice(0, 10), libera, "en UTC ya es el día 30: manda la fecha argentina");
  assert.equal((await creditoDe(c)).Estado, "Pendiente");

  reloj.t = medianocheAR(libera);
  const r2 = await correrDiario(corrida);
  assert.deepEqual((r2.cuerpo.liberados as { pedido: string }[]).map((l) => l.pedido), [c.numero]);
  assert.equal((await creditoDe(c)).Estado, "Disponible");
});

test("Una Fecha_entrega de «mañana» en la Argentina no se usa aunque en UTC ya sea ese día", async () => {
  const { corrida, reloj, caso } = armar();
  const hoyReal = fechaArgentina(new Date());
  const manana = sumarDias(hoyReal, 1);
  const c = await caso({ fechaEntrega: manana });
  reloj.t = medianocheAR(manana) - 60_000; // 23:59 de hoy en Buenos Aires = 02:59 de mañana en UTC
  const r1 = await correrDiario(corrida);
  assert.deepEqual(r1.cuerpo.fechasAnotadas, []);
  assert.match((r1.cuerpo.atencion as { motivo: string }[])[0]?.motivo ?? "", /es posterior a hoy/);
  assert.equal((await creditoDe(c)).Fecha_entrega ?? null, null);

  reloj.t = medianocheAR(manana);
  const r2 = await correrDiario(corrida);
  assert.deepEqual(r2.cuerpo.fechasAnotadas, [{ pedido: c.numero, fechaEntrega: manana, disponibleDesde: sumarDias(manana, 30) }]);
});

test("Las fechas se validan con el día argentino: hoy, mañana y una compra de las 23:30", () => {
  const p = (fechaEntrega: unknown, compra: string): PedidoDelCredito => ({
    id: "recP",
    numero: "HARPER-TZ1",
    estado: "entregado",
    total: TOTAL,
    renglones: [],
    email: null,
    regimen: { regimen: "nuevo", motivo: "marca-nueva" },
    pagoRegistrado: null,
    fechaEntrega,
    compra,
  });
  // 06/11 a las 23:30 en Buenos Aires: en UTC ya es el 07/11.
  const noche = new Date("2026-11-07T02:30:00.000Z");
  const hoy = fechaArgentina(noche);
  assert.equal(hoy, "2026-11-06");
  assert.deepEqual(entregaDelPedido([p("2026-11-06", "2026-11-06")], hoy), { tipo: "entregado", fecha: "2026-11-06" });
  assert.equal(entregaDelPedido([p("2026-11-07", "2026-11-06")], hoy).tipo, "revisar", "el 07/11 todavía es futuro en la Argentina");
  assert.equal(entregaDelPedido([p("2026-11-07", "2026-11-06")], fechaArgentina(new Date("2026-11-07T03:00:00.000Z"))).tipo, "entregado");
  // Una compra del 05/11 a las 23:30 (06/11 en UTC) entregada el 05/11: es del mismo día, no anterior.
  const compra = fechaArgentina(new Date("2026-11-06T02:30:00.000Z"));
  assert.equal(compra, "2026-11-05");
  assert.equal(entregaDelPedido([p("2026-11-05", compra)], hoy).tipo, "entregado");
  assert.equal(entregaDelPedido([p("2026-11-04", compra)], hoy).tipo, "revisar");
  // Formatos que no son una fecha sin hora: no se usan.
  for (const rara of ["2026-11-06T10:00:00.000Z", "06/11/2026", "2026-02-30", 20261106, true]) {
    assert.equal(entregaDelPedido([p(rara, "2026-11-01")], hoy).tipo, "revisar", String(rara));
  }
  // Dos pedidos con el mismo número, o ninguno: no se elige uno.
  assert.equal(entregaDelPedido([p("2026-11-06", "2026-11-01"), p("2026-11-06", "2026-11-01")], hoy).tipo, "revisar");
  assert.equal(entregaDelPedido([], hoy).tipo, "revisar");
});

test("El lector de Pedidos toma el día de la compra en la Argentina y no confunde números parecidos", async () => {
  const fila = await createRecord(TABLAS.pedidos, { Numero: "HARPER-LECT1", Estado: "entregado", Items: ITEMS, Total: TOTAL, Notas: MARCA_REGIMEN_NUEVO, Fecha_entrega: "2026-11-06" });
  await createRecord(TABLAS.pedidos, { Numero: "HARPER-LECT10", Estado: "pagado", Items: ITEMS, Total: TOTAL, Notas: MARCA_REGIMEN_NUEVO });
  const [p, ...resto] = await lectorPedidosPorNumeroAirtable.porNumero("HARPER-LECT1");
  assert.deepEqual(resto, []);
  assert.equal(p.compra, fechaArgentina(new Date(fila.createdTime)));
  assert.equal(p.fechaEntrega, "2026-11-06");
  assert.equal(p.total, TOTAL);
  assert.equal(p.regimen.regimen, "nuevo");
});

// ---------- Protecciones de la ruta ----------

test("Solo el cron de Vercel con CRON_SECRET; sin el secreto no entra nadie, y SYNC_TOKEN no sirve", () => {
  assert.equal(cronAutorizado("Bearer secreto-de-prueba", undefined), false, "sin CRON_SECRET");
  assert.equal(cronAutorizado(null, "secreto-de-prueba"), false);
  assert.equal(cronAutorizado("secreto-de-prueba", "secreto-de-prueba"), false, "sin Bearer");
  assert.equal(cronAutorizado("Bearer secreto-de-prueb", "secreto-de-prueba"), false);
  assert.equal(cronAutorizado("Bearer secreto-de-prueba", "secreto-de-prueba"), true);
  process.env.SYNC_TOKEN = "sync-de-prueba";
  try {
    assert.equal(cronAutorizado("Bearer sync-de-prueba"), false);
  } finally {
    delete process.env.SYNC_TOKEN;
  }
  assert.equal(controlDiarioActivo(), false, "en las pruebas, el interruptor está apagado");
});

test("Prendido sin MP_ACCESS_TOKEN o sin Redis: 503, aviso a Harper y ningún crédito tocado", async () => {
  process.env.HARPER_CREDITO_ACTIVO = "1";
  try {
    const reales = dependenciasCorridaReales();
    assert.deepEqual(reales.diario, { sinConfigurar: ["MP_ACCESS_TOKEN", "Redis (cerrojo)"] });
  } finally {
    delete process.env.HARPER_CREDITO_ACTIVO;
  }
  const { corrida, mails, caso, reloj } = armar();
  const c = await caso({ fechaEntrega: fechaArgentina(new Date()) });
  reloj.t = medianocheAR(sumarDias(c.compra, 30));
  const r = await correrDiario({ ...corrida, diario: { sinConfigurar: ["MP_ACCESS_TOKEN"] } });
  assert.equal(r.status, 503);
  assert.equal(mails.length, 1);
  assert.equal(mails[0].asunto, "ALERTA Harper — control diario del Crédito Harper sin configurar: falta MP_ACCESS_TOKEN");
  assert.equal((await creditoDe(c)).Estado, "Pendiente");
  assert.equal((await creditoDe(c)).Fecha_entrega ?? null, null);
});

test("Si el aviso de la corrida no sale, la respuesta es 500 (el registro no se pierde en silencio)", async () => {
  const { corrida, reloj, caso } = armar();
  const c = await caso({ fechaEntrega: fechaArgentina(new Date()) });
  reloj.t = medianocheAR(sumarDias(c.compra, 30));
  const r = await correrDiario({ ...corrida, enviarMail: async () => false });
  assert.equal(r.status, 500);
  assert.equal(r.cuerpo.avisoEnviado, false);
  assert.equal((await creditoDe(c)).Estado, "Disponible", "lo liberado queda liberado: el resumen está en la respuesta y el log");
});

test("liberarDisponibles sigue igual: libera lo que cumple en la tabla, sin consultar afuera", async () => {
  const { diario, reloj, caso } = armar();
  const hoyReal = fechaArgentina(new Date());
  const c = await caso({ credito: { Fecha_entrega: hoyReal, Disponible_desde: sumarDias(hoyReal, 30) } });
  reloj.t = medianocheAR(sumarDias(hoyReal, 30));
  assert.deepEqual(await liberarDisponibles(diario.credito), { liberados: [c.numero], ocupados: [] });
  assert.equal((await creditoDe(c)).Estado, "Disponible");
  assert.deepEqual(await liberarDisponibles(diario.credito), { liberados: [], ocupados: [] });
});
