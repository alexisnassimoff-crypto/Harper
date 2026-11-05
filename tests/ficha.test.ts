import { test } from "node:test";
import assert from "node:assert/strict";
import { mensajesDeConfianza } from "../lib/confianza";
import { condicionesDeCompra, medidasDeLaFicha, numerosDeLaPatilla, talleDe } from "../lib/ficha";
import { mensajeTalleModelo } from "../lib/whatsapp";
import { TEXTOS } from "../lib/textos";
import type { Medidas } from "../lib/tipos";

const vacias: Medidas = { calibreMm: null, puenteMm: null, patillaMm: null, frenteMm: null, altoMm: null };

test("ficha: las medidas se muestran solo si están cargadas, en el orden de la patilla", () => {
  assert.deepEqual(medidasDeLaFicha(null), []);
  assert.deepEqual(medidasDeLaFicha(vacias), []);
  const filas = medidasDeLaFicha({ calibreMm: 52, puenteMm: 18, patillaMm: 140, frenteMm: 138, altoMm: 41 });
  assert.deepEqual(
    filas.map((f) => [f.letra, f.nombre, f.valor]),
    [
      ["A", "Calibre", 52],
      ["B", "Puente", 18],
      [null, "Patilla", 140],
      ["C", "Alto", 41],
      ["D", "Frente", 138],
    ]
  );
  // Con una sola cargada, solo esa.
  assert.deepEqual(medidasDeLaFicha({ ...vacias, puenteMm: 19 }).map((f) => f.nombre), ["Puente"]);
});

test("ficha: los números de la patilla, solo con los tres", () => {
  assert.equal(numerosDeLaPatilla({ ...vacias, calibreMm: 52, puenteMm: 18, patillaMm: 140 }), "52□18-140");
  assert.equal(numerosDeLaPatilla({ ...vacias, calibreMm: 52, puenteMm: 18 }), null);
  assert.equal(numerosDeLaPatilla(null), null);
});

test("ficha: el talle sale del ancho del frente y sin él no se inventa", () => {
  // Es una orientación, y la ficha lo dice: nunca una garantía de ajuste.
  assert.match(TEXTOS.ficha.talle.orientativo, /orientación, no una garantía de ajuste/);
  assert.equal(TEXTOS.ficha.talle.etiqueta, "Talle orientativo");
  assert.equal(talleDe(null), null);
  assert.equal(talleDe({ ...vacias, calibreMm: 52 }), null, "el calibre solo no alcanza");
  assert.equal(talleDe({ ...vacias, frenteMm: 128 }), "Chico");
  assert.equal(talleDe({ ...vacias, frenteMm: 130 }), "Chico");
  assert.equal(talleDe({ ...vacias, frenteMm: 130.4 }), "Chico");
  assert.equal(talleDe({ ...vacias, frenteMm: 131 }), "Mediano");
  assert.equal(talleDe({ ...vacias, frenteMm: 140 }), "Mediano");
  assert.equal(talleDe({ ...vacias, frenteMm: 141 }), "Grande");
  assert.equal(talleDe({ ...vacias, frenteMm: 152 }), "Grande");
});

test("ficha: envío, devolución, cambios, garantía y pago, cada uno con su enlace visible", () => {
  const confianza = mensajesDeConfianza({ envioGratisDesde: 150_000, envioGratisAmbaDesde: 60_000 });
  // Con plazos distintos (la decisión del 04/11/2026: 10 para devolver, 30 para cambiar).
  const c = condicionesDeCompra(confianza, { diasArrepentimiento: 10, diasCambio: 30, mesesGarantia: 6 });
  assert.deepEqual(
    c.map((x) => x.clave),
    ["envio", "devolucion", "cambios", "garantia", "pago"]
  );
  assert.match(c[0].texto, /Envío gratis en AMBA desde \$\s?60\.000/);
  assert.equal(c[0].href, "/legales/terminos#envios");
  assert.equal(c[1].texto, "10 días corridos para devolverlo sin costo");
  assert.equal(c[1].href, "/legales/devoluciones");
  assert.equal(c[2].texto, "Cambios de color o modelo hasta 30 días");
  assert.equal(c[3].texto, "6 meses de garantía por defectos de fabricación");
  assert.equal(c[3].href, "/legales/devoluciones#garantia");
  assert.ok(c.every((x) => x.enlace.length > 0 && x.href.startsWith("/legales/")), "todos con enlace a la política");

  // Con el mismo plazo, devolución y cambios en un solo renglón (lo que hoy está en main).
  const igual = condicionesDeCompra(confianza, { diasArrepentimiento: 30, diasCambio: 30, mesesGarantia: 6 });
  assert.deepEqual(igual.map((x) => x.clave), ["envio", "devolucion", "garantia", "pago"]);
  assert.equal(igual[1].texto, "Cambios y devoluciones hasta 30 días");

  // Sin mensajes de confianza, igual quedan los plazos y la garantía.
  assert.deepEqual(
    condicionesDeCompra([], { diasArrepentimiento: 10, diasCambio: 30, mesesGarantia: 6 }).map((x) => x.clave),
    ["devolucion", "cambios", "garantia"]
  );
});

test("ficha: el mensaje de WhatsApp del talle nombra el modelo, sin caracteres raros", () => {
  assert.equal(mensajeTalleModelo("CITRINO"), "Hola, Harper. Quiero consultar por el talle y las medidas del modelo CITRINO.");
  assert.equal(mensajeTalleModelo("<b>"), "Hola, Harper. Quiero consultar por el talle y las medidas del modelo b.");
  assert.equal(mensajeTalleModelo(""), "Hola, Harper. Quiero consultar por el talle y las medidas de un modelo.");
});

test("ficha: los textos nuevos no prometen nada médico ni usan las palabras que la marca evita", () => {
  const todo = JSON.stringify(TEXTOS.ficha).toLowerCase();
  for (const palabra of ["canchero", "onda", "accesible", "fachero", "cura", "previene", "médic", "salud"]) {
    assert.ok(!todo.includes(palabra), `no dice «${palabra}»`);
  }
  assert.match(todo, /filtran parte de la luz azul/);
});
