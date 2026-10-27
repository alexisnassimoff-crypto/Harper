import { test } from "node:test";
import assert from "node:assert/strict";
import { CARACTERISTICAS_ANTEOJOS, caracteristicasDe, RESUMEN_ANTEOJOS } from "../lib/caracteristicas";

test("los cuatro modelos confirmados tienen sus cuatro características y la línea corta", () => {
  for (const slug of ["amatista", "obsidiana", "cuarzo", "citrino"]) {
    const c = caracteristicasDe({ slug, categoria: "Anteojos" });
    assert.ok(c, slug);
    assert.deepEqual([...c.lista], [
      "Filtro de luz azul",
      "Cristales fotocromáticos que se adaptan a la luz solar",
      "Protección UV400 contra los rayos UVA y UVB",
      "Armazón apto para colocar cristales con aumento",
    ]);
    assert.equal(c.resumen, "Filtro azul · Fotocromáticos · UV400");
  }
  // Tolera mayúsculas o espacios en el slug de Airtable.
  assert.ok(caracteristicasDe({ slug: " Citrino ", categoria: "Anteojos" }));
});

test("un anteojo nuevo no hereda las afirmaciones hasta que se confirme", () => {
  assert.equal(caracteristicasDe({ slug: "topacio", categoria: "Anteojos" }), null);
});

test("estuches y paños no llevan características de anteojos", () => {
  assert.equal(caracteristicasDe({ slug: "r100", categoria: "Estuches" }), null);
  assert.equal(caracteristicasDe({ slug: "pano-alta-densidad", categoria: "Paños" }), null);
  // Aunque un slug coincidiera, la categoría manda.
  assert.equal(caracteristicasDe({ slug: "citrino", categoria: "Estuches" }), null);
});

test("nada ofrece graduaciones ni afirma certificaciones", () => {
  const todo = [...CARACTERISTICAS_ANTEOJOS, RESUMEN_ANTEOJOS].join(" ").toLowerCase();
  for (const prohibida of ["receta", "graduaci", "iso", "certific", "norma"]) {
    assert.ok(!todo.includes(prohibida), `no debería decir "${prohibida}"`);
  }
});
