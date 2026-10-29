import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizarCliente, validarCliente } from "../lib/validacion";

const completo = {
  email: "ale@harper.ar",
  nombre: "Ale Nassimoff",
  telefono: "11 4917 2061",
  dni: "30123456",
  direccion: "Núñez 2422",
  ciudad: "CABA",
  provincia: "Ciudad Autónoma de Buenos Aires",
  cp: "1429",
  aceptaPromos: false,
  aceptaTerminos: true,
};

test("con todos los datos no hay errores; el DNI acepta puntos", () => {
  assert.deepEqual(validarCliente(completo), {});
  assert.deepEqual(validarCliente({ ...completo, dni: "30.123.456" }), {});
  assert.deepEqual(validarCliente({ ...completo, dni: "7654321" }), {});
});

test("el DNI es obligatorio: lo pide la logística para entregar", () => {
  assert.equal(validarCliente({ ...completo, dni: "" }).dni, "Ingresá tu DNI");
  assert.equal(validarCliente({ ...completo, dni: "   " }).dni, "Ingresá tu DNI");
  assert.ok(validarCliente({ ...completo, dni: "123" }).dni);
  assert.ok(validarCliente({ ...completo, dni: "123456789" }).dni);
});

test("el teléfono sigue siendo obligatorio: lo usa el envío", () => {
  assert.ok(validarCliente({ ...completo, telefono: "" }).telefono);
  assert.ok(validarCliente({ ...completo, telefono: "1234" }).telefono);
});

test("la provincia es una de las 24 y el código postal tiene sus cuatro números: con eso se cotiza el envío", () => {
  assert.deepEqual(validarCliente({ ...completo, provincia: "Córdoba", cp: "X5000ABC" }), {});
  assert.deepEqual(validarCliente({ ...completo, provincia: "cordoba", cp: "5000" }), {});
  assert.equal(validarCliente({ ...completo, provincia: "Bs As" }).provincia, "Elegí la provincia");
  assert.equal(validarCliente({ ...completo, provincia: "" }).provincia, "Elegí la provincia");
  assert.equal(validarCliente({ ...completo, cp: "CPxx" }).cp, "Ingresá el código postal");
  assert.equal(validarCliente({ ...completo, cp: "142" }).cp, "Ingresá el código postal");
});

test("normalizar deja el DNI solo con números y el consentimiento como booleano", () => {
  const n = normalizarCliente({ ...completo, dni: "30.123.456", aceptaPromos: undefined });
  assert.equal(n.dni, "30123456");
  assert.equal(n.aceptaPromos, false);
  assert.equal(n.email, "ale@harper.ar");
});
