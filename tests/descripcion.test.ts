import { test } from "node:test";
import assert from "node:assert/strict";
import { parrafosDe, resumenDe } from "../lib/descripcion";

test("cada renglón es un párrafo, con o sin renglón en blanco en el medio", () => {
  assert.deepEqual(parrafosDe("Uno.\nDos.\n\n\nTres.  \n  "), ["Uno.", "Dos.", "Tres."]);
  assert.deepEqual(parrafosDe("Uno.\r\n\r\nDos."), ["Uno.", "Dos."]);
  assert.deepEqual(parrafosDe("  muchos    espacios  "), ["muchos espacios"]);
  assert.deepEqual(parrafosDe(""), []);
  assert.deepEqual(parrafosDe(null), []);
});

test("el resumen es el primer párrafo, entero si entra", () => {
  assert.equal(resumenDe("Un solo par para todo el día.\nSegundo párrafo."), "Un solo par para todo el día.");
  assert.equal(resumenDe(undefined), "");
});

test("si el primer párrafo es largo, se corta en una palabra entera con puntos suspensivos", () => {
  const largo = "Anteojos con filtro de luz azul y cristales fotocromáticos, ".repeat(5).trim();
  const r = resumenDe(largo, 60);
  assert.ok(r.length <= 60, r);
  assert.ok(r.endsWith("…"), r);
  assert.ok(largo.startsWith(r.slice(0, -1)), r);
  assert.ok(!/[\s,]…$/.test(r), "no deja una coma o un espacio antes de los puntos");
});
