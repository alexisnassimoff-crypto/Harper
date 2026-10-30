import { test } from "node:test";
import assert from "node:assert/strict";

process.env.HARPER_FIXTURES = "1";
delete process.env.VERCEL;

import { getProductos } from "../lib/catalogo";
import { getTramos } from "../lib/descuentos";
import { armarPack, coloresIniciales, nombrePack, paresDisponibles, repartirColores, totalesPosibles } from "../lib/packs";
import { resolverCarrito } from "../lib/pedidos";

const TRAMOS = [
  { categoria: "Anteojos" as const, desdeUnidades: 2, porcentaje: 5 },
  { categoria: "Anteojos" as const, desdeUnidades: 4, porcentaje: 10 },
];

test("los packs usan los descuentos por cantidad que ya existen", () => {
  const uno = armarPack({ precio: 89900, cantidad: 1, tramos: TRAMOS, categoria: "Anteojos" });
  const dos = armarPack({ precio: 89900, cantidad: 2, tramos: TRAMOS, categoria: "Anteojos" });
  const cuatro = armarPack({ precio: 89900, cantidad: 4, tramos: TRAMOS, categoria: "Anteojos" });
  assert.deepEqual([uno.total, uno.ahorro, uno.porcentaje], [89900, 0, 0]);
  assert.deepEqual([dos.total, dos.precioUnitario, dos.lista, dos.ahorro], [170810, 85405, 179800, 8990]);
  assert.deepEqual([cuatro.total, cuatro.precioUnitario, cuatro.ahorro], [323640, 80910, 35960]);
});

test("con HARPER10 aplicado gana el mayor, como en el carrito; el envío se mira sin el cupón", () => {
  const uno = armarPack({ precio: 89900, cantidad: 1, tramos: TRAMOS, categoria: "Anteojos", cuponPorcentaje: 10 });
  const dos = armarPack({ precio: 89900, cantidad: 2, tramos: TRAMOS, categoria: "Anteojos", cuponPorcentaje: 10 });
  const cuatro = armarPack({ precio: 89900, cantidad: 4, tramos: TRAMOS, categoria: "Anteojos", cuponPorcentaje: 10 });
  assert.deepEqual([uno.total, uno.conCupon], [80910, true]);
  assert.deepEqual([dos.total, dos.conCupon, dos.totalParaEnvio], [161820, true, 170810]);
  assert.deepEqual([cuatro.total, cuatro.conCupon], [323640, false], "10% y 10%: queda el de cantidad");
});

test("nombre del pack", () => {
  assert.equal(nombrePack(1), "1 par");
  assert.equal(nombrePack(4), "4 pares");
});

test("con el estuche: el cupón se decide sobre todo, como en el carrito", () => {
  const estuche = { precio: 8990, categoria: "Estuches" as const };
  const dos = armarPack({ precio: 89900, cantidad: 2, tramos: TRAMOS, categoria: "Anteojos", extra: estuche });
  assert.deepEqual([dos.total, dos.precioExtra, dos.lista, dos.totalParaEnvio], [179800, 8990, 188790, 179800]);

  // 4 pares tienen 10% por cantidad, igual que el cupón; con el estuche el
  // cupón deja el total más bajo (también descuenta el estuche), así que gana.
  const cuatro = armarPack({ precio: 89900, cantidad: 4, tramos: TRAMOS, categoria: "Anteojos", cuponPorcentaje: 10, extra: estuche });
  assert.deepEqual([cuatro.conCupon, cuatro.precioUnitario, cuatro.precioExtra, cuatro.total], [true, 80910, 8091, 331731]);
  assert.equal(cuatro.totalParaEnvio, 323640 + 8990, "el envío se mira sin el cupón");
});

test("los totales a confirmar con Mercado Pago no se repiten", () => {
  const totales = totalesPosibles({
    precio: 89900,
    tramos: TRAMOS,
    categoria: "Anteojos",
    cuponPorcentaje: 10,
    extra: { precio: 8990, categoria: "Estuches" },
  });
  assert.deepEqual(totales, [80910, 89900, 89001, 98890, 161820, 170810, 169911, 179800, 323640, 331731, 332630].sort((a, b) => a - b));
});

test("cada par arranca con un color distinto, sin agotados y sin pasarse del stock", () => {
  const variantes = [
    { stock: 12, agotada: false }, // 0
    { stock: 0, agotada: true }, // 1
    { stock: 1, agotada: false }, // 2
    { stock: 5, agotada: false }, // 3
  ];
  assert.deepEqual(coloresIniciales(variantes, 2, 2), [2, 3]);
  assert.deepEqual(coloresIniciales(variantes, 4, 2), [2, 3, 0, 3], "el de 1 unidad no se repite");
  assert.deepEqual(coloresIniciales(variantes, 1, 1), [2], "el agotado no se elige");
  assert.deepEqual(coloresIniciales([{ stock: 1, agotada: false }], 2, 0), [0, -1], "sin stock para el segundo");
  assert.equal(paresDisponibles(variantes), 18);
});

test("lo que eligió el visitante se respeta mientras haya stock", () => {
  const variantes = [
    { stock: 12, agotada: false },
    { stock: 1, agotada: false },
    { stock: 5, agotada: false },
  ];
  assert.deepEqual(repartirColores(variantes, 2, [0, 0]), [0, 0], "dos del mismo color, si hay");
  // Del color 1 queda una sola unidad: el segundo par que lo pide pasa a otro.
  assert.deepEqual(repartirColores(variantes, 3, [1, 1, undefined]), [1, 0, 2]);
  assert.deepEqual(repartirColores(variantes, 2, [7, -1]), [0, 1], "un índice inválido se reemplaza");
});

test("el pack cuesta lo mismo que cobra el carrito, con colores mezclados y el estuche", async () => {
  const productos = await getProductos();
  const tramos = await getTramos();
  const citrino = productos.find((p) => p.slug === "citrino")!;
  const m500 = productos.find((p) => p.slug === "m500")!;
  // Con la escala de las fixtures (1, 3 y 5) y también 2 y 4, que el carrito puede tener.
  for (const cantidad of [1, 2, 3, 4, 5]) {
    for (const cupon of [undefined]) {
      for (const conEstuche of [false, true]) {
        const extra = conEstuche ? { precio: m500.precio, categoria: m500.categoria } : null;
        const pack = armarPack({ precio: citrino.precio, cantidad, tramos, categoria: "Anteojos", cuponPorcentaje: cupon ? 10 : 0, extra });
        const pares = coloresIniciales(citrino.variantes, cantidad, 0);
        const porColor = new Map<string, number>();
        for (const i of pares) porColor.set(citrino.variantes[i].id, (porColor.get(citrino.variantes[i].id) ?? 0) + 1);
        const items = [...porColor].map(([varianteId, n]) => ({ productoSlug: "citrino", varianteId, cantidad: n }));
        if (conEstuche) items.push({ productoSlug: "m500", varianteId: m500.variantes[0].id, cantidad: 1 });

        const carrito = await resolverCarrito(items, { cupon });
        const caso = `${cantidad} ${cupon ?? "sin cupón"} ${conEstuche ? "con" : "sin"} estuche`;
        assert.equal(pack.total, carrito.subtotal, caso);
        assert.equal(pack.totalParaEnvio, carrito.subtotalSinCupon, caso);
      }
    }
  }
});
