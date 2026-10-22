import { test } from "node:test";
import assert from "node:assert/strict";
import { cumpleFormula } from "../lib/fixtures/formula";

const fila = {
  Activo: true,
  Slug: "amatista",
  Numero: "HP-0001",
  Email: "Ale@Harper.ar",
  Clave: "costo_envio",
  Stock: 0,
  Vacio: "",
};

test("un campo solo es verdadero si tiene valor", () => {
  assert.equal(cumpleFormula("{Activo}", fila), true);
  assert.equal(cumpleFormula("{Stock}", fila), false);
  assert.equal(cumpleFormula("{Vacio}", fila), false);
  assert.equal(cumpleFormula("{NoExiste}", fila), false);
});

test("AND con igualdad, como la busca el catálogo", () => {
  assert.equal(cumpleFormula("AND({Activo}, {Slug} = 'amatista')", fila), true);
  assert.equal(cumpleFormula("AND({Activo}, {Slug} = 'citrino')", fila), false);
  assert.equal(cumpleFormula("AND({Stock}, {Slug} = 'amatista')", fila), false);
});

test("comillas dobles y simples, con escape", () => {
  assert.equal(cumpleFormula('{Numero} = "HP-0001"', fila), true);
  assert.equal(cumpleFormula("{Clave} = 'costo_envio'", fila), true);
  assert.equal(cumpleFormula("{Slug} = 'ama\\'tista'", { Slug: "ama'tista" }), true);
});

test("LOWER, OR y NOT", () => {
  assert.equal(cumpleFormula("LOWER({Email}) = 'ale@harper.ar'", fila), true);
  assert.equal(cumpleFormula("OR({Stock}, {Activo})", fila), true);
  assert.equal(cumpleFormula("NOT({Activo})", fila), false);
  assert.equal(cumpleFormula("{Slug} != 'citrino'", fila), true);
});

test("números se comparan como números", () => {
  assert.equal(cumpleFormula("{Stock} = 0", fila), true);
  assert.equal(cumpleFormula("{Precio} = 100", { Precio: 100 }), true);
});

test("fórmula vacía deja pasar todo; una desconocida explota", () => {
  assert.equal(cumpleFormula("", fila), true);
  assert.throws(() => cumpleFormula("DATETIME_DIFF({A}, {B})", fila), /no soportada/);
});
