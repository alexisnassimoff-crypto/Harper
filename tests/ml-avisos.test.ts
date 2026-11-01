import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calcularGanancia,
  cicloOptimo,
  decisionesARevisar,
  enviosDeOrdenes,
  esLunes,
  firmaDelPlan,
  leerCostoDeEnvio,
  leerResumenAds,
  mailDeEnvio,
  mailSemanal,
  motivoSinPlan,
  textoDeCorrida,
  PARAMETROS_FULL,
  pendientesDeAle,
  planDeEnvio,
  ritmoDeVenta,
  stockEnFull,
  resumenDePreguntas,
  resumenDeVentas,
  semanas,
  type FilaStock,
} from "../lib/ml-avisos";

const fila = (id: string, stock: number | null, unidades30: number, estado = "active", logistica = "fulfillment", unidades7 = 0): FilaStock => ({
  id,
  titulo: `Pub ${id}`,
  estado,
  stock,
  unidades30,
  unidades7,
  permalink: `https://x/${id}`,
  logistica,
});

const P = { ...PARAMETROS_FULL, diasReposicion: 10, diasSeguridad: 5, avisoAnticipado: 3 };

test("ciclo de envío: sin tarifa de almacenamiento no se pasa de los días sin cargo; con tarifa busca el más barato", () => {
  const sinTarifa = cicloOptimo(P, 10);
  assert.equal(sinTarifa.ciclo, 30);
  assert.equal(sinTarifa.costoMensual, 30_000);

  // Almacenamiento barato: conviene juntar mucho y pagar menos colectas.
  assert.equal(cicloOptimo({ ...P, almacenamientoUnidadMes: 10 }, 10).ciclo, 120);
  // Almacenamiento caro: apenas un poco más que los días sin cargo.
  const caro = cicloOptimo({ ...P, almacenamientoUnidadMes: 500 }, 10).ciclo;
  assert.ok(caro > 30 && caro <= 40, `ciclo ${caro}`);
});

test("el plan: un solo envío con todo lo de Full, cuando la primera llega al punto de reposición", () => {
  const plan = planDeEnvio(
    [
      fila("marron", 3, 17), // ~5 días: se agota antes de que llegue el envío
      fila("rect", 128, 113), // ~34 días
      fila("anteojo", 6, 1), // 180 días: no hace falta mandar, y es stock lento
      fila("magnetico", 54, 35), // 1 unidad de más sobre 54: no es stock lento
      fila("agotada", 0, 9, "paused"), // ML la pausó por falta de stock
      fila("coral", 2, 5, "active", "xd_drop_off"), // no es de Full
      fila("sinventas", 6, 0), // stock lento sin ventas
    ],
    P
  );

  assert.equal(plan.ciclo, 30);
  assert.equal(plan.diasHastaEnvio, 0);
  assert.equal(plan.hayQueEnviar, true);
  assert.deepEqual(plan.items.map((i) => i.id), ["agotada", "marron", "rect"]);
  // Cubre 10 de reposición + 30 de ciclo + 5 de seguridad = 45 días.
  assert.equal(plan.items.find((i) => i.id === "marron")?.mandar, 23);
  assert.equal(plan.items.find((i) => i.id === "rect")?.mandar, 42);
  assert.equal(plan.items.find((i) => i.id === "marron")?.seAgotaAntes, true);
  assert.equal(plan.items.find((i) => i.id === "rect")?.seAgotaAntes, false);
  // El rectangular tiene 34 días de stock pero vende mucho: no es lento.
  // El anteojo vende 1 por mes: de sus 6, ~4 no se venden en los 45 días que cubre el plan.
  assert.equal(plan.cobertura, 45);
  assert.deepEqual(plan.lentos.map((l) => [l.id, l.excedente]), [["sinventas", 6], ["anteojo", 4]]);
  assert.equal(firmaDelPlan(plan), "agotada,marron,rect");

  const mail = mailDeEnvio(plan, P);
  assert.match(mail.asunto, /armá el envío hoy mismo \(2 se agotan antes de que llegue\)/);
  assert.match(mail.texto, /Total del envío: 79/);
  assert.match(mail.texto, /Stock lento en Full/);
});

