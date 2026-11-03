import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { TABLAS } from "../lib/airtable";
import { atender, reiniciar, RespuestaFixture } from "../lib/fixtures/servidor";

type Lista = { records: { id: string; fields: Record<string, unknown> }[] };

beforeEach(() => reiniciar());

test("lista con fórmula y orden, igual que la API", () => {
  const r = atender<Lista>(encodeURIComponent(TABLAS.productos), {
    method: "GET",
    query: { filterByFormula: "{Activo}", "sort[0][field]": "Orden" },
  });

  // El producto de prueba (sin Activo) queda afuera.
  assert.equal(r.records.length, 10);
  assert.ok(r.records.every((f) => f.fields.Activo === true));

  const anteojos = r.records.filter((f) => f.fields.Categoria === "Anteojos");
  assert.deepEqual(
    anteojos.map((f) => f.fields.Nombre),
    ["AMATISTA", "OBSIDIANA", "CUARZO", "CITRINO"]
  );
});

test("maxRecords y lectura puntual", () => {
  const uno = atender<Lista>(encodeURIComponent(TABLAS.productos), {
    method: "GET",
    query: { filterByFormula: "AND({Activo}, {Slug} = 'citrino')", maxRecords: "1" },
  });
  assert.equal(uno.records.length, 1);
  assert.equal(uno.records[0].fields.Nombre, "CITRINO");

  const puntual = atender<{ id: string }>(`${encodeURIComponent(TABLAS.productos)}/${uno.records[0].id}`, {
    method: "GET",
  });
  assert.equal(puntual.id, uno.records[0].id);
});

test("crear y actualizar quedan en memoria; un id inexistente da 404", () => {
  const creado = atender<{ id: string; fields: Record<string, unknown> }>(
    encodeURIComponent(TABLAS.pedidos),
    { method: "POST", body: JSON.stringify({ fields: { Numero: "HP-0001", Estado: "pendiente" } }) }
  );
  assert.match(creado.id, /^recFIX/);

  atender(`${encodeURIComponent(TABLAS.pedidos)}/${creado.id}`, {
    method: "PATCH",
    body: JSON.stringify({ fields: { Estado: "pagado" } }),
  });

  const leido = atender<Lista>(encodeURIComponent(TABLAS.pedidos), {
    method: "GET",
    query: { filterByFormula: '{Numero} = "HP-0001"' },
  });
  assert.equal(leido.records[0].fields.Estado, "pagado");
  // PATCH no borra lo que no se manda.
  assert.equal(leido.records[0].fields.Numero, "HP-0001");

  assert.throws(
    () => atender(`${encodeURIComponent(TABLAS.pedidos)}/recNOEXISTE000000`, { method: "GET" }),
    (e: unknown) => e instanceof RespuestaFixture && e.status === 404
  );
});

test("reiniciar vuelve al catálogo inicial", () => {
  atender(encodeURIComponent(TABLAS.pedidos), {
    method: "POST",
    body: JSON.stringify({ fields: { Numero: "HP-0002" } }),
  });
  reiniciar();

  // Queda solo el pedido de prueba que viene de fábrica (HARPER-PRUEBA, ya
  // pagado, para ver /gracias confirmada sin cobrar); el creado acá se fue.
  const pedidos = atender<Lista>(encodeURIComponent(TABLAS.pedidos), { method: "GET", query: {} });
  assert.deepEqual(
    pedidos.records.map((r) => r.fields.Numero),
    ["HARPER-PRUEBA"]
  );
});
