import { test } from "node:test";
import assert from "node:assert/strict";
import { firmarComprobante, huella, leerComprobante, type DatosComprobante } from "../lib/cotizacion-envio";
import { leerEleccionEnvio } from "../lib/envio-elegido";

const CLAVE = Buffer.from("clave-de-prueba-de-32-bytes-0000");
const AHORA = 1_800_000_000_000;

const DATOS: DatosComprobante = {
  v: 1,
  exp: AHORA + 60_000,
  destino: huella(["5000", "CB", "cordoba"]),
  carrito: huella([["rec1", 1]]),
  entorno: "produccion",
  bonificado: false,
  cotizadoEn: new Date(AHORA).toISOString(),
  opcion: {
    id: "andreani:ground",
    transportista: "andreani",
    transportistaNombre: "Andreani",
    servicio: "ground",
    servicioNombre: "Estándar",
    costo: 8120.4,
    precio: 8121,
    plazo: "2-4 días",
  },
  detalle: { carrier: "andreani", service: "ground", totalPrice: 8120.4 },
};

test("un comprobante firmado se lee tal cual", () => {
  const token = firmarComprobante(DATOS, CLAVE);
  assert.deepEqual(leerComprobante(token, CLAVE, { entorno: "produccion", ahora: AHORA }), DATOS);
});

test("cambiar el precio, la firma o la clave lo invalida", () => {
  const token = firmarComprobante(DATOS, CLAVE);
  const [contenido, firma] = token.split(".");
  const tocado = Buffer.from(
    JSON.stringify({ ...DATOS, opcion: { ...DATOS.opcion, precio: 1 } })
  ).toString("base64url");
  assert.equal(leerComprobante(`${tocado}.${firma}`, CLAVE, { entorno: "produccion", ahora: AHORA }), null);
  assert.equal(leerComprobante(`${contenido}.${firma.slice(1)}x`, CLAVE, { entorno: "produccion", ahora: AHORA }), null);
  assert.equal(leerComprobante(token, Buffer.from("otra-clave"), { entorno: "produccion", ahora: AHORA }), null);
});

test("vencido, de otro entorno o con basura, no sirve", () => {
  const token = firmarComprobante(DATOS, CLAVE);
  assert.equal(leerComprobante(token, CLAVE, { entorno: "produccion", ahora: DATOS.exp }), null);
  assert.equal(leerComprobante(token, CLAVE, { entorno: "prueba", ahora: AHORA }), null);
  for (const basura of [null, 42, "", "a.b.c", "sin-punto", "x".repeat(5000)]) {
    assert.equal(leerComprobante(basura, CLAVE, { entorno: "produccion", ahora: AHORA }), null, String(basura).slice(0, 20));
  }
});

test("la huella es estable y distingue datos distintos", () => {
  assert.equal(huella(["5000", "CB"]), huella(["5000", "CB"]));
  assert.notEqual(huella(["5000", "CB"]), huella(["5001", "CB"]));
});

test("de la elección del navegador quedan el id y el comprobante, nunca un precio", () => {
  const token = firmarComprobante(DATOS, CLAVE);
  assert.deepEqual(leerEleccionEnvio({ id: "andreani:ground", comprobante: token, precio: 0, costo: 1 }), {
    id: "andreani:ground",
    comprobante: token,
  });
  assert.equal(leerEleccionEnvio({ precio: 0 }), undefined);
  assert.equal(leerEleccionEnvio(null), undefined);
  assert.equal(leerEleccionEnvio("andreani:ground"), undefined);
  assert.deepEqual(leerEleccionEnvio({ id: "andreani:ground; DROP", comprobante: "no es <un> token" }), undefined);
  assert.deepEqual(leerEleccionEnvio({ id: "correoArgentino:standard_dom" }), { id: "correoArgentino:standard_dom" });
});