test("el ritmo de venta usa la última semana si va más rápido que el mes", () => {
  assert.deepEqual(ritmoDeVenta({ unidades30: 30, unidades7: 7 }), { porDia: 1, acelera: false });
  const r = ritmoDeVenta({ unidades30: 30, unidades7: 14 });
  assert.equal(r.porDia, 2);
  assert.equal(r.acelera, true);
  // Si la última semana viene floja, se sigue planeando con el mes.
  assert.equal(ritmoDeVenta({ unidades30: 60, unidades7: 3 }).porDia, 2);
  // Con la venta acelerada, el mismo stock alcanza menos días y hay que mandar más.
  const normal = planDeEnvio([fila("rect", 60, 30, "active", "fulfillment", 7)], P).items;
  const rapido = planDeEnvio([fila("rect", 60, 30, "active", "fulfillment", 14)], P).items[0];
  assert.equal(normal.length, 0); // 60 días de stock: todavía no hace falta
  assert.equal(rapido.mandar, 30); // 2 por día × 45 − 60
  assert.equal(rapido.acelera, true);
});

test("con los tiempos reales (11 días hasta la venta, 7 de seguridad, aviso 7 antes) da la fecha límite con tiempo", () => {
  const real = { ...PARAMETROS_FULL };
  assert.equal(real.diasReposicion, 11);
  // 113 por mes = 3,77 por día; 128 unidades = 34 días. Punto de reposición: 18 días → armarlo en 15 días.
  const plan = planDeEnvio([fila("rect", 128, 113)], real, "2026-11-01");
  assert.equal(plan.diasHastaEnvio, 15);
  assert.equal(plan.fechaLimite, "2026-11-16");
  assert.equal(plan.hayQueEnviar, false); // falta más de una semana
  const cerca = planDeEnvio([fila("rect", 90, 113)], real, "2026-11-01"); // 23 días → armarlo en 5
  assert.equal(cerca.hayQueEnviar, true);
  assert.match(mailDeEnvio(cerca, real).asunto, /a más tardar el 06\/11 \(en 5 días\)/);
});

test("los pendientes de Ale se repiten por prioridad y antigüedad hasta que están hechos", () => {
  assert.deepEqual(
    pendientesDeAle([
      { Tarea: "Publicar packs", Para: "Ale", Estado: "Pendiente", Desde: "2026-11-01", Prioridad: 2 },
      { Tarea: "ROAS 8", Para: "Ale", Estado: "Pendiente", Desde: "2026-11-01", Prioridad: 1 },
      { Tarea: "Hecha", Para: "Ale", Estado: "Hecha", Desde: "2026-10-01", Prioridad: 1 },
      { Tarea: "De Claude", Para: "Claude", Estado: "Pendiente", Desde: "2026-11-01", Prioridad: 1 },
    ]).map((p) => p.tarea),
    ["ROAS 8", "Publicar packs"]
  );
});

test("el plan avisa con anticipación y no antes", () => {
  const lejos = planDeEnvio([fila("rect", 128, 113)], P); // 34 días − 15 = 19 días
  assert.equal(lejos.diasHastaEnvio, 18);
  assert.equal(lejos.hayQueEnviar, false);
  const cerca = planDeEnvio([fila("rect", 64, 113)], P); // 17 días − 15 = 2
  assert.equal(cerca.hayQueEnviar, true);
});

