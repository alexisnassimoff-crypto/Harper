import { test } from "node:test";
import assert from "node:assert/strict";
import { armarFilas, leerAnunciante, leerAnuncios, leerPublicaciones, sumarOrdenes, ventanas } from "../lib/ml-metricas";

// 30/10/2026 a las 10:30 en Argentina.
const AHORA = Date.parse("2026-10-30T13:30:00Z");

test("las ventanas son los 30 días completos hasta ayer y los 30 anteriores, en hora de Argentina", () => {
  assert.deepEqual(ventanas(AHORA), { desdePrevia: "2026-08-31", desde: "2026-09-30", hasta: "2026-10-29" });
  // A las 01:00 UTC del 30 todavía es 29 en Argentina: ayer es el 28.
  assert.equal(ventanas(Date.parse("2026-10-30T01:00:00Z")).hasta, "2026-10-28");
});

test("las órdenes pagadas se suman por publicación y ventana; sale_fee es por unidad", () => {
  const v = ventanas(AHORA);
  const ventas = sumarOrdenes(
    [
      {
        status: "paid",
        date_created: "2026-10-10T12:00:00.000-03:00",
        order_items: [{ item: { id: "MLA1" }, quantity: 2, unit_price: 10_000, sale_fee: 1_300 }],
      },
      // Previa.
      { status: "paid", date_created: "2026-09-05T12:00:00.000-03:00", order_items: [{ item: { id: "MLA1" }, quantity: 1, unit_price: 9_000, sale_fee: 1_100 }] },
      // El 29/09 a las 23:30 en Argentina es todavía la previa, aunque en UTC sea 30.
      { status: "paid", date_created: "2026-09-30T02:30:00.000Z", order_items: [{ item: { id: "MLA1" }, quantity: 1, unit_price: 9_000, sale_fee: 0 }] },
      // Hoy queda afuera: el día está a medias.
      { status: "paid", date_created: "2026-10-30T09:00:00.000-03:00", order_items: [{ item: { id: "MLA1" }, quantity: 5, unit_price: 1, sale_fee: 0 }] },
      { status: "cancelled", date_created: "2026-10-10T12:00:00.000-03:00", order_items: [{ item: { id: "MLA1" }, quantity: 7, unit_price: 1 }] },
      { status: "paid", date_created: "fecha rota", order_items: [{ item: { id: "MLA1" }, quantity: 9, unit_price: 1 }] },
    ],
    v
  );

  assert.deepEqual(ventas.get("MLA1"), {
    actual: { unidades: 2, facturado: 20_000, comision: 2_600 },
    previa: { unidades: 2, facturado: 18_000, comision: 1_100 },
  });
});

test("las publicaciones salen del multiget y se saltean las que no contestaron 200", () => {
  const pubs = leerPublicaciones([
    { code: 200, body: { id: "MLA1", title: "Estuche", status: "active", price: 15_990, available_quantity: 3, listing_type_id: "gold_special", permalink: "https://x" } },
    { code: 404, body: { message: "not found" } },
  ]);
  assert.equal(pubs.length, 1);
  assert.equal(pubs[0].precio, 15_990);
});

test("Product Ads: se toma el anunciante de Argentina y las métricas de cada grupo", () => {
  assert.deepEqual(
    leerAnunciante({ advertisers: [{ advertiser_id: 1, site_id: "MLB" }, { advertiser_id: 2, site_id: "MLA" }] }),
    { id: 2, site: "MLA" }
  );
  assert.equal(leerAnunciante({ advertisers: [] }), null);

  const { anuncios, total } = leerAnuncios({
    paging: { total: 1 },
    results: [{ ad_group_external_id: "MLA1", title: "Estuche", metrics: { prints: 1000, clicks: 20, cost: 3_000, total_amount: 30_000, units_quantity: 2, acos: 10 } }],
  });
  assert.equal(total, 1);
  assert.deepEqual(anuncios[0], { id: "MLA1", titulo: "Estuche", impresiones: 1000, clics: 20, costo: 3_000, ventas: 30_000, unidades: 2, acos: 10 });
});

test("las filas: visita que no se pudo leer queda vacía, conversión sobre visitas, y grupos de anuncios sin publicación propia", () => {
  const v = ventanas(AHORA);
  const filas = armarFilas({
    publicaciones: [
      { id: "MLA1", titulo: "Estuche", estado: "active", precio: 15_990, stock: 3, tipo: "gold_special", permalink: "https://x" },
      { id: "MLA2", titulo: "Paño", estado: "paused", precio: 3_000, stock: 0, tipo: "gold_special", permalink: "" },
    ],
    visitas: new Map([["MLA1", { actual: 400, previa: 300 }]]),
    ventas: new Map([["MLA1", { actual: { unidades: 8, facturado: 127_920, comision: 16_000 }, previa: { unidades: 5, facturado: 0, comision: 0 } }]]),
    anuncios: [
      { id: "MLA1", titulo: "Estuche", impresiones: 1000, clics: 20, costo: 3_000, ventas: 30_000, unidades: 2, acos: 10 },
      { id: "FAM99", titulo: "Familia", impresiones: 5, clics: 0, costo: 10, ventas: 0, unidades: 0, acos: null },
    ],
    v,
    ahora: AHORA,
    avisos: [],
  });

  assert.equal(filas.length, 3);
  assert.equal(filas[0].Conversion_30d, 0.02);
  assert.equal(filas[0].Ads_costo, 3_000);
  assert.equal(filas[1].Visitas_30d, null);
  assert.equal(filas[1].Conversion_30d, null);
  assert.equal(filas[1].Ads_clics, 0);
  assert.equal(filas[2].Estado, "solo anuncio");
  assert.equal(filas[0].Ventana, "2026-09-30 a 2026-10-29");
});

test("sin Product Ads, las columnas de anuncios quedan vacías (no en cero) y el aviso va en cada fila", () => {
  const filas = armarFilas({
    publicaciones: [{ id: "MLA1", titulo: "Estuche", estado: "active", precio: 1, stock: 1, tipo: "", permalink: "" }],
    visitas: new Map(),
    ventas: new Map(),
    anuncios: null,
    v: ventanas(AHORA),
    ahora: AHORA,
    avisos: ["Product Ads sin datos"],
  });
  assert.equal(filas[0].Ads_costo, null);
  assert.equal(filas[0].ACOS, null);
  assert.equal(filas[0].Avisos, "Product Ads sin datos");
});
