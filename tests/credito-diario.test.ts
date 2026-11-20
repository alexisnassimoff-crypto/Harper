import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

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
import { precio } from "../lib/formato";
import { creditosDisponibles, dependenciasCredito, filaDelRegistro, type CamposCredito } from "../lib/credito-airtable";
import {
  avisosPorMail,
  CLAVE_CORRIDA_DIARIA,
  controlDiarioActivo,
  correrDiario,
  cronAutorizado,
  DIAS_AVISO_VENCIMIENTO,
  DIAS_REINTENTO_AVISO_DISPONIBLE,
  dependenciasCorridaReales,
  entregaDelPedido,
  lectorPedidosPorNumeroAirtable,
  MARCA_AVISO_DISPONIBLE,
  MARCA_AVISO_DISPONIBLE_FALLIDO,
  MARCA_AVISO_VENCIMIENTO,
  procesarCreditosDelDia,
  type AvisoDisponible,
  type AvisoPorVencer,
  type AvisosCredito,
  type DependenciasCorrida,
  type DependenciasDiario,
  type PedidoDelCredito,
} from "../lib/credito-diario";
import { DIAS_AVISO_VENCIMIENTO as DIAS_AVISO_DEL_MOTOR, venceEl } from "../lib/credito-harper";
import { almacenUsosAirtable, anotarEnUso, claveDelUso, leerSaldoDeCredito, lectorPedidosDeUsosAirtable, usosDevueltos } from "../lib/credito-uso";
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
  assert.equal(f.Disponible_desde, libera, "liberado el día previsto: la fecha no cambia");
  // Ale, 18/11/2026: vence a los 6 meses de calendario de ese día, y la nota lo dice.
  assert.match(f.Notas ?? "", new RegExp(`Vence el ${venceEl(libera)} \\(6 meses desde que quedó disponible\\)\\.`));
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
  // Se liberó un día después del previsto (Ale, 18/11/2026): Disponible_desde
  // pasa a ser el día real, y los 6 meses corren desde ahí.
  const tarde = await creditoDe(contracargo);
  assert.equal(tarde.Disponible_desde, sumarDias(hoyReal, 31));
  assert.match(tarde.Notas ?? "", new RegExp(`Liberado el ${sumarDias(hoyReal, 31)}, después del día previsto \\(${sumarDias(hoyReal, 30)}\\)`));
  assert.match(tarde.Notas ?? "", new RegExp(`Vence el ${venceEl(sumarDias(hoyReal, 31))} `));
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

// ---------- Los avisos al comprador (Ale, 18/11/2026) ----------
//
// «Orienta a que vuelvan a comprar con el Cashback»: quien compra se tiene que
// enterar por mail cuando su crédito queda disponible y poco antes de que
// venza. El control diario manda cada aviso una sola vez por crédito (la
// marca queda en sus Notas) y solo con HARPER_CREDITO_ACTIVO=1. Acá los mails
// son de mentira: se anotan.

type Enviado = { aviso: "disponible"; datos: AvisoDisponible } | { aviso: "vencimiento"; datos: AvisoPorVencer };

/** Los avisos de mentira: anotan lo que se mandaría; los pedidos de `fallan` tiran, como un Resend caído. */
function avisosDePrueba(fallan = new Set<string>()) {
  const enviados: Enviado[] = [];
  const avisos: AvisosCredito = {
    async disponible(datos) {
      enviados.push({ aviso: "disponible", datos });
      if (fallan.has(datos.pedido)) throw new Error(`Resend 500 para ${datos.email}`);
    },
    async porVencer(datos) {
      enviados.push({ aviso: "vencimiento", datos });
      if (fallan.has(datos.pedido)) throw new Error(`Resend 500 para ${datos.email}`);
    },
  };
  return { enviados, avisos };
}

/** El control con lo que usa para los avisos (los créditos disponibles y lo que puede usar cada cuenta), con el reloj de la prueba. */
function conAvisos(diario: DependenciasDiario, reloj: { t: number }, avisos: AvisosCredito): DependenciasDiario {
  const uso = { almacen: almacenUsosAirtable, pedidos: lectorPedidosDeUsosAirtable, reloj: { ahora: () => reloj.t, dormir: async () => {} } };
  return { ...diario, cuentas: { disponibles: creditosDisponibles, saldo: (email) => leerSaldoDeCredito(email, uso) }, avisos };
}

