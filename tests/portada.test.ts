import { test } from "node:test";
import assert from "node:assert/strict";
import { DESCRIPCION_SITIO, SUBTITULO_PORTADA, TITULO_SITIO } from "../lib/portada";

test("el subtítulo de la portada dice qué vendemos, con el texto aprobado", () => {
  assert.equal(
    SUBTITULO_PORTADA,
    "Anteojos con filtro de luz azul y cristales fotocromáticos. Diseño para todos los días."
  );
});

test("ningún texto de la portada afirma certificaciones", () => {
  for (const texto of [SUBTITULO_PORTADA, DESCRIPCION_SITIO]) {
    for (const prohibida of ["iso", "certific", "norma"]) {
      assert.ok(!texto.toLowerCase().includes(prohibida), `no debería decir "${prohibida}": ${texto}`);
    }
  }
});

test("los metadatos presentan anteojos primero", () => {
  assert.match(TITULO_SITIO, /Anteojos/);
  assert.ok(DESCRIPCION_SITIO.toLowerCase().startsWith("anteojos"));
});
