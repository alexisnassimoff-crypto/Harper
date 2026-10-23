import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";

process.env.HARPER_FIXTURES = "1";
delete process.env.VERCEL;

import { getRecord, TABLAS } from "../lib/airtable";
import { ErrorCerrojoOcupado } from "../lib/cerrojo";
import { cerrojoEnMemoria, reiniciarRedis } from "../lib/fixtures/redis";
import { interceptar, reiniciar, RespuestaFixture } from "../lib/fixtures/servidor";
import { CAMPO_MARCAS, descontarStock, leerMarcas } from "../lib/stock";
import type { ItemResuelto } from "../lib/tipos";
import type { Reloj } from "../lib/webhook-lock";

type FilaVariante = { Stock?: number; Stock_pedidos?: string };

// Dos variantes del catálogo de prueba, con 12 unidades cada una.
const AMATISTA_NEGRO = "recLvS1Rce368QVeX";
const OBSIDIANA_NEGRO = "rect8rgXzLjIGbTge";

const instancia = new AsyncLocalStorage<string>();
const como = <T>(nombre: string, fn: () => Promise<T>) => instancia.run(nombre, fn);
const quien = () => instancia.getStore() ?? "?";
const tick = () => new Promise<void>((r) => setImmediate(r));

async function hasta(condicion: () => boolean, intentos = 200) {
  for (let i = 0; i < intentos; i++) {
    if (condicion()) return;
    await tick();
  }
  throw new Error("la condición no se cumplió");
}

function relojFalso(): Reloj {
  let t = 1_761_000_000_000;
  return {
    ahora: () => t,
    async dormir(ms) {
      t += ms;
      await tick();
    },
  };
}

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

const LIMPIO = { omitidas: [], noEncontradas: [] };

beforeEach(() => {
  reiniciar();
  reiniciarRedis();
  interceptar(null);
});

test("descuenta una vez y deja la marca del pedido en la variante, en la misma escritura", async () => {
  const r = await descontarStock([item(AMATISTA_NEGRO)], "HARPER-1");
  assert.deepEqual(r, { descontadas: [AMATISTA_NEGRO], ...LIMPIO });
  assert.deepEqual(await stockDe(AMATISTA_NEGRO), { stock: 11, marcas: ["HARPER-1"] });
});

