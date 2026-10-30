import { test } from "node:test";
import assert from "node:assert/strict";

// El carrito se resuelve contra el Airtable de prueba, que tiene la escala
// «llevá 3, pagá 2 · llevá 5, pagá 3» de anteojos junto a los tramos viejos.
process.env.HARPER_FIXTURES = "1";
process.env.HARPER_FIXTURES_ESCALA = "1";
delete process.env.VERCEL;

import { getProductos } from "../lib/catalogo";
import { aplicarDineroMP, unidadesParaCobrar } from "../lib/dinero-mp";
import {
  conEscala,
  escalaDe,
  fraseDeLaEscala,
  getTramos,
  nombreDelTramo,
  ofertaDeEscala,
  textoPorcentaje,
  totalConDescuento,
  type Tramo,
} from "../lib/descuentos";
import { armarPack, cantidadesDePack } from "../lib/packs";
import { resolverCarrito } from "../lib/pedidos";
import { empujeDeLaBarra } from "../lib/vitrina";

test("la escala manda en anteojos: los tramos por porcentaje de esa categoría no se aplican; los demás, sí", async () => {
  const tramos = await getTramos();
  const anteojos = tramos.filter((t) => t.categoria === "Anteojos");
  assert.deepEqual(
    anteojos.map((t) => [t.desdeUnidades, t.paga]),
    [
      [3, 2],
      [5, 3],
    ],
  );
  assert.equal(anteojos[0].porcentaje, 100 / 3, "el porcentaje sale exacto de la cuenta, sin redondear");
  assert.equal(anteojos[1].porcentaje, 40);
  assert.deepEqual(
    tramos.filter((t) => t.categoria === "Estuches").map((t) => [t.desdeUnidades, t.porcentaje]),
    [
      [2, 5],
      [4, 10],
      [8, 15],
      [15, 20],
    ],
  );
});

test("conEscala: sin escalones «llevá N, pagá M», los porcentajes quedan como estaban", () => {
  const viejos: Tramo[] = [
    { categoria: "Anteojos", desdeUnidades: 2, porcentaje: 5 },
    { categoria: "Anteojos", desdeUnidades: 4, porcentaje: 10 },
  ];
  assert.deepEqual(conEscala(viejos), viejos);
  const conTres = conEscala([...viejos, { categoria: "Anteojos", desdeUnidades: 3, porcentaje: 100 / 3, paga: 2 }]);
  assert.deepEqual(
    conTres.map((t) => t.desdeUnidades),
    [3],
  );
});

test("se redondea una vez sobre el total: 3 × $ 89.900 con 3x2 son $ 179.800 justos, no $ 179.799", () => {
  assert.equal(totalConDescuento(269700, 100 / 3), 179800);
  assert.equal(totalConDescuento(449500, 40), 269700);
  assert.equal(totalConDescuento(89900, 0), 89900);
});

test("en el carrito real: 1, 2, 3, 4, 5 y 6 pares cobran lo que dice la escala", async () => {
  const productos = await getProductos();
  const citrino = productos.find((p) => p.slug === "citrino")!;
  const color = citrino.variantes.find((v) => !v.agotada && v.stock >= 6) ?? citrino.variantes.find((v) => !v.agotada)!;
  const esperado: Record<number, number> = { 1: 89900, 2: 179800, 3: 179800, 4: 239733, 5: 269700, 6: 323640 };
  for (const [cantidad, total] of Object.entries(esperado)) {
    const n = Number(cantidad);
    if (n > color.stock) continue;
    const carrito = await resolverCarrito([{ productoSlug: "citrino", varianteId: color.id, cantidad: n }]);
    assert.equal(carrito.subtotal, total, `${n} pares`);
    assert.equal(carrito.ahorro, citrino.precio * n - total, `${n} pares, ahorro`);
    // Lo que se le manda a Mercado Pago suma exacto, aunque el unitario tenga fracción.
    const renglones = carrito.items.flatMap((i) => (Number.isInteger(i.precioUnitario) ? [{ precio: i.precioUnitario, cantidad: i.cantidad }] : unidadesParaCobrar(i)));
    assert.equal(
      renglones.reduce((s, r) => s + r.precio * r.cantidad, 0),
      total,
      `${n} pares, renglones`,
    );
    assert.ok(renglones.every((r) => Number.isInteger(r.precio)), `${n} pares, pesos enteros`);
  }
});

test("mezclando modelos y colores también: tres pares distintos son $ 179.800 y cinco, $ 269.700", async () => {
  const productos = await getProductos();
  const anteojos = productos.filter((p) => p.categoria === "Anteojos");
  const colores = anteojos.flatMap((p) => p.variantes.filter((v) => !v.agotada).map((v) => ({ productoSlug: p.slug, varianteId: v.id, cantidad: 1 })));
  const tres = await resolverCarrito(colores.slice(0, 3));
  assert.equal(tres.subtotal, 179800);
  assert.equal(
    tres.items.reduce((s, i) => s + i.subtotal, 0),
    179800,
  );
  const cinco = await resolverCarrito(colores.slice(0, 5));
  assert.equal(cinco.subtotal, 269700);
});

