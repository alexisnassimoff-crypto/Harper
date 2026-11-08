import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { coleccionDeNosotros, mosaicoDeNosotros, nombreDeModelo } from "../lib/nosotros";
import { TEXTOS } from "../lib/textos";
import type { Producto, Variante } from "../lib/tipos";

/** Quiénes somos, página editorial (Ale, 08/11/2026): lo que no depende de React. */

const fotos = (base: string) => [1, 2, 3].map((n) => `/productos/anteojos/${base}-${n}.webp`).concat("/productos/anteojos/estuche-incluido-1.webp");

const variante = (slug: string, color: string, stock: number, conFotos = true): Variante => {
  const plano = color.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().split(" ")[0];
  return {
    id: `v-${slug}-${plano}`,
    sku: `${slug}-${plano}`.toUpperCase(),
    color,
    colorHex: "#123456",
    stock,
    fotos: conFotos ? fotos(`${slug}-${plano}`) : [],
    fotoPortada: null,
    agotada: stock <= 0,
  };
};

const modelo = (slug: string, variantes: Variante[]): Producto =>
  ({
    id: `p-${slug}`,
    nombre: slug.toUpperCase(),
    slug,
    categoria: "Anteojos",
    variantes,
    fotoPrincipal: variantes[0]?.fotos[0] ?? null,
  }) as unknown as Producto;

const CATALOGO = [
  modelo("amatista", [variante("amatista", "Negro", 5), variante("amatista", "Gris traslúcido", 2)]),
  modelo("citrino", [variante("citrino", "Carey", 3), variante("citrino", "Ámbar traslúcido", 0)]),
  modelo("obsidiana", [variante("obsidiana", "Negro", 4)]),
  modelo("cuarzo", [variante("cuarzo", "Negro", 1)]),
];

