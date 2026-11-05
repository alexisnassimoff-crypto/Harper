import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// El carrito se resuelve contra el Airtable de prueba (sin tramos de anteojos, como hoy).
process.env.HARPER_FIXTURES = "1";
delete process.env.VERCEL;

import { getProductos } from "../lib/catalogo";
import { descuentoDelSegundo } from "../lib/contribucion";
import { totalConDescuento } from "../lib/descuentos";
import {
  aplicarDuo,
  calcularDuo,
  PORCENTAJE_DUO,
  preciosConDescuentoDuo,
  unidadesConDescuentoDuo,
  type RenglonDuo,
} from "../lib/duo";
import { resolverCarrito } from "../lib/pedidos";
import { CATEGORIAS, type Categoria } from "../lib/categorias";
import type { ItemResuelto } from "../lib/tipos";

/** Motor del descuento Dúo (Ale, 05/11/2026 · Tarea 03). */

const anteojo = (precioLista: number, cantidad = 1): RenglonDuo => ({ categoria: "Anteojos", precioLista, cantidad });
const de = (categoria: Categoria, precioLista: number, cantidad = 1): RenglonDuo => ({ categoria, precioLista, cantidad });

function item(categoria: Categoria, precioLista: number, cantidad: number, extra: Partial<ItemResuelto> = {}): ItemResuelto {
  return {
    productoId: `p-${precioLista}`,
    productoSlug: `p-${precioLista}`,
    nombre: "MODELO",
    categoria,
    varianteId: `v-${precioLista}-${cantidad}-${extra.color ?? "negro"}`,
    sku: "SKU",
    color: "Negro",
    foto: null,
    precioLista,
    precioUnitario: precioLista,
    descuento: 0,
    cantidad,
    subtotal: precioLista * cantidad,
    stockDisponible: 10,
    ...extra,
  };
}

/** Las sumas tienen que cerrar siempre: renglones = total, subtotal = lista − descuento. */
function cierra(renglones: RenglonDuo[], r: ReturnType<typeof calcularDuo>) {
  assert.equal(r.renglones.length, renglones.length);
  assert.equal(r.renglones.reduce((t, x) => t + x.descuento, 0), r.descuento, "los renglones suman el total");
  assert.equal(r.renglones.reduce((t, x) => t + x.unidadesConDescuento, 0), r.unidadesConDescuento);
  r.renglones.forEach((x, n) => {
    assert.equal(x.subtotal, renglones[n].precioLista * renglones[n].cantidad - x.descuento);
    assert.ok(Number.isInteger(x.descuento), "pesos enteros");
    assert.ok(x.descuento >= 0);
  });
}

test("Dúo: con n anteojos llevan el descuento ⌊n/2⌋ (3 → 1, 4 → 2, 5 → 2, 6 → 3)", () => {
  const esperado: [number, number][] = [[0, 0], [1, 0], [2, 1], [3, 1], [4, 2], [5, 2], [6, 3], [7, 3], [10, 5]];
  for (const [n, k] of esperado) {
    assert.equal(unidadesConDescuentoDuo(n), k, `${n} anteojos`);
    const r = calcularDuo([anteojo(89_900, n)]);
    assert.equal(r.unidadesConDescuento, k, `${n} anteojos en un renglón`);
    assert.equal(r.descuento, k * 22_475);
  }
  assert.equal(unidadesConDescuentoDuo(Number.NaN), 0);
  assert.equal(unidadesConDescuentoDuo(-3), 0);
  assert.equal(PORCENTAJE_DUO, 25);
});

test("Dúo: dos pares iguales, el 25 % sobre uno ($ 22.475)", () => {
  const renglones = [anteojo(89_900, 2)];
  const r = calcularDuo(renglones);
  assert.equal(r.anteojos, 2);
  assert.equal(r.descuento, 22_475);
  assert.equal(r.renglones[0].unidadesConDescuento, 1);
  assert.equal(r.renglones[0].subtotal, 157_325);
  cierra(renglones, r);
});

test("Dúo: con precios distintos, el descuento va al más barato, sin importar el orden", () => {
  for (const renglones of [[anteojo(89_900), anteojo(69_900)], [anteojo(69_900), anteojo(89_900)]]) {
    const r = calcularDuo(renglones);
    assert.equal(r.descuento, 17_475, "25 % de $ 69.900");
    const barato = renglones.findIndex((x) => x.precioLista === 69_900);
    assert.equal(r.renglones[barato].descuento, 17_475);
    assert.equal(r.renglones[1 - barato].descuento, 0, "el caro queda a precio de lista");
    cierra(renglones, r);
  }
});