test("ganancia real: precio − cupón, cargos de ML, envío, impuestos, mercadería y packaging, todo sin IVA", () => {
  const rango = { desde: "2026-10-26", hasta: "2026-11-01" };
  const costos = new Map([
    ["RECT", { costo: 1038.68, packaging: 45 }],
    ["ANT", { costo: 8478.68, packaging: 45 }],
    ["VYCE", { costo: null, packaging: 45 }],
  ]);
  const ordenes = [
    // Un rectangular a $8.900 sin cupón: ML cobra $2.754 (16% + $1.330).
    { status: "paid", date_created: "2026-10-27T12:00:00.000-03:00", coupon: { amount: 0 }, shipping: { id: 1 }, order_items: [{ item: { id: "RECT" }, quantity: 1, unit_price: 8_900, sale_fee: 2_754 }] },
    // Un anteojo con cupón de $3.000 y envío a cargo del vendedor.
    { status: "paid", date_created: "2026-10-28T12:00:00.000-03:00", coupon: { amount: 3_000 }, shipping: { id: 2 }, order_items: [{ item: { id: "ANT" }, quantity: 1, unit_price: 85_405, sale_fee: 17_305.05 }] },
    // Sin costo cargado: queda afuera y se avisa.
    { status: "paid", date_created: "2026-10-29T12:00:00.000-03:00", coupon: { amount: 0 }, shipping: { id: 3 }, order_items: [{ item: { id: "VYCE" }, quantity: 1, unit_price: 110_900, sale_fee: 20_000 }] },
    // Fuera del rango y cancelada: no cuentan.
    { status: "paid", date_created: "2026-11-02T12:00:00.000-03:00", coupon: { amount: 0 }, shipping: { id: 4 }, order_items: [{ item: { id: "RECT" }, quantity: 1, unit_price: 8_900, sale_fee: 2_754 }] },
    { status: "cancelled", date_created: "2026-10-27T12:00:00.000-03:00", coupon: { amount: 0 }, shipping: { id: 5 }, order_items: [{ item: { id: "RECT" }, quantity: 1, unit_price: 8_900, sale_fee: 2_754 }] },
  ];
  assert.deepEqual(enviosDeOrdenes(ordenes, rango).sort(), ["1", "2", "3"]);

  const g = calcularGanancia({ ordenes, rango, costos, envioDe: new Map([["1", 0], ["2", 6_735], ["3", 7_000]]), publicidad: 10_000, colectas: 30_000 });

  assert.equal(g.ventas, 8_900 + 82_405);
  assert.equal(g.cupones, 3_000);
  assert.equal(g.cargosML, Math.round((2_754 + 17_305.05) / 1.21));
  assert.equal(g.envios, Math.round(6_735 / 1.21));
  assert.equal(g.mercaderia, Math.round(1038.68 + 8478.68));
  assert.equal(g.packaging, 90);
  assert.equal(g.colectas, Math.round(30_000 / 1.21));
  assert.equal(g.unidadesSinCosto, 1);
  assert.equal(g.ventasSinCosto, 110_900);
  // 75.459 sin IVA − 16.578 cargos − 5.566 envío − 10.000 publicidad − 2.147 impuestos − 9.517 − 90 − 24.793
  assert.equal(g.ganancia, 6_767);
  assert.equal(g.margen, Math.round((g.ganancia / g.ventasSinIva) * 1000) / 10);
});

test("un rectangular solo, sin publicidad ni colectas, deja lo mismo que dice el modelo antes de esos costos", () => {
  const g = calcularGanancia({
    ordenes: [{ status: "paid", date_created: "2026-10-27T12:00:00.000-03:00", coupon: { amount: 0 }, order_items: [{ item: { id: "R" }, quantity: 1, unit_price: 8_900, sale_fee: 2_754 }] }],
    rango: { desde: "2026-10-26", hasta: "2026-11-01" },
    costos: new Map([["R", { costo: 1038.68, packaging: 45 }]]),
    envioDe: new Map(),
    publicidad: 0,
    colectas: 0,
  });
  // 7.355 − 2.276 − 134 (IIBB) − 74 (cheque) − 1.039 − 45
  assert.equal(g.ganancia, 3_788);
});

