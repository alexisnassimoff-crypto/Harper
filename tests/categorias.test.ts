import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CATEGORIAS,
  categoriaDesdeTexto,
  categoriaPorSlug,
  categoriasConProductos,
  esCategoriaDeAnteojos,
  rutaDeCategoria,
} from "../lib/categorias";
import { caracteristicasDe } from "../lib/caracteristicas";

test("las categorías de Airtable se reconocen con mayúsculas, tildes y guiones distintos", () => {
  assert.equal(categoriaDesdeTexto("Anteojos"), "Anteojos");
  assert.equal(categoriaDesdeTexto(" anteojos de SOL "), "Anteojos de sol");
  assert.equal(categoriaDesdeTexto("Clip On"), "Clip-On");
  assert.equal(categoriaDesdeTexto("clip-on"), "Clip-On");
  assert.equal(categoriaDesdeTexto("Anteojos de receta"), "Anteojos de receta");
  assert.equal(categoriaDesdeTexto("Panos"), "Paños");
  assert.equal(categoriaDesdeTexto("Lentes de contacto"), null);
  assert.equal(categoriaDesdeTexto(""), null);
  assert.equal(categoriaDesdeTexto(undefined), null);
});

test("solo aparecen las categorías con productos, en el orden del registro", () => {
  const hoy = [{ categoria: "Paños" as const }, { categoria: "Anteojos" as const }, { categoria: "Estuches" as const }];
  assert.deepEqual(categoriasConProductos(hoy).map((c) => c.nombre), ["Anteojos", "Estuches", "Paños"]);
  const conSol = [...hoy, { categoria: "Anteojos de sol" as const }];
  assert.deepEqual(categoriasConProductos(conSol).map((c) => c.nombre), ["Anteojos", "Anteojos de sol", "Estuches", "Paños"]);
});

test("rutas y tipos de cada categoría", () => {
  assert.equal(rutaDeCategoria("Anteojos de sol"), "/anteojos-de-sol");
  assert.equal(rutaDeCategoria("Paños"), "/panos");
  assert.equal(categoriaPorSlug("clip-on")?.nombre, "Clip-On");
  assert.equal(categoriaPorSlug("no-existe"), null);
  for (const nombre of ["Anteojos", "Anteojos de sol", "Clip-On", "Anteojos de receta"] as const) {
    assert.ok(esCategoriaDeAnteojos(nombre), nombre);
  }
  assert.ok(!esCategoriaDeAnteojos("Estuches"));
  // Slugs únicos.
  assert.equal(new Set(CATEGORIAS.map((c) => c.slug)).size, CATEGORIAS.length);
});

test("una categoría nueva de anteojos no hereda las características de los cuatro modelos actuales", () => {
  for (const categoria of ["Anteojos de sol", "Clip-On", "Anteojos de receta"] as const) {
    assert.equal(caracteristicasDe({ slug: "citrino", categoria }), null, categoria);
    assert.equal(caracteristicasDe({ slug: "modelo-nuevo", categoria }), null, categoria);
  }
});
