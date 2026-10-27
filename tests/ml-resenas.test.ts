import { test } from "node:test";
import assert from "node:assert/strict";

import {
  combinarOpiniones,
  leerReputacion,
  leerResenasDeItem,
  nombreMedalla,
  textoVentas,
} from "../lib/ml-resenas";

function resena(id: number, rate: number, content: string, date: string) {
  return { id, rate, title: "Muy buenos", content, date_created: date, status: "published" };
}

const CUARZO = {
  paging: { total: 3, offset: 0, limit: 50 },
  reviews: [
    resena(1, 5, "Excelentes, muy livianos y cómodos.", "2026-09-10T12:00:00.000-03:00"),
    resena(2, 4, "Buena calidad, llegaron rápido.", "2026-10-01T12:00:00.000-03:00"),
    resena(3, 2, "No me gustó el color en persona.", "2026-10-05T12:00:00.000-03:00"),
  ],
  rating_average: 3.7,
  rating_levels: { one_star: 0, two_star: 1, three_star: 0, four_star: 1, five_star: 1 },
};

test("lee las opiniones de una publicación y descarta lo que no tiene forma", () => {
  const leidas = leerResenasDeItem(CUARZO, "CUARZO")!;
  assert.equal(leidas.total, 3);
  assert.deepEqual(leidas.niveles, [0, 1, 0, 1, 1]);
  assert.equal(leidas.resenas.length, 3);
  assert.equal(leidas.resenas[0].modelo, "CUARZO");

  assert.equal(leerResenasDeItem(null), null);
  assert.equal(leerResenasDeItem("error"), null);
  const rara = leerResenasDeItem({ reviews: [{ id: 9, rate: 7, content: "x" }, { rate: 5 }] })!;
  assert.equal(rara.resenas.length, 0, "sin id o con estrellas fuera de rango no entra");
  assert.equal(rara.total, 0);
});

test("combina publicaciones sin contar dos veces las que comparten opiniones", () => {
  const cuarzoNegro = leerResenasDeItem(CUARZO, "CUARZO")!;
  // Mercado Libre devuelve las mismas opiniones en otro color del mismo modelo.
  const cuarzoAmbar = leerResenasDeItem(CUARZO, "CUARZO")!;
  const citrino = leerResenasDeItem(
    {
      paging: { total: 2 },
      reviews: [
        resena(10, 5, "Los uso todo el día frente a la compu.", "2026-10-20T09:00:00.000-03:00"),
        resena(11, 5, "Bien", "2026-10-21T09:00:00.000-03:00"),
      ],
      rating_levels: { one_star: 0, two_star: 0, three_star: 0, four_star: 0, five_star: 2 },
    },
    "CITRINO"
  )!;

  const opiniones = combinarOpiniones([cuarzoNegro, cuarzoAmbar, citrino])!;
  assert.equal(opiniones.total, 5, "3 de Cuarzo (una vez) + 2 de Citrino");
  // (2 + 4 + 5 + 5 + 5) / 5 = 4,2
  assert.equal(opiniones.promedio, 4.2);
  // Solo 4 o 5 estrellas con un texto que diga algo; la más reciente primero.
  assert.deepEqual(
    opiniones.destacadas.map((r) => r.id),
    ["10", "2", "1"]
  );
  assert.equal(opiniones.destacadas[0].modelo, "CITRINO");
});

test("sin opiniones no hay bloque", () => {
  assert.equal(combinarOpiniones([]), null);
  assert.equal(combinarOpiniones([leerResenasDeItem({ paging: { total: 0 }, reviews: [] })!]), null);
});

test("lee la reputación de vendedor", () => {
  const reputacion = leerReputacion({
    id: 123,
    seller_reputation: {
      level_id: "5_green",
      power_seller_status: "gold",
      transactions: { completed: 587, canceled: 3, total: 590, period: "historic", ratings: { positive: 0.98, negative: 0.01, neutral: 0.01 } },
    },
  });
  assert.deepEqual(reputacion, { medalla: "gold", nivel: 5, ventas: 587, positivas: 98 });
  assert.equal(nombreMedalla("gold"), "MercadoLíder Gold");

  assert.equal(leerReputacion({}), null);
  assert.equal(leerReputacion({ seller_reputation: { level_id: null, power_seller_status: null, transactions: { completed: 0 } } }), null);
  assert.deepEqual(
    leerReputacion({ seller_reputation: { level_id: "raro", power_seller_status: "diamante", transactions: { completed: 40 } } }),
    { medalla: null, nivel: null, ventas: 40, positivas: null }
  );
});

test("las ventas se redondean para abajo, nunca para arriba", () => {
  assert.equal(textoVentas(587), "+500 ventas");
  assert.equal(textoVentas(1234), "+1200 ventas");
  assert.equal(textoVentas(100), "+100 ventas");
  assert.equal(textoVentas(42), "42 ventas");
  assert.equal(textoVentas(1), "1 venta");
});
