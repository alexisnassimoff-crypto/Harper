import { test } from "node:test";
import assert from "node:assert/strict";
import { leerImpuestos, leerTasa, netoDe, precioSinImpuestosNacionales } from "../lib/impuestos";

test("sin dato del contador no hay precio sin impuestos (no se supone el tratamiento fiscal)", () => {
  const impuestos = leerImpuestos(new Map());
  assert.equal(netoDe(impuestos, "Anteojos", 89900), null);
});

test("el neto sale del precio final, con centavos, y el precio final no cambia", () => {
  assert.equal(precioSinImpuestosNacionales(89900, 21), 74297.52);
  assert.equal(precioSinImpuestosNacionales(89900, 10.5), 81357.47);
  assert.equal(precioSinImpuestosNacionales(89900, 0), 89900);
});

test("una categoría con otra alícuota gana sobre la general", () => {
  const impuestos = leerImpuestos(new Map([["impuestos_nacionales", "21"], ["impuestos_nacionales_panos", "10,5 %"]]));
  assert.equal(netoDe(impuestos, "Anteojos", 89900), 74297.52);
  assert.equal(netoDe(impuestos, "Paños", 89900), 81357.47);
});

test("valores inválidos se ignoran", () => {
  for (const v of ["", " ", "abc", "-5", "100", "150"]) assert.equal(leerTasa(v), null, `con "${v}"`);
  assert.equal(leerTasa("21%"), 21);
  assert.equal(leerTasa("10,5"), 10.5);
});
