import { test } from "node:test";
import assert from "node:assert/strict";

// El carrito real del servidor contra el Airtable de prueba, con el envío
// gratis desde $ 160.000: así se ve que el umbral se mide antes del Dúo
// (Tarea 06): dos pares de $ 89.900 llegan a lista ($ 179.800) y con el Dúo
// pagan $ 157.325, debajo del mínimo, sin perder el envío gratis.
process.env.HARPER_FIXTURES = "1";
process.env.HARPER_FIXTURES_ENVIO_GRATIS_DESDE = "160000";
delete process.env.VERCEL;
delete process.env.HARPER_DUO_ACTIVO;

import { getProductos } from "../lib/catalogo";
import { conDescuento, totalConDescuento } from "../lib/descuentos";
import { unidadesParaCobrar } from "../lib/dinero-mp";
import { resolverCarrito, type CarritoResuelto } from "../lib/pedidos";
import { cashbackDe, type SuscriptorDelCarrito } from "../lib/suscriptores";
import type { ItemCarrito } from "../lib/tipos";

/** Integración del Dúo en resolverCarrito (Tarea 04), con el interruptor apagado y prendido. */

async function conInterruptor<T>(valor: string | undefined, hacer: () => Promise<T>): Promise<T> {
  const antes = process.env.HARPER_DUO_ACTIVO;
  if (valor === undefined) delete process.env.HARPER_DUO_ACTIVO;
  else process.env.HARPER_DUO_ACTIVO = valor;
  try {
    return await hacer();
  } finally {
    if (antes === undefined) delete process.env.HARPER_DUO_ACTIVO;
    else process.env.HARPER_DUO_ACTIVO = antes;
  }
}
const apagado = <T>(hacer: () => Promise<T>) => conInterruptor(undefined, hacer);
const prendido = <T>(hacer: () => Promise<T>) => conInterruptor("1", hacer);

async function variantes() {
  const productos = await getProductos();
  const v = (slug: string, n = 0) => {
    const p = productos.find((x) => x.slug === slug)!;
    return { productoSlug: slug, varianteId: p.variantes[n].id, precio: p.precio };
  };
  return { amatistaNegro: v("amatista", 0), cuarzoAmbar: v("cuarzo", 1), estuche: v("m500", 0) };
}
const linea = (v: { productoSlug: string; varianteId: string }, cantidad = 1): ItemCarrito => ({ productoSlug: v.productoSlug, varianteId: v.varianteId, cantidad });

/** Lo que se le manda a Mercado Pago (lib/mercadopago.ts): pesos enteros que suman el subtotal. */
function sumaParaMercadoPago(carrito: CarritoResuelto): number {
  return carrito.items.reduce(
    (total, i) =>
      total +
      (Number.isInteger(i.precioUnitario) ? [{ precio: i.precioUnitario, cantidad: i.cantidad }] : unidadesParaCobrar(i)).reduce((t, u) => {
        assert.ok(Number.isInteger(u.precio), "a Mercado Pago van pesos enteros");
        return t + u.precio * u.cantidad;
      }, 0),
    0
  );
}

/** Los importes del carrito que tienen que coincidir entre la vista y el cobro. */
const importes = (c: CarritoResuelto) => ({
  items: c.items.map((i) => ({ sku: i.sku, subtotal: i.subtotal, precioUnitario: i.precioUnitario, descuento: i.descuento })),
  subtotal: c.subtotal,
  subtotalSinCupon: c.subtotalSinCupon,
  envio: c.envio,
  total: c.total,
  ahorro: c.ahorro,
  dineroMP: c.dineroMP?.subtotal ?? null,
});

test("Dúo apagado: el carrito cobra exactamente lo de siempre", async () => {
  const { amatistaNegro, cuarzoAmbar, estuche } = await variantes();
  const items = [linea(amatistaNegro), linea(cuarzoAmbar), linea(estuche, 2)];

  const base = await apagado(() => resolverCarrito(items));
  // Los anteojos a precio de lista; los estuches, con su tramo de 2+ (5 %).
  assert.deepEqual(base.items.map((i) => i.subtotal), [89_900, 89_900, totalConDescuento(2 * estuche.precio, 5)]);
  assert.equal(base.subtotal, 179_800 + totalConDescuento(2 * estuche.precio, 5));
  assert.equal(base.ahorro, 2 * estuche.precio - totalConDescuento(2 * estuche.precio, 5));
  assert.equal(base.envio, 0, "supera el envío gratis de $ 160.000");
  assert.equal(base.total, base.subtotal);

  // Cualquier valor que no sea "1" es apagado, y da lo mismo, para mostrar y para cobrar.
  for (const valor of ["0", "", "true", "si"]) {
    const otro = await conInterruptor(valor, () => resolverCarrito(items));
    assert.deepEqual(importes(otro), importes(base), `HARPER_DUO_ACTIVO="${valor}"`);
  }
  const cobro = await apagado(() => resolverCarrito(items, { paraCobrar: true }));
  assert.deepEqual(importes(cobro), importes(base));
});

