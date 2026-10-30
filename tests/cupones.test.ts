import { test } from "node:test";
import assert from "node:assert/strict";

// El carrito se resuelve contra el Airtable de prueba.
process.env.HARPER_FIXTURES = "1";
delete process.env.VERCEL;

import {
  aplicarMejorPromocion,
  buscarCupon,
  CUPON_BIENVENIDA,
  HAY_CUPONES,
  cuponDeNotas,
  mensajeDelCupon,
  normalizarCodigo,
  precioConCupon,
} from "../lib/cupones";
import { getProductos } from "../lib/catalogo";
import { resolverCarrito } from "../lib/pedidos";
import type { ItemResuelto } from "../lib/tipos";

// HARPER10 dejó de ofrecerse el 30/10/2026 (Ale): la promoción es «llevá 3,
// pagá 2 · llevá 5, pagá 3». La lógica del cupón queda probada con la lista
// de cupones explícita, por si vuelve uno.
const CON_HARPER10 = [CUPON_BIENVENIDA];

test("HARPER10 ya no se acepta: no hay cupones vigentes", () => {
  assert.equal(HAY_CUPONES, false);
  assert.equal(buscarCupon("HARPER10"), null);
});

test("el código se reconoce sin importar mayúsculas ni espacios; otro código no existe", () => {
  assert.equal(normalizarCodigo(" harper10 "), "HARPER10");
  assert.equal(buscarCupon("Harper10", CON_HARPER10)?.porcentaje, 10);
  assert.equal(buscarCupon("HARPER20", CON_HARPER10), null);
  assert.equal(buscarCupon(undefined, CON_HARPER10), null);
});

test("10% sobre el precio, redondeado a peso como los demás descuentos", () => {
  assert.equal(precioConCupon(89900), 80910);
  assert.equal(precioConCupon(10900), 9810);
  assert.equal(precioConCupon(8900), 8010);
  assert.equal(precioConCupon(32900), 29610);
  assert.equal(precioConCupon(29900), 26910);
});

function item(precioLista: number, cantidad: number, descuento = 0): ItemResuelto {
  const precioUnitario = descuento ? Math.round(precioLista * (1 - descuento / 100)) : precioLista;
  return {
    productoId: "p",
    productoSlug: "p",
    nombre: "P",
    categoria: "Anteojos",
    varianteId: `v${precioLista}${cantidad}`,
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

test("un par: se aplica el cupón y se ahorra el 10% exacto", () => {
  const r = aplicarMejorPromocion([item(89900, 1)], "HARPER10", CON_HARPER10);
  assert.deepEqual(r.cupon, { codigo: "HARPER10", estado: "aplicado", ahorro: 8990 });
  assert.equal(r.items[0].precioUnitario, 80910);
  assert.equal(r.items[0].subtotal, 80910);
  assert.equal(r.items[0].descuento, 10);
});

test("no se acumula: con dos pares (5% cada uno) gana el cupón, que conviene más", () => {
  const r = aplicarMejorPromocion([item(89900, 2, 5)], "HARPER10", CON_HARPER10);
  assert.equal(r.cupon?.estado, "aplicado");
  assert.equal(r.items[0].descuento, 10, "10%, no 5% + 10%");
  assert.equal(r.items[0].subtotal, 161820);
  assert.equal(r.cupon?.ahorro, 17980);
});

test("si la promoción por cantidad es mejor (o igual), queda esa y el cupón no se aplica", () => {
  const mejor = [item(8900, 8, 15)];
  const r = aplicarMejorPromocion(mejor, "HARPER10", CON_HARPER10);
  assert.equal(r.cupon?.estado, "no-conviene");
  assert.deepEqual(r.items, mejor);
  assert.match(mensajeDelCupon(r.cupon!) ?? "", /no se suma a otras promociones/);

  const igual = aplicarMejorPromocion([item(10000, 4, 10)], "HARPER10", CON_HARPER10);
  assert.equal(igual.cupon?.estado, "no-conviene");
});

test("un código inexistente no cambia nada; sin código no hay cupón", () => {
  const items = [item(89900, 1)];
  assert.deepEqual(aplicarMejorPromocion(items, "OTRO").cupon, { codigo: "OTRO", estado: "invalido", ahorro: 0 });
  assert.equal(aplicarMejorPromocion(items, "").cupon, null);
  assert.equal(aplicarMejorPromocion(items, undefined).items, items);
});

test("el cupón guardado en Notas (si faltaba el campo) se recupera para el aviso", () => {
  assert.equal(cuponDeNotas("DATOS DE FACTURACIÓN\nFactura B\n\nCupón: HARPER10 (−$ 8.990)"), "HARPER10 (−$ 8.990)");
  assert.equal(cuponDeNotas("Llamar antes"), null);
});

test("en el carrito real: un HARPER10 guardado no descuenta nada y el carrito cobra lo mismo", async () => {
  const productos = await getProductos();
  const amatista = productos.find((p) => p.slug === "amatista")!;
  const par = [{ productoSlug: "amatista", varianteId: amatista.variantes[0].id, cantidad: 1 }];

  const sin = await resolverCarrito(par);
  const con = await resolverCarrito(par, { cupon: "harper10" });
  assert.equal(con.cupon?.estado, "invalido");
  assert.equal(con.subtotal, sin.subtotal);
  assert.equal(con.total, sin.total);
  assert.equal(con.ahorro, 0);
});
