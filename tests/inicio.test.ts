import { test } from "node:test";
import assert from "node:assert/strict";
import { DATOS_ML_DE_PRUEBA } from "../lib/fixtures/opiniones";
import { seleccionDeOpiniones, type ResenaML } from "../lib/ml-resenas";
import { TEXTOS } from "../lib/textos";
import { categoriasParaComprar, fotoDeLaPortada } from "../lib/vitrina";

/** La portada simplificada (Ale, 05/11/2026): lo que no depende de React. */

const variante = (color: string, stock: number, fotos: string[] = []) => ({
  id: `v-${color}-${stock}`,
  sku: color.toUpperCase(),
  color,
  colorHex: "#000",
  stock,
  fotos,
  agotada: stock <= 0,
});

test("inicio: Comprar muestra solo categorías de anteojos con stock, en orden", () => {
  const productos = [
    { nombre: "SOL1", categoria: "Anteojos de sol" as const, variantes: [variante("negro", 0)] },
    { nombre: "CITRINO", categoria: "Anteojos" as const, variantes: [variante("carey", 3)] },
    { nombre: "R100", categoria: "Estuches" as const, variantes: [variante("negro", 10)] },
    { nombre: "CLIP", categoria: "Clip-On" as const, variantes: [variante("negro", 2)] },
  ];
  const categorias = categoriasParaComprar(productos);
  // La de sol no tiene stock: no aparece como disponible. Los estuches no son anteojos.
  assert.deepEqual(
    categorias.map((c) => [c.nombre, c.titulo, c.enlace, c.productos.map((p) => p.nombre)]),
    [
      ["Anteojos", "Fotocromáticos", "/anteojos", ["CITRINO"]],
      ["Clip-On", "Clip-on", "/clip-on", ["CLIP"]],
    ],
  );
  // El detalle no repite el nombre de la línea.
  assert.equal(categorias[0].detalle, "Filtro de luz azul · UV400");
  assert.deepEqual(categoriasParaComprar([]), []);
});

test("inicio: la foto de la primera pantalla es un anteojo de cerca, del carey con stock", () => {
  const fotos = (base: string) => [1, 2, 3].map((n) => `/productos/anteojos/${base}-${n}.webp`).concat("/productos/estuches/x-1.webp");
  const modelos = [
    { nombre: "AMATISTA", variantes: [variante("Negro", 5, fotos("amatista-negro"))] },
    { nombre: "CITRINO", variantes: [variante("Carey", 0, fotos("citrino-carey")), variante("Ámbar", 2, fotos("citrino-ambar"))] },
    { nombre: "CUARZO", variantes: [variante("Carey", 1, fotos("cuarzo-carey"))] },
  ];
  // El carey del Citrino está agotado: va el del Cuarzo, su foto de cerca (-3).
  assert.deepEqual(fotoDeLaPortada(modelos), { src: "/productos/anteojos/cuarzo-carey-3.webp", alt: "Cuarzo en carey, de cerca" });
  // Sin carey con stock, el primer color con stock; sin la de cerca, su primera foto.
  assert.equal(fotoDeLaPortada([{ nombre: "OBSIDIANA", variantes: [variante("Negro", 1, ["/productos/anteojos/obsidiana-negro-1.webp"])] }])?.src, "/productos/anteojos/obsidiana-negro-1.webp");
  assert.equal(fotoDeLaPortada([{ nombre: "X", variantes: [variante("Negro", 0, ["/a.webp"])] }]), null);
});

test("inicio: las opiniones son una selección corta y real, sin repetir a la misma persona", () => {
  const r = (id: string, estrellas: number, texto: string, producto: string | null = null): ResenaML => ({
    id,
    estrellas,
    titulo: "Excelente",
    texto,
    fecha: "2026-10-20T00:00:00Z",
    producto,
  });
  const lista = [
    r("1", 5, "Excelente producto!!!."),
    r("2", 4, "Me llegó un poco aplastado, pero está bueno igual."),
    r("3", 5, "Hermosas fundas. Compre negra y azul."),
    r("4", 5, "Hermosas fundas. Compre en negra y azul 😍."),
    r("5", 5, "Cómodos, estéticos y bloquean muy bien la luz uv.", "Modelo CITRINO"),
    r("6", 5, "Calidad y precios formidables. El estuche se ve resistente y de muy buena calidad."),
  ];
  const elegidas = seleccionDeOpiniones(lista);
  // Primero la que nombra un modelo; ni la corta, ni la de 4 estrellas, ni la repetida.
  assert.deepEqual(elegidas.map((x) => x.id), ["5", "3", "6"]);
  // El texto queda tal cual.
  assert.equal(elegidas[0].texto, "Cómodos, estéticos y bloquean muy bien la luz uv.");
  assert.ok(seleccionDeOpiniones(DATOS_ML_DE_PRUEBA.opiniones?.destacadas ?? []).length <= 3);
});

test("inicio: los textos presentan la marca sin palabras que Harper evita ni promesas médicas", () => {
  const todo = JSON.stringify(TEXTOS.inicio).toLowerCase();
  assert.equal(TEXTOS.inicio.boton, "Explorar anteojos");
  for (const palabra of ["canchero", "onda", "accesible", "fachero", "cura", "previene", "médic", "salud"]) {
    assert.ok(!todo.includes(palabra), `no dice «${palabra}»`);
  }
});
