import { test } from "node:test";
import assert from "node:assert/strict";
import {
  idsDeLink,
  leerBusqueda,
  leerPrecioDeVenta,
  leerPublicacionAjena,
  leerReputacion,
  normalizarApodo,
  paginaDeCompetencia,
  posicionesEnBusqueda,
  resumenDeAcceso,
  type PublicacionAjena,
} from "../lib/ml-competencia";

test("los ids salen de cualquier link de Mercado Libre, incluido el de compartir de la app", () => {
  assert.deepEqual(
    idsDeLink(
      "https://articulo.mercadolibre.com.ar/MLA-3849160770?attributes=COLOR_SECONDARY_COLOR:TmVncm8=&matt_tool=89488245#origin=share&sid=share&action=copy"
    ),
    { item: "MLA3849160770", userProduct: null, producto: null }
  );
  assert.deepEqual(
    idsDeLink(
      "https://www.mercadolibre.com.ar/up/MLAU3707449697?matt_tool=89488245&pdp_filters=item_id:MLA1634832199&ua=x#origin=share&sid=share&wid=MLA1634832199&action=copy"
    ),
    { item: "MLA1634832199", userProduct: "MLAU3707449697", producto: null }
  );
  // El : del filtro puede venir codificado.
  assert.equal(idsDeLink("https://www.mercadolibre.com.ar/up/MLAU1?pdp_filters=item_id%3AMLA22").item, "MLA22");
  assert.deepEqual(idsDeLink("https://www.mercadolibre.com.ar/estuche-anteojos/p/MLA12345678"), {
    item: null,
    userProduct: null,
    producto: "MLA12345678",
  });
  assert.equal(idsDeLink("https://articulo.mercadolibre.com.ar/MLA-3024740550-estuche-rectangular-_JM").item, "MLA3024740550");
  assert.equal(idsDeLink("MLA-123").item, "MLA123");
  assert.equal(idsDeLink("cualquier cosa").item, null);
  assert.equal(idsDeLink("https://x.com/%E0%A4%A").item, null);
});

test("el apodo se busca en mayúsculas, sin espacios ni acentos", () => {
  assert.equal(normalizarApodo("Luz Óptica"), "LUZOPTICA");
  assert.equal(normalizarApodo("blaps eyewear"), "BLAPSEYEWEAR");
  assert.equal(normalizarApodo("ARKY"), "ARKY");
});

test("una publicación ajena, del multiget o de la búsqueda", () => {
  // Del multiget: vendedor como seller_id y cuotas según el tipo de publicación.
  assert.deepEqual(
    leerPublicacionAjena({
      id: "MLA1",
      title: "Estuche rígido",
      price: 7_990,
      original_price: 9_990,
      seller_id: 55,
      status: "active",
      sold_quantity: 500,
      listing_type_id: "gold_pro",
      shipping: { free_shipping: false, logistic_type: "fulfillment" },
      permalink: "https://x",
    }),
    {
      id: "MLA1",
      titulo: "Estuche rígido",
      precio: 7_990,
      precioOriginal: 9_990,
      vendedorId: 55,
      vendedor: null,
      envioGratis: false,
      full: true,
      cuotasSinInteres: true,
      vendidas: 500,
      estado: "active",
      permalink: "https://x",
    }
  );
  // De la búsqueda: vendedor con apodo y cuotas con su tasa.
  const deBusqueda = leerPublicacionAjena({
    id: "MLA2",
    title: "Estuche",
    price: 8_000,
    original_price: 8_000,
    seller: { id: 66, nickname: "KYAR" },
    installments: { quantity: 6, rate: 36.5 },
    listing_type_id: "gold_pro",
    shipping: { logistic_type: "cross_docking" },
  });
  assert.equal(deBusqueda?.vendedor, "KYAR");
  assert.equal(deBusqueda?.vendedorId, 66);
  assert.equal(deBusqueda?.cuotasSinInteres, false);
  assert.equal(deBusqueda?.precioOriginal, null);
  assert.equal(deBusqueda?.full, false);
  assert.equal(deBusqueda?.envioGratis, null);
  assert.equal(leerPublicacionAjena({ title: "sin id" }), null);
  assert.equal(leerPublicacionAjena(null), null);
});

