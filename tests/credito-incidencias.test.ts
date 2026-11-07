import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// Crédito Harper, paso 5: devoluciones e incidencias (lib/credito-incidencias.ts).
// Todo contra el Airtable en memoria y un Redis en memoria: nada toca
// pedidos, compradores ni créditos reales, y no sale ningún mail.
process.env.HARPER_FIXTURES = "1";
delete process.env.VERCEL;
delete process.env.HARPER_DUO_ACTIVO;
delete process.env.HARPER_CREDITO_ACTIVO;
for (const v of ["KV_REST_API_URL", "KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "MP_ACCESS_TOKEN"]) delete process.env[v];

import { createRecord, getRecord, listRecords, TABLAS, updateRecord } from "../lib/airtable";
import { normalizarSolicitud } from "../lib/arrepentimiento";
import { registrarArrepentimiento } from "../lib/arrepentimiento-servidor";
import type { Cerrojo } from "../lib/cerrojo";
import type { ConfigTienda } from "../lib/config";
import { almacenAirtable, dependenciasCredito, type CamposCredito } from "../lib/credito-airtable";
import { billeteraDeCredito } from "../lib/credito-cuenta";
import { dependenciasIncidenciaReales, incidenciaPorArrepentimiento, vincularArrepentimiento, type DependenciasIncidencia } from "../lib/credito-incidencias";
import { procesarCreditosDelDia, lectorPedidosPorNumeroAirtable } from "../lib/credito-diario";
import { lectorPedidosAirtable, MARCA_REGIMEN_NUEVO, pagoDe, procesarPagoParaCredito, type DependenciasPagoCredito, type LectorMercadoPago } from "../lib/credito-pagos";
import { claveCerrojoCredito, liberarCredito, saldosDeLaCuenta } from "../lib/credito-persistencia";
import { abrirCuentaDeCredito, almacenUsosAirtable, claveDelUso, CreditoInsuficiente, leerSaldoDeCredito, lectorPedidosDeUsosAirtable, type DependenciasUso } from "../lib/credito-uso";
import { cerrojoEnMemoria, reiniciarRedis } from "../lib/fixtures/redis";
import type { PagoMP } from "../lib/mercadopago";
import { fechaArgentina, sumarDias } from "../lib/suscriptores";
import { interceptar, reiniciar } from "../lib/fixtures/servidor";

const AHORA = Date.parse("2026-12-10T15:00:00.000Z");
const MAIL = "compradora@ejemplo.com";
const CODIGO = "ARR-20261210-23456";
const ITEMS = JSON.stringify([{ categoria: "Anteojos", cantidad: 1, subtotal: 89_900, sku: "AMATISTA-NEGRO" }]);

function reloj(inicio = AHORA) {
  const r = { t: inicio, ahora: () => r.t, dormir: async (ms: number) => void (r.t += ms) };
  return r;
}

function armar(o: { activo?: boolean; cerrojo?: Cerrojo | null } = {}) {
  const r = reloj();
  const cerrojo = o.cerrojo === undefined ? cerrojoEnMemoria({ ahora: () => r.t }) : o.cerrojo;
  let n = 0;
  const credito = { ...dependenciasCredito(), cerrojo, ahora: () => new Date(r.t), nonce: () => `n-${++n}` };
  const uso: DependenciasUso = { almacen: almacenUsosAirtable, pedidos: lectorPedidosDeUsosAirtable, cerrojo, reloj: r, esperaOcupadoMs: 50 };
  const deps: DependenciasIncidencia = {
    ...dependenciasIncidenciaReales(),
    activo: () => o.activo ?? true,
    credito,
    uso,
    esperar: () => new Promise<void>((listo) => setTimeout(listo, 5)),
  };
  return { deps, reloj: r, cerrojo };
}

let secuencia = 0;
/** Un pedido del crédito nuevo, con su cliente y su crédito (como lo dejan los pasos 1 y 2). */
async function compra(o: { estado?: string; email?: string; notas?: string; credito?: Partial<CamposCredito> | null } = {}) {
  const numero = `HARPER-I${++secuencia}`;
  const cliente = await createRecord<{ Email?: string }>(TABLAS.clientes, { Email: o.email ?? MAIL });
  const pedido = await createRecord<Record<string, unknown>>(TABLAS.pedidos, {
    Numero: numero,
    Estado: o.estado ?? "entregado",
    Cliente: [cliente.id],
    Items: ITEMS,
    Total: 89_900,
    Notas: o.notas ?? MARCA_REGIMEN_NUEVO,
  });
  const credito =
    o.credito === null
      ? null
      : await createRecord<CamposCredito>(TABLAS.creditos, {
          Clave: `credito-harper:${numero}`,
          Pedido: numero,
          Email: o.email ?? MAIL,
          Monto: 4_495,
          Porcentaje: 5,
          Base: 89_900,
          Anteojos: 1,
          Estado: "Pendiente",
          Generado_el: "2026-10-01T12:00:00.000Z",
          Fecha_entrega: "2026-10-05",
          Disponible_desde: "2026-11-04",
          Reglas: "credito-harper-v1",
          Notas: "",
          ...o.credito,
        });
  return { numero, pedido, credito };
}
async function usoDeCredito(numero: string, monto: number, estado = "Usado") {
  return createRecord<CamposCredito>(TABLAS.creditos, {
    Clave: claveDelUso(numero),
    Pedido: numero,
    Email: MAIL,
    Monto: monto,
    Porcentaje: 0,
    Base: 0,
    Anteojos: 0,
    Estado: estado,
    Generado_el: "2026-11-20T12:00:00.000Z",
    Reglas: "uso-credito-harper-v1",
    Notas: "",
  });
}
const solicitudDe = (pedido: string, email = MAIL) => normalizarSolicitud({ nombre: "Ana Pérez", email, pedido, producto: "", motivo: "" });
const filaDe = async (id: string) => (await getRecord<CamposCredito>(TABLAS.creditos, id)).fields;

beforeEach(() => {
  reiniciar();
  reiniciarRedis();
  interceptar(null);
});

// ---------- Detección: el arrepentimiento verificado abre la incidencia ----------

test("Arrepentimiento verificado: el crédito pendiente queda retenido (incidencia abierta, con nota) y no se libera; repetirlo no cambia nada", async () => {
  const { deps } = armar();
  const c = await compra();
  const nota = await incidenciaPorArrepentimiento(solicitudDe(c.numero), CODIGO, deps);
  assert.match(nota ?? "", new RegExp(`el crédito de \\$\\s?4\\.495 del pedido ${c.numero} queda retenido por el arrepentimiento ${CODIGO}`));
  assert.match(nota ?? "", /la regla de la devolución parcial está pendiente/);
  const fila = await filaDe(c.credito!.id);
  assert.equal(fila.Incidencia_abierta, true);
  assert.equal(fila.Estado, "Pendiente", "no se anula");
  assert.equal(fila.Monto, 4_495, "no cambia el monto");
  assert.match(fila.Notas ?? "", new RegExp(`Incidencia abierta: arrepentimiento ${CODIGO}\\.`));

  // Con la entrega y los 30 días cumplidos, igual no se libera.
  const [pendiente] = await almacenAirtable.delPedido(c.numero);
  assert.equal((await liberarCredito(pendiente, deps.credito)).estado, "todavia-no");
  assert.equal((await filaDe(c.credito!.id)).Estado, "Pendiente");

  // Una segunda solicitud del mismo pedido: idempotente, una sola marca.
  await incidenciaPorArrepentimiento(solicitudDe(c.numero), "ARR-20261210-XXXXX", deps);
  assert.equal(((await filaDe(c.credito!.id)).Notas ?? "").match(/Incidencia abierta/g)?.length, 1);
});

test("Si falta cualquiera de las cuatro condiciones, no se toca nada y se pide revisión manual", async () => {
  const { deps } = armar();
  const base = await compra();
  const otro = await compra({ email: "otra@ejemplo.com" });
  const pendientePago = await compra({ estado: "pendiente" });
  const sinAnotar = await compra({ credito: null });
  const duplicado = await compra();
  await createRecord(TABLAS.pedidos, { Numero: duplicado.numero, Estado: "pagado", Items: ITEMS, Total: 89_900, Notas: MARCA_REGIMEN_NUEVO });

  const casos: [string, ReturnType<typeof solicitudDe>, RegExp][] = [
    ["sin número", solicitudDe(""), /no trae un número de pedido válido/],
    ["número inexistente", solicitudDe("HARPER-NOEXISTE"), /no hay ningún pedido HARPER-NOEXISTE/],
    ["dos pedidos con el mismo número", solicitudDe(duplicado.numero), /hay 2 pedidos con el número/],
    ["otro mail", solicitudDe(base.numero, "otra@ejemplo.com"), /el mail de la solicitud no es el del cliente/],
    ["pedido sin confirmar", solicitudDe(pendientePago.numero), /no está confirmado \(pendiente\)/],
    ["crédito todavía sin anotar", solicitudDe(sinAnotar.numero), /todavía no tiene el Crédito Harper anotado/],
  ];
  for (const [que, solicitud, motivo] of casos) {
    const nota = await incidenciaPorArrepentimiento(solicitud, CODIGO, deps);
    assert.match(nota ?? "", motivo, que);
    assert.match(nota ?? "", /Revisalo a mano/, que);
  }
  for (const c of [base, otro, pendientePago, duplicado]) {
    const fila = await filaDe(c.credito!.id);
    assert.equal(fila.Incidencia_abierta ?? false, false, `${c.numero}: no se tocó`);
    assert.equal(fila.Notas, "");
  }

  // Sin Crédito Harper que revisar (régimen anterior, o ya anulado): ninguna nota.
  const anterior = await compra({ notas: "Cashback a acreditar", credito: null });
  assert.equal(await incidenciaPorArrepentimiento(solicitudDe(anterior.numero), CODIGO, deps), null);
  const anulado = await compra({ credito: { Estado: "Anulado" } });
  assert.equal(await incidenciaPorArrepentimiento(solicitudDe(anulado.numero), CODIGO, deps), null);
  assert.equal((await filaDe(anulado.credito!.id)).Incidencia_abierta ?? false, false);
});

test("La verificación usa el mail del cliente del pedido, no el que escribe la solicitud", async () => {
  const { deps } = armar();
  const c = await compra();
  assert.deepEqual(await vincularArrepentimiento(solicitudDe(c.numero, "OTRA@ejemplo.com"), deps), {
    vinculado: false,
    numero: c.numero,
    motivo: `el mail de la solicitud no es el del cliente del pedido ${c.numero}`,
  });
  assert.deepEqual(await vincularArrepentimiento(solicitudDe(c.numero.toLowerCase(), "Compradora@Ejemplo.com"), deps), { vinculado: true, numero: c.numero, email: MAIL });
});

// ---------- Retención: lo disponible no se usa ----------

test("Crédito ya disponible: queda «A revisar» y no se puede usar; si ya lo gastó, no se recupera solo y la cuenta no usa más crédito", async () => {
  const { deps } = armar();
  const devuelto = await compra({ credito: { Estado: "Disponible", Monto: 10_000 } });
  await compra({ credito: { Estado: "Disponible", Monto: 5_000 } });
  // Gastó 12.000 en otra compra, con el crédito de las dos.
  const gasto = await usoDeCredito("HARPER-OTRA-COMPRA", 12_000);
  assert.equal((await leerSaldoDeCredito(MAIL, deps.uso)).usable, 3_000);

  const nota = await incidenciaPorArrepentimiento(solicitudDe(devuelto.numero), CODIGO, deps);
  assert.match(nota ?? "", /ya estaba disponible: quedó «A revisar»/);
  assert.match(nota ?? "", /no se recupera solo, porque la regla está pendiente/);
  assert.equal((await filaDe(devuelto.credito!.id)).Estado, "A revisar");
  const saldo = await leerSaldoDeCredito(MAIL, deps.uso);
  assert.deepEqual([saldo.ganado, saldo.usado, saldo.usable, saldo.sobregiro], [5_000, 12_000, 0, 7_000], "nunca negativo");
  assert.equal((await filaDe(gasto.id)).Estado, "Usado", "el uso de la otra compra no se toca");

  // Y no puede reservar nada más.
  const abierta = await abrirCuentaDeCredito(MAIL, deps.uso);
  if ("estado" in abierta) throw new Error("ocupado");
  try {
    await assert.rejects(abierta.cuenta.reservar("HARPER-NUEVA", 1), CreditoInsuficiente);
  } finally {
    await abierta.cerrar();
  }
});

test("El pedido que se devuelve se pagó en parte con crédito: ese crédito no vuelve solo (queda descontado y se avisa)", async () => {
  const { deps } = armar();
  await compra({ credito: { Estado: "Disponible", Monto: 9_000 } });
  const c = await compra();
  const usado = await usoDeCredito(c.numero, 3_000);
  const nota = await incidenciaPorArrepentimiento(solicitudDe(c.numero), CODIGO, deps);
  assert.match(nota ?? "", new RegExp(`El pedido ${c.numero} se pagó en parte con \\$\\s?3\\.000 de Crédito Harper: si se concreta la devolución, ese crédito no vuelve solo`));
  assert.equal((await filaDe(usado.id)).Estado, "Usado");
  assert.equal((await leerSaldoDeCredito(MAIL, deps.uso)).usable, 6_000);
});

test("Cambio o reclamo interno: Harper marca Incidencia_abierta a mano; lo disponible queda retenido (no se usa, se ve en revisión) y vuelve al cerrarla", async () => {
  const { deps } = armar();
  const c = await compra({ credito: { Estado: "Disponible", Monto: 10_000 } });
  assert.equal((await leerSaldoDeCredito(MAIL, deps.uso)).usable, 10_000);

  await updateRecord<CamposCredito>(TABLAS.creditos, c.credito!.id, { Incidencia_abierta: true });
  const saldo = await leerSaldoDeCredito(MAIL, deps.uso);
  assert.equal(saldo.usable, 0, "retenido");
  const abierta = await abrirCuentaDeCredito(MAIL, deps.uso);
  if ("estado" in abierta) throw new Error("ocupado");
  try {
    await assert.rejects(abierta.cuenta.reservar("HARPER-NUEVA", 1), CreditoInsuficiente);
  } finally {
    await abierta.cerrar();
  }
  const filas = await almacenAirtable.delPedido(c.numero);
  assert.deepEqual(saldosDeLaCuenta([], filas, new Date(AHORA)).credito, { disponible: 0, pendiente: 0, aRevisar: 10_000 });
  const billetera = billeteraDeCredito(filas, MAIL, new Date(AHORA), { usos: saldo.usos, usable: saldo.usable });
  assert.equal(billetera.disponible, 0);
  assert.equal(billetera.enRevision, 10_000);
  assert.equal(billetera.movimientos[0].estado, "en-revision");
  assert.equal(billetera.movimientos[0].conGestionAbierta, true);

  // Harper la cierra (destilda Incidencia_abierta): vuelve a poder usarse.
  await updateRecord<CamposCredito>(TABLAS.creditos, c.credito!.id, { Incidencia_abierta: false });
  assert.equal((await leerSaldoDeCredito(MAIL, deps.uso)).usable, 10_000);
});

test("Pendiente con la incidencia marcada a mano: no se libera aunque pasen los 30 días; al cerrarla, se libera a su tiempo", async () => {
  const { deps } = armar();
  const c = await compra({ credito: { Incidencia_abierta: true } });
  const [fila] = await almacenAirtable.delPedido(c.numero);
  assert.equal((await liberarCredito(fila, deps.credito)).estado, "todavia-no");
  await updateRecord<CamposCredito>(TABLAS.creditos, c.credito!.id, { Incidencia_abierta: false });
  const [cerrada] = await almacenAirtable.delPedido(c.numero);
  assert.equal((await liberarCredito(cerrada, deps.credito)).estado, "liberado");
});

// ---------- Lo que no tiene regla: bloqueado para revisión ----------

test("La devolución parcial no se recalcula sola: aplicarDevolucion no se usa desde ningún circuito", () => {
  const raiz = path.resolve(__dirname, "..", "..");
  const usan: string[] = [];
  const recorrer = (dir: string) => {
    for (const e of fs.readdirSync(path.join(raiz, dir), { withFileTypes: true })) {
      const rel = path.join(dir, e.name);
      if (e.isDirectory()) recorrer(rel);
      else if (/\.(ts|tsx)$/.test(e.name) && rel !== path.join("lib", "credito-persistencia.ts") && /aplicarDevolucion\s*\(/.test(fs.readFileSync(path.join(raiz, rel), "utf8"))) usan.push(rel);
    }
  };
  for (const dir of ["app", "components", "lib"]) recorrer(dir);
  assert.deepEqual(usan, []);
  // El reembolso parcial de Mercado Pago abre la incidencia y la ruta diaria lo retiene (no lo recalcula).
  const pagos = fs.readFileSync(path.join(raiz, "lib", "credito-pagos.ts"), "utf8");
  assert.match(pagos, /return ahora\.estado === "parcial" \|\| ahora\.incidenciaAbierta;/);
  // Revisión del PR #83: los dos avisos de Mercado Pago que tocan la incidencia solo pueden abrirla.
  assert.equal((pagos.match(/marcarIncidencia\(/g) ?? []).length, 2);
  assert.equal((pagos.match(/\{ nuncaCerrar: true \}/g) ?? []).length, 2);
  assert.doesNotMatch(pagos, /resuelto a favor de Harper/);
  const diario = fs.readFileSync(path.join(raiz, "lib", "credito-diario.ts"), "utf8");
  assert.match(diario, /reembolso parcial en Mercado Pago: registrar la devolución/);
});

// ---------- Apagado, sin Redis y errores ----------

test("Apagado: no se lee ni se escribe nada y el arrepentimiento es el de siempre", async () => {
  const c = await compra();
  // Las dependencias de verdad, con el interruptor apagado (como en producción).
  assert.equal(await incidenciaPorArrepentimiento(solicitudDe(c.numero), CODIGO), null);
  assert.equal(await incidenciaPorArrepentimiento(solicitudDe(c.numero), CODIGO, armar({ activo: false }).deps), null);
  assert.equal((await filaDe(c.credito!.id)).Incidencia_abierta ?? false, false);
});

test("Sin Redis, con el crédito ocupado o con un error: no se escribe nada y la nota pide marcarla a mano", async () => {
  const c = await compra();
  const sinRedis = await incidenciaPorArrepentimiento(solicitudDe(c.numero), CODIGO, armar({ cerrojo: null }).deps);
  assert.match(sinRedis ?? "", new RegExp(`no se pudo abrir la incidencia del pedido ${c.numero}.*Marcá Incidencia_abierta a mano`));

  const ocupado = armar();
  await ocupado.cerrojo!.tomar(claveCerrojoCredito(c.numero), "otro", 120_000);
  assert.match((await incidenciaPorArrepentimiento(solicitudDe(c.numero), CODIGO, ocupado.deps)) ?? "", /otro proceso tenía el crédito/);

  const roto = armar();
  roto.deps.pedidosConNumero = async () => {
    throw new Error("Airtable 503");
  };
  assert.match((await incidenciaPorArrepentimiento(solicitudDe(c.numero), CODIGO, roto.deps)) ?? "", /no se pudo abrir la incidencia.*Airtable 503/);
  assert.equal((await filaDe(c.credito!.id)).Incidencia_abierta ?? false, false);
});

test("El arrepentimiento se registra igual, y la nota del crédito llega al aviso a Harper (aunque la revisión tire)", async () => {
  const config = { razonSocial: "FOCUS VISION SRL", cuit: "30-71802316-1", emailContacto: "contacto@harper.test", emailPedidos: "pedidos@harper.test" } as ConfigTienda;
  const correr = async (credito: () => Promise<string | null>) => {
    const enviados: { para: string; texto: string }[] = [];
    const r = await registrarArrepentimiento(solicitudDe("HARPER-I999"), {
      config,
      ahora: new Date(AHORA),
      azar: new Uint8Array([0, 1, 2, 3, 4]),
      enviar: async (e) => {
        enviados.push({ para: e.para, texto: e.texto });
        return { ok: true as const };
      },
      crear: async () => ({ id: "rec1" }),
      actualizar: async () => undefined,
      cashback: async () => null,
      credito,
    });
    return { r, aHarper: enviados.find((e) => e.para === "pedidos@harper.test")?.texto ?? "" };
  };
  const con = await correr(async () => "Crédito Harper: NOTA DE PRUEBA.");
  assert.equal(con.r.ok, true);
  assert.match(con.aHarper, /Crédito Harper: NOTA DE PRUEBA\./);
  const tira = await correr(async () => {
    throw new Error("se cayó");
  });
  assert.equal(tira.r.ok, true, "nunca frena el arrepentimiento");
  assert.match(tira.aHarper, /No se pudo revisar el Crédito Harper del pedido/);
  const apagado = await correr(async () => null);
  assert.doesNotMatch(apagado.aHarper, /Crédito Harper/, "apagado, el aviso es el de siempre");
});

// ---------- Revisión del PR #83: un aviso de Mercado Pago nunca cierra una incidencia ----------

/** Un pedido entregado hoy, cobrado en un Mercado Pago de mentira (solo lectura), con su crédito pendiente. */
async function cobrada(o: { credito?: Partial<CamposCredito> } = {}) {
  const pagos = new Map<string, PagoMP>();
  const c = await compra({ credito: { Fecha_entrega: null, Disponible_desde: null, ...o.credito } });
  const pagoId = String(800_000 + secuencia);
  pagos.set(pagoId, { id: Number(pagoId), status: "approved", external_reference: c.pedido.id, transaction_amount: 89_900 } as PagoMP);
  const hoy = fechaArgentina(new Date(c.pedido.createdTime));
  await updateRecord(TABLAS.pedidos, c.pedido.id, { MP_payment_id: pagoId, Fecha_entrega: hoy });
  const leer = (id: string) => {
    const p = pagos.get(id);
    if (!p) throw new Error(`pago ${id} desconocido`);
    return pagoDe(p);
  };
  const mp: LectorMercadoPago = { pago: async (id) => leer(id), pagosDelPedido: async (pedidoId) => [...pagos.keys()].map(leer).filter((x) => x.pedidoId === pedidoId) };
  return { ...c, pagoId, pagos, mp, hoy };
}
const pagoCon = (deps: DependenciasIncidencia, mp: LectorMercadoPago): DependenciasPagoCredito => ({ credito: deps.credito, mp, pedidos: lectorPedidosAirtable });
const abierta = async (id: string) => (await filaDe(id)).Incidencia_abierta === true;

test("Arrepentimiento abierto + aviso aprobado repetido de Mercado Pago: la incidencia sigue abierta", async () => {
  const { deps } = armar();
  const c = await cobrada();
  await incidenciaPorArrepentimiento(solicitudDe(c.numero), CODIGO, deps);
  assert.equal(await abierta(c.credito!.id), true);
  for (let i = 0; i < 3; i++) {
    const r = await procesarPagoParaCredito(c.pagoId, pagoCon(deps, c.mp));
    assert.equal(r.accion === "registrar" && r.resultado.estado, "ya");
    assert.equal(r.accion === "registrar" && r.incidencia, null, "no la toca");
  }
  assert.equal(await abierta(c.credito!.id), true);
  assert.doesNotMatch((await filaDe(c.credito!.id)).Notas ?? "", /Incidencia cerrada/);
});

test("Reclamo interno marcado a mano + pago normal de Mercado Pago: sigue abierta y el crédito disponible sigue retenido", async () => {
  const { deps } = armar();
  const c = await cobrada({ credito: { Estado: "Disponible", Incidencia_abierta: true } });
  const r = await procesarPagoParaCredito(c.pagoId, pagoCon(deps, c.mp));
  assert.equal(r.accion === "registrar" && r.incidencia, null);
  assert.equal(await abierta(c.credito!.id), true);
  assert.equal((await filaDe(c.credito!.id)).Estado, "Disponible");
  assert.equal((await leerSaldoDeCredito(MAIL, deps.uso)).usable, 0);
});

test("Avisos simultáneos no levantan el bloqueo, ni siquiera si el reclamo de Mercado Pago se resuelve en el medio", async () => {
  // Varios avisos aprobados a la vez, con un arrepentimiento al mismo tiempo.
  const { deps } = armar();
  const c = await cobrada();
  await Promise.all([
    procesarPagoParaCredito(c.pagoId, pagoCon(deps, c.mp)),
    incidenciaPorArrepentimiento(solicitudDe(c.numero), CODIGO, deps),
    procesarPagoParaCredito(c.pagoId, pagoCon(deps, c.mp)),
    procesarPagoParaCredito(c.pagoId, pagoCon(deps, c.mp)),
  ]);
  assert.equal(await abierta(c.credito!.id), true);
  // Ya abierta, otros avisos aprobados a la vez tampoco la cierran.
  await Promise.all([1, 2, 3].map(() => procesarPagoParaCredito(c.pagoId, pagoCon(deps, c.mp))));
  assert.equal(await abierta(c.credito!.id), true);

  // Mercado Pago muestra un reclamo cuando la casilla está cerrada; adentro del
  // cerrojo, el reclamo ya se resolvió, pero entretanto Harper abrió una
  // incidencia interna: el aviso no la cierra.
  const otro = armar();
  const d = await cobrada();
  d.pagos.set(d.pagoId, { ...d.pagos.get(d.pagoId)!, status: "in_mediation" } as PagoMP);
  const cerrojo = otro.cerrojo!;
  // La primera llave es la de anotar el crédito («ya»); la segunda, la de la incidencia.
  let vez = 0;
  const conCarrera: Cerrojo = {
    ...cerrojo,
    tomar: async (clave, nonce, ttl) => {
      if (clave === claveCerrojoCredito(d.numero) && ++vez === 2) {
        await updateRecord<CamposCredito>(TABLAS.creditos, d.credito!.id, { Incidencia_abierta: true });
        d.pagos.set(d.pagoId, { ...d.pagos.get(d.pagoId)!, status: "approved" } as PagoMP);
      }
      return cerrojo.tomar(clave, nonce, ttl);
    },
  };
  const r = await procesarPagoParaCredito(d.pagoId, { credito: { ...otro.deps.credito, cerrojo: conCarrera }, mp: d.mp, pedidos: lectorPedidosAirtable });
  assert.equal(r.accion === "registrar" && r.incidencia?.estado, "incidencia-abierta");
  assert.equal(await abierta(d.credito!.id), true, "nunca se cierra por un aviso");

  // Lo mismo con un reembolso parcial: hay una incidencia interna abierta (un
  // arrepentimiento) y, adentro del cerrojo, el pago ya no figura reembolsado
  // (se revirtió). El aviso no la cierra.
  const tercero = armar();
  const e = await cobrada();
  await incidenciaPorArrepentimiento(solicitudDe(e.numero), CODIGO, tercero.deps);
  e.pagos.set(e.pagoId, { ...e.pagos.get(e.pagoId)!, transaction_amount_refunded: 20_000 } as PagoMP);
  const cerrojo3 = tercero.cerrojo!;
  const conReversa: Cerrojo = {
    ...cerrojo3,
    tomar: async (clave, nonce, ttl) => {
      if (clave === claveCerrojoCredito(e.numero)) e.pagos.set(e.pagoId, { ...e.pagos.get(e.pagoId)!, transaction_amount_refunded: 0 } as PagoMP);
      return cerrojo3.tomar(clave, nonce, ttl);
    },
  };
  const parcial = await procesarPagoParaCredito(e.pagoId, { credito: { ...tercero.deps.credito, cerrojo: conReversa }, mp: e.mp, pedidos: lectorPedidosAirtable });
  assert.equal(parcial.accion, "incidencia");
  assert.equal(await abierta(e.credito!.id), true, "el reembolso parcial tampoco la cierra");
});

test("Una incidencia que Harper cerró de verdad no queda bloqueada: los avisos no la reabren sin reclamo y la ruta diaria la libera", async () => {
  const { deps, reloj: r } = armar();
  const c = await cobrada();
  await incidenciaPorArrepentimiento(solicitudDe(c.numero), CODIGO, deps);
  // Harper la resuelve: destilda Incidencia_abierta.
  await updateRecord<CamposCredito>(TABLAS.creditos, c.credito!.id, { Incidencia_abierta: false });
  await procesarPagoParaCredito(c.pagoId, pagoCon(deps, c.mp));
  await procesarPagoParaCredito(c.pagoId, pagoCon(deps, c.mp));
  assert.equal(await abierta(c.credito!.id), false, "sin reclamo en Mercado Pago, no se reabre");

  r.t = new Date(`${sumarDias(c.hoy, 30)}T03:00:00.000Z`).getTime();
  const resumen = await procesarCreditosDelDia({ credito: deps.credito, mp: c.mp, pedidos: lectorPedidosPorNumeroAirtable });
  assert.deepEqual(resumen.liberados.map((l) => l.pedido), [c.numero]);
  assert.equal((await filaDe(c.credito!.id)).Estado, "Disponible");

  // Y un reclamo nuevo en Mercado Pago, después de cerrada, sí la vuelve a abrir.
  const otra = await cobrada();
  await updateRecord<CamposCredito>(TABLAS.creditos, otra.credito!.id, { Incidencia_abierta: false });
  otra.pagos.set(otra.pagoId, { ...otra.pagos.get(otra.pagoId)!, status: "in_mediation" } as PagoMP);
  const reabierta = await procesarPagoParaCredito(otra.pagoId, pagoCon(deps, otra.mp));
  assert.equal(reabierta.accion === "registrar" && reabierta.incidencia?.estado, "incidencia-abierta");
});

test("La liberación diaria nunca libera un crédito con una incidencia interna abierta (arrepentimiento o marca a mano)", async () => {
  const { deps, reloj: r } = armar();
  const arrep = await cobrada();
  await incidenciaPorArrepentimiento(solicitudDe(arrep.numero), CODIGO, deps);
  const amano = await cobrada({ credito: { Incidencia_abierta: true } });
  r.t = new Date(`${sumarDias(arrep.hoy, 45)}T03:00:00.000Z`).getTime();
  for (let dia = 0; dia < 3; dia++) {
    const resumen = await procesarCreditosDelDia({ credito: deps.credito, mp: arrep.mp, pedidos: lectorPedidosPorNumeroAirtable });
    assert.deepEqual(resumen.liberados, []);
    r.t += 24 * 3_600_000;
  }
  for (const c of [arrep, amano]) {
    const fila = await filaDe(c.credito!.id);
    assert.equal(fila.Estado, "Pendiente", c.numero);
    assert.equal(fila.Incidencia_abierta, true, c.numero);
  }
});

test("Los pedidos con las reglas de hoy y sus saldos no cambian: ni crédito, ni incidencia, ni Saldos", async () => {
  const { deps } = armar();
  const viejo = await cobrada();
  // El pedido es del régimen anterior (sin la marca del crédito nuevo) y no tiene crédito.
  await updateRecord(TABLAS.pedidos, viejo.pedido.id, { Notas: "Cashback a acreditar: $ 4.495 (ana@ejemplo.com)" });
  await updateRecord<CamposCredito>(TABLAS.creditos, viejo.credito!.id, { Pedido: "HARPER-OTRO-QUE-NO-ES", Clave: "credito-harper:HARPER-OTRO-QUE-NO-ES" });
  await createRecord(TABLAS.saldos, { Pedido: viejo.numero, Tipo: "Cashback", Monto: 4_495, Email: MAIL });
  const saldosAntes = JSON.stringify((await listRecords(TABLAS.saldos, { revalidate: 0 })).map((x) => x.fields));
  const creditosAntes = (await listRecords(TABLAS.creditos, { revalidate: 0 })).length;

  const r = await procesarPagoParaCredito(viejo.pagoId, pagoCon(deps, viejo.mp));
  assert.equal(r.accion === "nada" && r.motivo, "regimen-anterior");
  assert.equal(await incidenciaPorArrepentimiento(solicitudDe(viejo.numero), CODIGO, deps), null);

  assert.equal(JSON.stringify((await listRecords(TABLAS.saldos, { revalidate: 0 })).map((x) => x.fields)), saldosAntes);
  assert.equal((await listRecords(TABLAS.creditos, { revalidate: 0 })).length, creditosAntes);
  assert.equal((await almacenAirtable.delPedido(viejo.numero)).length, 0);
});
