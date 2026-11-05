import { test } from "node:test";
import assert from "node:assert/strict";

// Tarea 06 (Ale, 05/11/2026): con el Dúo, el envío gratis se mide antes del
// 25 %. El envío de punta a punta en el servidor, con el catálogo de prueba
// (sin tramos de anteojos, como hoy en producción) y un Envia de mentira.
// El envío gratis desde $ 160.000 en todo el país: dos pares de $ 89.900
// llegan a lista ($ 179.800) y con el Dúo pagan $ 157.325, debajo del mínimo.
process.env.HARPER_FIXTURES = "1";
process.env.ENVIA_TOKEN = "token-de-prueba";
process.env.HARPER_FIXTURES_ENVIO_GRATIS_DESDE = "160000";
process.env.HARPER_FIXTURES_ENVIO_GRATIS_AMBA_DESDE = "60000";
delete process.env.HARPER_FIXTURES_ESCALA;
delete process.env.VERCEL;
delete process.env.HARPER_DUO_ACTIVO;

import { listRecords, TABLAS, updateRecord } from "../lib/airtable";
import { leerComprobante } from "../lib/cotizacion-envio";
import { conDescuento, totalConDescuento } from "../lib/descuentos";
import { cotizacionParaComprador } from "../lib/envio-gratis";
import { claveDeComprobantes, entornoEnvia, vaciarCacheEnvia } from "../lib/envia";
import { resolverCarrito, type CarritoResuelto } from "../lib/pedidos";
import type { SuscriptorDelCarrito } from "../lib/suscriptores";
import type { ItemCarrito } from "../lib/tipos";

const CITRINO_NEGRO = "rec5h3kW0JBY8Wd7y"; // $ 89.900
const AMATISTA_NEGRO = "recLvS1Rce368QVeX"; // $ 89.900
const M500 = "recMyVTEzcVtTh64g"; // estuche, $ 8.990
const citrino = (cantidad = 1): ItemCarrito => ({ productoSlug: "citrino", varianteId: CITRINO_NEGRO, cantidad });
const amatista = (cantidad = 1): ItemCarrito => ({ productoSlug: "amatista", varianteId: AMATISTA_NEGRO, cantidad });
const m500 = (cantidad = 1): ItemCarrito => ({ productoSlug: "m500", varianteId: M500, cantidad });

const CORDOBA = { cp: "5000", provincia: "Córdoba", ciudad: "Córdoba", calle: "Bv. San Juan", numero: "123" };
const CABA = { cp: "1426", provincia: "Ciudad Autónoma de Buenos Aires", ciudad: "Buenos Aires", calle: "Gorostiaga", numero: "1635" };
const DOS_PARES = [citrino(), amatista()];
/** Córdoba: Correo Argentino cotiza $ 7.350,25; con el 10 % de recargo, $ 8.086. */
const ENVIO_CORDOBA = 8086;

let consultas = 0;
let caido = false;
const fetchOriginal = globalThis.fetch;
globalThis.fetch = (async (entrada: RequestInfo | URL, init?: RequestInit) => {
  const url = String(entrada);
  if (!url.startsWith("https://api.envia.com/")) return fetchOriginal(entrada, init);
  consultas++;
  if (caido) throw new Error("Envia no contesta");
  const carrier = JSON.parse(String(init?.body)).shipment.carrier;
  const data =
    carrier === "andreani"
      ? [{ carrier, service: "ground", serviceDescription: "Estándar", deliveryEstimate: "2-4 días", totalPrice: "8120.40", currency: "ARS" }]
      : carrier === "correoArgentino"
        ? [{ carrier, service: "standard_dom", serviceDescription: "Clásico", deliveryEstimate: "3-6 días", totalPrice: 7350.25, currency: "ARS" }]
        : null;
  return new Response(JSON.stringify(data ? { meta: "rate", data } : { meta: "error", error: { code: 1126, message: "sin cobertura" } }));
}) as typeof fetch;
console.warn = () => {};

function reiniciar() {
  vaciarCacheEnvia();
  consultas = 0;
  caido = false;
}

async function conInterruptor<T>(valor: string | undefined, hacer: () => Promise<T>): Promise<T> {
  const antes = process.env.HARPER_DUO_ACTIVO;
  if (valor === undefined) delete process.env.HARPER_DUO_ACTIVO;
  else process.env.HARPER_DUO_ACTIVO = valor;
  try {
    return await hacer();
  } finally {
    if (antes === undefined) delete process.env.HARPER_DUO_ACTIVO;
    else process.env.HARPER_DUO_ACTIVO = antes;
  }
}
const apagado = <T>(hacer: () => Promise<T>) => conInterruptor(undefined, hacer);
const prendido = <T>(hacer: () => Promise<T>) => conInterruptor("1", hacer);

