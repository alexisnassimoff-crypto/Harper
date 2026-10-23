import { test } from "node:test";
import assert from "node:assert/strict";
import { DESCRIPCION_SITIO, TITULO_SITIO, subtituloPorDefecto } from "../lib/portada";

test("el subtítulo se arma con lo que hay publicado", () => {
  assert.equal(
    subtituloPorDefecto(4, 4),
    "Cuatro modelos y hasta cuatro colores. Comprá online, pagá con Mercado Pago y recibilos en tu casa."
  );
  assert.equal(
    subtituloPorDefecto(1, 1),
    "Un modelo. Comprá online, pagá con Mercado Pago y recibilos en tu casa."
  );
  assert.equal(
    subtituloPorDefecto(12, 2),
    "12 modelos y hasta dos colores. Comprá online, pagá con Mercado Pago y recibilos en tu casa."
  );
  assert.equal(subtituloPorDefecto(0, 0), "Comprá online, pagá con Mercado Pago y recibilos en tu casa.");
});

test("los metadatos presentan anteojos primero y sin claims ópticos", () => {
  assert.match(TITULO_SITIO, /Anteojos/);
  assert.ok(DESCRIPCION_SITIO.toLowerCase().startsWith("anteojos"));
  for (const prohibida of ["luz azul", "fotocrom", "uv", "iso", "certific"]) {
    assert.ok(!DESCRIPCION_SITIO.toLowerCase().includes(prohibida), `no debería decir "${prohibida}"`);
  }
});
