import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

// Crédito Harper: el vencimiento (Ale, 18/11/2026). El crédito vence a los 6
// meses de quedar disponible:
//  - meses de calendario desde Disponible_desde (el día de Buenos Aires en que
//    de verdad quedó disponible);
//  - se puede usar hasta el día del vencimiento inclusive; si ese día no
//    existe en el mes, vence el último día del mes;
//  - al usarlo se consume primero el que vence antes;
//  - una fila «Disponible» sin Disponible_desde (solo por una edición a mano)
//    no vence.
// Lo que se puede usar sale de un solo cálculo (lib/credito-uso.ts,
// saldoDeCredito): lo usan la billetera, el carrito y el checkout, así que
// los tres tienen que mostrar el mismo número.
//
// Todo contra el Airtable y el Redis en memoria: nada toca pagos, la base real
// ni compradores reales. El interruptor se prende solo adentro de las pruebas
// que lo necesitan, y se vuelve a apagar.
process.env.HARPER_FIXTURES = "1";
process.env.MP_WEBHOOK_SECRET = "secreto-de-prueba-del-vencimiento";
delete process.env.VERCEL;
delete process.env.HARPER_DUO_ACTIVO;
delete process.env.HARPER_CREDITO_ACTIVO;
for (const v of ["KV_REST_API_URL", "KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "MP_ACCESS_TOKEN", "RESEND_API_KEY"]) delete process.env[v];

import { createRecord, TABLAS, updateRecord } from "../lib/airtable";
import { getProductos } from "../lib/catalogo";
import { type CamposCredito } from "../lib/credito-airtable";
import { billeteraDeCredito, billeteraDeLaCuenta, creditoParaElCarrito } from "../lib/credito-cuenta";
import { esFechaValida, estaVencido, MESES_PARA_VENCER_CREDITO, sumarMeses, venceEl } from "../lib/credito-harper";
import type { FilaCredito } from "../lib/credito-persistencia";
import {
  abrirCuentaDeCredito,
  almacenUsosAirtable,
  claveDelUso,
  leerSaldoDeCredito,
  lectorPedidosDeUsosAirtable,
  saldoDeCredito,
  type DependenciasUso,
  type FilaUso,
} from "../lib/credito-uso";
import { cerrojoEnMemoria, reiniciarRedis } from "../lib/fixtures/redis";
import { interceptar, reiniciar } from "../lib/fixtures/servidor";
import { resolverCarrito } from "../lib/pedidos";
import { fechaArgentina, sumarDias } from "../lib/suscriptores";
import { COOKIE_CUENTA, claveDeSesionCuenta, crearSesionCuenta } from "../lib/suscriptores-sesion";
import type { ItemCarrito } from "../lib/tipos";

beforeEach(() => {
  reiniciar();
  reiniciarRedis();
  interceptar(null);
});

async function prendido<T>(hacer: () => Promise<T>): Promise<T> {
  process.env.HARPER_CREDITO_ACTIVO = "1";
  try {
    return await hacer();
  } finally {
    delete process.env.HARPER_CREDITO_ACTIVO;
  }
}

// ---------- 1. La fecha ----------

test("Vence a los 6 meses de calendario; si el día no existe en el mes, el último del mes (31/01 → 31/07; 31/08 → 28/02 o 29/02)", () => {
  assert.equal(MESES_PARA_VENCER_CREDITO, 6);
  const casos: [string, string][] = [
    ["2026-01-31", "2026-07-31"], // julio tiene 31
    ["2026-08-31", "2027-02-28"], // 2027 no es bisiesto
    ["2027-08-31", "2028-02-29"], // 2028 sí
    ["2027-08-30", "2028-02-29"],
    ["2027-08-29", "2028-02-29"],
    ["2027-08-28", "2028-02-28"],
    ["2099-08-31", "2100-02-28"], // 2100 no es bisiesto (divisible por 100, no por 400)
    ["2026-10-31", "2027-04-30"], // el ejemplo de las condiciones publicadas
    ["2026-12-31", "2027-06-30"],
    ["2026-03-31", "2026-09-30"],
    ["2026-05-31", "2026-11-30"],
    ["2026-11-20", "2027-05-20"],
    ["2026-07-15", "2027-01-15"], // cruza el año
    ["2026-07-01", "2027-01-01"],
    ["2028-02-29", "2028-08-29"],
    ["2026-02-28", "2026-08-28"], // el 28 sigue siendo el 28
  ];
  for (const [desde, vence] of casos) assert.equal(venceEl(desde), vence, desde);

  // La regla para todos los días de tres años: el mismo día seis meses después
  // (o el último de ese mes), siempre una fecha que existe, entre 181 y 184
  // días después, y nunca antes que la del día anterior.
  const dia = (iso: string) => Date.parse(`${iso}T00:00:00.000Z`) / 86_400_000;
  let anterior = "";
  for (let d = "2026-01-01"; d <= "2028-12-31"; d = sumarDias(d, 1)) {
    const v = venceEl(d);
    assert.ok(esFechaValida(v), `${d} → ${v}`);
    const [anio, mes, diaDelMes] = d.split("-").map(Number);
    const mesFinal = ((mes - 1 + 6) % 12) + 1;
    const anioFinal = anio + (mes + 6 > 12 ? 1 : 0);
    const ultimo = new Date(Date.UTC(anioFinal, mesFinal, 0)).getUTCDate();
    assert.equal(v, `${anioFinal}-${String(mesFinal).padStart(2, "0")}-${String(Math.min(diaDelMes, ultimo)).padStart(2, "0")}`, d);
    const dias = dia(v) - dia(d);
    assert.ok(dias >= 181 && dias <= 184, `${d}: ${dias} días`);
    assert.ok(v >= anterior, `${d}: no retrocede`);
    anterior = v;
  }

  // sumarMeses: la misma cuenta con otros meses, y nada inventado.
  assert.equal(sumarMeses("2026-01-31", 1), "2026-02-28");
  assert.equal(sumarMeses("2026-01-31", 13), "2027-02-28");
  assert.equal(sumarMeses("2026-01-31", -2), "2025-11-30");
  assert.equal(sumarMeses("2026-11-20", 0), "2026-11-20");
  for (const mala of ["2026-02-30", "2026-13-01", "2026-1-5", "30/04/2027", ""]) assert.throws(() => venceEl(mala), RangeError, mala);
  assert.throws(() => sumarMeses("2026-01-31", 1.5), RangeError);
});

test("El último día se puede usar entero, en hora de Buenos Aires; vence al día siguiente; sin Disponible_desde no vence", () => {
  // Disponible desde el 31/10/2026: vence el 30/04/2027, inclusive.
  assert.equal(estaVencido("2026-10-31", "2027-04-29"), false);
  assert.equal(estaVencido("2026-10-31", "2027-04-30"), false, "el día del vencimiento todavía se puede usar");
  assert.equal(estaVencido("2026-10-31", "2027-05-01"), true);
  // 23:59:59 del 30/04 en Buenos Aires son las 02:59:59 del 01/05 en UTC: todavía no venció.
  assert.equal(estaVencido("2026-10-31", new Date("2027-05-01T02:59:59.000Z")), false);
  assert.equal(estaVencido("2026-10-31", new Date("2027-05-01T03:00:00.000Z")), true, "00:00 del 01/05 en Buenos Aires");
  // El mismo día en que quedó disponible no está vencido.
  assert.equal(estaVencido("2026-10-31", "2026-10-31"), false);
  // Una fila «Disponible» sin fecha (editada a mano) no vence nunca.
  assert.equal(estaVencido(null, "2099-12-31"), false);
  // Un «hoy» que no existe no se adivina.
  assert.throws(() => estaVencido("2026-10-31", "2027-02-30"), RangeError);
  assert.throws(() => estaVencido("2026-10-31", new Date("no")), RangeError);
});

// ---------- 2. Lo que se puede usar (saldoDeCredito) ----------

let secuencia = 0;
const ganado = (o: { monto: number; desde?: string | null; generadoEl?: string; estado?: FilaCredito["estado"]; incidencia?: boolean; pedido?: string }): FilaCredito => {
  const pedido = o.pedido ?? `HARPER-V${++secuencia}`;
  return {
    id: `recC${String(++secuencia).padStart(13, "0")}`,
    clave: `credito-harper:${pedido}`,
    pedido,
    email: "vence@ejemplo.com",
    monto: o.monto,
    porcentaje: 5,
    base: o.monto * 20,
    anteojos: 1,
    estado: o.estado ?? "Disponible",
    generadoEl: o.generadoEl ?? "2026-01-01T15:00:00.000Z",
    fechaEntrega: null,
    disponibleDesde: o.desde ?? null,
    incidenciaAbierta: o.incidencia ?? false,
    reglas: "credito-harper-v1",
    notas: "",
  };
};
const usado = (monto: number, en: string, estado: FilaUso["estado"] = "Usado"): FilaUso => {
  const pedido = `HARPER-U${++secuencia}`;
  return { id: `recU${String(++secuencia).padStart(13, "0")}`, clave: claveDelUso(pedido), pedido, email: "vence@ejemplo.com", monto, estado, generadoEl: en, notas: "", rota: false };
};
const saldo = (creditos: FilaCredito[], usos: FilaUso[], ahora: string) => saldoDeCredito({ creditos, usos }, new Map(), new Date(ahora));
const resumen = (s: ReturnType<typeof saldo>) => ({ usable: s.usable, vencido: s.vencido, sobregiro: s.sobregiro, proximo: s.proximoVencimiento });

test("Dos créditos con distinto vencimiento: cada uso se descuenta primero del que vence antes, aunque se haya ganado después", () => {
  // El de P1 se ganó después pero vence antes (quedó disponible antes); el de P2 se ganó primero y se liberó tarde.
  const p2 = ganado({ monto: 5_000, desde: "2026-03-01", generadoEl: "2025-12-01T15:00:00.000Z" }); // vence 2026-09-01
  const p1 = ganado({ monto: 5_000, desde: "2026-01-10", generadoEl: "2025-12-20T15:00:00.000Z" }); // vence 2026-07-10
  const u = usado(6_000, "2026-04-01T15:00:00.000Z");

  const antes = saldo([p2, p1], [u], "2026-05-01T15:00:00.000Z");
  assert.deepEqual(resumen(antes), { usable: 4_000, vencido: 0, sobregiro: 0, proximo: { monto: 4_000, venceEl: "2026-09-01" } });
  assert.deepEqual(
    antes.porCredito.map((c) => [c.pedido, c.restante, c.venceEl, c.vencido]),
    [
      [p1.pedido, 0, "2026-07-10", false],
      [p2.pedido, 4_000, "2026-09-01", false],
    ],
    "en el orden en que se usan: el que vence antes, primero"
  );
  // Vence P1, que ya estaba usado entero: no se pierde nada ni queda deuda.
  assert.deepEqual(resumen(saldo([p2, p1], [u], "2026-08-01T15:00:00.000Z")), { usable: 4_000, vencido: 0, sobregiro: 0, proximo: { monto: 4_000, venceEl: "2026-09-01" } });
  // Vence P2: lo que le quedaba se pierde.
  assert.deepEqual(resumen(saldo([p2, p1], [u], "2026-09-02T15:00:00.000Z")), { usable: 0, vencido: 4_000, sobregiro: 0, proximo: null });
  // El orden en que llegan las filas no cambia nada.
  assert.deepEqual(saldo([p1, p2], [u], "2026-05-01T15:00:00.000Z").porCredito, antes.porCredito);
});

test("Un crédito usado en parte que vence: se pierde solo lo que le quedaba, lo usado queda cubierto y no hay sobregiro", () => {
  const viejo = ganado({ monto: 10_000, desde: "2026-01-15" }); // vence 2026-07-15
  const nuevo = ganado({ monto: 2_000, desde: "2026-06-01" }); // vence 2026-12-01
  const u = usado(3_000, "2026-05-10T15:00:00.000Z");
  const s = saldo([viejo, nuevo], [u], "2026-07-16T15:00:00.000Z");
  assert.deepEqual(
    { ganado: s.ganado, usado: s.usado, ...resumen(s) },
    { ganado: 12_000, usado: 3_000, usable: 2_000, vencido: 7_000, sobregiro: 0, proximo: { monto: 2_000, venceEl: "2026-12-01" } }
  );
  assert.deepEqual(s.porCredito.map((c) => [c.restante, c.vencido]), [[7_000, true], [2_000, false]]);
  // El día del vencimiento todavía no se perdió nada.
  assert.deepEqual(resumen(saldo([viejo, nuevo], [u], "2026-07-15T15:00:00.000Z")), { usable: 9_000, vencido: 0, sobregiro: 0, proximo: { monto: 7_000, venceEl: "2026-07-15" } });
});

test("Un uso hecho después de que un crédito venció no lo toma: sale del que sigue vigente", () => {
  const vencido = ganado({ monto: 5_000, desde: "2026-01-10" }); // vence 2026-07-10
  const vigente = ganado({ monto: 5_000, desde: "2026-06-01" }); // vence 2026-12-01
  const u = usado(3_000, "2026-08-01T15:00:00.000Z");
  const s = saldo([vencido, vigente], [u], "2026-08-02T15:00:00.000Z");
  assert.deepEqual(resumen(s), { usable: 2_000, vencido: 5_000, sobregiro: 0, proximo: { monto: 2_000, venceEl: "2026-12-01" } });
  // El día de cada uso es el de Buenos Aires: las 23:30 del último día todavía cuentan para ese crédito.
  const ultimoDia = usado(1_000, "2026-07-11T02:30:00.000Z"); // 23:30 del 10/07 en Buenos Aires
  const alOtroDia = usado(1_000, "2026-07-11T03:00:00.000Z"); // 00:00 del 11/07
  assert.deepEqual(saldo([vencido, vigente], [ultimoDia], "2026-08-02T15:00:00.000Z").porCredito.map((c) => c.restante), [4_000, 5_000]);
  assert.deepEqual(saldo([vencido, vigente], [alOtroDia], "2026-08-02T15:00:00.000Z").porCredito.map((c) => c.restante), [5_000, 4_000]);
  // Una fecha que no se entiende cuenta como hoy: nunca se descuenta de uno vencido.
  assert.deepEqual(saldo([vencido, vigente], [usado(1_000, "basura")], "2026-08-02T15:00:00.000Z").porCredito.map((c) => c.restante), [5_000, 4_000]);
});

test("Una reserva hecha antes del vencimiento queda cubierta por ese crédito aunque el pago llegue después", () => {
  const vence = ganado({ monto: 5_000, desde: "2026-01-10" }); // vence 2026-07-10
  const otro = ganado({ monto: 3_000, desde: "2026-06-01" }); // vence 2026-12-01
  // Apartado a las 23:50 del último día (02:50 UTC del 11/07); el pedido sigue en revisión.
  const reserva = usado(4_000, "2026-07-11T02:50:00.000Z", "Reservado");
  const enRevision = new Map([[reserva.pedido, { id: "recP", numero: reserva.pedido, estado: "pendiente", mpStatus: "in_process", total: 0, pagoRegistrado: null, fecha: Date.parse(reserva.generadoEl) }]]);
  const alOtroDia = saldoDeCredito({ creditos: [vence, otro], usos: [reserva] }, enRevision, new Date("2026-07-11T15:00:00.000Z"));
  assert.deepEqual(resumen(alOtroDia), { usable: 3_000, vencido: 1_000, sobregiro: 0, proximo: { monto: 3_000, venceEl: "2026-12-01" } });
  assert.equal(alOtroDia.reservado, 4_000);
  // El pago se acredita: «Usado», con la fecha de la reserva. Nada cambia.
  const confirmado = saldo([vence, otro], [{ ...reserva, estado: "Usado" }], "2026-07-12T15:00:00.000Z");
  assert.deepEqual(resumen(confirmado), resumen(alOtroDia));
  // Si el pedido no se paga, la reserva se libera: lo que le quedaba al vencido ya venció.
  const liberada = saldo([vence, otro], [{ ...reserva, estado: "Liberado" }], "2026-07-12T15:00:00.000Z");
  assert.deepEqual(resumen(liberada), { usable: 3_000, vencido: 5_000, sobregiro: 0, proximo: { monto: 3_000, venceEl: "2026-12-01" } });
});

test("Sin vencimientos da lo de siempre; sin Disponible_desde no vence; lo retenido, lo bloqueado y lo anulado después de usarlo", () => {
  // Sin fechas: ganado − usado − reservado, nunca negativo; lo que pasa, sobregiro.
  const a = ganado({ monto: 5_000 });
  const b = ganado({ monto: 2_000 });
  const u = usado(9_000, "2026-04-01T15:00:00.000Z");
  const deAntes = saldo([a, b], [u], "2099-01-01T15:00:00.000Z");
  assert.deepEqual({ ganado: deAntes.ganado, usado: deAntes.usado, ...resumen(deAntes) }, { ganado: 7_000, usado: 9_000, usable: 0, vencido: 0, sobregiro: 2_000, proximo: null });
  const s = saldo([a, b], [], "2099-01-01T15:00:00.000Z");
  assert.deepEqual(resumen(s), { usable: 7_000, vencido: 0, sobregiro: 0, proximo: null }, "sin fecha, no vence ni tiene próximo vencimiento");
  assert.deepEqual(s.porCredito.map((c) => c.venceEl), [null, null]);
  // Con fecha y sin fecha: primero se usa el que vence; el que no vence, al final.
  const conFecha = ganado({ monto: 1_000, desde: "2098-12-01" });
  assert.deepEqual(saldo([a, conFecha], [usado(1_500, "2098-12-15T15:00:00.000Z")], "2098-12-20T15:00:00.000Z").porCredito.map((c) => [c.venceEl, c.restante]), [["2099-06-01", 0], [null, 4_500]]);

  // Dos que vencen el mismo día: el próximo vencimiento los suma.
  const x = ganado({ monto: 1_000, desde: "2026-03-31" });
  const y = ganado({ monto: 2_000, desde: "2026-03-30" }); // 30/09 también
  assert.deepEqual(saldo([x, y], [], "2026-04-01T15:00:00.000Z").proximoVencimiento, { monto: 3_000, venceEl: "2026-09-30" });

  // Retenido por una incidencia: no cuenta. Pendiente: tampoco.
  const retenido = ganado({ monto: 4_000, desde: "2026-03-01", incidencia: true });
  const pendiente = ganado({ monto: 4_000, desde: "2026-09-01", estado: "Pendiente" });
  assert.deepEqual(resumen(saldo([retenido, pendiente, x], [], "2026-04-01T15:00:00.000Z")), { usable: 1_000, vencido: 0, sobregiro: 0, proximo: { monto: 1_000, venceEl: "2026-09-30" } });

  // Un uso ilegible bloquea la cuenta: nada para usar y ningún vencimiento que anunciar.
  const bloqueada = saldo([x, y], [{ ...usado(1, "2026-04-01T15:00:00.000Z"), rota: true }], "2026-04-01T15:00:00.000Z");
  assert.deepEqual([bloqueada.bloqueado, bloqueada.usable, bloqueada.proximoVencimiento], [true, 0, null]);

  // Un crédito que se anuló después de usarlo: el uso queda sin respaldo (sobregiro),
  // aunque haya otro crédito que ya había vencido cuando se usó.
  const vencidoAntes = ganado({ monto: 5_000, desde: "2026-01-10" }); // vence 2026-07-10
  const anuladoDespues = ganado({ monto: 5_000, desde: "2026-06-01", estado: "A revisar" });
  const sinRespaldo = saldo([vencidoAntes, anuladoDespues], [usado(3_000, "2026-08-01T15:00:00.000Z")], "2026-08-02T15:00:00.000Z");
  assert.deepEqual({ ganado: sinRespaldo.ganado, ...resumen(sinRespaldo) }, { ganado: 5_000, usable: 0, vencido: 5_000, sobregiro: 3_000, proximo: null });
});

test("La billetera usa el mismo reparto: «vencido» si venció con algo sin usar, «usado» si venció ya usado entero", () => {
  const usadoEntero = ganado({ monto: 2_000, desde: "2026-01-05", generadoEl: "2025-12-01T15:00:00.000Z" }); // vence 2026-07-05
  const vencidoConResto = ganado({ monto: 5_000, desde: "2026-01-10", generadoEl: "2025-12-05T15:00:00.000Z" }); // vence 2026-07-10
  const vigente = ganado({ monto: 3_000, desde: "2026-06-01", generadoEl: "2026-05-01T15:00:00.000Z" }); // vence 2026-12-01
  const pendiente = ganado({ monto: 2_000, desde: "2026-09-01", estado: "Pendiente", generadoEl: "2026-07-01T15:00:00.000Z" });
  const u = usado(2_500, "2026-03-01T15:00:00.000Z");
  const creditos = [usadoEntero, vencidoConResto, vigente, pendiente];
  const b = billeteraDeCredito(creditos, "vence@ejemplo.com", new Date("2026-08-01T15:00:00.000Z"), { usos: [u] });
  assert.deepEqual([b.disponible, b.vencido, b.pendiente, b.proximoVencimiento], [3_000, 4_500, 2_000, { monto: 3_000, venceEl: "2026-12-01" }]);
  assert.deepEqual(
    b.movimientos.filter((m) => m.tipo === "ganado").map((m) => [m.pedido, m.estado, m.venceEl, m.restante]),
    [
      [pendiente.pedido, "pendiente", "2027-03-01", null],
      [vigente.pedido, "disponible", "2026-12-01", 3_000],
      [vencidoConResto.pedido, "vencido", "2026-07-10", 4_500],
      [usadoEntero.pedido, "usado", "2026-07-05", 0],
    ]
  );
  // Es el mismo número que el cálculo del checkout con esas filas.
  const delCheckout = saldo(creditos, [u], "2026-08-01T15:00:00.000Z");
  assert.equal(b.disponible, delCheckout.usable);
  assert.equal(b.vencido, delCheckout.vencido);
  assert.deepEqual(b.proximoVencimiento, delCheckout.proximoVencimiento);
});

// ---------- 3. Con la tabla «Créditos» (Airtable de prueba) ----------

const MAIL = "vence@ejemplo.com";

async function creditoEnTabla(campos: Partial<CamposCredito> & { Monto: number }) {
  const pedido = `HARPER-T${++secuencia}`;
  return createRecord<CamposCredito>(TABLAS.creditos, {
    Clave: `credito-harper:${pedido}`,
    Pedido: pedido,
    Email: MAIL,
    Porcentaje: 5,
    Base: campos.Monto * 20,
    Anteojos: 1,
    Estado: "Disponible",
    Generado_el: "2026-01-01T15:00:00.000Z",
    Reglas: "credito-harper-v1",
    Notas: "",
    ...campos,
  });
}
async function usoEnTabla(numero: string, monto: number, estado: string, generadoEl: string) {
  return createRecord<CamposCredito>(TABLAS.creditos, {
    Clave: claveDelUso(numero),
    Pedido: numero,
    Email: MAIL,
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
function cuentaConReloj(inicio: number) {
  const reloj = {
    t: inicio,
    ahora: () => reloj.t,
    dormir: async (ms: number) => {
      reloj.t += ms;
      await new Promise<void>((listo) => setImmediate(listo));
    },
  };
  const deps: DependenciasUso = { almacen: almacenUsosAirtable, pedidos: lectorPedidosDeUsosAirtable, cerrojo: cerrojoEnMemoria({ ahora: () => reloj.t }), reloj, esperaOcupadoMs: 2_000 };
  return { deps, reloj };
}

test("Reserva el último día y el pago se acredita después del vencimiento: se confirma sin sobregiro, y una compra nueva usa el que sigue vigente", async () => {
  await creditoEnTabla({ Monto: 5_000, Disponible_desde: "2026-11-10" }); // vence 2027-05-10
  await creditoEnTabla({ Monto: 3_000, Disponible_desde: "2027-01-20" }); // vence 2027-07-20
  const numero = "HARPER-RESERVA1";
  const pedido = await createRecord(TABLAS.pedidos, { Numero: numero, Estado: "pendiente", Total: 0, Fecha: "2027-05-11T02:50:00.000Z" });
  // 23:50 del 10/05 en Buenos Aires: todavía vale el primero.
  const { deps, reloj } = cuentaConReloj(Date.parse("2027-05-11T02:50:00.000Z"));

  const abierta = await abrirCuentaDeCredito(MAIL, deps);
  if ("estado" in abierta) throw new Error("ocupada");
  try {
    assert.deepEqual([abierta.cuenta.saldo.usable, abierta.cuenta.saldo.proximoVencimiento], [8_000, { monto: 5_000, venceEl: "2027-05-10" }]);
    await abierta.cuenta.reservar(numero, 4_000);
    // Con la reserva nueva se vuelve a repartir: salió del que vence hoy.
    assert.deepEqual(abierta.cuenta.saldo.porCredito.map((c) => c.restante), [1_000, 3_000]);
    assert.equal(abierta.cuenta.saldo.usable, 4_000);
  } finally {
    await abierta.cerrar();
  }

  // Al día siguiente, con el pago en revisión en Mercado Pago (la reserva sigue).
  await updateRecord(TABLAS.pedidos, pedido.id, { MP_status: "in_process" });
  reloj.t = Date.parse("2027-05-11T15:00:00.000Z");
  const despues = await leerSaldoDeCredito(MAIL, deps);
  assert.deepEqual([despues.usable, despues.vencido, despues.sobregiro, despues.reservado], [3_000, 1_000, 0, 4_000]);

  // Se acredita el pago: «Usado», sin sobregiro ni aviso a Harper.
  const otra = await abrirCuentaDeCredito(MAIL, deps);
  if ("estado" in otra) throw new Error("ocupada");
  try {
    const r = await otra.cuenta.confirmar(numero);
    assert.equal(r.estado, "confirmado");
    if (r.estado === "confirmado") assert.equal(r.sobregiro, 0, "lo apartado antes de vencer quedó cubierto");
    // Una compra nueva, ya vencido el primero: sale del que sigue vigente.
    await otra.cuenta.reservar("HARPER-RESERVA2", 2_000);
    assert.deepEqual([otra.cuenta.saldo.usable, otra.cuenta.saldo.vencido, otra.cuenta.saldo.sobregiro], [1_000, 1_000, 0]);
  } finally {
    await otra.cerrar();
  }
});

async function lineas() {
  const productos = await getProductos();
  const p = (slug: string) => productos.find((x) => x.slug === slug)!;
  return (slug: string, n = 0, cantidad = 1): ItemCarrito => ({ productoSlug: slug, varianteId: p(slug).variantes[n].id, cantidad });
}

test("La billetera de Mi Cuenta muestra lo mismo que ofrecen el carrito y el checkout, con un crédito vencido usado en parte", async () => {
  // Con el reloj de verdad: el carrito lee la hora del servidor (Date.now()).
  const hoy = fechaArgentina(new Date());
  // Vencido hace unos días (200 días desde que quedó disponible), usado en parte cuando valía.
  const viejo = await creditoEnTabla({ Monto: 10_000, Disponible_desde: sumarDias(hoy, -200), Generado_el: new Date(Date.now() - 260 * 86_400_000).toISOString() });
  assert.ok(estaVencido(sumarDias(hoy, -200), hoy), "el viejo ya venció");
  await usoEnTabla("HARPER-USO-VIEJO", 3_000, "Usado", new Date(Date.now() - 100 * 86_400_000).toISOString());
  // Dos vigentes; el que vence antes paga el uso de hace 5 días y la reserva en curso.
  await creditoEnTabla({ Monto: 4_495, Disponible_desde: sumarDias(hoy, -30), Generado_el: new Date(Date.now() - 70 * 86_400_000).toISOString() });
  await creditoEnTabla({ Monto: 15_733, Disponible_desde: sumarDias(hoy, -10), Generado_el: new Date(Date.now() - 50 * 86_400_000).toISOString() });
  await usoEnTabla("HARPER-USO-RECIENTE", 2_000, "Usado", new Date(Date.now() - 5 * 86_400_000).toISOString());
  await usoEnTabla("HARPER-RESERVA-EN-CURSO", 1_000, "Reservado", new Date().toISOString());
  const esperado = 4_495 - 2_000 - 1_000 + 15_733;
  const peticion = new Request("https://harper.ar/api/carrito/resolver", { method: "POST", headers: { cookie: `${COOKIE_CUENTA}=${crearSesionCuenta(claveDeSesionCuenta()!, MAIL)}` } });

  const vistos = await prendido(async () => {
    const billetera = await billeteraDeLaCuenta({ tipo: "comprador", email: MAIL });
    const carrito = await creditoParaElCarrito(peticion, true);
    const linea = await lineas();
    const resuelto = await resolverCarrito([linea("amatista"), linea("obsidiana")], { paraCobrar: true, ...(carrito ? { creditoHarper: carrito } : {}) });
    const { deps } = cuentaConReloj(Date.now());
    const abierta = await abrirCuentaDeCredito(MAIL, deps);
    if ("estado" in abierta) throw new Error("ocupada");
    try {
      return { billetera, carrito, resuelto, checkout: abierta.cuenta.saldo };
    } finally {
      await abierta.cerrar();
    }
  });

  assert.equal(vistos.billetera.disponible, esperado);
  assert.equal(vistos.carrito?.usable, esperado, "el carrito ofrece lo mismo");
  assert.equal(vistos.resuelto.creditoHarper?.usable, esperado, "el checkout (resolverCarrito) también");
  assert.equal(vistos.checkout.usable, esperado, "y la cuenta tomada para reservar");
  // Lo vencido se ve en la billetera y no se ofrece en ningún lado.
  assert.equal(vistos.billetera.vencido, 7_000);
  assert.equal(vistos.checkout.vencido, 7_000);
  assert.equal(vistos.checkout.sobregiro, 0, "lo usado del vencido no es deuda");
  // El próximo vencimiento es el mismo en la billetera y en el carrito.
  assert.deepEqual(vistos.billetera.proximoVencimiento, { monto: 4_495 - 3_000, venceEl: venceEl(sumarDias(hoy, -30)) });
  assert.deepEqual(vistos.carrito?.proximoVencimiento, vistos.billetera.proximoVencimiento);
  // Y el crédito usado en el checkout nunca pasa de lo que se puede usar.
  assert.ok((vistos.resuelto.creditoHarper?.usado ?? 0) <= esperado);
});