test("Dúo: 3 pares descuentan uno de los más baratos; 4, los dos más baratos", () => {
  const tres = [anteojo(89_900), anteojo(89_900), anteojo(69_900)];
  const r3 = calcularDuo(tres);
  assert.equal(r3.unidadesConDescuento, 1);
  assert.equal(r3.descuento, 17_475);
  assert.deepEqual(r3.renglones.map((x) => x.descuento), [0, 0, 17_475]);
  cierra(tres, r3);

  const cuatro = [anteojo(109_900), anteojo(69_900), anteojo(89_900), anteojo(79_900)];
  const r4 = calcularDuo(cuatro);
  assert.equal(r4.unidadesConDescuento, 2);
  assert.equal(r4.descuento, 17_475 + 19_975, "25 % de $ 69.900 y de $ 79.900");
  assert.deepEqual(r4.renglones.map((x) => x.unidadesConDescuento), [0, 1, 0, 1]);
  cierra(cuatro, r4);
});

test("Dúo: 5 pares descuentan dos y 6 descuentan tres, mezclando renglones y cantidades", () => {
  // 5: tres CITRINO de $ 89.900 y dos de $ 69.900 → los dos de $ 69.900.
  const cinco = [anteojo(89_900, 3), anteojo(69_900, 2)];
  const r5 = calcularDuo(cinco);
  assert.equal(r5.unidadesConDescuento, 2);
  assert.equal(r5.descuento, 2 * 17_475);
  assert.deepEqual(r5.renglones.map((x) => x.unidadesConDescuento), [0, 2]);
  cierra(cinco, r5);

  // 6: tres de $ 89.900, dos de $ 69.900 y uno de $ 79.900 → 69.900 × 2 + 79.900.
  const seis = [anteojo(89_900, 3), anteojo(69_900, 2), anteojo(79_900, 1)];
  const r6 = calcularDuo(seis);
  assert.equal(r6.unidadesConDescuento, 3);
  assert.equal(r6.descuento, 54_925);
  assert.deepEqual(r6.renglones.map((x) => x.unidadesConDescuento), [0, 2, 1]);
  cierra(seis, r6);

  // 6 iguales en un solo renglón: tres con descuento.
  const r6iguales = calcularDuo([anteojo(89_900, 6)]);
  assert.equal(r6iguales.descuento, 67_425);
  assert.equal(r6iguales.renglones[0].subtotal, 471_975);
});

test("Dúo: el mismo modelo en colores distintos (renglones distintos, mismo precio) cuenta como Dúo", () => {
  const renglones = [anteojo(89_900), anteojo(89_900)];
  const r = calcularDuo(renglones);
  assert.equal(r.descuento, 22_475);
  // A igual precio gana el primer renglón: el resultado no depende del azar.
  assert.deepEqual(r.renglones.map((x) => x.descuento), [22_475, 0]);
  assert.deepEqual(calcularDuo(renglones).renglones, r.renglones, "siempre igual");
  cierra(renglones, r);
});

test("Dúo: el total no depende del orden de los renglones", () => {
  const base = [anteojo(109_900), anteojo(69_900, 2), anteojo(89_900, 3), anteojo(79_900), de("Estuches", 29_900)];
  const total = calcularDuo(base).descuento;
  const ordenes = [[...base].reverse(), [base[2], base[4], base[0], base[3], base[1]], [base[1], base[3], base[0], base[4], base[2]]];
  for (const otro of ordenes) {
    const r = calcularDuo(otro);
    assert.equal(r.descuento, total);
    cierra(otro, r);
  }
});

test("Dúo: estuches y paños no cuentan ni llevan descuento", () => {
  const unAnteojo = [anteojo(89_900), de("Estuches", 29_900, 3), de("Paños", 6_990, 2)];
  const r1 = calcularDuo(unAnteojo);
  assert.equal(r1.anteojos, 1);
  assert.equal(r1.descuento, 0, "un anteojo con complementos no es Dúo");
  cierra(unAnteojo, r1);

  // Aunque el estuche sea más barato, el descuento va a un anteojo.
  const dos = [de("Estuches", 15_900), anteojo(89_900, 2)];
  const r2 = calcularDuo(dos);
  assert.equal(r2.anteojos, 2);
  assert.equal(r2.descuento, 22_475);
  assert.equal(r2.renglones[0].descuento, 0);
  assert.equal(r2.renglones[0].subtotal, 15_900);
  cierra(dos, r2);
});

