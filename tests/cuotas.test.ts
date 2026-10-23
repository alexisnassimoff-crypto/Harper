import { test } from "node:test";
import assert from "node:assert/strict";
import { cuotasActivas, importeCuota } from "../lib/cuotas";

test("sin variable no se anuncian cuotas", () => {
  delete process.env.NEXT_PUBLIC_CUOTAS;
  assert.equal(cuotasActivas(), null);
});

test("solo se aceptan enteros de 2 o más", () => {
  for (const [valor, esperado] of [
    ["3", 3],
    ["6", 6],
    ["12", 12],
    ["1", null],
    ["0", null],
    ["si", null],
    [" ", null],
    ["3.5", 3],
  ] as const) {
    process.env.NEXT_PUBLIC_CUOTAS = valor;
    assert.equal(cuotasActivas(), esperado, `con "${valor}"`);
  }
  delete process.env.NEXT_PUBLIC_CUOTAS;
});

test("el importe por cuota redondea hacia arriba al peso", () => {
  assert.equal(importeCuota(89900, 3), 29967);
  assert.equal(importeCuota(89900, 6), 14984);
  assert.equal(importeCuota(6990, 3), 2330);
  assert.equal(importeCuota(100, 1), 100);
  assert.equal(importeCuota(100, 0), 100);
});
