import { test } from "node:test";
import assert from "node:assert/strict";

// El carrito se resuelve contra el Airtable de prueba.
process.env.HARPER_FIXTURES = "1";
delete process.env.VERCEL;

import { aplicarMejorPromocion } from "../lib/cupones";
import { getProductos } from "../lib/catalogo";
import { resolverCarrito } from "../lib/pedidos";
import {
  aplicarTransferencia,
  esPedidoPorTransferencia,
  leerMedioPago,
  MEDIO_TRANSFERENCIA,
  NOTA_TRANSFERENCIA,
  TIPOS_EXCLUIDOS_TRANSFERENCIA,
  unidadesParaCobrar,
} from "../lib/transferencia";
import type { ItemResuelto } from "../lib/tipos";

function item(precioLista: number, cantidad: number, descuento = 0, varianteId = `v${precioLista}${cantidad}`): ItemResuelto {
  const precioUnitario = descuento ? Math.round(precioLista * (1 - descuento / 100)) : precioLista;
  return {
    productoId: "p",
    productoSlug: "p",
    nombre: "P",
    categoria: "Anteojos",
    varianteId,
    sku: "S",
    color: "C",
    foto: null,
    precioLista,
    precioUnitario,
    descuento,
    cantidad,
    subtotal: precioUnitario * cantidad,
    stockDisponible: 10,
  };
}

const total = (items: ItemResuelto[]) => items.reduce((t, i) => t + i.subtotal, 0);

test("HARPER10 + transferencia: $ 89.900 → $ 80.910 → $ 72.819 (ahorro $ 17.081, no el 20%)", () => {
  const conCupon = aplicarMejorPromocion([item(89900, 1)], "HARPER10");
  const t = aplicarTransferencia(conCupon.items);
  assert.equal(conCupon.cupon?.ahorro, 8990);
  assert.equal(t.ahorro, 8091);
  assert.equal(t.subtotal, 72819);
  assert.equal(conCupon.cupon!.ahorro + t.ahorro, 17081);
  assert.equal(t.items[0].subtotal, 72819);
  assert.equal(t.items[0].descuento, 10, "el cupón queda registrado aparte");
  assert.equal(t.items[0].descuentoTransferencia, 10);
});

test("sin cupón, dos pares: 5% por cantidad y después 10% por transferencia", () => {
  // 2 × $ 85.405 = $ 170.810; por transferencia $ 153.729, como a mano.
  const t = aplicarTransferencia([item(89900, 2, 5)]);
  assert.equal(t.subtotal, 153729);
  assert.equal(t.ahorro, 17081);
  assert.equal(total(t.items), t.subtotal);
});

test("con cupón y dos pares: el cupón (10%, el mayor) y después la transferencia (10%)", () => {
  const promo = aplicarMejorPromocion([item(89900, 2, 5)], "HARPER10");
  assert.equal(promo.cupon?.estado, "aplicado");
  const t = aplicarTransferencia(promo.items);
  assert.equal(t.subtotal, 145638);
  assert.equal(t.ahorro, 16182);
});

test("varios renglones: el pedido suma exacto lo mismo que el 10% del total", () => {
  // Dos colores distintos, a $ 85.405 cada uno: por renglón darían $ 76.864,50.
  const items = [item(89900, 1, 5, "a"), item(89900, 1, 5, "b"), item(8900, 3, 0, "c")];
  const t = aplicarTransferencia(items);
  assert.equal(t.subtotal, Math.round(total(items) * 0.9));
  assert.equal(total(t.items), t.subtotal);
  assert.equal(t.ahorro, total(items) - t.subtotal);
});

test("solo 'transferencia' es transferencia; cualquier otra cosa, Mercado Pago", () => {
  assert.equal(leerMedioPago("transferencia"), "transferencia");
  assert.equal(leerMedioPago("TRANSFERENCIA"), "mercadopago");
  assert.equal(leerMedioPago(undefined), "mercadopago");
  assert.equal(leerMedioPago({}), "mercadopago");
});

test("a Mercado Pago, en pesos enteros: el renglón se parte si no se divide justo", () => {
  // Dos pares por $ 153.729: uno a $ 76.864 y otro a $ 76.865.
  assert.deepEqual(unidadesParaCobrar({ subtotal: 153729, cantidad: 2 }), [
    { precio: 76864, cantidad: 1 },
    { precio: 76865, cantidad: 1 },
  ]);
  // Un renglón exacto (todos los de Mercado Pago de siempre) queda igual.
  assert.deepEqual(unidadesParaCobrar({ subtotal: 80910 * 3, cantidad: 3 }), [{ precio: 80910, cantidad: 3 }]);
  // Siempre suma exacto.
  for (const [subtotal, cantidad] of [[230594, 3], [1000001, 7], [7609, 1], [68773 * 5 + 4, 5]]) {
    const partes = unidadesParaCobrar({ subtotal, cantidad });
    assert.equal(partes.reduce((t, u) => t + u.precio * u.cantidad, 0), subtotal);
    assert.equal(partes.reduce((t, u) => t + u.cantidad, 0), cantidad);
    assert.ok(partes.every((u) => Number.isInteger(u.precio)));
  }
});

test("por transferencia Mercado Pago ofrece solo dinero en cuenta: tarjetas, efectivo y cuotas sin tarjeta afuera", () => {
  for (const tipo of ["credit_card", "debit_card", "prepaid_card", "ticket", "digital_currency"]) {
    assert.ok((TIPOS_EXCLUIDOS_TRANSFERENCIA as readonly string[]).includes(tipo), tipo);
  }
  assert.ok(!(TIPOS_EXCLUIDOS_TRANSFERENCIA as readonly string[]).includes("account_money"));
});

test("el pedido se reconoce como transferencia por su campo o por la nota", () => {
  assert.equal(esPedidoPorTransferencia({ Medio_pago: MEDIO_TRANSFERENCIA }), true);
  assert.equal(esPedidoPorTransferencia({ Notas: `Cupón: X\n\n${NOTA_TRANSFERENCIA}` }), true);
  assert.equal(esPedidoPorTransferencia({ Medio_pago: "Mercado Pago" }), false);
  assert.equal(esPedidoPorTransferencia({ Notas: "DATOS DE FACTURACIÓN\nFactura B" }), false);
  assert.equal(esPedidoPorTransferencia({}), false);
});

test("en el carrito real: la transferencia va junto al precio de siempre y no cambia el envío", async () => {
  const productos = await getProductos();
  const amatista = productos.find((p) => p.slug === "amatista")!;
  const estuche = productos.find((p) => p.slug === "m500")!;
  const par = [{ productoSlug: "amatista", varianteId: amatista.variantes[0].id, cantidad: 1 }];
  const chico = [{ productoSlug: "m500", varianteId: estuche.variantes[0].id, cantidad: 1 }];

  const con = await resolverCarrito(par, { cupon: "HARPER10" });
  assert.ok(con.transferencia);
  assert.equal(con.transferencia.subtotal, Math.round(con.subtotal * 0.9));
  assert.equal(con.transferencia.ahorro, con.subtotal - con.transferencia.subtotal);

  // Debajo del envío gratis: la transferencia no toca el envío.
  const chicoCon = await resolverCarrito(chico);
  assert.ok(chicoCon.envio > 0);
  assert.equal(chicoCon.transferencia?.subtotal, Math.round(estuche.precio * 0.9));

  assert.equal((await resolverCarrito([])).transferencia, null);
});