test("costo de envío, semanas, ventas, publicidad, decisiones y preguntas", () => {
  assert.equal(leerCostoDeEnvio({ receiver: { cost: 0 }, senders: [{ cost: 6735.5 }] }), 6735.5);
  assert.equal(leerCostoDeEnvio({}), 0);

  const lunes = Date.parse("2026-11-02T13:30:00Z");
  assert.deepEqual(semanas(lunes), { actual: { desde: "2026-10-26", hasta: "2026-11-01" }, anterior: { desde: "2026-10-19", hasta: "2026-10-25" } });
  assert.equal(esLunes(lunes), true);
  assert.equal(esLunes(Date.parse("2026-11-02T01:00:00Z")), false);

  const s = semanas(lunes);
  const r = resumenDeVentas(
    [
      { status: "paid", date_created: "2026-10-27T12:00:00.000-03:00", order_items: [{ item: { id: "A", title: "Rect" }, quantity: 2, unit_price: 8_900 }] },
      { status: "paid", date_created: "2026-10-26T02:30:00.000Z", order_items: [{ item: { id: "A", title: "Rect" }, quantity: 1, unit_price: 8_900 }] }, // domingo 25 en Argentina
    ],
    s
  );
  assert.deepEqual(r.actual, { pedidos: 1, unidades: 2, facturado: 17_800 });
  assert.deepEqual(r.anterior, { pedidos: 1, unidades: 1, facturado: 8_900 });

  assert.deepEqual(leerResumenAds({ metrics_summary: { cost: 100, total_amount: 900, units_quantity: 3, acos: 11.1 } }), { costo: 100, ventas: 900, unidades: 3, acos: 11.1 });
  assert.equal(leerResumenAds({ results: [] }), null);

  assert.deepEqual(
    decisionesARevisar(
      [
        { Decision: "ROAS anteojos", Revisar_el: "2026-11-15", Estado: "Probando" },
        { Decision: "Vencida", Revisar_el: "2026-11-01", Estado: "Propuesta" },
        { Decision: "Lejana", Revisar_el: "2026-12-01", Estado: "Propuesta" },
        { Decision: "Cerrada", Revisar_el: "2026-11-05", Estado: "Hecha" },
      ],
      "2026-11-09"
    ).map((d) => d.decision),
    ["Vencida", "ROAS anteojos"]
  );

  assert.deepEqual(
    resumenDePreguntas(
      [
        { Recibida: "2026-11-01T04:00:53.229Z", Estado: "respondida sola" },
        { Recibida: "2026-10-30T15:00:00.000Z", Estado: "borrador" },
        { Recibida: "2026-11-02T15:00:00.000Z", Estado: "borrador" },
      ],
      s.actual
    ),
    { total: 2, solas: 1, borradores: 1, pendientes: 1 }
  );
});