let numeroAviso = 0;
/** Un crédito ya «Disponible» desde `desde`; null, sin la fecha (como una edición a mano). */
async function disponibleDesde(desde: string | null, o: { email?: string; monto?: number; incidencia?: boolean } = {}) {
  const n = ++numeroAviso;
  const pedido = `HARPER-AV${n}`;
  const email = o.email ?? `comprador${n}@ejemplo.com`;
  const fila = await createRecord<CamposCredito>(TABLAS.creditos, {
    Clave: `credito-harper:${pedido}`,
    Pedido: pedido,
    Email: email,
    Monto: o.monto ?? 4_495,
    Porcentaje: 5,
    Base: 89_900,
    Anteojos: 1,
    Estado: "Disponible",
    Generado_el: "2026-10-01T12:00:00.000Z",
    Reglas: "credito-harper-v1",
    Notas: "",
    ...(desde ? { Disponible_desde: desde } : {}),
    ...(o.incidencia ? { Incidencia_abierta: true } : {}),
  });
  return { pedido, email, id: fila.id };
}
async function usoDeLaCuenta(email: string, numero: string, monto: number | null, generadoEl: string) {
  return createRecord<CamposCredito>(TABLAS.creditos, {
    Clave: claveDelUso(numero),
    Pedido: numero,
    Email: email,
    ...(monto === null ? {} : { Monto: monto }),
    Porcentaje: 0,
    Base: 0,
    Anteojos: 0,
    Estado: "Usado",
    Generado_el: generadoEl,
    Reglas: "uso-credito-harper-v1",
    Notas: "",
  });
}
const notasDe = async (id: string) => (await getRecord<CamposCredito>(TABLAS.creditos, id)).fields.Notas ?? "";
/** 10:00 de ese día en Buenos Aires. */
const alas10 = (dia: string) => new Date(`${dia}T13:00:00.000Z`).getTime();
const porPedido = <T extends { pedido: string }>(lista: readonly T[], campos: (x: T) => unknown) => Object.fromEntries(lista.map((x) => [x.pedido, campos(x)]));

async function prendido<T>(hacer: () => Promise<T>): Promise<T> {
  process.env.HARPER_CREDITO_ACTIVO = "1";
  try {
    return await hacer();
  } finally {
    delete process.env.HARPER_CREDITO_ACTIVO;
  }
}