/** Cambia un valor de Config del Airtable de prueba solo durante `hacer`. */
async function conConfig<T>(clave: string, valor: string, hacer: () => Promise<T>): Promise<T> {
  const fila = (await listRecords<{ Clave?: string; Valor?: string }>(TABLAS.config)).find((f) => f.fields.Clave === clave)!;
  const antes = fila.fields.Valor;
  await updateRecord(TABLAS.config, fila.id, { Valor: valor });
  try {
    return await hacer();
  } finally {
    await updateRecord(TABLAS.config, fila.id, { Valor: antes });
  }
}

/** Lo que importa del envío, sin el comprobante (lleva un IV al azar). */
const envioDe = (c: CarritoResuelto) => ({
  subtotal: c.subtotal,
  subtotalSinCupon: c.subtotalSinCupon,
  envio: c.envio,
  total: c.total,
  envioBonificado: c.envioBonificado,
  envioZona: c.envioZona,
  envioCotizado: c.envioCotizado,
  opcion: c.envioDelPedido.opcion,
  cobrado: c.envioDelPedido.cobrado,
});

const UMBRALES = { amba: 60_000, nacional: 160_000 };

test("Dúo apagado: el envío gratis se decide exactamente como hoy", async () => {
  reiniciar();
  const dos = await apagado(() => resolverCarrito(DOS_PARES, { destino: CORDOBA }));
  assert.equal(dos.subtotal, 179_800);
  assert.equal(dos.subtotalSinCupon, 179_800);
  assert.equal(dos.envioBonificado, true);
  assert.equal(dos.envio, 0);

  const unoYEstuche = await apagado(() => resolverCarrito([citrino(), m500()], { destino: CORDOBA }));
  assert.equal(unoYEstuche.subtotalSinCupon, unoYEstuche.subtotal);
  assert.equal(unoYEstuche.envioBonificado, false);
  assert.equal(unoYEstuche.envio, ENVIO_CORDOBA);
  assert.equal(cotizacionParaComprador(unoYEstuche, UMBRALES).falta, 160_000 - 98_890);

  // Cualquier valor que no sea "1" es apagado, y da lo mismo.
  for (const valor of ["0", "", "true"]) {
    for (const items of [DOS_PARES, [citrino(), m500()], [citrino(3), m500(2)]]) {
      const base = await apagado(() => resolverCarrito(items, { destino: CORDOBA }));
      const otro = await conInterruptor(valor, () => resolverCarrito(items, { destino: CORDOBA }));
      assert.deepEqual(envioDe(otro), envioDe(base), `HARPER_DUO_ACTIVO="${valor}"`);
    }
  }
});

test("Dúo prendido: dos pares a Córdoba pagan $ 157.325 y siguen con el envío gratis", async () => {
  reiniciar();
  const con = await prendido(() => resolverCarrito(DOS_PARES, { destino: CORDOBA }));
  assert.equal(con.subtotal, 157_325);
  assert.equal(con.subtotalSinCupon, 179_800, "el envío gratis se mide antes del 25 %");
  assert.equal(con.envioBonificado, true);
  assert.equal(con.envio, 0);
  assert.equal(con.total, 157_325);
  assert.equal(con.envioZona, "resto");
  // Harper paga el envío, como en todo pedido con envío gratis.
  assert.equal(con.envioDelPedido.opcion?.costo, 7350.25);
  assert.equal(con.envioDelPedido.cobrado, 0);
  // Al transportista se le declara lo que se vende: el valor con el Dúo.
  assert.equal((con.envioDelPedido.cotizacion as { valorDeclarado: number }).valorDeclarado, 157_325);
  // Lo que ve el comprador: no le falta nada para el envío gratis.
  const visto = cotizacionParaComprador(con, UMBRALES);
  assert.equal(visto.bonificado, true);
  assert.equal(visto.falta, 0);
});

test("Lo cotizado con el Dúo se cobra en el checkout con el mismo envío gratis, sin volver a cotizar", async () => {
  reiniciar();
  const cotizado = await prendido(() => resolverCarrito(DOS_PARES, { destino: CORDOBA }));
  const comprobante = cotizado.opcionesEnvio[0].comprobante;
  assert.equal(leerComprobante(comprobante, claveDeComprobantes()!, { entorno: entornoEnvia() })?.bonificado, true);

  consultas = 0;
  caido = true; // si consultara, fallaría
  const cobrado = await prendido(() =>
    resolverCarrito(DOS_PARES, { paraCobrar: true, destino: CORDOBA, eleccion: { id: "domicilio", comprobante } })
  );
  assert.equal(consultas, 0);
  assert.equal(cobrado.envio, 0);
  assert.equal(cobrado.envioBonificado, true);
  assert.equal(cobrado.total, 157_325);
  assert.equal(cobrado.envioDelPedido.cotizadoEn, cotizado.envioDelPedido.cotizadoEn);

  // Si el Dúo se apaga entre la cotización y el pago, el carrito es otro
  // ($ 179.800): el comprobante no sirve y se cotiza de nuevo.
  caido = false;
  const sinDuo = await apagado(() => resolverCarrito(DOS_PARES, { paraCobrar: true, destino: CORDOBA, eleccion: { comprobante } }));
  assert.ok(sinDuo.opcionesEnvio.length > 0, "cotización nueva");
  assert.equal(sinDuo.total, 179_800);
  assert.equal(sinDuo.envio, 0);
});

