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
  cbuValido,
  esPedidoPorTransferencia,
  fechaDeVencimiento,
  formatearCuit,
  leerDatosTransferencia,
  leerMedioPago,
  NOTA_TRANSFERENCIA,
  venceLaTransferencia,
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

test("el CBU se verifica con sus dos dígitos verificadores", () => {
  assert.equal(cbuValido("2850590940904181352016"), true);
  assert.equal(cbuValido("2850590940904181352017"), false, "último dígito cambiado");
  assert.equal(cbuValido("2850591940904181352016"), false, "primer bloque cambiado");
  assert.equal(cbuValido("285059094090418135201"), false, "21 dígitos");
});

test("sin titular, alias o un CBU válido no se ofrece la transferencia", () => {
  const completos: Record<string, string> = {
    transferencia_titular: "FOCUS VISION SRL",
    transferencia_cuit: "30718023161",
    transferencia_banco: "Banco",
    transferencia_cuenta: "CC 1",
    transferencia_cbu: "2850 5909 4090 4181 3520 16",
    transferencia_alias: "UN.ALIAS",
  };
  const leer = (datos: Record<string, string>) => leerDatosTransferencia((c) => datos[c]);

  assert.equal(leer(completos)?.cbu, "2850590940904181352016", "el CBU se guarda sin espacios");
  assert.equal(leer({ ...completos, transferencia_alias: "" }), null);
  assert.equal(leer({ ...completos, transferencia_titular: " " }), null);
  assert.equal(leer({ ...completos, transferencia_cbu: "2850590940904181352017" }), null);
});

test("CUIT con guiones, y el plazo de 24 horas en hora de Buenos Aires", () => {
  assert.equal(formatearCuit("30718023161"), "30-71802316-1");
  assert.equal(formatearCuit("algo"), "algo");

  const creado = new Date("2026-10-26T18:40:00Z"); // lunes 15:40 en Buenos Aires
  assert.equal(fechaDeVencimiento(venceLaTransferencia(creado)), "martes 27/10, 15:40");
});

test("el pedido se reconoce como transferencia por su campo o por la nota", () => {
  assert.equal(esPedidoPorTransferencia({ Medio_pago: "Transferencia" }), true);
  assert.equal(esPedidoPorTransferencia({ Notas: `Cupón: X\n\n${NOTA_TRANSFERENCIA}\nConfirmar: url` }), true);
  assert.equal(esPedidoPorTransferencia({ Medio_pago: "Mercado Pago" }), false);
  assert.equal(esPedidoPorTransferencia({}), false);
});

test("en el carrito real: la transferencia va junto al precio de siempre y no cambia el envío", async () => {
  const productos = await getProductos();
  const amatista = productos.find((p) => p.slug === "amatista")!;
  const estuche = productos.find((p) => p.slug === "m500")!;
  const par = [{ productoSlug: "amatista", varianteId: amatista.variantes[0].id, cantidad: 1 }];
  const chico = [{ productoSlug: "m500", varianteId: estuche.variantes[0].id, cantidad: 1 }];

  const con = await resolverCarrito(par, { cupon: "HARPER10" });
  assert.ok(con.transferencia, "la cuenta de prueba está cargada en Config");
  assert.equal(con.transferencia.subtotal, Math.round(con.subtotal * 0.9));
  assert.equal(con.transferencia.ahorro, con.subtotal - con.transferencia.subtotal);
  assert.equal(con.config.transferencia?.alias, "HARPER.PRUEBA.CUENTA");

  // Debajo del envío gratis: la transferencia no toca el envío.
  const chicoCon = await resolverCarrito(chico);
  assert.ok(chicoCon.envio > 0);
  assert.equal(chicoCon.transferencia?.subtotal, Math.round(estuche.precio * 0.9));

  assert.equal((await resolverCarrito([])).transferencia, null);
});
