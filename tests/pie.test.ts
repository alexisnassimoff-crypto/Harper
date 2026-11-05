import { test } from "node:test";
import assert from "node:assert/strict";
import { urlDeInstagram } from "../lib/config";
import { DIAS_ARREPENTIMIENTO, DIAS_CAMBIO, MESES_GARANTIA } from "../lib/confianza";

test("el Instagram de Config se acepta como @usuario, usuario o URL", () => {
  assert.equal(urlDeInstagram("@harper.ar"), "https://www.instagram.com/harper.ar/");
  assert.equal(urlDeInstagram("harper.ar"), "https://www.instagram.com/harper.ar/");
  assert.equal(urlDeInstagram("https://instagram.com/harper.ar?igsh=xyz"), "https://www.instagram.com/harper.ar/");
  assert.equal(urlDeInstagram("https://www.instagram.com/harper.ar/"), "https://www.instagram.com/harper.ar/");
  assert.equal(urlDeInstagram(""), "");
  assert.equal(urlDeInstagram(undefined), "");
  assert.equal(urlDeInstagram("javascript:alert(1)"), "", "nada que no sea un usuario");
});

test("los plazos: 10 días corridos para devolver, 30 para cambios, y 6 meses de garantía (04/11/2026)", () => {
  assert.equal(DIAS_ARREPENTIMIENTO, 10);
  assert.equal(DIAS_CAMBIO, 30);
  assert.equal(MESES_GARANTIA, 6);
});
