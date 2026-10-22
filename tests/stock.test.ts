import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

process.env.HARPER_FIXTURES = "1";
delete process.env.VERCEL;

import { getRecord, TABLAS } from "../lib/airtable";
import { CAMPO_MARCAS, descontarStock, leerMarcas } from "../lib/stock";
import type { ItemResuelto } from "../lib/tipos";

type FilaVariante = { Stock?: number; Stock_pedidos?: string };

// Dos variantes del catálogo de prueba, con 12 unidades cada una.
const AMATISTA_NEGRO = "recLvS1Rce368QVeX";
const OBSIDIANA_NEGRO = "rect8rgXzLjIGbTge";

function item(varianteId: string, cantidad = 1): ItemResuelto {
  return {
    productoId: "p",
    productoSlug: "x",
    nombre: "X",
    categoria: "Anteojos",
    varianteId,
    sku: "X",
    color: "Negro",
    foto: null,
    precioLista: 89900,
    precioUnitario: 89900,
    descuento: 0,
    cantidad,
    subtotal: 89900 * cantidad,
    stockDisponible: 12,
  };
}

async function stockDe(id: string) {
  const v = await getRecord<FilaVariante>(TABLAS.variantes, id);
  return { stock: v.fields.Stock, marcas: leerMarcas(v.fields.Stock_pedidos) };
}

beforeEach(async () => {
  const { reiniciar, interceptar } = await import("../lib/fixtures/servidor");
  reiniciar();
  interceptar(null);
});

test("descuenta una vez y deja la marca del pedido en la variante, en la misma escritura", async () => {
  const r = await descontarStock([item(AMATISTA_NEGRO)], "HARPER-1");
  assert.deepEqual(r, { descontadas: [AMATISTA_NEGRO], omitidas: [], sinMarca: false });
  assert.deepEqual(await stockDe(AMATISTA_NEGRO), { stock: 11, marcas: ["HARPER-1"] });
});

test("el mismo pedido otra vez (reintento) no vuelve a descontar", async () => {
  await descontarStock([item(AMATISTA_NEGRO), item(OBSIDIANA_NEGRO, 2)], "HARPER-1");
  const r = await descontarStock([item(AMATISTA_NEGRO), item(OBSIDIANA_NEGRO, 2)], "HARPER-1");

  assert.deepEqual(r, { descontadas: [], omitidas: [AMATISTA_NEGRO, OBSIDIANA_NEGRO], sinMarca: false });
  assert.deepEqual(await stockDe(AMATISTA_NEGRO), { stock: 11, marcas: ["HARPER-1"] });
  assert.deepEqual(await stockDe(OBSIDIANA_NEGRO), { stock: 10, marcas: ["HARPER-1"] });
});

test("otro pedido sobre la misma variante sí descuenta, y la marca más nueva va primero", async () => {
  await descontarStock([item(AMATISTA_NEGRO)], "HARPER-1");
  await descontarStock([item(AMATISTA_NEGRO)], "HARPER-2");
  assert.deepEqual(await stockDe(AMATISTA_NEGRO), { stock: 10, marcas: ["HARPER-2", "HARPER-1"] });
});

test("un reintento parcial: la variante ya marcada se salta, la otra se descuenta", async () => {
  await descontarStock([item(AMATISTA_NEGRO)], "HARPER-1");
  // El primer intento se cayó antes de llegar a la segunda variante.
  const r = await descontarStock([item(AMATISTA_NEGRO), item(OBSIDIANA_NEGRO)], "HARPER-1");
  assert.deepEqual(r.omitidas, [AMATISTA_NEGRO]);
  assert.deepEqual(r.descontadas, [OBSIDIANA_NEGRO]);
  assert.equal((await stockDe(AMATISTA_NEGRO)).stock, 11);
  assert.equal((await stockDe(OBSIDIANA_NEGRO)).stock, 11);
});

test("la misma variante en dos renglones se suma; el stock nunca queda negativo", async () => {
  await descontarStock([item(AMATISTA_NEGRO, 10), item(AMATISTA_NEGRO, 5)], "HARPER-1");
  assert.deepEqual(await stockDe(AMATISTA_NEGRO), { stock: 0, marcas: ["HARPER-1"] });
});

test("recuerda los últimos 50 pedidos", async () => {
  for (let i = 1; i <= 55; i++) {
    await descontarStock([item(AMATISTA_NEGRO, 0)], `HARPER-${i}`);
  }
  const { marcas } = await stockDe(AMATISTA_NEGRO);
  assert.equal(marcas.length, 50);
  assert.equal(marcas[0], "HARPER-55");
  assert.equal(marcas[49], "HARPER-6");
});

test("si la base no tiene el campo de marcas, descuenta igual y lo avisa", async () => {
  const { interceptar, RespuestaFixture } = await import("../lib/fixtures/servidor");

  // Airtable contesta 422 UNKNOWN_FIELD_NAME ante un campo que no existe.
  interceptar((path, llamada) => {
    if (llamada.method === "PATCH" && path.startsWith(encodeURIComponent(TABLAS.variantes)) && llamada.body?.includes(CAMPO_MARCAS)) {
      throw new RespuestaFixture(422, `{"error":{"type":"UNKNOWN_FIELD_NAME","message":"Unknown field name: \\"${CAMPO_MARCAS}\\""}}`);
    }
  });

  const r = await descontarStock([item(AMATISTA_NEGRO)], "HARPER-1");
  assert.equal(r.sinMarca, true);
  assert.deepEqual(r.descontadas, [AMATISTA_NEGRO]);
  assert.deepEqual(await stockDe(AMATISTA_NEGRO), { stock: 11, marcas: [] });
});

test("cualquier otro error de Airtable sí corta: el webhook devuelve 500 y Mercado Pago reintenta", async () => {
  const { interceptar, RespuestaFixture } = await import("../lib/fixtures/servidor");
  interceptar((_path, llamada) => {
    if (llamada.method === "PATCH") throw new RespuestaFixture(503, "Airtable caído");
  });

  await assert.rejects(descontarStock([item(AMATISTA_NEGRO)], "HARPER-1"), /503/);
  assert.equal((await stockDe(AMATISTA_NEGRO)).stock, 12);
});
