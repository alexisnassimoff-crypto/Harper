import { test } from "node:test";
import assert from "node:assert/strict";

// El Airtable de prueba, como queda con Socios Harper: sin «llevá 3, pagá 2»,
// con la membresía ($ 159.900) y los cristales para socios ($ 80.000).
process.env.HARPER_FIXTURES = "1";
delete process.env.VERCEL;

import { listRecords, TABLAS } from "../lib/airtable";
import { getConfig } from "../lib/config";
import { getProductos } from "../lib/catalogo";
import { unidadesParaCobrar } from "../lib/dinero-mp";
import { resolverCarrito } from "../lib/pedidos";
import { planDelPedido, planesDeSocio, SLUG_AUMENTO, SLUG_SOCIO } from "../lib/socios";
import { numeroDeSocio, registrarSocio, venceEn } from "../lib/socios-alta";

async function ids() {
  const productos = await getProductos();
  const variante = (slug: string) => productos.find((p) => p.slug === slug)!.variantes.find((v) => !v.agotada)!.id;
  return {
    socio: { productoSlug: SLUG_SOCIO, varianteId: variante(SLUG_SOCIO), cantidad: 1 },
    aumento: { productoSlug: SLUG_AUMENTO, varianteId: variante(SLUG_AUMENTO), cantidad: 1 },
    citrino: (cantidad = 1) => ({ productoSlug: "citrino", varianteId: variante("citrino"), cantidad }),
    cuarzo: { productoSlug: "cuarzo", varianteId: variante("cuarzo"), cantidad: 1 },
    estuche: { productoSlug: "m500", varianteId: variante("m500"), cantidad: 1 },
  };
}

test("los planes salen de Airtable: socio $ 159.900, con aumento $ 239.900 y 100 lugares", async () => {
  const [productos, config] = await Promise.all([getProductos(), getConfig()]);
  const planes = planesDeSocio(productos, config.sociosCupos)!;
  assert.equal(planes.socio.precio, 159900);
  assert.match(planes.socio.precioTexto, /^\$\s159\.900$/);
  assert.equal(planes.aumento?.total, 239900);
  assert.match(planes.aumento?.totalTexto ?? "", /^\$\s239\.900$/);
  assert.deepEqual([planes.cupos, planes.quedan], [100, 100]);
  // Sin la membresía publicada, no hay planes.
  assert.equal(planesDeSocio(productos.filter((p) => p.slug !== SLUG_SOCIO)), null);
});

test("con la membresía, el primer par va incluido y el envío es gratis", async () => {
  const i = await ids();
  const carrito = await resolverCarrito([i.socio, i.citrino()]);
  assert.equal(carrito.subtotal, 159900);
  assert.equal(carrito.envio, 0);
  assert.equal(carrito.ahorro, 89900);
  const par = carrito.items.find((x) => x.productoSlug === "citrino")!;
  assert.deepEqual([par.subtotal, par.precioUnitario, par.incluido], [0, 0, 89900]);
  // A Mercado Pago no le llega un renglón en $ 0, pero el pedido sí lleva el par (para el stock).
  assert.equal(carrito.items.length, 2);
});

test("el plan con aumento suma los cristales: $ 239.900", async () => {
  const i = await ids();
  const carrito = await resolverCarrito([i.socio, i.aumento, i.citrino()]);
  assert.equal(carrito.subtotal, 239900);
  assert.equal(planDelPedido(carrito.items), "Socio con aumento");
  assert.equal(planDelPedido((await resolverCarrito([i.socio, i.citrino()])).items), "Socio");
});

test("solo un par va incluido: el segundo se cobra, y el unitario sale en pesos enteros", async () => {
  const i = await ids();
  const dos = await resolverCarrito([i.socio, i.citrino(2)]);
  assert.equal(dos.subtotal, 159900 + 89900);
  const linea = dos.items.find((x) => x.productoSlug === "citrino")!;
  assert.deepEqual([linea.cantidad, linea.subtotal, linea.incluido], [2, 89900, 89900]);
  assert.ok(unidadesParaCobrar(linea).every((u) => Number.isInteger(u.precio) && u.precio > 0));

  // Con dos modelos, el incluido es el primero; el otro se paga entero.
  const mezcla = await resolverCarrito([i.socio, i.citrino(), i.cuarzo]);
  assert.equal(mezcla.subtotal, 159900 + 89900);
  assert.equal(mezcla.items.filter((x) => x.incluido).length, 1);
});

test("una sola membresía, de a una; los cristales sin membresía no se venden", async () => {
  const i = await ids();
  const tres = await resolverCarrito([{ ...i.socio, cantidad: 3 }, i.citrino()]);
  assert.equal(tres.items.find((x) => x.productoSlug === SLUG_SOCIO)!.cantidad, 1);
  assert.equal(tres.subtotal, 159900);

  const solo = await resolverCarrito([i.aumento, i.citrino()]);
  assert.ok(!solo.items.some((x) => x.productoSlug === SLUG_AUMENTO));
  assert.deepEqual(solo.descartados, [{ varianteId: i.aumento.varianteId, motivo: "no-existe" }]);
  assert.equal(solo.subtotal, 89900, "sin membresía, el par se paga");
});