test("el mismo pedido otra vez (reintento) no vuelve a descontar", async () => {
  await descontarStock([item(AMATISTA_NEGRO), item(OBSIDIANA_NEGRO, 2)], "HARPER-1");
  const r = await descontarStock([item(AMATISTA_NEGRO), item(OBSIDIANA_NEGRO, 2)], "HARPER-1");

  assert.deepEqual(r, { descontadas: [], omitidas: [AMATISTA_NEGRO, OBSIDIANA_NEGRO], noEncontradas: [] });
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

test("una variante borrada a mano (404) se salta y se informa; las demás se descuentan", async () => {
  const r = await descontarStock([item("recBORRADA00000001"), item(AMATISTA_NEGRO)], "HARPER-1");
  assert.deepEqual(r, { descontadas: [AMATISTA_NEGRO], omitidas: [], noEncontradas: ["recBORRADA00000001"] });
  assert.equal((await stockDe(AMATISTA_NEGRO)).stock, 11);
});

test("un error transitorio al leer una variante (503, 429) corta TODO el descuento: nada se escribe y el webhook reintenta", async () => {
  // Falla la lectura de la segunda variante; la primera ya se había leído bien.
  interceptar((path, llamada) => {
    if (llamada.method === "GET" && path.endsWith(OBSIDIANA_NEGRO)) throw new RespuestaFixture(503, "Airtable caído");
  });

  await assert.rejects(descontarStock([item(AMATISTA_NEGRO), item(OBSIDIANA_NEGRO)], "HARPER-1"), /503/);

  // Con Airtable sano: nada quedó escrito, y el reintento descuenta las dos.
  interceptar(null);
  assert.deepEqual(await stockDe(AMATISTA_NEGRO), { stock: 12, marcas: [] });
  assert.deepEqual(await stockDe(OBSIDIANA_NEGRO), { stock: 12, marcas: [] });
  const r = await descontarStock([item(AMATISTA_NEGRO), item(OBSIDIANA_NEGRO)], "HARPER-1");
  assert.deepEqual(r.descontadas, [AMATISTA_NEGRO, OBSIDIANA_NEGRO]);
  assert.equal((await stockDe(OBSIDIANA_NEGRO)).stock, 11);
});

test("si la base no tiene el campo de marcas (422), NO se descuenta nada: el error sube", async () => {
  interceptar((path, llamada) => {
    if (llamada.method === "PATCH" && path.startsWith(encodeURIComponent(TABLAS.variantes)) && llamada.body?.includes(CAMPO_MARCAS)) {
      throw new RespuestaFixture(422, `{"error":{"type":"UNKNOWN_FIELD_NAME","message":"Unknown field name: \\"${CAMPO_MARCAS}\\""}}`);
    }
  });

  await assert.rejects(descontarStock([item(AMATISTA_NEGRO)], "HARPER-1"), /422.*UNKNOWN_FIELD_NAME/);
  assert.deepEqual(await stockDe(AMATISTA_NEGRO), { stock: 12, marcas: [] });
});

test("si el campo de marcas tiene otro tipo (422 INVALID_VALUE_FOR_COLUMN), tampoco se descuenta", async () => {
  interceptar((path, llamada) => {
    if (llamada.method === "PATCH" && path.startsWith(encodeURIComponent(TABLAS.variantes))) {
      throw new RespuestaFixture(422, `{"error":{"type":"INVALID_VALUE_FOR_COLUMN","message":"Field \\"${CAMPO_MARCAS}\\" cannot accept the provided value"}}`);
    }
  });

  await assert.rejects(descontarStock([item(AMATISTA_NEGRO)], "HARPER-1"), /422/);
  assert.deepEqual(await stockDe(AMATISTA_NEGRO), { stock: 12, marcas: [] });
});

test("cualquier otro error de Airtable al escribir sí corta: el webhook devuelve 500 y Mercado Pago reintenta", async () => {
  interceptar((_path, llamada) => {
    if (llamada.method === "PATCH") throw new RespuestaFixture(503, "Airtable caído");
  });

  await assert.rejects(descontarStock([item(AMATISTA_NEGRO)], "HARPER-1"), /503/);
  assert.equal((await stockDe(AMATISTA_NEGRO)).stock, 12);
});

// ---- Dos pedidos distintos sobre la misma variante ----

/**
 * Fuerza el entrelazado malo: B lee la variante después de que A la leyó y
 * ANTES de que A escriba. Sin cerrojo, los dos ven 12 y los dos escriben 11:
 * una unidad vendida desaparece del descuento.
 */
function entrelazarLecturas(abrirCuando: () => boolean) {
  interceptar(async (path, llamada) => {
    if (quien() === "A" && llamada.method === "PATCH" && path.startsWith(encodeURIComponent(TABLAS.variantes))) {
      await hasta(abrirCuando);
    }
  });
}

test("CONTROL sin cerrojo: dos pedidos a la vez sobre la misma variante se pisan la lectura (12 → 11 en vez de 10)", async () => {
  let leyoB = false;
  const interceptorBase = (path: string, llamada: { method: string }) => {
    if (quien() === "B" && llamada.method === "GET" && path.endsWith(AMATISTA_NEGRO)) leyoB = true;
  };
  interceptar(async (path, llamada) => {
    interceptorBase(path, llamada);
    if (quien() === "A" && llamada.method === "PATCH") await hasta(() => leyoB);
  });

  await Promise.all([
    como("A", () => descontarStock([item(AMATISTA_NEGRO)], "HARPER-A")),
    como("B", () => descontarStock([item(AMATISTA_NEGRO)], "HARPER-B")),
  ]);

  // Documenta el problema que el cerrojo resuelve: el stock real debería ser 10.
  const { stock, marcas } = await stockDe(AMATISTA_NEGRO);
  assert.equal(stock, 11);
  assert.equal(marcas.length, 1);
});

test("CON cerrojo: dos pedidos a la vez sobre la misma variante se serializan y el stock baja las dos unidades (12 → 10)", async () => {
  const reloj = relojFalso();
  const cerrojo = cerrojoEnMemoria(reloj);

  // A escribe recién cuando B ya intentó tomar la llave (y está esperando).
  let intentosAntesDeB = 0;
  entrelazarLecturas(() => cerrojo.intentos > intentosAntesDeB + 1);

  const a = como("A", async () => {
    const r = await descontarStock([item(AMATISTA_NEGRO)], "HARPER-A", { cerrojo, reloj });
    return r;
  });
  await hasta(() => cerrojo.intentos >= 1);
  intentosAntesDeB = cerrojo.intentos - 1;
  const b = como("B", () => descontarStock([item(AMATISTA_NEGRO)], "HARPER-B", { cerrojo, reloj }));

  const [ra, rb] = await Promise.all([a, b]);
  assert.deepEqual(ra.descontadas, [AMATISTA_NEGRO]);
  assert.deepEqual(rb.descontadas, [AMATISTA_NEGRO]);
  assert.deepEqual(await stockDe(AMATISTA_NEGRO), { stock: 10, marcas: ["HARPER-B", "HARPER-A"] });
  // Y las llaves quedaron sueltas.
  assert.equal(await cerrojo.tomar("harper:variante:" + AMATISTA_NEGRO, "x", 1000), true);
});

test("CON cerrojo: si otro pedido no suelta la variante a tiempo, se corta como transitorio (reintento), sin escribir", async () => {
  const reloj = relojFalso();
  const cerrojo = cerrojoEnMemoria(reloj);
  assert.ok(await cerrojo.tomar("harper:variante:" + AMATISTA_NEGRO, "otro-pedido", 60_000));

  await assert.rejects(descontarStock([item(AMATISTA_NEGRO)], "HARPER-1", { cerrojo, reloj }), ErrorCerrojoOcupado);
  assert.deepEqual(await stockDe(AMATISTA_NEGRO), { stock: 12, marcas: [] });
});

test("CON cerrojo: las llaves se piden en orden fijo y se sueltan aunque Airtable falle", async () => {
  const reloj = relojFalso();
  const cerrojo = cerrojoEnMemoria(reloj);
  interceptar((_path, llamada) => {
    if (llamada.method === "PATCH") throw new RespuestaFixture(503, "Airtable caído");
  });

  await assert.rejects(descontarStock([item(OBSIDIANA_NEGRO), item(AMATISTA_NEGRO)], "HARPER-1", { cerrojo, reloj }), /503/);
  // Las dos llaves quedaron libres.
  assert.equal(await cerrojo.tomar("harper:variante:" + AMATISTA_NEGRO, "x", 1000), true);
  assert.equal(await cerrojo.tomar("harper:variante:" + OBSIDIANA_NEGRO, "x", 1000), true);
});