test("Avisos al comprador: «ya podés usarlo» y «por vencer» salen una vez por crédito, con lo que queda y su fecha; otra corrida no los repite", async () => {
  const { diario, reloj, caso } = armar();
  const hoy = "2027-05-10";
  reloj.t = alas10(hoy);
  // Uno que el control libera hoy (entregado hace 30 días) y uno que ya figuraba disponible desde hoy.
  const liberado = await caso({ fechaEntrega: sumarDias(hoy, -30) });
  const deHoy = await disponibleDesde(hoy);
  // Por vencer: en 10 días, en 15 (el límite) y hoy (todavía se puede usar hoy).
  assert.equal(DIAS_AVISO_VENCIMIENTO, 15);
  // El número vive en el motor (los números publicados) y el control usa ese mismo.
  assert.equal(DIAS_AVISO_VENCIMIENTO, DIAS_AVISO_DEL_MOTOR);
  const enDiez = await disponibleDesde("2026-11-20"); // vence 2027-05-20
  const enQuince = await disponibleDesde("2026-11-25"); // vence 2027-05-25
  const venceHoy = await disponibleDesde("2026-11-10"); // vence 2027-05-10
  // Sin aviso: vence en 16 días, en dos meses, o venció ayer.
  const enDieciseis = await disponibleDesde("2026-11-26"); // vence 2027-05-26
  const lejos = await disponibleDesde("2027-01-20");
  const vencido = await disponibleDesde("2026-11-09"); // venció el 2027-05-09

  const { enviados, avisos } = avisosDePrueba();
  const deps = conAvisos(diario, reloj, avisos);
  await prendido(async () => {
    const r1 = await procesarCreditosDelDia(deps);
    assert.deepEqual(r1.liberados.map((l) => l.pedido), [liberado.numero]);
    const de = (aviso: Enviado["aviso"]) => enviados.filter((e) => e.aviso === aviso).map((e) => e.datos);
    assert.deepEqual(
      porPedido(de("disponible") as AvisoDisponible[], (d) => d),
      {
        [liberado.numero]: { email: "cliente@ejemplo.com", pedido: liberado.numero, monto: MONTO, disponibleDesde: hoy, venceEl: "2027-11-10" },
        [deHoy.pedido]: { email: deHoy.email, pedido: deHoy.pedido, monto: 4_495, disponibleDesde: hoy, venceEl: "2027-11-10" },
      },
      "al mail de la compra, con lo que puede usar y hasta cuándo"
    );
    assert.deepEqual(porPedido(de("vencimiento") as AvisoPorVencer[], (d) => [d.email, d.monto, d.venceEl, d.dias]), {
      [enDiez.pedido]: [enDiez.email, 4_495, "2027-05-20", 10],
      [enQuince.pedido]: [enQuince.email, 4_495, "2027-05-25", 15],
      [venceHoy.pedido]: [venceHoy.email, 4_495, "2027-05-10", 0],
    });
    assert.equal(r1.avisosEnviados.length, 5);
    assert.deepEqual(r1.avisosFallidos, []);
    // La marca en las Notas de cada uno, y en los demás nada.
    assert.match(await notasDe(liberado.creditoId), new RegExp(`${MARCA_AVISO_DISPONIBLE} ${hoy}`));
    assert.match(await notasDe(deHoy.id), new RegExp(`${MARCA_AVISO_DISPONIBLE} ${hoy}`));
    for (const c of [enDiez, enQuince, venceHoy]) assert.match(await notasDe(c.id), new RegExp(`${MARCA_AVISO_VENCIMIENTO} ${hoy}`), c.pedido);
    for (const c of [enDieciseis, lejos, vencido]) assert.equal(await notasDe(c.id), "", c.pedido);

    // Otra corrida el mismo día (un reintento del cron): nada se repite.
    enviados.length = 0;
    const r2 = await procesarCreditosDelDia(deps);
    assert.equal(enviados.length, 0);
    assert.deepEqual([r2.disponiblesHoy, r2.porVencer, r2.avisosEnviados], [[], [], []]);

    // Al día siguiente: solo el que entró a los 15 días. El que vencía ayer ya no se avisa.
    reloj.t = alas10(sumarDias(hoy, 1));
    await procesarCreditosDelDia(deps);
    assert.deepEqual(
      enviados.map((e) => [e.aviso, e.datos.pedido, e.aviso === "vencimiento" ? e.datos.dias : null]),
      [["vencimiento", enDieciseis.pedido, 15]]
    );
    // Cada marca, una sola vez.
    assert.equal(veces(await notasDe(deHoy.id), MARCA_AVISO_DISPONIBLE), 1);
    assert.equal(veces(await notasDe(enDiez.id), MARCA_AVISO_VENCIMIENTO), 1);
    assert.equal(veces(await notasDe(liberado.creditoId), MARCA_AVISO_DISPONIBLE), 1);
  });
});

