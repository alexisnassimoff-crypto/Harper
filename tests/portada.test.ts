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

test("los textos de la marca: sin palabras prohibidas, sin contar los modelos de hoy, sin precios ni promesas médicas", async () => {
  const { TEXTOS } = await import("../lib/textos");
  const { FORMAS } = await import("../lib/vitrina");
  const { LINEAS } = await import("../lib/lineas");
  // Todos los textos, y los que llevan datos armados con unos de ejemplo.
  const textos: string[] = [];
  const juntar = (v: unknown): void => {
    if (typeof v === "string") textos.push(v);
    else if (typeof v === "function") textos.push(String(v("$ 1", 3, 2, "$ 2", "$ 3")));
    else if (v && typeof v === "object") Object.values(v).forEach(juntar);
  };
  juntar(TEXTOS);
  const todo = [...textos, ...Object.values(FORMAS), ...LINEAS.map((l) => l.promesa), DESCRIPCION_SITIO, TITULO_SITIO].join(" ").toLowerCase();
  assert.ok(textos.length > 40);
  // Las que Ale no quiere en el sitio (30/10/2026).
  for (const prohibida of ["canchero", "onda", "ondero", "fachero", "accesible"]) {
    assert.ok(!new RegExp(`\\b${prohibida}`).test(todo), `no debería decir "${prohibida}"`);
  }
  // La colección crece: no se cuentan los modelos ni los colores de hoy.
  assert.ok(!/\b(cuatro|doce)\b/.test(todo));
  // Los precios y las promociones los pone el código.
  assert.ok(!/\$\s?[1-9]\d*\.\d{3}/.test(todo));
  assert.ok(!/previene|cura |descans|oftalmólog|recomiendan/.test(todo));
});

test("los textos que llevan datos se arman bien", async () => {
  const { TEXTOS } = await import("../lib/textos");
  assert.equal(TEXTOS.portada.bajada("$ 89.900"), "Anteojos fotocromáticos con filtro de luz azul, a $ 89.900 el par.");
  assert.equal(TEXTOS.portada.bajada(null), "Anteojos fotocromáticos con filtro de luz azul.");
  assert.equal(
    TEXTOS.portada.promo(3, 2, "$ 179.800", 6, "$ 29.966,67"),
    "Si te llevás 3, pagás 2: $ 179.800 en 6 cuotas sin interés de $ 29.966,67.",
  );
  assert.equal(
    TEXTOS.viene.bajada("de sol polarizados, de receta y clip-on", 25, 95),
    "Se vienen anteojos de sol polarizados, de receta y clip-on: 25 modelos nuevos en 95 colores.",
  );
  assert.equal(TEXTOS.cierre.precio("$ 89.900") + TEXTOS.cierre.escala("tres", "dos"), "Cada par cuesta $ 89.900. Y si te llevás tres, pagás dos.");
});

test("en la ficha, «Incluye» arranca por el anteojo mismo, solo en los modelos confirmados", async () => {
  const { caracteristicasDe } = await import("../lib/caracteristicas");
  assert.equal(
    caracteristicasDe({ slug: "citrino", categoria: "Anteojos" })?.incluido,
    "1 anteojo de TR90 con cristales fotocromáticos, filtro de luz azul y protección UV400",
  );
  assert.equal(caracteristicasDe({ slug: "nuevo", categoria: "Anteojos" }), null, "un modelo sin confirmar no afirma nada");
});