test("Dúo prendido: dos modelos y colores distintos, importes coherentes en todo el flujo", async () => {
  const { amatistaNegro, cuarzoAmbar } = await variantes();
  const items = [linea(amatistaNegro), linea(cuarzoAmbar)];
  const sin = await apagado(() => resolverCarrito(items));
  const con = await prendido(() => resolverCarrito(items));

  // Precios iguales: el 25 % va al primer renglón (lib/duo.ts).
  assert.deepEqual(con.items.map((i) => i.subtotal), [67_425, 89_900]);
  assert.deepEqual(con.items.map((i) => i.descuento), [25, 0]);
  assert.equal(con.subtotal, 157_325);
  assert.equal(con.ahorro, 22_475);
  assert.equal(con.subtotalSinCupon, 179_800, "el envío gratis se mide antes del Dúo (Tarea 06)");

  // Con el envío gratis desde $ 160.000: sin Dúo no paga envío, y con el Dúo
  // tampoco, aunque pague $ 157.325 (Tarea 06).
  assert.equal(sin.envio, 0);
  assert.equal(con.envio, 0);
  assert.equal(con.envioBonificado, true);
  assert.equal(con.total, 157_325);
  assert.equal(sin.total - con.total, 22_475, "el cliente ahorra el Dúo entero");

  // Dinero en Mercado Pago: el 10 % va sobre lo que ya tiene el Dúo, no sobre la lista.
  assert.equal(con.dineroMP?.subtotal, conDescuento(157_325, 10));

  // Lo que se le manda a Mercado Pago suma exactamente el subtotal.
  assert.equal(sumaParaMercadoPago(con), con.subtotal);

  // El checkout (paraCobrar) cobra lo mismo que mostró el carrito: un solo cálculo.
  const cobro = await prendido(() => resolverCarrito(items, { paraCobrar: true }));
  assert.deepEqual(importes(cobro), importes(con));
});

test("Dúo prendido: un anteojo solo queda igual que con el Dúo apagado", async () => {
  const { amatistaNegro, estuche } = await variantes();
  const items = [linea(amatistaNegro), linea(estuche)];
  const sin = await apagado(() => resolverCarrito(items));
  const con = await prendido(() => resolverCarrito(items));
  assert.deepEqual(importes(con), importes(sin));
  assert.equal(con.items[0].subtotal, 89_900);
});

test("Dúo prendido: los estuches siguen con su tramo y no cuentan para el Dúo", async () => {
  const { amatistaNegro, cuarzoAmbar, estuche } = await variantes();
  const con = await prendido(() => resolverCarrito([linea(amatistaNegro), linea(cuarzoAmbar), linea(estuche, 2)]));
  const estuches = totalConDescuento(2 * estuche.precio, 5);
  assert.deepEqual(con.items.map((i) => i.subtotal), [67_425, 89_900, estuches]);
  assert.equal(con.items[2].descuento, 5);
  assert.equal(con.subtotal, 157_325 + estuches);
  assert.equal(con.ahorro, 22_475 + (2 * estuche.precio - estuches));
  assert.equal(sumaParaMercadoPago(con), con.subtotal);
});

test("Dúo prendido: cuatro del mismo modelo y color, dos con el 25 %", async () => {
  const { amatistaNegro } = await variantes();
  const con = await prendido(() => resolverCarrito([linea(amatistaNegro, 4)]));
  assert.equal(con.items[0].subtotal, 314_650);
  assert.equal(con.items[0].precioUnitario, 78_662.5);
  assert.equal(con.items[0].descuento, 12.5);
  assert.equal(con.envio, 0);
  assert.equal(sumaParaMercadoPago(con), 314_650, "se manda partido en pesos enteros");
});

test("Dúo prendido con un suscriptor: primero el Dúo, después el cupón de bienvenida", async () => {
  const { amatistaNegro, cuarzoAmbar } = await variantes();
  const suscriptor: SuscriptorDelCarrito = { id: "recPRUEBA", email: "prueba@harper.ar", cuponDisponible: true, saldoDisponible: 0, activo: true };
  const con = await prendido(() => resolverCarrito([linea(amatistaNegro), linea(cuarzoAmbar)], { suscriptor }));
  assert.equal(con.subtotal + con.suscriptor!.cupon, 157_325, "el cupón va sobre lo que ya tiene el Dúo");
  assert.equal(con.subtotalSinCupon, 179_800, "el envío gratis se mide antes del Dúo y del cupón");
  assert.equal(con.suscriptor?.cupon, 10_000);
  assert.equal(con.subtotal, 147_325);
  assert.equal(con.envio, 0, "el suscriptor tiene envío gratis, como hoy");
  assert.equal(con.total, 147_325);
  assert.equal(con.suscriptor?.cashbackPrevisto, cashbackDe(147_325), "el cashback de hoy, sobre lo que paga");
  assert.equal(sumaParaMercadoPago(con), con.subtotal);
});