test("sin anteojos en el carrito, la membresía sola no regala nada", async () => {
  const i = await ids();
  const carrito = await resolverCarrito([i.socio, i.estuche]);
  const estuche = carrito.items.find((x) => x.productoSlug === "m500")!;
  assert.equal(estuche.incluido, undefined);
  assert.equal(carrito.subtotal, 159900 + estuche.precioLista);
});

test("el 10% de dinero en Mercado Pago no toca la membresía", async () => {
  const i = await ids();
  const carrito = await resolverCarrito([i.socio, i.citrino(2)]);
  // 159.900 fijos + 10% sobre el par que se paga (89.900 → 80.910).
  assert.equal(carrito.dineroMP!.subtotal, 159900 + 80910);
  const socio = carrito.dineroMP!.items.find((x) => x.productoSlug === SLUG_SOCIO)!;
  assert.deepEqual([socio.subtotal, socio.descuentoDineroMP], [159900, undefined]);
});

test("la membresía no va en la caja: el paquete es el del par", async () => {
  const i = await ids();
  const conSocio = await resolverCarrito([i.socio, i.citrino()]);
  const solo = await resolverCarrito([i.citrino()]);
  assert.deepEqual(conSocio.paquete, solo.paquete);
});

test("el alta del socio: número en orden, una sola vez por pedido, y vence a los 12 meses", async () => {
  const items = [
    { productoSlug: SLUG_SOCIO, categoria: "Membresía" as const },
    { productoSlug: "citrino", categoria: "Anteojos" as const },
  ];
  const cliente = { nombre: "Ana Pérez", email: "ana@ejemplo.com", telefono: "1144445555" };
  const ahora = new Date("2026-10-30T15:00:00Z");

  const primero = await registrarSocio({ numeroPedido: "H-SOCIO-1", items, cliente, ahora });
  assert.deepEqual(primero, { numero: 1, plan: "Socio", vence: "2027-10-30" });
  // El webhook se reintenta: mismo socio, sin otra fila.
  assert.deepEqual(await registrarSocio({ numeroPedido: "H-SOCIO-1", items, cliente, ahora }), primero);

  const segundo = await registrarSocio({
    numeroPedido: "H-SOCIO-2",
    items: [...items, { productoSlug: SLUG_AUMENTO, categoria: "Membresía" as const }],
    cliente,
    ahora,
  });
  assert.deepEqual([segundo?.numero, segundo?.plan], [2, "Socio con aumento"]);

  const filas = await listRecords<{ Pedido?: string; Segundo_par?: string; Reposicion?: string }>(TABLAS.socios);
  assert.equal(filas.length, 2);
  assert.deepEqual([filas[0].fields.Segundo_par, filas[0].fields.Reposicion], ["Pendiente", "Disponible"]);

  // Un pedido sin membresía no da de alta a nadie.
  assert.equal(await registrarSocio({ numeroPedido: "H-1", items: items.slice(1), cliente, ahora }), null);

  assert.equal(numeroDeSocio(7), "N.º 007");
  assert.equal(venceEn("2028-02-29"), "2029-02-28");
  // A medianoche en Buenos Aires ya es el día siguiente en UTC: el alta va con la fecha de acá.
  const tarde = await registrarSocio({ numeroPedido: "H-SOCIO-3", items, cliente, ahora: new Date("2026-10-31T02:30:00Z") });
  assert.equal(tarde?.vence, "2027-10-30");
});

test("con la membresía a la venta, el «llevá 3, pagá 2» ya no corre aunque siga cargado en Airtable", async () => {
  const { tramosVigentes } = await import("../lib/descuentos");
  const cargados = [
    { categoria: "Anteojos" as const, desdeUnidades: 3, porcentaje: 100 / 3, paga: 2 },
    { categoria: "Anteojos" as const, desdeUnidades: 5, porcentaje: 40, paga: 3 },
    { categoria: "Anteojos" as const, desdeUnidades: 15, porcentaje: 20 },
    { categoria: "Estuches" as const, desdeUnidades: 2, porcentaje: 5 },
  ];
  // Antes de la membresía: manda la escala y el mayorista de anteojos no corre.
  assert.deepEqual(
    tramosVigentes(cargados, false).map((t) => [t.categoria, t.desdeUnidades]),
    [["Estuches", 2], ["Anteojos", 3], ["Anteojos", 5]]
  );
  // Con la membresía: sin escala; el mayorista de 15 vuelve, los estuches siguen.
  assert.deepEqual(
    tramosVigentes(cargados, true).map((t) => [t.categoria, t.desdeUnidades]),
    [["Estuches", 2], ["Anteojos", 15]]
  );

  // Y en el carrito: tres pares se pagan enteros.
  const i = await ids();
  const tres = await resolverCarrito([i.citrino(3)]);
  assert.equal(tres.subtotal, 89900 * 3);
});
