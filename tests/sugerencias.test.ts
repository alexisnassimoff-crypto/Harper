import { test } from "node:test";
import assert from "node:assert/strict";
import { elegirSugerencias } from "../lib/sugerencias";
import type { Tramo } from "../lib/descuentos";
import type { ItemResuelto, Producto, Variante } from "../lib/tipos";

function variante(id: string, stock = 10): Variante {
  return { id, sku: id.toUpperCase(), color: "Negro", colorHex: "#000", stock, fotos: [`/${id}.webp`], agotada: stock <= 0 };
}

function producto(id: string, categoria: Producto["categoria"], precio: number, stock = 10): Producto {
  return {
    id, nombre: id.toUpperCase(), slug: id, categoria, descripcion: "", precio, precioAnterior: null, videos: [],
    variantes: [variante(`${id}-negro`, stock)], fotoPrincipal: `/${id}.webp`, agotado: stock <= 0, envase: null,
    incluye: [], medidas: null, material: null, lentes: null,
  };
}

function item(p: Producto, cantidad = 1): ItemResuelto {
  return {
    productoId: p.id, productoSlug: p.slug, nombre: p.nombre, categoria: p.categoria, varianteId: p.variantes[0].id,
    sku: p.variantes[0].sku, color: "Negro", foto: null, precioLista: p.precio, precioUnitario: p.precio, descuento: 0,
    cantidad, subtotal: p.precio * cantidad, stockDisponible: 10,
  };
}

const amatista = producto("amatista", "Anteojos", 89900);
const citrino = producto("citrino", "Anteojos", 89900);
const cuarzo = producto("cuarzo", "Anteojos", 89900);
const obsidiana = producto("obsidiana", "Anteojos", 89900, 0);
const r100 = producto("r100", "Estuches", 6990);
const pano = producto("pano", "Paños", 29900);
const catalogo = [amatista, citrino, cuarzo, obsidiana, r100, pano];

const TRAMOS: Tramo[] = [
  { categoria: "Anteojos", desdeUnidades: 2, porcentaje: 5 },
  { categoria: "Anteojos", desdeUnidades: 4, porcentaje: 10 },
  { categoria: "Estuches", desdeUnidades: 2, porcentaje: 5 },
];

test("con un anteojo ofrece otros anteojos (el segundo par), nunca un estuche", () => {
  const s = elegirSugerencias([item(amatista)], catalogo, 0, TRAMOS);

  assert.ok(s.length > 0);
  assert.ok(s.every((x) => x.categoria === "Anteojos"));
  assert.ok(!s.some((x) => x.productoId === amatista.id), "no repite el que ya lleva");
  assert.ok(!s.some((x) => x.productoId === obsidiana.id), "no ofrece agotados");
  assert.equal(s[0].motivo, "Segundo par: 5% off en los dos");
});

test("sin tramos cargados, igual ofrece el segundo par con un motivo honesto", () => {
  const s = elegirSugerencias([item(amatista)], catalogo, 0, []);
  assert.equal(s[0].motivo, "Sumá un segundo par");
});

test("con dos o más anteojos en el carrito no se anuncian los tramos mayores", () => {
  // Ya tiene la promo de 2 pares: el siguiente tramo (4 pares, 10%) se aplica
  // al cobrar pero no se publicita.
  for (const cantidad of [1, 2, 3, 7, 14]) {
    const s = elegirSugerencias([item(amatista, 1), item(citrino, cantidad)], catalogo, 0, TRAMOS);
    assert.ok(s.length > 0);
    for (const x of s) {
      assert.equal(x.motivo, "Otro modelo para sumar", `con ${cantidad + 1} pares: ${x.motivo}`);
      assert.ok(!x.motivo.includes("%"));
    }
  }
});

test("la promo del segundo par usa el porcentaje del tramo de 2, no el de más unidades", () => {
  const tramos: Tramo[] = [
    { categoria: "Anteojos", desdeUnidades: 4, porcentaje: 10 },
    { categoria: "Anteojos", desdeUnidades: 2, porcentaje: 5 },
  ];
  assert.equal(elegirSugerencias([item(amatista)], catalogo, 0, tramos)[0].motivo, "Segundo par: 5% off en los dos");
  // Si el primer tramo no es de 2 unidades, no se habla de "segundo par" con descuento.
  const desde3: Tramo[] = [{ categoria: "Anteojos", desdeUnidades: 3, porcentaje: 8 }];
  assert.equal(elegirSugerencias([item(amatista)], catalogo, 0, desde3)[0].motivo, "Sumá un segundo par");
});

test("con complementos de todo tipo, ofrece más sin prometer descuentos", () => {
  const otroEstuche = producto("m500", "Estuches", 7990);
  const s = elegirSugerencias([item(r100), item(pano)], [...catalogo, otroEstuche], 0, TRAMOS);
  assert.ok(s.length > 0);
  assert.ok(s.every((x) => x.motivo === "Otro modelo para sumar" && !/descuento|%/.test(x.motivo)));
});

test("estuche → paño, paño → estuche", () => {
  assert.equal(elegirSugerencias([item(r100)], catalogo, 0, TRAMOS)[0]?.categoria, "Paños");
  assert.equal(elegirSugerencias([item(pano)], catalogo, 0, TRAMOS)[0]?.categoria, "Estuches");
});

test("carrito vacío: nada", () => {
  assert.deepEqual(elegirSugerencias([], catalogo, 0, TRAMOS), []);
});

test("la rotación diaria cambia el orden pero no el conjunto", () => {
  const hoy = elegirSugerencias([item(amatista)], catalogo, 0, TRAMOS).map((s) => s.productoId).sort();
  const manana = elegirSugerencias([item(amatista)], catalogo, 1, TRAMOS).map((s) => s.productoId).sort();
  assert.deepEqual(hoy, manana);
});
