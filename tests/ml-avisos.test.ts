import { test } from "node:test";
import assert from "node:assert/strict";
import {
  alertasDeStock,
  decisionesARevisar,
  esLunes,
  firmaDeAlertas,
  leerResumenAds,
  mailDeStock,
  mailSemanal,
  resumenDePreguntas,
  resumenDeVentas,
  semanas,
  type FilaStock,
} from "../lib/ml-avisos";

const fila = (id: string, stock: number | null, unidades30: number, estado = "active"): FilaStock => ({
  id,
  titulo: `Pub ${id}`,
  estado,
  stock,
  unidades30,
  permalink: `https://x/${id}`,
});

test("la alerta de stock: menos de 21 días, de la más urgente a la menos, con cuánto mandar para 60 días", () => {
  const alertas = alertasDeStock([
    fila("marron", 3, 17), // ~5 días: urgente
    fila("rect", 128, 113), // ~34 días: no entra
    fila("azul", 10, 19), // ~16 días
    fila("agotada", 0, 9, "paused"), // ML la pausó por falta de stock
    fila("sinventas", 2, 0), // no vende: no se avisa
    fila("pausada", 5, 10, "paused"), // pausada a mano con stock: no se avisa
  ]);

  assert.deepEqual(alertas.map((a) => a.id), ["agotada", "marron", "azul"]);
  assert.equal(alertas[1].urgente, true);
  assert.equal(alertas[2].urgente, false);
  // 17 por mes = 0,567 por día; 60 días = 34; menos los 3 que hay = 31.
  assert.equal(alertas[1].mandar, 31);
  assert.equal(alertas[0].mandar, 18);
});

test("la firma de la alerta solo cambia si cambian las publicaciones o su urgencia", () => {
  const a = alertasDeStock([fila("a", 3, 17), fila("b", 10, 19)]);
  const b = alertasDeStock([fila("b", 9, 19), fila("a", 2, 17)]);
  assert.equal(firmaDeAlertas(a), firmaDeAlertas(b));
  const c = alertasDeStock([fila("a", 3, 17), fila("b", 2, 19)]); // b pasa a urgente
  assert.notEqual(firmaDeAlertas(a), firmaDeAlertas(c));
  assert.match(mailDeStock(a).asunto, /1 publicación se queda sin stock esta semana/);
});

test("las semanas son la última completa de lunes a domingo, en hora de Argentina", () => {
  // Lunes 2/11/2026 a las 10:30 en Argentina.
  const lunes = Date.parse("2026-11-02T13:30:00Z");
  assert.deepEqual(semanas(lunes), {
    actual: { desde: "2026-10-26", hasta: "2026-11-01" },
    anterior: { desde: "2026-10-19", hasta: "2026-10-25" },
  });
  assert.equal(esLunes(lunes), true);
  // El lunes 2/11 a las 01:00 UTC todavía es domingo 1/11 en Argentina.
  assert.equal(esLunes(Date.parse("2026-11-02T01:00:00Z")), false);
});

test("el resumen de ventas separa las dos semanas por fecha de Argentina", () => {
  const s = semanas(Date.parse("2026-11-02T13:30:00Z"));
  const orden = (fecha: string, id: string, cantidad: number, precio: number, status = "paid") => ({
    status,
    date_created: fecha,
    order_items: [{ item: { id, title: `Título ${id}` }, quantity: cantidad, unit_price: precio }],
  });
  const r = resumenDeVentas(
    [
      orden("2026-10-27T12:00:00.000-03:00", "MLA1", 2, 8_900),
      orden("2026-11-01T23:30:00.000-03:00", "MLA1", 1, 8_900),
      // Lunes 26/10 a las 01:00 en Argentina, aunque en UTC sea 26 también.
      orden("2026-10-26T04:00:00.000Z", "MLA2", 1, 89_900),
      orden("2026-10-20T10:00:00.000-03:00", "MLA1", 1, 8_900),
      orden("2026-10-20T10:00:00.000-03:00", "MLA1", 5, 1, "cancelled"),
      // Domingo 25/10 a las 23:30 en Argentina: semana anterior.
      orden("2026-10-26T02:30:00.000Z", "MLA2", 1, 89_900),
    ],
    s
  );
  assert.deepEqual(r.actual, { pedidos: 3, unidades: 4, facturado: 116_600 });
  assert.deepEqual(r.anterior, { pedidos: 2, unidades: 2, facturado: 98_800 });
  const mla1 = r.porPublicacion.find((p) => p.id === "MLA1");
  assert.equal(mla1?.titulo, "Título MLA1");
  assert.equal(mla1?.actual.unidades, 3);
  assert.equal(mla1?.anterior.unidades, 1);
});