test("Dúo: cuentan todas las categorías de anteojos, salvo que se elija otra cosa", () => {
  const mezcla = [anteojo(89_900), de("Anteojos de sol", 99_900)];
  assert.equal(calcularDuo(mezcla).descuento, 22_475, "anteojos de sol cuentan (lib/categorias.ts)");
  const soloAnteojos = calcularDuo(mezcla, { esElegible: (c) => c === "Anteojos" });
  assert.equal(soloAnteojos.anteojos, 1);
  assert.equal(soloAnteojos.descuento, 0);
});

test("Dúo: Clip-On y Anteojos de receta cuentan como anteojos completos", () => {
  // Dos Clip-On: uno con el 25 %.
  const clipOn = calcularDuo([de("Clip-On", 99_900, 2)]);
  assert.equal(clipOn.anteojos, 2);
  assert.equal(clipOn.descuento, 24_975);

  // Dos de receta: uno con el 25 %.
  const receta = calcularDuo([de("Anteojos de receta", 129_900), de("Anteojos de receta", 129_900)]);
  assert.equal(receta.anteojos, 2);
  assert.equal(receta.descuento, 32_475);

  // Un Clip-On y uno de receta forman un Dúo: el descuento va al más barato.
  const mixtos = [de("Anteojos de receta", 129_900), de("Clip-On", 99_900)];
  const r = calcularDuo(mixtos);
  assert.equal(r.descuento, 24_975);
  assert.deepEqual(r.renglones.map((x) => x.descuento), [0, 24_975]);
  cierra(mixtos, r);

  // Las cuatro categorías juntas: 4 anteojos, los dos más baratos con el 25 %.
  const cuatro = [anteojo(89_900), de("Anteojos de sol", 99_900), de("Clip-On", 109_900), de("Anteojos de receta", 129_900)];
  const r4 = calcularDuo(cuatro);
  assert.equal(r4.anteojos, 4);
  assert.deepEqual(r4.renglones.map((x) => x.unidadesConDescuento), [1, 1, 0, 0]);
  assert.equal(r4.descuento, 22_475 + 24_975);
  cierra(cuatro, r4);

  // Un Clip-On o uno de receta con un estuche no es Dúo.
  assert.equal(calcularDuo([de("Clip-On", 99_900), de("Estuches", 29_900)]).descuento, 0);
  assert.equal(calcularDuo([de("Anteojos de receta", 129_900), de("Paños", 6_990, 3)]).descuento, 0);

  // En el carrito, igual.
  const carrito = aplicarDuo([item("Clip-On", 99_900, 1), item("Anteojos de receta", 129_900, 1), item("Estuches", 29_900, 1)]);
  assert.equal(carrito.aplicado, true);
  assert.equal(carrito.ahorro, 24_975);
  assert.deepEqual(carrito.items.map((i) => i.subtotal), [74_925, 129_900, 29_900]);
});

test("Dúo: cuentan solo las categorías de anteojos completos; los complementos nunca", () => {
  // Un clip que se vende suelto es un complemento, no un Clip-On: se carga con
  // una categoría de complemento y no cuenta para el Dúo.
  for (const { nombre, tipo } of CATEGORIAS) {
    const r = calcularDuo([de(nombre, 89_900, 2)]);
    if (tipo === "anteojos") assert.equal(r.descuento, 22_475, `${nombre} cuenta`);
    else assert.equal(r.descuento, 0, `${nombre} no cuenta`);
  }
  assert.deepEqual(
    CATEGORIAS.filter((c) => c.tipo === "anteojos").map((c) => c.nombre),
    ["Anteojos", "Anteojos de sol", "Clip-On", "Anteojos de receta"],
    "las cuatro categorías elegibles (Ale, 05/11/2026)"
  );
});

