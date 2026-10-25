import { test } from "node:test";
import assert from "node:assert/strict";
import { registroAceptacion, VERSION_TERMINOS, versionTerminosLegible } from "../lib/legales";

test("el pedido guarda la versión aceptada y el momento exacto, en UTC", () => {
  const momento = new Date("2026-10-25T14:03:12.345Z");
  assert.equal(registroAceptacion(momento, "2026-10-22"), "Versión 2026-10-22 · 2026-10-25T14:03:12.345Z");
  assert.ok(registroAceptacion(momento).startsWith(`Versión ${VERSION_TERMINOS} · `));
});

test("la versión se muestra como fecha legible, sin correrse de día por la zona horaria", () => {
  assert.equal(versionTerminosLegible("2026-10-22"), "22 de octubre de 2026");
  assert.equal(versionTerminosLegible("2026-01-01"), "1 de enero de 2026");
});