test("No regala envío: si antes del 25 % no llega al mínimo, paga el envío igual que sin el Dúo", async () => {
  reiniciar();
  await conConfig("envio_gratis_desde", "180000", async () => {
    const sin = await apagado(() => resolverCarrito(DOS_PARES, { destino: CORDOBA }));
    const con = await prendido(() => resolverCarrito(DOS_PARES, { destino: CORDOBA }));
    assert.equal(sin.envio, ENVIO_CORDOBA);
    assert.equal(con.subtotalSinCupon, 179_800);
    assert.equal(con.envioBonificado, false);
    assert.equal(con.envio, ENVIO_CORDOBA);
    assert.equal(con.total, 157_325 + ENVIO_CORDOBA);
    assert.ok(con.total < sin.total, "con el Dúo paga menos igual");
    // «Te faltan…» se mide con la misma base: $ 180.000 − $ 179.800.
    assert.equal(cotizacionParaComprador(con, { amba: 60_000, nacional: 180_000 }).falta, 200);
  });

  // Justo en el mínimo, a lista: gratis.
  reiniciar();
  await conConfig("envio_gratis_desde", "179800", async () => {
    const con = await prendido(() => resolverCarrito(DOS_PARES, { destino: CORDOBA }));
    assert.equal(con.envioBonificado, true);
    assert.equal(con.total, 157_325);
  });

  // Un solo anteojo no tiene Dúo: queda como hoy.
  reiniciar();
  const uno = await prendido(() => resolverCarrito([citrino(), m500()], { destino: CORDOBA }));
  const unoSin = await apagado(() => resolverCarrito([citrino(), m500()], { destino: CORDOBA }));
  assert.deepEqual(envioDe(uno), envioDe(unoSin));
});

test("Con estuches: los anteojos cuentan a lista y los estuches con su propio tramo", async () => {
  reiniciar();
  const items = [citrino(), amatista(), m500(2)];
  const estuches = totalConDescuento(2 * 8_990, 5); // $ 17.081
  const con = await prendido(() => resolverCarrito(items, { destino: CORDOBA }));
  assert.equal(con.subtotal, 157_325 + estuches);
  assert.equal(con.subtotalSinCupon, 179_800 + estuches);

  // El mínimo entre la base con el tramo de los estuches ($ 196.881) y la de
  // los estuches a lista ($ 197.780): no llega, porque los estuches van con su tramo.
  reiniciar();
  await conConfig("envio_gratis_desde", "197000", async () => {
    const conMinimo = await prendido(() => resolverCarrito(items, { destino: CORDOBA }));
    assert.equal(conMinimo.envioBonificado, false);
    assert.equal(conMinimo.envio, ENVIO_CORDOBA);
  });
  reiniciar();
  await conConfig("envio_gratis_desde", "196881", async () => {
    const justo = await prendido(() => resolverCarrito(items, { destino: CORDOBA }));
    assert.equal(justo.envioBonificado, true);
  });
});

test("AMBA y tarifa plana: igual que hoy (en la Ciudad, gratis desde $ 60.000 con cualquier anteojo)", async () => {
  reiniciar();
  for (const items of [DOS_PARES, [citrino()], [m500()]]) {
    const sin = await apagado(() => resolverCarrito(items, { destino: CABA }));
    const con = await prendido(() => resolverCarrito(items, { destino: CABA }));
    assert.equal(con.envioBonificado, sin.envioBonificado, JSON.stringify(items));
    assert.equal(con.envio, sin.envio, JSON.stringify(items));
  }
  // Sin destino (carrito y panel lateral): la tarifa plana, con la misma base.
  const sinDestino = await prendido(() => resolverCarrito(DOS_PARES));
  assert.equal(sinDestino.envio, 0);
  assert.equal(sinDestino.total, 157_325);
});

test("Dinero en Mercado Pago y suscriptores no cambian quién tiene envío gratis", async () => {
  reiniciar();
  await conConfig("envio_gratis_desde", "180000", async () => {
    // El 10 % va sobre lo que queda con el Dúo; el envío es el mismo.
    const con = await prendido(() => resolverCarrito(DOS_PARES, { destino: CORDOBA }));
    assert.equal(con.dineroMP?.subtotal, conDescuento(157_325, 10));
    assert.equal(con.envio, ENVIO_CORDOBA);

    // Un suscriptor tiene envío gratis siempre, con o sin Dúo.
    const suscriptor: SuscriptorDelCarrito = { id: "recPRUEBA", email: "prueba@harper.ar", cuponDisponible: false, saldoDisponible: 0, activo: true };
    const conSuscriptor = await prendido(() => resolverCarrito(DOS_PARES, { destino: CORDOBA, suscriptor }));
    assert.equal(conSuscriptor.envio, 0);
    assert.equal(conSuscriptor.total, 157_325);
  });
});
