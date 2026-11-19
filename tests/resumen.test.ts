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

test("la cuenta: sin renglón de cupón de bienvenida; el saldo de antes en el suyo, y la cuenta cierra (Ale, 18/11/2026)", () => {
  // Un pedido de hoy con saldo a favor de antes: $ 89.900 − $ 20.000 (saldo) = $ 69.900; − $ 6.990 (dinero en Mercado Pago) = $ 62.910.
  const d = desglosar({ subtotal: 69900, ahorro: 0, ahorroDineroMP: 6990, envio: 0, suscriptor: { cupon: 0, saldoUsado: 20000 } });
  assert.equal(d.lista, 89900);
  assert.equal(d.descuento, 0);
  assert.equal(d.cupon, 0, "el cupón de bienvenida terminó: no tiene renglón");
  assert.equal(d.saldo, 20000);
  assert.equal(d.total, 62910);
  assert.equal(d.lista - d.descuento - d.saldo - d.dineroMP + d.envio, d.total);
  // El saldo es plata del comprador: no se cuenta como ahorro.
  assert.equal(d.ahorroTotal, 6990);
  // Lo mismo sin mandar el campo del cupón, que es lo que hace el servidor hoy.
  assert.deepEqual(desglosar({ subtotal: 69900, ahorro: 0, ahorroDineroMP: 6990, envio: 0, suscriptor: { saldoUsado: 20000 } }), d);

  // Si llegara un importe de cupón (un pedido de antes del 18/11), nunca vuelve
  // a tener renglón propio: va con los descuentos, y la cuenta sigue cerrando.
  // $ 89.900 − $ 10.000 (cupón) − $ 20.000 (saldo) = $ 59.900; − $ 5.990 = $ 53.910.
  const deAntes = desglosar({ subtotal: 59900, ahorro: 0, ahorroDineroMP: 5990, envio: 0, suscriptor: { cupon: 10000, saldoUsado: 20000 } });
  assert.equal(deAntes.cupon, 0);
  assert.equal(deAntes.descuento, 10000);
  assert.equal(deAntes.lista, 89900);
  assert.equal(deAntes.total, 53910);
  assert.equal(deAntes.lista - deAntes.descuento - deAntes.cupon - deAntes.saldo - deAntes.dineroMP + deAntes.envio, deAntes.total);
  assert.equal(deAntes.ahorroTotal, 15990);
});

test("Dúo y dinero en Mercado Pago: dos anteojos de $ 89.900 quedan en $ 157.325 y en $ 141.593, y la cuenta cierra (Ale, 18/11/2026)", () => {
  // El servidor manda el subtotal con el Dúo ya descontado y su ahorro; el 10 % va sobre lo que queda.
  const d = desglosar({ subtotal: 157325, ahorro: 22475, ahorroDineroMP: 157325 - 141593, envio: 0 });
  assert.equal(d.lista, 179800);
  assert.equal(d.descuento, 22475);
  assert.equal(d.dineroMP, 15732);
  assert.equal(d.total, 141593);
  assert.equal(d.lista - d.descuento - d.dineroMP + d.envio, d.total);
  assert.equal(d.ahorroTotal, 22475 + 15732);
  // Con el envío (dos anteojos fuera de AMBA no llegan a $ 250.000): el 10 % no lo toca.
  const conEnvio = desglosar({ subtotal: 157325, ahorro: 22475, ahorroDineroMP: 15732, envio: 10100 });
  assert.equal(conEnvio.total, 141593 + 10100);
});

test("sin suscriptor, nada cambia", () => {
  const d = desglosar({ subtotal: 89900, ahorro: 0, envio: 0, suscriptor: null });
  assert.equal(d.lista, 89900);
  assert.equal(d.cupon, 0);
  assert.equal(d.saldo, 0);
});