test("Dúo: el redondeo se hace una vez sobre el total y los renglones cierran", () => {
  // 25 % de $ 99.990 = $ 24.997,50: queda en pesos enteros como en lib/descuentos.ts.
  const uno = calcularDuo([anteojo(99_990, 2)]);
  assert.equal(uno.descuento, 99_990 - totalConDescuento(99_990, 25));
  assert.ok(Number.isInteger(uno.descuento));

  // Dos renglones con fracción: el total se redondea una sola vez y la
  // diferencia la absorbe un renglón; nunca se pierde ni se inventa un peso.
  const renglones = [anteojo(99_990), anteojo(99_990), anteojo(149_990, 2)];
  const r = calcularDuo(renglones);
  const listaDescontada = 99_990 * 2;
  assert.equal(r.descuento, listaDescontada - totalConDescuento(listaDescontada, 25));
  cierra(renglones, r);
  assert.equal(r.renglones[2].descuento, 0);
});

test("Dúo: no modifica lo que recibe y valida los renglones", () => {
  const renglones = [anteojo(89_900, 2), anteojo(69_900)];
  const copia = structuredClone(renglones);
  calcularDuo(renglones);
  assert.deepEqual(renglones, copia);

  assert.deepEqual(calcularDuo([]).renglones, []);
  assert.equal(calcularDuo([anteojo(89_900, 0), anteojo(89_900)]).descuento, 0, "un renglón en cero no suma anteojos");
  assert.throws(() => calcularDuo([anteojo(0, 2)]), RangeError);
  assert.throws(() => calcularDuo([anteojo(-1, 2)]), RangeError);
  assert.throws(() => calcularDuo([anteojo(Number.NaN, 2)]), RangeError);
  assert.throws(() => calcularDuo([anteojo(89_900, 1.5)]), RangeError);
  assert.throws(() => calcularDuo([anteojo(89_900, -1)]), RangeError);
  assert.throws(() => calcularDuo([anteojo(89_900, 2)], { porcentaje: 0 }), RangeError);
  assert.throws(() => calcularDuo([anteojo(89_900, 2)], { porcentaje: 100 }), RangeError);
});

test("Dúo: la misma regla que el modelo financiero (lib/contribucion.ts)", () => {
  const casos = [[89_900, 89_900], [89_900, 69_900], [100_000, 90_000, 80_000], [100_000, 90_000, 80_000, 70_000], [89_900, 89_900, 89_900, 89_900, 89_900], [109_900, 99_900, 89_900, 79_900, 69_900, 59_900]];
  for (const precios of casos) {
    assert.equal(calcularDuo(precios.map((p) => anteojo(p))).descuento, descuentoDelSegundo(precios, 0.25), precios.join(" + "));
  }
  assert.deepEqual(preciosConDescuentoDuo([89_900, 69_900, 79_900, 109_900]), [69_900, 79_900]);
});

test("Dúo en el carrito: aplica sobre los renglones y deja los subtotales listos para cobrar", () => {
  const items = [item("Anteojos", 89_900, 1, { color: "Negro" }), item("Anteojos", 69_900, 1, { color: "Ámbar" }), item("Estuches", 29_900, 1)];
  const r = aplicarDuo(items);
  assert.equal(r.aplicado, true);
  assert.equal(r.ahorro, 17_475);
  assert.equal(r.items[0].subtotal, 89_900, "el más caro, a precio de lista");
  assert.equal(r.items[0].descuento, 0);
  assert.equal(r.items[1].subtotal, 52_425);
  assert.equal(r.items[1].precioUnitario, 52_425);
  assert.equal(r.items[1].descuento, 25);
  assert.equal(r.items[2].subtotal, 29_900, "el estuche no cambia");
  assert.equal(items[1].subtotal, 69_900, "no modifica lo que recibe");

  // Un renglón con dos unidades y una sola con el 25 %: 12,5 % efectivo.
  const par = aplicarDuo([item("Anteojos", 89_900, 2)]);
  assert.equal(par.items[0].subtotal, 157_325);
  assert.equal(par.items[0].precioUnitario, 78_662.5, "fracción de peso: se cobra partido en pesos enteros");
  assert.equal(par.items[0].descuento, 12.5);
});

test("Dúo en el carrito: sin dos anteojos no hace nada", () => {
  const items = [item("Anteojos", 89_900, 1), item("Estuches", 29_900, 2)];
  const r = aplicarDuo(items);
  assert.equal(r.aplicado, false);
  assert.equal(r.motivo, "sin-pares");
  assert.equal(r.ahorro, 0);
  assert.deepEqual(r.items, items);
});

