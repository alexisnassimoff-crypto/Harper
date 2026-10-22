import { test, before } from "node:test";
import assert from "node:assert/strict";

// El catálogo se lee contra el Airtable en memoria: sin red ni credenciales.
process.env.HARPER_FIXTURES = "1";
delete process.env.VERCEL_ENV;

import { getProducto, getProductos, getSlugs } from "../lib/catalogo";
import { modoFixtures } from "../lib/airtable";

before(() => {
  assert.equal(modoFixtures(), true);
});

test("el catálogo completo: 10 productos activos, 4 anteojos primero", async () => {
  const productos = await getProductos();

  assert.equal(productos.length, 10);
  assert.equal(productos.filter((p) => p.categoria === "Anteojos").length, 4);
  assert.equal(productos.filter((p) => p.categoria === "Estuches").length, 3);
  assert.equal(productos.filter((p) => p.categoria === "Paños").length, 3);

  // El producto interno de prueba de cobro está inactivo y no aparece.
  assert.ok(!productos.some((p) => p.slug === "prueba-cobro"));

  // Cada producto tiene variantes con fotos y precio.
  for (const p of productos) {
    assert.ok(p.variantes.length > 0, `${p.nombre} sin variantes`);
    assert.ok(p.precio > 0, `${p.nombre} sin precio`);
    assert.ok(p.fotoPrincipal, `${p.nombre} sin foto`);
  }
});

test("filtrar por categoría y leer uno por slug", async () => {
  const anteojos = await getProductos("Anteojos");
  assert.deepEqual(
    anteojos.map((p) => p.slug),
    ["amatista", "obsidiana", "cuarzo", "citrino"]
  );

  const citrino = await getProducto("citrino");
  assert.ok(citrino);
  assert.equal(citrino.variantes.length, 4);
  assert.equal(citrino.variantes[3].sku, "CITRINO-CAREY");
  assert.equal(citrino.variantes[3].stock, 3);

  assert.equal(await getProducto("no-existe"), null);
  assert.equal(await getProducto("prueba-cobro"), null);
});

test("los campos nuevos de la ficha se leen y, si faltan, quedan vacíos", async () => {
  const amatista = await getProducto("amatista");
  assert.ok(amatista);
  assert.deepEqual(amatista.incluye, ["Estuche rígido Harper", "Paño de microfibra"]);
  assert.deepEqual(amatista.medidas, { frenteMm: 140, puenteMm: 19, patillaMm: 145 });
  assert.equal(amatista.material, "Acetato");
  assert.equal(amatista.lentes, "Fotocromáticos con filtro de luz azul");

  const obsidiana = await getProducto("obsidiana");
  assert.ok(obsidiana);
  assert.equal(obsidiana.medidas, null);
  assert.equal(obsidiana.material, null);
  assert.equal(obsidiana.lentes, null);

  const pano = await getProducto("pano-mostrador-30x45");
  assert.ok(pano);
  assert.deepEqual(pano.incluye, []);
  assert.equal(pano.envase, null);
});

test("los slugs para el sitemap", async () => {
  const slugs = await getSlugs();
  assert.equal(slugs.length, 10);
  assert.ok(slugs.includes("m500"));
});
