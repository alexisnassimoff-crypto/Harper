import { test } from "node:test";
import assert from "node:assert/strict";
import { indiceVarianteInicial, rutaDeVariante } from "../lib/variantes";
import type { Producto, Variante } from "../lib/tipos";

function variante(id: string, sku: string, stock: number): Variante {
  return { id, sku, color: sku, colorHex: "#000", stock, fotos: [], agotada: stock <= 0 };
}

const producto: Producto = {
  id: "recP",
  nombre: "CITRINO",
  slug: "citrino",
  categoria: "Anteojos",
  descripcion: "",
  precio: 89900,
  precioAnterior: null,
  videos: [],
  variantes: [
    variante("recA", "CITRINO-NEGRO", 0),
    variante("recB", "CITRINO-AMBAR", 12),
    variante("recC", "CITRINO-CAREY", 3),
  ],
  fotoPrincipal: null,
  agotado: false,
  envase: null,
  incluye: [],
  medidas: null,
  material: null,
  lentes: null,
};

test("sin color pedido abre en el primero con stock", () => {
  assert.equal(indiceVarianteInicial(producto), 1);
  assert.equal(indiceVarianteInicial(producto, ""), 1);
  assert.equal(indiceVarianteInicial(producto, "no-existe"), 1);
});

test("con color pedido, por SKU o ID, sin importar mayúsculas y aunque esté agotado", () => {
  assert.equal(indiceVarianteInicial(producto, "citrino-carey"), 2);
  assert.equal(indiceVarianteInicial(producto, "CITRINO-CAREY"), 2);
  assert.equal(indiceVarianteInicial(producto, "recC"), 2);
  assert.equal(indiceVarianteInicial(producto, "citrino-negro"), 0);
});

test("la ruta solo lleva color cuando no es el que la ficha elegiría sola", () => {
  assert.equal(rutaDeVariante(producto, 1), "/producto/citrino");
  assert.equal(rutaDeVariante(producto, 2), "/producto/citrino/citrino-carey");
  assert.equal(rutaDeVariante(producto, 0), "/producto/citrino/citrino-negro");
  assert.equal(rutaDeVariante(producto, 9), "/producto/citrino");
});

test("todos agotados: abre en el primero", () => {
  const agotado = {
    ...producto,
    variantes: [variante("x", "X", 0), variante("y", "Y", 0)],
  };
  assert.equal(indiceVarianteInicial(agotado), 0);
  assert.equal(rutaDeVariante(agotado, 0), "/producto/citrino");
});