test("Dúo en el carrito: no se acumula con otro descuento por cantidad en anteojos, ni se aplica dos veces", () => {
  // Un tramo de Airtable ya aplicado a los anteojos (hoy están apagados).
  const conTramo = [item("Anteojos", 89_900, 2, { descuento: 5, precioUnitario: 85_405, subtotal: 170_810 })];
  const r = aplicarDuo(conTramo);
  assert.equal(r.aplicado, false);
  assert.equal(r.motivo, "otro-descuento");
  assert.deepEqual(r.items, conTramo, "queda el descuento que ya tenía");

  const una = aplicarDuo([item("Anteojos", 89_900, 2)]);
  const dos = aplicarDuo(una.items);
  assert.equal(dos.aplicado, false);
  assert.equal(dos.items[0].subtotal, 157_325, "no descuenta dos veces");

  // Un descuento en estuches no impide el Dúo en anteojos.
  const estucheConTramo = [item("Anteojos", 89_900, 2), item("Estuches", 29_900, 2, { descuento: 5, precioUnitario: 28_405, subtotal: 56_810 })];
  const r2 = aplicarDuo(estucheConTramo);
  assert.equal(r2.aplicado, true);
  assert.equal(r2.items[1].subtotal, 56_810);
});

test("Dúo en el carrito: va antes del cupón, del saldo y del dinero en Mercado Pago", () => {
  assert.throws(() => aplicarDuo([item("Anteojos", 89_900, 2, { cupon: 10_000 })]));
  assert.throws(() => aplicarDuo([item("Anteojos", 89_900, 2, { saldo: 5_000 })]));
  assert.throws(() => aplicarDuo([item("Anteojos", 89_900, 2, { descuentoDineroMP: 10 })]));
});

test("Dúo con el carrito real del servidor (fixtures): dos modelos y colores distintos", async () => {
  const productos = await getProductos();
  const amatista = productos.find((p) => p.slug === "amatista")!;
  const cuarzo = productos.find((p) => p.slug === "cuarzo")!;
  const estuche = productos.find((p) => p.slug === "m500")!;
  const carrito = await resolverCarrito([
    { productoSlug: "amatista", varianteId: amatista.variantes[0].id, cantidad: 1 },
    { productoSlug: "cuarzo", varianteId: cuarzo.variantes[1].id, cantidad: 1 },
    { productoSlug: "m500", varianteId: estuche.variantes[0].id, cantidad: 1 },
  ]);
  // Hoy el carrito no aplica el Dúo: los anteojos van a precio de lista.
  const anteojos = carrito.items.filter((i) => i.categoria === "Anteojos");
  assert.equal(anteojos.length, 2);
  assert.ok(anteojos.every((i) => i.descuento === 0 && i.subtotal === i.precioLista * i.cantidad));

  const r = aplicarDuo(carrito.items);
  assert.equal(r.aplicado, true);
  const masBarato = Math.min(...anteojos.map((i) => i.precioLista));
  assert.equal(r.ahorro, masBarato - totalConDescuento(masBarato, 25));
  const subtotalAntes = carrito.items.reduce((t, i) => t + i.subtotal, 0);
  assert.equal(r.items.reduce((t, i) => t + i.subtotal, 0), subtotalAntes - r.ahorro);
});

test("Dúo: todavía no está activo (ninguna página, ruta ni el carrito lo usan)", () => {
  const raiz = path.resolve(__dirname, "..", "..");
  const permitidos = new Set([path.join("lib", "duo.ts"), path.join("lib", "contribucion.ts")]);
  const usos: string[] = [];
  const recorrer = (dir: string) => {
    for (const entrada of fs.readdirSync(path.join(raiz, dir), { withFileTypes: true })) {
      const relativo = path.join(dir, entrada.name);
      if (entrada.isDirectory()) recorrer(relativo);
      else if (/\.(ts|tsx)$/.test(entrada.name) && !permitidos.has(relativo)) {
        const texto = fs.readFileSync(path.join(raiz, relativo), "utf8");
        if (/from\s+["'](?:\.\.?\/|@\/lib\/|\.\.\/lib\/)duo["']/.test(texto)) usos.push(relativo);
      }
    }
  };
  for (const dir of ["app", "components", "lib"]) recorrer(dir);
  assert.deepEqual(usos, [], "integrar el Dúo es otra tarea: al hacerlo, se actualiza esta prueba");
});