test("los estuches siguen con su porcentaje y no cuentan para la escala de anteojos", async () => {
  const productos = await getProductos();
  const m500 = productos.find((p) => p.slug === "m500")!;
  const citrino = productos.find((p) => p.slug === "citrino")!;
  const carrito = await resolverCarrito([
    { productoSlug: "m500", varianteId: m500.variantes[0].id, cantidad: 2 },
    { productoSlug: "citrino", varianteId: citrino.variantes.find((v) => !v.agotada)!.id, cantidad: 1 },
  ]);
  const estuches = carrito.items.find((i) => i.categoria === "Estuches")!;
  assert.equal(estuches.descuento, 5);
  assert.equal(estuches.subtotal, Math.round(m500.precio * 2 * 0.95));
  assert.equal(carrito.items.find((i) => i.categoria === "Anteojos")!.descuento, 0);
});

test("dinero en Mercado Pago se suma a la escala: 3x2 de $ 179.800 → $ 161.820", async () => {
  const productos = await getProductos();
  const citrino = productos.find((p) => p.slug === "citrino")!;
  const color = citrino.variantes.find((v) => !v.agotada && v.stock >= 3)!;
  const carrito = await resolverCarrito([{ productoSlug: "citrino", varianteId: color.id, cantidad: 3 }]);
  const conMP = aplicarDineroMP(carrito.items);
  assert.equal(conMP.subtotal, 161820);
  assert.equal(
    unidadesParaCobrar(conMP.items[0]).reduce((s, r) => s + r.precio * r.cantidad, 0),
    161820,
  );
});

test("los packs de la portada y la ficha: 1, 3 y 5, con el total del carrito y el tachado de a uno", async () => {
  const tramos = await getTramos();
  assert.deepEqual(cantidadesDePack(tramos, "Anteojos"), [1, 3, 5]);
  assert.deepEqual(cantidadesDePack([], "Anteojos"), [1, 2, 4], "sin escala, los de siempre");
  const tres = armarPack({ precio: 89900, cantidad: 3, tramos, categoria: "Anteojos" });
  assert.deepEqual([tres.total, tres.lista, tres.ahorro], [179800, 269700, 89900]);
  const cinco = armarPack({ precio: 89900, cantidad: 5, tramos, categoria: "Anteojos" });
  assert.deepEqual([cinco.total, cinco.lista, cinco.precioUnitario], [269700, 449500, 53940]);
});

test("cómo se nombra y cuánto falta para el próximo par gratis", async () => {
  const tramos = await getTramos();
  const escala = escalaDe(tramos, "Anteojos");
  assert.deepEqual(
    escala.map((t) => nombreDelTramo(t)),
    ["Llevá 3, pagá 2", "Llevá 5, pagá 3"],
  );
  assert.equal(fraseDeLaEscala(tramos, "Anteojos"), "llevá 3 y pagá 2, o llevá 5 y pagá 3");
  assert.equal(fraseDeLaEscala(tramos, "Estuches"), null);
  assert.equal(textoPorcentaje(100 / 3), "33,3");
  assert.equal(nombreDelTramo({ desdeUnidades: 2, porcentaje: 5 }), "5 % OFF");

  assert.deepEqual(ofertaDeEscala(tramos, "Anteojos", 1), { actual: null, siguiente: { lleva: 3, paga: 2, faltan: 2 } });
  assert.deepEqual(ofertaDeEscala(tramos, "Anteojos", 3), { actual: { lleva: 3, paga: 2 }, siguiente: { lleva: 5, paga: 3, faltan: 2 } });
  assert.deepEqual(ofertaDeEscala(tramos, "Anteojos", 7), { actual: { lleva: 5, paga: 3 }, siguiente: null });
  assert.equal(ofertaDeEscala(tramos, "Estuches", 1), null);
});

test("la barra «Tus pares» habla de la escala", async () => {
  const tramos = await getTramos();
  const base = { actual: 0, proximo: null, cupon: 0, subtotalSinCupon: 89900, precioPar: 89900, envioGratisDesde: 0 };
  const con = (pares: number, subtotalSinCupon = base.subtotalSinCupon) =>
    empujeDeLaBarra({ ...base, pares, subtotalSinCupon, escala: ofertaDeEscala(tramos, "Anteojos", pares) });
  assert.equal(con(1), "Sumá 2 más y uno te sale gratis.");
  assert.equal(con(2), "Uno más y te lo llevás gratis.");
  assert.equal(con(3), "Llevá 3, pagá 2 aplicado. Sumá 2 más y te llevás 2 gratis.");
  assert.equal(con(4), "Llevá 3, pagá 2 aplicado. Uno más y te llevás 2 gratis.");
  assert.equal(con(5), "Llevá 5, pagá 3 aplicado.");
});
