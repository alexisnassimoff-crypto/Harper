import { test } from "node:test";
import assert from "node:assert/strict";
import { desglosar } from "../lib/resumen";

test("dos anteojos con 5%: la cuenta cierra de arriba abajo", () => {
  // El servidor manda el subtotal ya descontado (2 × 85.405) y el ahorro.
  const d = desglosar({ subtotal: 170810, ahorro: 8990, envio: 0 });
  assert.equal(d.lista, 179800);
  assert.equal(d.descuento, 8990);
  assert.equal(d.lista - d.descuento + d.envio, d.total);
  assert.equal(d.total, 170810);
});

test("sin descuento y con envío", () => {
  const d = desglosar({ subtotal: 6990, ahorro: 0, envio: 10100 });
  assert.equal(d.lista, 6990);
  assert.equal(d.descuento, 0);
  assert.equal(d.total, 17090);
});

test("HARPER10 y dineroMP: cada descuento en su línea, la cuenta cierra", () => {
  // $ 89.900 − $ 8.990 (cupón) = $ 80.910; − $ 8.091 (dinero en Mercado Pago) = $ 72.819.
  const d = desglosar({ subtotal: 80910, ahorro: 8990, ahorroDineroMP: 8091, envio: 0 });
  assert.equal(d.lista, 89900);
  assert.equal(d.descuento, 8990);
  assert.equal(d.dineroMP, 8091);
  assert.equal(d.total, 72819);
  assert.equal(d.ahorroTotal, 17081);
  assert.equal(d.lista - d.descuento - d.dineroMP + d.envio, d.total);
});

test("el dinero en Mercado Pago no toca el envío", () => {
  const d = desglosar({ subtotal: 8010, ahorro: 890, ahorroDineroMP: 801, envio: 10100 });
  assert.equal(d.envio, 10100);
  assert.equal(d.total, 8010 - 801 + 10100);
});