test("el mail semanal trae la semana, el mes, la ganancia real y el próximo envío", () => {
  const s = semanas(Date.parse("2026-11-02T13:30:00Z"));
  const ganancia = calcularGanancia({
    ordenes: [{ status: "paid", date_created: "2026-10-27T12:00:00.000-03:00", coupon: { amount: 0 }, order_items: [{ item: { id: "R" }, quantity: 1, unit_price: 8_900, sale_fee: 2_754 }] }],
    rango: s.actual,
    costos: new Map([["R", { costo: 1038.68, packaging: 45 }]]),
    envioDe: new Map(),
    publicidad: 0,
    colectas: 0,
  });
  const mail = mailSemanal({
    semanas: s,
    ventas: {
      actual: { pedidos: 50, unidades: 70, facturado: 1_000_000 },
      anterior: { pedidos: 40, unidades: 60, facturado: 800_000 },
      porPublicacion: [{ id: "MLA1", titulo: "Rectangular", actual: { pedidos: 0, unidades: 30, facturado: 267_000 }, anterior: { pedidos: 0, unidades: 20, facturado: 178_000 } }],
    },
    meses: [{ titulo: "noviembre (1 al 1)", totales: { pedidos: 9, unidades: 12, facturado: 130_000 } }, { titulo: "octubre completo", totales: { pedidos: 228, unidades: 300, facturado: 4_007_585 } }],
    ganancias: [{ titulo: "Semana", rango: s.actual, ganancia }],
    ads: { actual: { costo: 120_000, ventas: 600_000, unidades: 40, acos: 20 }, anterior: null },
    plan: planDeEnvio([fila("marron", 3, 17)], P),
    parametros: P,
    decisiones: [{ decision: "ROAS anteojos", revisar: "2026-11-15", estado: "Probando" }],
    preguntas: { total: 4, solas: 3, borradores: 1, pendientes: 1 },
    pendientes: [{ tarea: "Subir Anteojos New a ROAS 8", desde: "2026-11-01", prioridad: 1 }],
  });
  assert.match(mail.asunto, /semana del 26\/10 al 01\/11/);
  assert.match(mail.asunto, /\+25%/);
  assert.match(mail.asunto, /ganancia/);
  assert.match(mail.texto, /octubre completo: \$\s?4\.007\.585/);
  assert.match(mail.texto, /Ganancia real/);
  assert.match(mail.html, /Margen sobre ventas sin IVA/);
  assert.match(mail.texto, /Próximo envío a Full: armarlo hoy mismo/);
  assert.match(mail.texto, /Pendientes tuyos:\n- Subir Anteojos New a ROAS 8 \(desde el 01\/11\)/);
  assert.match(mail.texto, /15\/11: ROAS anteojos/);
});

test("sin plan de envío, el aviso dice por qué", () => {
  assert.match(motivoSinPlan([]), /vacía/);
  // Las filas escritas antes de que existiera la columna Logistica.
  assert.match(motivoSinPlan([fila("rect", 128, 113, "active", "")]), /\/api\/ml\/metricas/);
  assert.match(motivoSinPlan([fila("rect", 128, 113, "active", "cross_docking")]), /nada que reponer/);
});

test("la última corrida de métricas queda en una línea, en hora de Argentina", () => {
  const cuando = Date.parse("2026-11-01T13:31:00Z");
  assert.equal(textoDeCorrida({ cuando, origen: "cron", ok: true, publicaciones: 40 }), "1/11, 10:31 · cron · bien, 40 publicaciones");
  assert.equal(textoDeCorrida({ cuando, origen: "a mano", ok: false, error: "Mercado Libre 500" }), "1/11, 10:31 · a mano · falló: Mercado Libre 500");
});

test("el plan usa el stock que está en Full, no el del depósito propio", () => {
  assert.equal(stockEnFull({ stock: 30, stockFull: 0 }), 0);
  assert.equal(stockEnFull({ stock: 30, stockFull: null }), 30);
  assert.equal(stockEnFull({ stock: null }), 0);

  // Sol: publicación de Full con 30 en el depósito y nada en Full, sin ventas: no es stock lento en Full.
  const sol = { ...fila("sol", 30, 0, "active", "fulfillment"), stockFull: 0 };
  // Rectangular: 140 en total pero solo 20 en Full; vende 3 por día.
  const rect = { ...fila("rect", 140, 90, "active", "fulfillment"), stockFull: 20 };
  const plan = planDeEnvio([sol, rect], P);
  assert.equal(plan.lentos.length, 0);
  assert.equal(plan.items[0].id, "rect");
  assert.equal(plan.items[0].stock, 20);
  // 20 en Full a 3 por día alcanzan ~6,7 días: está debajo del punto de reposición.
  assert.equal(plan.diasHastaEnvio, 0);
  assert.equal(plan.items[0].seAgotaAntes, true);
});
