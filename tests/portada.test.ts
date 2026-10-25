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

test("el subtítulo aprobado solo se muestra si todos los anteojos publicados tienen las características confirmadas", async () => {
  const { subtituloDeLaPortada } = await import("../lib/portada");
  const confirmados = [{ confirmado: true }, { confirmado: true }];
  assert.equal(subtituloDeLaPortada("", confirmados), SUBTITULO_PORTADA);
  // Llega un modelo nuevo sin confirmar (por ejemplo, de sol): sin subtítulo, sin afirmar nada falso.
  assert.equal(subtituloDeLaPortada("", [...confirmados, { confirmado: false }]), "");
  assert.equal(subtituloDeLaPortada("", []), "");
  // Lo que se cargue en Config manda siempre.
  assert.equal(subtituloDeLaPortada("  Otro texto  ", [{ confirmado: false }]), "Otro texto");
});
