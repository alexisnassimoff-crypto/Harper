import { test } from "node:test";
import assert from "node:assert/strict";

process.env.HARPER_FIXTURES = "1";

import { createRecord, TABLAS } from "../lib/airtable";
import {
  clienteQueCompro,
  codigoCorrecto,
  codigoNuevo,
  crearDesafio,
  datosDeLaUltimaCompra,
  normalizarEmail,
  VIGENCIA_CODIGO_MS,
} from "../lib/reconocer-cliente";

const CLAVE = Buffer.from("clave-de-prueba-de-32-bytes-0000");
const AHORA = 1_800_000_000_000;

test("el código se verifica con el desafío: mismo mail, mismo código y sin vencer", () => {
  const desafio = crearDesafio(CLAVE, "ana@ejemplo.com", "123456", AHORA);
  assert.ok(!desafio.includes("123456"), "el desafío no lleva el código");
  assert.equal(codigoCorrecto(CLAVE, desafio, "ana@ejemplo.com", "123456", AHORA + 1000), true);
  assert.equal(codigoCorrecto(CLAVE, desafio, "ana@ejemplo.com", " 123456 ", AHORA + 1000), true, "con espacios también");
  assert.equal(codigoCorrecto(CLAVE, desafio, "ana@ejemplo.com", "123457", AHORA + 1000), false, "otro código");
  assert.equal(codigoCorrecto(CLAVE, desafio, "otra@ejemplo.com", "123456", AHORA + 1000), false, "otro mail");
  assert.equal(codigoCorrecto(CLAVE, desafio, "ana@ejemplo.com", "123456", AHORA + VIGENCIA_CODIGO_MS), false, "vencido");
  assert.equal(codigoCorrecto(Buffer.from("otra-clave"), desafio, "ana@ejemplo.com", "123456", AHORA + 1000), false, "otra clave");
  const [, firma] = desafio.split(".");
  assert.equal(codigoCorrecto(CLAVE, `${AHORA + 99 * VIGENCIA_CODIGO_MS}.${firma}`, "ana@ejemplo.com", "123456", AHORA + 1000), false, "estirar el vencimiento rompe la firma");
  for (const raro of [null, 42, "", "sin-punto", "1.2.3", "abc.def"]) {
    assert.equal(codigoCorrecto(CLAVE, raro, "ana@ejemplo.com", "123456", AHORA), false, String(raro));
  }
  assert.equal(codigoCorrecto(CLAVE, desafio, "ana@ejemplo.com", "12345", AHORA), false, "cinco números");
  assert.equal(codigoCorrecto(CLAVE, desafio, "ana@ejemplo.com", 123456, AHORA), false, "un número, no texto");
});

test("los códigos son de seis números y el mail se compara en minúsculas", () => {
  for (let i = 0; i < 50; i++) assert.match(codigoNuevo(), /^\d{6}$/);
  assert.equal(normalizarEmail("  Ana@Ejemplo.COM "), "ana@ejemplo.com");
  assert.equal(normalizarEmail("no-es-un-mail"), null);
  assert.equal(normalizarEmail(null), null);
  assert.equal(normalizarEmail(`${"a".repeat(120)}@ejemplo.com`), null);
});

test("con una compra confirmada, se completan sus datos y la dirección de la última compra", async () => {
  const cliente = await createRecord(TABLAS.clientes, {
    Email: "vuelve@ejemplo.com",
    Nombre: "Ana Pérez",
    Telefono: "3514445566",
    DNI: "30123456",
    Primera_compra: "2026-10-01",
  });
  await createRecord(TABLAS.pedidos, {
    Numero: "HP-VIEJO",
    Cliente: [cliente.id],
    Direccion: "Bv. San Juan 100",
    Ciudad: "Córdoba",
    Provincia: "Córdoba",
    CP: "5000",
    Fecha: "2026-10-01T12:00:00.000Z",
  });
  await createRecord(TABLAS.pedidos, {
    Numero: "HP-NUEVO",
    Cliente: [cliente.id],
    Direccion: "Gorostiaga 1700, 5° B",
    Ciudad: "Buenos Aires",
    Provincia: "Ciudad Autónoma de Buenos Aires",
    CP: "1426",
    Fecha: "2026-10-20T12:00:00.000Z",
  });

  const encontrado = await clienteQueCompro("vuelve@ejemplo.com");
  assert.ok(encontrado);
  assert.deepEqual(await datosDeLaUltimaCompra(encontrado!), {
    email: "vuelve@ejemplo.com",
    nombre: "Ana Pérez",
    telefono: "3514445566",
    dni: "30123456",
    direccion: "Gorostiaga 1700, 5° B",
    ciudad: "Buenos Aires",
    provincia: "Ciudad Autónoma de Buenos Aires",
    cp: "1426",
  });
});

test("sin compra confirmada (solo un pedido sin pagar) no hay nada que completar", async () => {
  await createRecord(TABLAS.clientes, { Email: "nopago@ejemplo.com", Nombre: "Beto", DNI: "20111222" });
  assert.equal(await clienteQueCompro("nopago@ejemplo.com"), null);
  assert.equal(await clienteQueCompro("nadie@ejemplo.com"), null);
});