test("Con HARPER_CREDITO_ACTIVO apagado no sale ningún aviso ni queda ninguna marca, y la ruta contesta antes de armar el control", async () => {
  const { diario, reloj } = armar();
  const hoy = "2027-05-10";
  reloj.t = alas10(hoy);
  const deHoy = await disponibleDesde(hoy);
  const porVencer = await disponibleDesde("2026-11-20");
  const { enviados, avisos } = avisosDePrueba();
  const escrituras = anotarEscrituras();

  const r = await procesarCreditosDelDia(conAvisos(diario, reloj, avisos));

  assert.deepEqual(enviados, [], "ningún mail al comprador");
  assert.deepEqual(r.avisosEnviados, []);
  assert.deepEqual(escrituras, [], "ni una marca en Notas");
  for (const c of [deHoy, porVencer]) assert.equal(await notasDe(c.id), "");
  // Lo que se habría avisado queda solo en el resumen, sin mails.
  assert.deepEqual(r.disponiblesHoy.map((d) => d.pedido), [deHoy.pedido]);
  assert.deepEqual(r.porVencer.map((d) => d.pedido), [porVencer.pedido]);
  // La ruta: sin el interruptor contesta «apagado» antes de armar las dependencias (y los mails).
  assert.equal(controlDiarioActivo(), false);
  const ruta = fs.readFileSync(path.resolve(__dirname, "..", "..", "app", "api", "credito", "diario", "route.ts"), "utf8");
  const apagado = ruta.indexOf("if (!controlDiarioActivo()) {");
  assert.ok(apagado > 0 && apagado < ruta.indexOf("dependenciasCorridaReales()") && apagado < ruta.indexOf("correrDiario("));
  assert.match(ruta.slice(apagado), /^if \(!controlDiarioActivo\(\)\) \{\s*return NextResponse\.json\(\{ ok: true, apagado: true,/);
});

test("Un aviso que no sale: queda anotado que hoy no salió, se reintenta al día siguiente (hasta 7 días) y nunca deshace la liberación; ni la respuesta ni el resumen llevan mails de compradores", async () => {
  const { diario, corrida, mails, reloj, caso } = armar();
  const hoy = "2027-05-10";
  reloj.t = alas10(hoy);
  const liberado = await caso({ fechaEntrega: sumarDias(hoy, -30) });
  const falla = await disponibleDesde(hoy, { email: "falla@ejemplo.com" });
  // Disponible hace 6 días sin aviso (por ejemplo, el control no corrió): todavía se avisa. Hace 7, ya no.
  assert.equal(DIAS_REINTENTO_AVISO_DISPONIBLE, 7);
  const haceSeis = await disponibleDesde(sumarDias(hoy, -6));
  const haceSiete = await disponibleDesde(sumarDias(hoy, -7));
  const { enviados, avisos } = avisosDePrueba(new Set([falla.pedido, liberado.numero]));
  const deps = conAvisos(diario, reloj, avisos);

  await prendido(async () => {
    const r1 = await correrDiario({ ...corrida, diario: deps });
    assert.equal(r1.status, 200, "un aviso que no sale no hace fallar la corrida");
    assert.equal((await creditoDe(liberado)).Estado, "Disponible", "lo liberado queda liberado");
    assert.deepEqual(new Set(enviados.map((e) => e.datos.pedido)), new Set([liberado.numero, falla.pedido, haceSeis.pedido]));
    assert.ok(!enviados.some((e) => e.datos.pedido === haceSiete.pedido), "fuera de los 7 días");
    const fallidos = r1.cuerpo.avisosFallidos as { pedido: string; aviso: string; error: string }[];
    assert.deepEqual(new Set(fallidos.map((f) => f.pedido)), new Set([falla.pedido, liberado.numero]));
    for (const f of fallidos) assert.equal(f.error, "Resend 500 para (mail)", "sin el mail del comprador");
    assert.match(await notasDe(falla.id), new RegExp(`${MARCA_AVISO_DISPONIBLE_FALLIDO} ${hoy} \\(Resend 500 para \\(mail\\)\\)`));
    assert.doesNotMatch(await notasDe(falla.id), /falla@ejemplo\.com/);
    assert.match(await notasDe(haceSeis.id), new RegExp(`${MARCA_AVISO_DISPONIBLE} ${hoy}`));
    // La respuesta de la ruta y el resumen a Harper: sin mails de compradores.
    assert.doesNotMatch(JSON.stringify(r1.cuerpo), /@/);
    assert.equal(mails.length, 1);
    assert.doesNotMatch(`${mails[0].asunto} ${mails[0].texto}`, /falla@|cliente@|comprador\d+@/);
    assert.match(mails[0].texto ?? "", /Avisos al comprador enviados: 1 de crédito disponible y 0 de vencimiento\./);
    assert.match(mails[0].texto ?? "", /Avisos al comprador que no salieron \(se reintentan desde mañana\):/);

    // El mismo día no se reintenta.
    enviados.length = 0;
    await procesarCreditosDelDia(deps);
    assert.equal(enviados.length, 0);
    // Al día siguiente, con el envío andando: salen los dos que fallaron, y nada más.
    const bien = avisosDePrueba();
    reloj.t = alas10(sumarDias(hoy, 1));
    await procesarCreditosDelDia(conAvisos(diario, reloj, bien.avisos));
    assert.deepEqual(new Set(bien.enviados.map((e) => e.datos.pedido)), new Set([falla.pedido, liberado.numero]));
    assert.match(await notasDe(falla.id), new RegExp(`${MARCA_AVISO_DISPONIBLE} ${sumarDias(hoy, 1)}`));
    // Y después ya no.
    bien.enviados.length = 0;
    reloj.t = alas10(sumarDias(hoy, 2));
    await procesarCreditosDelDia(conAvisos(diario, reloj, bien.avisos));
    assert.deepEqual(bien.enviados, []);
  });
});

test("Un «Disponible» sin Disponible_desde (editado a mano) no vence ni se avisa: va al resumen a Harper para que le ponga la fecha", async () => {
  const { diario, corrida, mails, reloj } = armar();
  reloj.t = alas10("2027-05-10");
  const sinFecha = await disponibleDesde(null, { email: "amano@ejemplo.com", monto: 2_000 });
  const { enviados, avisos } = avisosDePrueba();
  await prendido(async () => {
    const r = await correrDiario({ ...corrida, diario: conAvisos(diario, reloj, avisos) });
    assert.equal(r.status, 200);
    assert.deepEqual(r.cuerpo.sinFecha, [sinFecha.pedido]);
    assert.deepEqual(enviados, []);
    assert.equal(mails.length, 1, "hay algo que contarle a Harper");
    assert.match(mails[0].texto ?? "", new RegExp(`Disponibles sin Disponible_desde: no vencen hasta que tengan fecha\\. Revisalos en Créditos: ${sinFecha.pedido}\\.`));
    assert.doesNotMatch(mails[0].texto ?? "", /amano@/);
  });
  // Y la cuenta lo puede usar, años después: no vence.
  const saldo = await leerSaldoDeCredito("amano@ejemplo.com", { almacen: almacenUsosAirtable, pedidos: lectorPedidosDeUsosAirtable, reloj: { ahora: () => alas10("2030-01-01"), dormir: async () => {} } });
  assert.deepEqual([saldo.usable, saldo.vencido, saldo.proximoVencimiento], [2_000, 0, null]);
});

test("Los avisos dicen lo que de verdad queda: el usado entero no recibe «por vencer», el usado en parte avisa el resto; ni retenido ni con la cuenta bloqueada", async () => {
  const { diario, reloj } = armar();
  const hoy = "2027-05-10";
  reloj.t = alas10(hoy);
  // Todos vencen el 2027-05-20, en 10 días.
  const entero = await disponibleDesde("2026-11-20", { email: "entero@ejemplo.com", monto: 4_495 });
  await usoDeLaCuenta("entero@ejemplo.com", "HARPER-COMPRA-E", 4_495, "2027-01-05T12:00:00.000Z");
  const parte = await disponibleDesde("2026-11-20", { email: "parte@ejemplo.com", monto: 15_733 });
  await usoDeLaCuenta("parte@ejemplo.com", "HARPER-COMPRA-P", 10_000, "2027-01-05T12:00:00.000Z");
  const retenido = await disponibleDesde("2026-11-20", { email: "retenido@ejemplo.com", incidencia: true });
  const bloqueado = await disponibleDesde("2026-11-20", { email: "bloqueado@ejemplo.com" });
  await usoDeLaCuenta("bloqueado@ejemplo.com", "HARPER-RARO", null, "2027-01-05T12:00:00.000Z"); // un uso editado a mano, sin monto
  const { enviados, avisos } = avisosDePrueba();

  await prendido(async () => {
    await procesarCreditosDelDia(conAvisos(diario, reloj, avisos));
  });

  assert.deepEqual(
    enviados.map((e) => [e.aviso, e.datos.pedido, e.datos.monto]),
    [["vencimiento", parte.pedido, 15_733 - 10_000]],
    "solo lo que se pierde si no lo usa"
  );
  for (const c of [entero, retenido, bloqueado]) assert.equal(await notasDe(c.id), "", c.pedido);
});

test("El mail salió pero la marca no se pudo dejar (otra instancia tenía el crédito): se avisa a Harper de que puede repetirse", async () => {
  const { diario, reloj } = armar();
  const hoy = "2027-05-10";
  reloj.t = alas10(hoy);
  const c = await disponibleDesde(hoy);
  const tomada = await diario.credito.cerrojo!.tomar(`harper:credito:${c.pedido}`, "otra-instancia", 60_000);
  assert.equal(tomada, true);
  const { enviados, avisos } = avisosDePrueba();
  const r = await prendido(() => procesarCreditosDelDia(conAvisos(diario, reloj, avisos)));
  assert.deepEqual(enviados.map((e) => e.datos.pedido), [c.pedido]);
  assert.deepEqual(r.avisosEnviados, [{ pedido: c.pedido, aviso: "disponible" }]);
  assert.equal(r.avisosFallidos.length, 1);
  assert.match(r.avisosFallidos[0].error, /^el mail salió, pero no quedó la marca en Notas \(.*\): puede repetirse mañana$/);
  assert.equal(await notasDe(c.id), "");
});

// ---------- El crédito devuelto también avisa antes de vencer (20/11/2026) ----------

/** Un uso «Devuelto» (la compra se reembolsó entera), con su día en Disponible_desde (null: marcado a mano sin fecha). */
async function usoDevuelto(email: string, numero: string, monto: number, generadoEl: string, desde: string | null) {
  return createRecord<CamposCredito>(TABLAS.creditos, {
    Clave: claveDelUso(numero),
    Pedido: numero,
    Email: email,
    Monto: monto,
    Porcentaje: 0,
    Base: 0,
    Anteojos: 0,
    Estado: "Devuelto",
    Generado_el: generadoEl,
    ...(desde ? { Disponible_desde: desde } : {}),
    Reglas: "uso-credito-harper-v1",
    Notas: "",
  });
}

/** Como `conAvisos`, con el crédito devuelto: se lee de la tabla y la marca va en el uso, con el cerrojo de la cuenta. */
function conDevueltos(diario: DependenciasDiario, reloj: { t: number }, avisos: AvisosCredito): DependenciasDiario {
  const uso = { almacen: almacenUsosAirtable, pedidos: lectorPedidosDeUsosAirtable, cerrojo: diario.credito.cerrojo, reloj: { ahora: () => reloj.t, dormir: async () => {} } };
  return { ...conAvisos(diario, reloj, avisos), devueltos: { leer: usosDevueltos, anotar: (fila, texto) => anotarEnUso(fila, texto, uso) } };
}

test("Crédito devuelto: recibe el aviso de «por vencer» con lo que le queda (marcado en su uso, una sola vez); el «ya disponible» no; sin fecha o ya usado, nada", async () => {
  const { diario, reloj } = armar();
  const hoy = "2027-05-10";
  reloj.t = alas10(hoy);
  // Cada cuenta: el crédito que ganó (ya vencido, usado entero) y la compra en que lo usó, reembolsada entera.
  const deUna = async (email: string, numero: string, desde: string | null) => {
    await disponibleDesde("2026-05-01", { email }); // vence 2026-11-01
    return usoDevuelto(email, numero, 4_495, "2026-10-25T15:00:00.000Z", desde);
  };
  const porVencer = await deUna("devuelto@ejemplo.com", "HARPER-DEV1", "2026-11-20"); // vuelve el 20/11, vence el 20/05/2027: en 10 días
  const sinFecha = await deUna("amano@ejemplo.com", "HARPER-DEV2", null); // marcado a mano sin fecha: no vence
  const reusado = await deUna("reusado@ejemplo.com", "HARPER-DEV3", "2026-11-20");
  await usoDeLaCuenta("reusado@ejemplo.com", "HARPER-DEV3-RECOMPRA", 4_495, "2026-12-01T15:00:00.000Z"); // ya lo volvió a usar entero
  const lejos = await deUna("lejos@ejemplo.com", "HARPER-DEV4", "2027-01-20"); // vence en julio
  const { enviados, avisos } = avisosDePrueba();
  const deps = conDevueltos(diario, reloj, avisos);

  await prendido(async () => {
    const r1 = await procesarCreditosDelDia(deps);
    assert.deepEqual(
      enviados.map((e) => [e.aviso, e.datos]),
      [["vencimiento", { email: "devuelto@ejemplo.com", pedido: "HARPER-DEV1", monto: 4_495, venceEl: "2027-05-20", dias: 10, devuelto: true }]],
      "solo el devuelto con algo sin usar que vence en 15 días o menos"
    );
    assert.deepEqual(r1.disponiblesHoy, [], "el «ya disponible» no es para el crédito devuelto");
    assert.deepEqual(r1.avisosEnviados, [{ pedido: "HARPER-DEV1", aviso: "vencimiento" }]);
    assert.deepEqual(r1.avisosFallidos, []);
    // La marca queda en las Notas del uso; en los demás, nada.
    assert.match(await notasDe(porVencer.id), new RegExp(`${MARCA_AVISO_VENCIMIENTO} ${hoy}`));
    for (const f of [sinFecha, reusado, lejos]) assert.equal(await notasDe(f.id), "");
    assert.equal((await getRecord<CamposCredito>(TABLAS.creditos, porVencer.id)).fields.Estado, "Devuelto", "la marca no cambia el estado");

    // Otra corrida el mismo día, y al día siguiente: no se repite.
    enviados.length = 0;
    await procesarCreditosDelDia(deps);
    reloj.t = alas10(sumarDias(hoy, 1));
    await procesarCreditosDelDia(deps);
    assert.deepEqual(enviados, []);
    assert.equal(veces(await notasDe(porVencer.id), MARCA_AVISO_VENCIMIENTO), 1);
  });
  // Sin `devueltos` (como antes), el control no los mira.
  const solo = avisosDePrueba();
  reloj.t = alas10(hoy);
  await prendido(() => procesarCreditosDelDia(conAvisos(diario, reloj, solo.avisos)));
  assert.deepEqual(solo.enviados, []);
});

test("El mail de «por vencer» de un crédito devuelto no dice «Lo sumaste con tu pedido»", async () => {
  const enviados: { text: string }[] = [];
  const fetchOriginal = globalThis.fetch;
  process.env.RESEND_API_KEY = "clave-de-prueba";
  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    if (String(url) !== "https://api.resend.com/emails") throw new Error(`sin red en las pruebas: ${String(url)}`);
    enviados.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ id: "re_prueba" }), { status: 200 });
  }) as typeof fetch;
  try {
    const datos = { email: "compradora@ejemplo.com", pedido: "HARPER-AVISO2", monto: 4_495, venceEl: "2027-05-20", dias: 10 };
    await avisosPorMail.porVencer(datos);
    await avisosPorMail.porVencer({ ...datos, devuelto: true });
  } finally {
    globalThis.fetch = fetchOriginal;
    delete process.env.RESEND_API_KEY;
  }
  assert.match(enviados[0].text, /Lo sumaste con tu pedido HARPER-AVISO2\./);
  assert.doesNotMatch(enviados[1].text, /Lo sumaste con tu pedido/);
  assert.match(enviados[1].text, /Tenés \$\s4\.495 de Crédito Harper que vence el 20\/05\/2027\./);
});

