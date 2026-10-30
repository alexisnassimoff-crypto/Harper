import { test } from "node:test";
import assert from "node:assert/strict";

import {
  combinarOpiniones,
  etiquetaDeProducto,
  leerDatosGuardados,
  leerPublicacionesDeLaCuenta,
  leerReputacion,
  leerResenasDeItem,
  nombreMedalla,
  textoVentas,
  unirPublicaciones,
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
  const leidas = leerResenasDeItem(CUARZO, "Modelo CUARZO")!;
  assert.equal(leidas.total, 3);
  assert.deepEqual(leidas.niveles, [0, 1, 0, 1, 1]);
  assert.equal(leidas.resenas.length, 3);
  assert.equal(leidas.resenas[0].producto, "Modelo CUARZO");

  assert.equal(leerResenasDeItem(null), null);
  assert.equal(leerResenasDeItem("error"), null);
  const rara = leerResenasDeItem({ reviews: [{ id: 9, rate: 7, content: "x" }, { rate: 5 }] })!;
  assert.equal(rara.resenas.length, 0, "sin id o con estrellas fuera de rango no entra");
  assert.equal(rara.total, 0);
});

test("combina publicaciones sin contar dos veces las que comparten opiniones", () => {
  const cuarzoNegro = leerResenasDeItem(CUARZO, "Modelo CUARZO")!;
  // Mercado Libre devuelve las mismas opiniones en otro color del mismo modelo.
  const cuarzoAmbar = leerResenasDeItem(CUARZO, "Modelo CUARZO")!;
  const citrino = leerResenasDeItem(
    {
      paging: { total: 2 },
      reviews: [
        resena(10, 5, "Los uso todo el día frente a la compu.", "2026-10-20T09:00:00.000-03:00"),
        resena(11, 5, "Bien", "2026-10-21T09:00:00.000-03:00"),
      ],
      rating_levels: { one_star: 0, two_star: 0, three_star: 0, four_star: 0, five_star: 2 },
    },
    "Modelo CITRINO"
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
  assert.equal(opiniones.destacadas[0].producto, "Modelo CITRINO");
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

test("cada opinión dice qué se compró: modelo de anteojos, estuche o paño", () => {
  assert.equal(etiquetaDeProducto("CUARZO", "Anteojos"), "Modelo CUARZO");
  assert.equal(etiquetaDeProducto("R100", "Estuches"), "Estuche R100");
  assert.equal(etiquetaDeProducto("Paño Premium Alta Densidad", "Paños"), "Paño Premium Alta Densidad", "sin «Paño Paño»");
  assert.equal(etiquetaDeProducto("Microfibra 15x18", "Paños"), "Paño Microfibra 15x18");
});

test("se leen las publicaciones de la tabla y las de la cuenta, sin repetir", () => {
  const unidas = unirPublicaciones(
    [
      { id: "MLA1", producto: "Modelo CUARZO" },
      { id: "MLA2", producto: null },
      { id: "MLA2", producto: "Estuche R100" },
    ],
    ["MLA1", "MLA3", "MLA3"]
  );
  assert.deepEqual(unidas, [
    { id: "MLA1", producto: "Modelo CUARZO" },
    { id: "MLA2", producto: "Estuche R100" },
    { id: "MLA3", producto: null },
  ]);
  assert.deepEqual(leerPublicacionesDeLaCuenta({ results: ["MLA9", 5, "otra cosa", "MLA10"], paging: { total: 2 } }), { ids: ["MLA9", "MLA10"], total: 2 });
  assert.deepEqual(leerPublicacionesDeLaCuenta(null), { ids: [], total: 0 });
});

test("las opiniones de todos los productos se juntan: estuches y paños también suman", () => {
  const anteojo = leerResenasDeItem(CUARZO, "Modelo CUARZO")!;
  const estuche = leerResenasDeItem(
    {
      paging: { total: 1 },
      reviews: [resena(30, 5, "El estuche es firme y cierra perfecto.", "2026-10-25T09:00:00.000-03:00")],
      rating_levels: { one_star: 0, two_star: 0, three_star: 0, four_star: 0, five_star: 1 },
    },
    "Estuche R100"
  )!;
  const opiniones = combinarOpiniones([anteojo, estuche])!;
  assert.equal(opiniones.total, 4);
  assert.equal(opiniones.destacadas[0].producto, "Estuche R100");
});

test("la copia guardada se valida antes de mostrarla", () => {
  const datos = { opiniones: { promedio: 4.8, total: 5, destacadas: [] }, reputacion: { medalla: "gold", nivel: 5, ventas: 633, positivas: 98 } };
  assert.deepEqual(leerDatosGuardados(datos), datos);
  assert.deepEqual(leerDatosGuardados({ opiniones: { total: 0, promedio: 0, destacadas: [] }, reputacion: null }), null);
  assert.equal(leerDatosGuardados("basura"), null);
  assert.deepEqual(leerDatosGuardados({ reputacion: { ventas: 10 } }), { opiniones: null, reputacion: { ventas: 10 } });
});
