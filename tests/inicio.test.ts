import { test } from "node:test";
import assert from "node:assert/strict";
import { DATOS_ML_DE_PRUEBA } from "../lib/fixtures/opiniones";
import { opinionesDeAnteojos, type ResenaML } from "../lib/ml-resenas";
import { TEXTOS } from "../lib/textos";
import { categoriasParaComprar, destacadosDeLaPortada, fotoDeLaPortada } from "../lib/vitrina";

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

test("inicio: la foto de la primera pantalla es un anteojo real entero, del carey con stock", () => {
  const fotos = (base: string) => [1, 2, 3].map((n) => `/productos/anteojos/${base}-${n}.webp`).concat("/productos/estuches/x-1.webp");
  const modelos = [
    { nombre: "AMATISTA", variantes: [variante("Negro", 5, fotos("amatista-negro"))] },
    { nombre: "CITRINO", variantes: [variante("Carey", 0, fotos("citrino-carey")), variante("Ámbar", 2, fotos("citrino-ambar"))] },
    { nombre: "CUARZO", variantes: [variante("Carey", 1, fotos("cuarzo-carey"))] },
  ];
  // El carey del Citrino está agotado: va el del Cuarzo, su foto de tres cuartos (-2).
  assert.deepEqual(fotoDeLaPortada(modelos), { src: "/productos/anteojos/cuarzo-carey-2.webp", alt: "Cuarzo en carey" });
  // Sin carey con stock, el primer color con stock; sin la de tres cuartos, su primera foto.
  assert.equal(fotoDeLaPortada([{ nombre: "OBSIDIANA", variantes: [variante("Negro", 1, ["/productos/anteojos/obsidiana-negro-1.webp"])] }])?.src, "/productos/anteojos/obsidiana-negro-1.webp");
  assert.equal(fotoDeLaPortada([{ nombre: "X", variantes: [variante("Negro", 0, ["/a.webp"])] }]), null);
});

test("inicio: cuatro destacados como mucho, de a uno por categoría", () => {
  const cat = (pre: string, n: number) => ({ productos: Array.from({ length: n }, (_, i) => `${pre}${i + 1}`) });
  // Hoy: una sola categoría con cuatro modelos.
  assert.deepEqual(destacadosDeLaPortada([cat("F", 4)]), ["F1", "F2", "F3", "F4"]);
  assert.deepEqual(destacadosDeLaPortada([cat("F", 6)]), ["F1", "F2", "F3", "F4"]);
  // Con más categorías, en ronda: cada una tiene su lugar y nunca pasan de cuatro.
  assert.deepEqual(destacadosDeLaPortada([cat("F", 4), cat("S", 3)]), ["F1", "S1", "F2", "S2"]);
  assert.deepEqual(destacadosDeLaPortada([cat("F", 4), cat("S", 1), cat("R", 2), cat("C", 2), cat("X", 2)]), ["F1", "S1", "R1", "C1"]);
  assert.deepEqual(destacadosDeLaPortada([cat("F", 1), cat("S", 1)]), ["F1", "S1"]);
  assert.deepEqual(destacadosDeLaPortada([]), []);
});

test("inicio: las opiniones son solo de anteojos, reales y sin repetir a la misma persona", () => {
  const r = (id: string, estrellas: number, texto: string, producto: string | null = null): ResenaML => ({
    id,
    estrellas,
    titulo: "Excelente",
    texto,
    fecha: "2026-10-20T00:00:00Z",
    producto,
  });
  const lista = [
    r("1", 5, "Excelente producto!!!.", "Modelo CUARZO"),
    r("2", 5, "Muy lindo y además trae una microfibra gruesa."),
    r("3", 5, "Hermosas fundas. Compre negra y azul.", "Estuche R100"),
    r("4", 5, "Cómodos, estéticos y bloquean muy bien la luz uv.", "Modelo CITRINO"),
    r("5", 5, "Cómodos, estéticos y bloquean muy bien la luz uv!", "Modelo CITRINO"),
    r("6", 4, "Es el segundo que compro, cumple con todo lo dicho.", "Modelo OBSIDIANA"),
  ];
  // Ni la de un estuche, ni la que no dice qué se compró, ni la corta, ni la repetida.
  assert.deepEqual(opinionesDeAnteojos(lista).map((x) => x.id), ["4", "6"]);
  // En la ficha de un modelo, las suyas primero.
  assert.deepEqual(opinionesDeAnteojos(lista, { modelo: "Obsidiana" }).map((x) => x.id), ["6", "4"]);
  // El texto queda tal cual.
  assert.equal(opinionesDeAnteojos(lista)[0].texto, "Cómodos, estéticos y bloquean muy bien la luz uv.");
  // Sin opiniones de anteojos, nada (la sección no aparece).
  assert.deepEqual(opinionesDeAnteojos([r("9", 5, "Muy buena presentación, viene con el paño.", "Paño Premium")]), []);
  // Con la copia real de harper.ar: solo las que nombran un modelo.
  const reales = opinionesDeAnteojos(DATOS_ML_DE_PRUEBA.opiniones?.destacadas ?? []);
  assert.ok(reales.length > 0 && reales.length <= 3 && reales.every((x) => x.producto?.startsWith("Modelo ")));
});

test("inicio: los textos presentan la marca sin frases genéricas, sin exagerar y sin palabras que Harper evita", () => {
  const todo = JSON.stringify(TEXTOS.inicio).toLowerCase();
  assert.equal(TEXTOS.inicio.producto, "Anteojos de diseño");
  assert.equal(TEXTOS.inicio.boton, "Explorar anteojos");
  assert.equal(TEXTOS.inicio.suscripcion.titulo, "Ser parte tiene sus ventajas.");
  assert.equal(TEXTOS.inicio.suscripcion.boton, "Descubrir mis beneficios");
  for (const palabra of ["para todos los días", "premium", "lujo", "calidad superior", "canchero", "onda", "accesible", "fachero", "cura", "previene", "médic", "salud"]) {
    assert.ok(!todo.includes(palabra), `no dice «${palabra}»`);
  }
});
