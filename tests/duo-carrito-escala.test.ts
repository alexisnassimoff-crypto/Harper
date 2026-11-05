import { test } from "node:test";
import assert from "node:assert/strict";

// El Airtable de prueba con la escala de anteojos encendida («llevá 3, pagá
// 2» y «llevá 5, pagá 3»), para ver qué queda cuando vuelven los tramos.
process.env.HARPER_FIXTURES = "1";
process.env.HARPER_FIXTURES_ESCALA = "1";
delete process.env.VERCEL;
delete process.env.HARPER_DUO_ACTIVO;

import { getProductos } from "../lib/catalogo";
import { ofertaDeEscala, porcentajeParaCantidad, proximoTramo, totalConDescuento } from "../lib/descuentos";
import { packConDuo, resolverCarrito, type CarritoResuelto } from "../lib/pedidos";
import { filasDeDescuento, mensajesDelDuo } from "../lib/promocion-anteojos";
import { empujeDeLaBarra } from "../lib/vitrina";

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
  // Tarea 06: el envío gratis se mide antes del 25 %, con los anteojos a lista.
  assert.equal(con.subtotalSinCupon, 179_800);
  assert.equal(sin.subtotalSinCupon, 179_800);
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
    // Si queda la escala, el envío gratis se mide como hoy: sobre lo que se paga.
    assert.equal(con.subtotalSinCupon, sin.subtotalSinCupon);
    assert.equal(con.subtotalSinCupon, esperado);
    assert.equal(con.envio, sin.envio);
  }
});

/** La línea de la barra «Tus pares» con lo que resolvió el servidor. */
function barra(c: CarritoResuelto, pares: number) {
  return empujeDeLaBarra({
    pares,
    actual: porcentajeParaCantidad(c.tramos, "Anteojos", pares),
    proximo: proximoTramo(c.tramos, "Anteojos", pares),
    cupon: 0,
    subtotalSinCupon: c.subtotalSinCupon,
    precioPar: 89_900,
    envioGratisDesde: 0,
    escala: ofertaDeEscala(c.tramos, "Anteojos", pares),
    duo: c.duo ?? null,
  });
}

test("Tarea 07, con la escala: si con otro par gana el «llevá 3, pagá 2», se cuenta el tramo, no el Dúo", async () => {
  // Dos anteojos: queda el Dúo, pero con un tercero gana la escala.
  const dos = await carrito(2, true);
  assert.deepEqual(dos.duo, { porcentaje: 25, ahorro: 22_475, unidades: 1, siguiente: "tramos" });
  const m = mensajesDelDuo(dos.duo!, "carrito");
  assert.equal(m.siguiente, null, "no se promete otro 25 %");
  assert.equal(m.tramos, true, "la tienda muestra el tramo, como siempre");
  assert.equal(barra(dos, 2), "Dúo aplicado. Uno más y te lo llevás gratis.");

  // Tres anteojos: quedó la escala; nada dice «Dúo».
  const tres = await carrito(3, true);
  assert.equal(tres.duo?.ahorro, 0);
  assert.ok(tres.items.every((i) => !i.duo));
  assert.deepEqual(filasDeDescuento({ ahorro: tres.ahorro, items: tres.items, cupon: tres.cupon }), [{ etiqueta: "Descuento", monto: tres.ahorro }]);
  assert.equal(mensajesDelDuo(tres.duo!, "ficha").aplicado, null);
  const texto = barra(tres, 3) ?? "";
  assert.ok(!texto.includes("Dúo"), texto);
  assert.ok(texto.startsWith("Llevá 3, pagá 2 aplicado"), texto);

  // Los packs de la ficha y la portada: con 3 cobra la escala; con 2, el Dúo.
  const amatista = (await getProductos()).find((p) => p.slug === "amatista")!;
  process.env.HARPER_DUO_ACTIVO = "1";
  try {
    const pack3 = await packConDuo(amatista, 3);
    assert.equal(pack3?.promocion, "tramos");
    assert.equal(pack3?.total, totalConDescuento(89_900 * 3, (1 - 2 / 3) * 100));
    const pack2 = await packConDuo(amatista, 2);
    assert.equal(pack2?.promocion, "duo");
    assert.equal(pack2?.total, 157_325);
  } finally {
    delete process.env.HARPER_DUO_ACTIVO;
  }
});