test("nosotros: la apertura lleva el carey con stock de cerca y dos modelos más de tres cuartos", () => {
  const mosaico = mosaicoDeNosotros(CATALOGO);
  assert.equal(mosaico.length, 3);
  const [grande, ...chicas] = mosaico;
  assert.equal(grande.detalle, true);
  assert.equal(grande.src, "/productos/anteojos/citrino-carey-3.webp");
  assert.equal(grande.pie, "Citrino · Carey");
  assert.equal(grande.alt, "Citrino en carey, de cerca");
  // El carey es el color con el que abre la ficha del Citrino: la ruta base.
  assert.equal(grande.enlace, "/producto/citrino");
  // Las chicas: otros modelos (no el Citrino), de tres cuartos, en el color con el que abre su ficha.
  assert.deepEqual(
    chicas.map((p) => [p.src, p.pie, p.enlace, p.detalle]),
    [
      ["/productos/anteojos/amatista-negro-2.webp", "Amatista · Negro", "/producto/amatista", false],
      ["/productos/anteojos/obsidiana-negro-2.webp", "Obsidiana · Negro", "/producto/obsidiana", false],
    ],
  );
  // Cada pieza tiene el fondo de su color.
  assert.ok(mosaico.every((p) => /^#[0-9a-f]{6}$/i.test(p.tinte)));
});

test("nosotros: sin carey con stock, la apertura empieza por el primer color con stock; sin fotos, nada", () => {
  const sinCarey = [
    modelo("citrino", [variante("citrino", "Carey", 0), variante("citrino", "Gris traslúcido", 2)]),
    modelo("obsidiana", [variante("obsidiana", "Negro", 4)]),
  ];
  const mosaico = mosaicoDeNosotros(sinCarey);
  assert.equal(mosaico[0].src, "/productos/anteojos/citrino-gris-3.webp");
  assert.equal(mosaico[0].pie, "Citrino · Gris traslúcido");
  // El gris no es el color con el que abre la ficha (el carey está agotado, pero el gris es el primero con stock): ruta base.
  assert.equal(mosaico[0].enlace, "/producto/citrino");
  assert.equal(mosaico.length, 2);

  // Un color sin la foto de cerca usa la de tres cuartos y, sin esa, la primera.
  const sinCerca = { ...variante("cuarzo", "Carey", 2), fotos: ["/productos/anteojos/cuarzo-carey-1.webp", "/productos/anteojos/cuarzo-carey-2.webp"] };
  assert.equal(mosaicoDeNosotros([modelo("cuarzo", [sinCerca])])[0].src, "/productos/anteojos/cuarzo-carey-2.webp");
  const unaSola = { ...variante("cuarzo", "Carey", 2), fotos: ["https://cdn.ejemplo/foto.webp"] };
  assert.equal(mosaicoDeNosotros([modelo("cuarzo", [unaSola])])[0].src, "https://cdn.ejemplo/foto.webp");

  // Todo agotado o sin fotos: no hay apertura con fotos.
  assert.deepEqual(mosaicoDeNosotros([modelo("x", [variante("x", "Negro", 0)])]), []);
  assert.deepEqual(mosaicoDeNosotros([modelo("x", [variante("x", "Negro", 3, false)])]), []);
});

test("nosotros: la colección muestra cada modelo con su forma y solo sus colores con stock, con su enlace", () => {
  const coleccion = coleccionDeNosotros(CATALOGO);
  assert.deepEqual(
    coleccion.map((m) => m.nombre),
    ["Amatista", "Citrino", "Obsidiana", "Cuarzo"],
  );
  const citrino = coleccion[1];
  assert.match(citrino.forma ?? "", /Cuadrado, de bordes suaves/);
  assert.equal(citrino.enlace, "/producto/citrino");
  // El ámbar del Citrino está agotado: no aparece.
  assert.deepEqual(citrino.colores.map((c) => c.color), ["Carey"]);
  // La foto de frente (recortes de la vitrina) y el enlace a la ficha de cada color.
  const amatista = coleccion[0];
  assert.deepEqual(
    amatista.colores.map((c) => [c.color, c.foto, c.enlace]),
    [
      ["Negro", "/productos/anteojos/amatista-negro-frente.webp", "/producto/amatista"],
      ["Gris traslúcido", "/productos/anteojos/amatista-gris-frente.webp", "/producto/amatista/amatista-gris"],
    ],
  );
  // Dos colores del mismo modelo no comparten fondo.
  assert.notEqual(amatista.colores[0].tinte, amatista.colores[1].tinte);

  // Un modelo nuevo, sin forma escrita, va sin la línea; uno sin stock no aparece.
  const nuevos = coleccionDeNosotros([modelo("jaspe", [variante("jaspe", "Negro", 1)]), modelo("onix", [variante("onix", "Negro", 0)])]);
  assert.deepEqual(
    nuevos.map((m) => [m.nombre, m.forma]),
    [["Jaspe", null]],
  );
});

test("nosotros: el nombre del modelo va con mayúscula inicial", () => {
  assert.equal(nombreDeModelo("CITRINO"), "Citrino");
  assert.equal(nombreDeModelo("ojo de tigre"), "Ojo de tigre");
});

test("nosotros: los textos no prometen lo que no está confirmado ni adelantan el programa nuevo", () => {
  const N = TEXTOS.nosotros;
  const todo = [
    N.etiqueta,
    ...N.frase,
    N.bajada,
    N.ideas.etiqueta,
    N.ideas.titulo,
    N.ideas.bajada,
    ...N.manifiesto.flatMap((m) => [m.titulo, m.texto]),
    N.coleccion.etiqueta,
    N.coleccion.titulo,
    N.coleccion.bajada,
    N.coleccion.verModelo("Citrino"),
    ...Object.values(N.compra),
    ...Object.values(N.cierre),
    N.viene("de sol polarizados"),
  ].join(" ");
  // Sin el programa nuevo, sin precios ni promociones, sin historia, fabricación, materiales ni certificaciones.
  assert.doesNotMatch(todo, /crédito|credito|dúo|duo\b|cashback|\$\s?\d|%|descuento|cuota|gratis/i);
  assert.doesNotMatch(todo, /fabrica|fabricamos|fábrica|acetato|metal|titanio|certific|desde 19|desde 20|fundad|historia|familia|garantizamos/i);
  // Lo de los cristales es solo lo confirmado (lib/caracteristicas.ts).
  assert.match(N.manifiesto[2].texto, /Se oscurecen solos al sol, filtran parte de la luz azul de las pantallas y tienen protección UV400\./);
  // Lo de Ale (04/11/2026): sin «como la ropa» ni lo del accesorio.
  assert.doesNotMatch(todo, /como la ropa|accesorio/i);
});

test("nosotros: la página no toca el carrito, el checkout, los pagos ni el programa nuevo, y cierra en Anteojos", () => {
  const pagina = readFileSync(join(__dirname, "../../app/quienes-somos/page.tsx"), "utf8");
  assert.doesNotMatch(pagina, /carrito|checkout|mercadopago|credito|Credito|duo|Duo|airtable/);
  // Las condiciones de compra son las de la ficha (lib/ficha.ts), con los plazos de lib/confianza.ts.
  assert.match(pagina, /condicionesDeCompra\(mensajesDeConfianza\(config\)/);
  // El cierre lleva a la colección de anteojos; nada de anclas de la portada que ya no existen.
  assert.match(pagina, /rutaDeCategoria\(LINEAS\[0\]\.categoria\)/);
  assert.doesNotMatch(pagina, /\/#lo-que-viene/);
});
