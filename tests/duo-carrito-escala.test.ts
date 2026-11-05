import { test } from "node:test";
import assert from "node:assert/strict";

// El Airtable de prueba con la escala de anteojos encendida («llevá 3, pagá
// 2» y «llevá 5, pagá 3»), para ver qué queda cuando vuelven los tramos.
process.env.HARPER_FIXTURES = "1";
process.env.HARPER_FIXTURES_ESCALA = "1";
delete process.env.VERCEL;
delete process.env.HARPER_DUO_ACTIVO;

import { getProductos } from "../lib/catalogo";
import { totalConDescuento } from "../lib/descuentos";
import { resolverCarrito } from "../lib/pedidos";

/**
 * Prioridad del Dúo frente a los tramos de Airtable (revisión del PR #61):
 * en los anteojos queda el que le deje al cliente el total más bajo, nunca
 * los dos, y uno peor no le gana en silencio.
 */

async function carrito(cantidad: number, duo: boolean) {
  const amatista = (await getProductos()).find((p) => p.slug === "amatista")!;
  if (duo) process.env.HARPER_DUO_ACTIVO = "1";
  try {
    return await resolverCarrito([{ productoSlug: "amatista", varianteId: amatista.variantes[0].id, cantidad }]);
  } finally {
    delete process.env.HARPER_DUO_ACTIVO;
  }
}

test("Con la escala de Airtable: 2 anteojos no llegan al 3x2, queda el Dúo", async () => {
  const sin = await carrito(2, false);
  assert.equal(sin.subtotal, 179_800, "sin Dúo, a precio de lista");
  const con = await carrito(2, true);
  assert.equal(con.subtotal, 157_325);
  assert.equal(con.ahorro, 22_475);
});

test("Con la escala de Airtable: con 3 y 5 anteojos el «llevá N, pagá M» es mejor y queda; el Dúo no se suma", async () => {
  for (const [cantidad, porcentaje] of [[3, (1 - 2 / 3) * 100], [4, (1 - 2 / 3) * 100], [5, (1 - 3 / 5) * 100]] as const) {
    const sin = await carrito(cantidad, false);
    const con = await carrito(cantidad, true);
    const esperado = totalConDescuento(89_900 * cantidad, porcentaje);
    assert.equal(sin.subtotal, esperado, `${cantidad} anteojos sin Dúo`);
    assert.equal(con.subtotal, esperado, `${cantidad} anteojos con Dúo: queda la escala`);
    assert.equal(con.ahorro, sin.ahorro);
    assert.deepEqual(con.items, sin.items, "los renglones quedan exactamente iguales");
  }
});