test("la búsqueda, el precio con promociones y la reputación", () => {
  const b = leerBusqueda({ paging: { total: 1234 }, results: [{ id: "MLA1", title: "A", price: 1 }, { nada: true }] });
  assert.equal(b.total, 1234);
  assert.equal(b.resultados.length, 1);
  assert.deepEqual(leerBusqueda({ error: "forbidden" }), { total: null, resultados: [] });

  assert.deepEqual(leerPrecioDeVenta({ amount: 7_500, regular_amount: 9_000 }), { precio: 7_500, original: 9_000 });
  assert.deepEqual(leerPrecioDeVenta({ amount: 7_500, regular_amount: null }), { precio: 7_500, original: null });
  assert.equal(leerPrecioDeVenta({}), null);

  assert.deepEqual(
    leerReputacion({ nickname: "KYAR", seller_reputation: { level_id: "5_green", power_seller_status: "platinum", transactions: { completed: 12_000 } } }),
    { apodo: "KYAR", nivel: "5_green", medalla: "platinum", ventas: 12_000 }
  );
});

const pub = (id: string, vendedorId: number, precio = 1_000): PublicacionAjena => ({
  id,
  titulo: `Pub ${id}`,
  precio,
  precioOriginal: null,
  vendedorId,
  vendedor: null,
  envioGratis: null,
  full: null,
  cuotasSinInteres: null,
  vendidas: null,
  estado: null,
  permalink: null,
});

test("las posiciones: los primeros siempre, y más abajo solo Harper y los competidores", () => {
  const resultados = [pub("A", 1), pub("B", 2), pub("C", 3), pub("D", 99), pub("E", 4), pub("F", 7)];
  const pos = posicionesEnBusqueda(resultados, 99, new Map([[7, "Kyar"]]), 2);
  assert.deepEqual(
    pos.map((p) => [p.puesto, p.id, p.quien]),
    [
      [1, "A", null],
      [2, "B", null],
      [4, "D", "Harper"],
      [6, "F", "Kyar"],
    ]
  );
});

test("el resumen de acceso agrupa las pruebas por tipo de dato", () => {
  assert.deepEqual(
    resumenDeAcceso([
      { que: "Búsquedas: estuche", status: 200, ok: true, detalle: "" },
      { que: "Búsquedas: paño", status: 403, ok: false, detalle: "forbidden" },
      { que: "Reputación de vendedor: Kyar", status: 200, ok: true, detalle: "" },
    ]),
    [
      { que: "Búsquedas", ok: 1, total: 2 },
      { que: "Reputación de vendedor", ok: 1, total: 1 },
    ]
  );
});

test("la página escapa lo que viene de Mercado Libre y muestra lo que no se pudo leer", () => {
  const html = paginaDeCompetencia({
    fecha: "1/11/26 10:00",
    pruebas: [
      { que: "Publicaciones de otros vendedores: MLA1", status: 200, ok: true, detalle: "" },
      { que: "Búsquedas: estuche", status: 403, ok: false, detalle: "forbidden <x>" },
    ],
    publicaciones: [{ ...pub("MLA1", 5, 7_990), titulo: "Estuche <b>rígido</b>", nombre: "Kyar", cuotasSinInteres: true }],
    vendedores: [{ nombre: "Soluna", como: null, id: null, reputacion: null, publicaciones: null, ejemplos: [] }],
    busquedas: [{ texto: "estuche", total: null, posiciones: [] }],
  });
  assert.ok(html.includes("Estuche &lt;b&gt;rígido&lt;/b&gt;"));
  assert.ok(!html.includes("<b>rígido"));
  assert.ok(html.includes("$7.990"));
  assert.ok(html.includes("✅ Publicaciones de otros vendedores: 1 de 1"));
  assert.ok(html.includes("❌ Búsquedas: 0 de 1"));
  assert.ok(html.includes("forbidden &lt;x&gt;"));
  assert.ok(html.includes("no encontrado"));
  assert.ok(html.includes("Sin resultados legibles"));
});
