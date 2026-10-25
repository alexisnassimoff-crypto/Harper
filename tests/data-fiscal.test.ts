import { test } from "node:test";
import assert from "node:assert/strict";
import { leerDataFiscal } from "../lib/data-fiscal";

// La forma del código que entrega ARCA para un sitio web (el QR es de ejemplo).
const CODIGO =
  '<a href="http://qr.afip.gob.ar/?qr=AbC123_x-Yz,," target="_F960AFIPInfo"><img src="http://www.afip.gob.ar/images/f960/DATAWEB.jpg" border="0"></a>';

test("del código de ARCA se toman solo el enlace al QR y el logo, este por https", () => {
  assert.deepEqual(leerDataFiscal(CODIGO), {
    enlace: "http://qr.afip.gob.ar/?qr=AbC123_x-Yz,,",
    imagen: "https://www.afip.gob.ar/images/f960/DATAWEB.jpg",
  });
});

test("sin código, o con enlaces que no son de ARCA, no se muestra nada", () => {
  assert.equal(leerDataFiscal(""), null);
  assert.equal(leerDataFiscal(null), null);
  assert.equal(leerDataFiscal('<a href="https://ejemplo.com/?qr=123"><img src="https://ejemplo.com/logo.jpg"></a>'), null);
  assert.equal(leerDataFiscal('<a href="https://qr.afip.gob.ar.ejemplo.com/?qr=1">x</a>'), null);
});

test("también acepta el dominio de ARCA y el enlace solo (sin logo)", () => {
  assert.deepEqual(leerDataFiscal("https://qr.arca.gob.ar/?qr=Q1W2E3"), { enlace: "https://qr.arca.gob.ar/?qr=Q1W2E3", imagen: null });
});

test("nunca se usa el HTML pegado: un script o atributos de más quedan afuera", () => {
  const r = leerDataFiscal(`${CODIGO}<script>alert(1)</script>`);
  assert.ok(r && !r.enlace.includes("<") && !r.enlace.includes('"'));
});
