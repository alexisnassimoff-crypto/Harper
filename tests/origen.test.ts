import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fbcDesdeClickId,
  leerOrigenDeUrl,
  normalizarOrigen,
  origenVigente,
  resumirOrigen,
  VIGENCIA_ORIGEN_MS,
} from "../lib/origen";

const AHORA = 1761000000000;

test("una llegada desde un anuncio guarda UTM, fbclid, landing y referrer", () => {
  const o = leerOrigenDeUrl({
    search: "?utm_source=ig&utm_medium=paid&utm_campaign=lanzamiento&utm_content=video1&fbclid=XYZ",
    pathname: "/producto/citrino",
    referrer: "https://l.instagram.com/?u=algo",
    ahora: AHORA,
  });

  assert.deepEqual(o, {
    utm_source: "ig",
    utm_medium: "paid",
    utm_campaign: "lanzamiento",
    utm_content: "video1",
    fbclid: "XYZ",
    landing: "/producto/citrino",
    referrer: "https://l.instagram.com/",
    ts: AHORA,
  });
});

test("sin nada de campaña en la URL no se pisa lo guardado", () => {
  assert.equal(leerOrigenDeUrl({ search: "", pathname: "/", ahora: AHORA }), null);
  assert.equal(leerOrigenDeUrl({ search: "?pedido=HARPER-1", pathname: "/gracias", ahora: AHORA }), null);
});

test("normalizar deja solo claves conocidas, recortadas, y nunca datos sueltos", () => {
  const largo = "x".repeat(500);
  const n = normalizarOrigen({
    utm_source: " meta ",
    utm_campaign: largo,
    fbp: "fb.1.123.456",
    email: "no@deberia.pasar",
    nombre: "tampoco",
    ts: 1761000000000.7,
    landing: "/",
  });

  assert.ok(n);
  assert.equal(n.utm_source, "meta");
  assert.equal(n.utm_campaign?.length, 200);
  assert.equal(n.fbp, "fb.1.123.456");
  assert.equal(n.ts, 1761000000000);
  assert.ok(!("email" in n));
  assert.ok(!("nombre" in n));

  assert.equal(normalizarOrigen(null), null);
  assert.equal(normalizarOrigen("texto"), null);
  assert.equal(normalizarOrigen({ basura: 1 }), null);
});

test("la atribución vence a los 30 días", () => {
  assert.equal(origenVigente({ utm_source: "ig", ts: AHORA }, AHORA + VIGENCIA_ORIGEN_MS - 1), true);
  assert.equal(origenVigente({ utm_source: "ig", ts: AHORA }, AHORA + VIGENCIA_ORIGEN_MS + 1), false);
  assert.equal(origenVigente({ utm_source: "ig" }, AHORA), true);
  assert.equal(origenVigente(null, AHORA), false);
});

test("fbc se arma desde el fbclid con la forma que pide Meta", () => {
  assert.equal(fbcDesdeClickId("ABC", 1700000000000), "fb.1.1700000000000.ABC");
  assert.equal(fbcDesdeClickId(undefined, 1), undefined);
});

test("resumen de una línea", () => {
  assert.equal(resumirOrigen({ utm_source: "ig", utm_medium: "paid", utm_campaign: "lanz" }), "ig / paid / lanz");
  assert.equal(resumirOrigen({ fbclid: "x" }), "meta (fbclid)");
  assert.equal(resumirOrigen(null), "");
});