test("publicidad, decisiones y preguntas para el resumen", () => {
  assert.deepEqual(leerResumenAds({ metrics_summary: { cost: 100, total_amount: 900, units_quantity: 3, acos: 11.1 } }), {
    costo: 100,
    ventas: 900,
    unidades: 3,
    acos: 11.1,
  });
  assert.equal(leerResumenAds({ results: [] }), null);

  const decisiones = decisionesARevisar(
    [
      { Decision: "ROAS anteojos", Revisar_el: "2026-11-15", Estado: "Probando" },
      { Decision: "Vencida", Revisar_el: "2026-11-01", Estado: "Propuesta" },
      { Decision: "Lejana", Revisar_el: "2026-12-01", Estado: "Propuesta" },
      { Decision: "Cerrada", Revisar_el: "2026-11-05", Estado: "Hecha" },
      { Decision: "Sin fecha", Estado: "Propuesta" },
    ],
    "2026-11-09"
  );
  assert.deepEqual(decisiones.map((d) => d.decision), ["Vencida", "ROAS anteojos"]);

  const s = { desde: "2026-10-26", hasta: "2026-11-01" };
  assert.deepEqual(
    resumenDePreguntas(
      [
        { Recibida: "2026-11-01T04:00:53.229Z", Estado: "respondida sola" }, // 1/11 01:00 en Argentina
        { Recibida: "2026-10-30T15:00:00.000Z", Estado: "borrador" },
        { Recibida: "2026-10-28T15:00:00.000Z", Estado: "aprobada" },
        { Recibida: "2026-11-02T15:00:00.000Z", Estado: "borrador" }, // otra semana
      ],
      s
    ),
    { total: 3, solas: 1, borradores: 2, pendientes: 1 }
  );
});

test("el mail semanal dice ventas, cambio, lo que más vendió, stock y decisiones", () => {
  const s = semanas(Date.parse("2026-11-02T13:30:00Z"));
  const mail = mailSemanal({
    semanas: s,
    ventas: {
      actual: { pedidos: 50, unidades: 70, facturado: 1_000_000 },
      anterior: { pedidos: 40, unidades: 60, facturado: 800_000 },
      porPublicacion: [{ id: "MLA1", titulo: "Rectangular", actual: { pedidos: 0, unidades: 30, facturado: 267_000 }, anterior: { pedidos: 0, unidades: 20, facturado: 178_000 } }],
    },
    ads: { actual: { costo: 120_000, ventas: 600_000, unidades: 40, acos: 20 }, anterior: null },
    alertas: alertasDeStock([fila("marron", 3, 17)]),
    decisiones: [{ decision: "ROAS anteojos", revisar: "2026-11-15", estado: "Probando" }],
    preguntas: { total: 4, solas: 3, borradores: 1, pendientes: 1 },
  });
  assert.match(mail.asunto, /semana del 26\/10 al 01\/11/);
  assert.match(mail.asunto, /\+25%/);
  assert.match(mail.texto, /Rectangular/);
  assert.match(mail.texto, /URGENTE Pub marron/);
  assert.match(mail.texto, /15\/11: ROAS anteojos/);
  assert.match(mail.html, /Publicidad sobre ventas totales: 12%/);
  assert.match(mail.html, /1 sin responder/);
});