test("Los avisos de verdad (avisosPorMail): van al mail de la compra con las plantillas de lib/mails.ts; sin mails configurados, cuentan como no enviados", async () => {
  const datos = { email: "compradora@ejemplo.com", pedido: "HARPER-AVISO1", monto: 4_495, disponibleDesde: "2026-10-31", venceEl: "2027-04-30" };
  // Sin RESEND_API_KEY: tira, y el control lo anota como un aviso que no salió.
  delete process.env.RESEND_API_KEY;
  await assert.rejects(avisosPorMail.disponible(datos), /RESEND_API_KEY sin configurar/);
  await assert.rejects(avisosPorMail.porVencer({ ...datos, dias: 3 }), /RESEND_API_KEY sin configurar/);
  // Con un Resend de mentira (nada sale a la red): lo que se mandaría.
  const enviados: { to: string[]; subject: string; text: string; html: string }[] = [];
  const fetchOriginal = globalThis.fetch;
  process.env.RESEND_API_KEY = "clave-de-prueba";
  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    if (String(url) !== "https://api.resend.com/emails") throw new Error(`sin red en las pruebas: ${String(url)}`);
    enviados.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ id: "re_prueba" }), { status: 200 });
  }) as typeof fetch;
  try {
    await avisosPorMail.disponible(datos);
    await avisosPorMail.porVencer({ email: datos.email, pedido: datos.pedido, monto: 1_200, venceEl: "2027-04-30", dias: 3 });
  } finally {
    globalThis.fetch = fetchOriginal;
    delete process.env.RESEND_API_KEY;
  }
  assert.deepEqual(enviados.map((m) => [m.to, m.subject]), [
    [["compradora@ejemplo.com"], `Ya podés usar tu Crédito Harper: ${precio(4_495)}`],
    [["compradora@ejemplo.com"], "Tu Crédito Harper vence el 30/04/2027"],
  ]);
  assert.match(enviados[0].text, /Tu Crédito Harper de \$\s4\.495 ya está disponible para tu próxima compra de anteojos\. Vence el 30\/04\/2027\./);
  assert.match(enviados[1].text, /Tenés \$\s1\.200 de Crédito Harper que vence el 30\/04\/2027\. Usalo en tu próxima compra de anteojos hasta ese día inclusive\./);
  for (const m of enviados) assert.match(m.html, /\/anteojos"/);
});
