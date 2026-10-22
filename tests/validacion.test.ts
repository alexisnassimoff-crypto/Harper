import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizarCliente, validarCliente } from "../lib/validacion";

const completo = {
  email: "ale@harper.ar",
  nombre: "Ale Nassimoff",
  telefono: "11 4917 2061",
  dni: "",
  direccion: "Núñez 2422",
  ciudad: "CABA",
  provincia: "Ciudad Autónoma de Buenos Aires",
  cp: "1429",
  aceptaPromos: false,
};

test("el DNI es opcional", () => {
  assert.deepEqual(validarCliente(completo), {});
  assert.deepEqual(validarCliente({ ...completo, dni: "30123456" }), {});
  assert.deepEqual(validarCliente({ ...completo, dni: "30.123.456" }), {});
});

test("si se escribe un DNI, tiene que tener forma de DNI", () => {
  assert.ok(validarCliente({ ...completo, dni: "123" }).dni);
  assert.ok(validarCliente({ ...completo, dni: "1234567890" }).dni);
});

test("el teléfono sigue siendo obligatorio: lo usa el envío", () => {
  assert.ok(validarCliente({ ...completo, telefono: "" }).telefono);
  assert.ok(validarCliente({ ...completo, telefono: "1234" }).telefono);
});

test("normalizar deja el DNI solo con números y el consentimiento como booleano", () => {
  const n = normalizarCliente({ ...completo, dni: "30.123.456", aceptaPromos: undefined });
  assert.equal(n.dni, "30123456");
  assert.equal(n.aceptaPromos, false);
  assert.equal(n.email, "ale@harper.ar");
});
