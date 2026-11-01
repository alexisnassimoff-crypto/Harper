import { test } from "node:test";
import assert from "node:assert/strict";
import {
  armarFilas,
  armarFilasAnuncios,
  leerAnunciante,
  leerAnuncios,
  anunciosDeGruposItem,
  leerAnunciosDelGrupo,
  leerCampanas,
  leerPublicaciones,
  leerVisitas,
  sumarOrdenes,
  ventanas,
  type Anuncio,
  type AnuncioDePublicacion,
} from "../lib/ml-metricas";

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

test("las visitas vienen en una lista aunque se pida una sola publicación", () => {
  assert.equal(leerVisitas([{ item_id: "MLA1", total_visits: 1222 }]), 1222);
  assert.equal(leerVisitas({ item_id: "MLA1", total_visits: 5 }), 5);
  assert.equal(leerVisitas([]), null);
  assert.equal(leerVisitas(null), null);
});

test("Product Ads: se toma el anunciante de Argentina, y cada grupo con su id, tipo y campaña", () => {
  assert.deepEqual(
    leerAnunciante({ advertisers: [{ advertiser_id: 1, site_id: "MLB" }, { advertiser_id: 2, site_id: "MLA" }] }),
    { id: 2, site: "MLA" }
  );
  assert.equal(leerAnunciante({ advertisers: [] }), null);

  const { anuncios, total } = leerAnuncios({
    paging: { total: 1 },
    results: [
      {
        id: 1553910303,
        ad_group_external_id: "1553910303916497",
        ad_group_type: "FAMILY",
        campaign_id: 353605357,
        title: "Estuche Ovalado",
        metrics: { prints: 1000, clicks: 20, cost: 3_000, total_amount: 30_000, units_quantity: 2, acos: 10 },
      },
    ],
  });
  assert.equal(total, 1);
  assert.deepEqual(anuncios[0], {
    grupoId: "1553910303",
    externo: "1553910303916497",
    tipo: "FAMILY",
    campanaId: "353605357",
    titulo: "Estuche Ovalado",
    impresiones: 1000,
    clics: 20,
    costo: 3_000,
    ventas: 30_000,
    unidades: 2,
    acos: 10,
  });
});

test("el detalle de un grupo trae las métricas de cada publicación, y las campañas su nombre", () => {
  const { anuncios, total } = leerAnunciosDelGrupo(
    {
      paging: { total: 2 },
      results: [
        { item_id: "MLA1", family_id: 900, metrics: { prints: 500, clicks: 10, cost: 2_000, total_amount: 89_000, units_quantity: 1, acos: 2.2 } },
        { item_id: "MLA2", family_id: 900, metrics: { prints: 50, clicks: 0, cost: 0 } },
      ],
    },
    "77"
  );
  assert.equal(total, 2);
  assert.deepEqual(anuncios[0], { item: "MLA1", grupoId: "77", impresiones: 500, clics: 10, costo: 2_000, ventas: 89_000, unidades: 1, acos: 2.2 });
  assert.equal(anuncios[1].ventas, 0);
  assert.deepEqual([...leerCampanas({ results: [{ id: 7, name: "Anteojos New", roas_target: 8 }] })], [
    ["7", { nombre: "Anteojos New", roasObjetivo: 8 }],
  ]);
});

const anuncio = (a: Partial<Anuncio> & Pick<Anuncio, "grupoId">): Anuncio => ({
  externo: "",
  tipo: "FAMILY",
  campanaId: "",
  titulo: "",
  impresiones: 0,
  clics: 0,
  costo: 0,
  ventas: 0,
  unidades: 0,
  acos: null,
  ...a,
});

const pub = (id: string, titulo: string) => ({ id, titulo, estado: "active", precio: 1, stock: 1, tipo: "", permalink: "" });

const deGrupo = (item: string, grupoId: string, costo: number): AnuncioDePublicacion => ({
  item,
  grupoId,
  impresiones: 100,
  clics: 5,
  costo,
  ventas: 0,
  unidades: 0,
  acos: null,
});

test("las filas: visita que no se pudo leer queda vacía y la conversión es sobre visitas", () => {
  const v = ventanas(AHORA);
  const filas = armarFilas({
    publicaciones: [pub("MLA1", "Estuche"), pub("MLA2", "Paño")],
    visitas: new Map([["MLA1", { actual: 400, previa: 300 }]]),
    ventas: new Map([["MLA1", { actual: { unidades: 8, facturado: 127_920, comision: 16_000 }, previa: { unidades: 5, facturado: 0, comision: 0 } }]]),
    anuncios: [],
    porPublicacion: new Map(),
    v,
    ahora: AHORA,
    avisos: [],
  });

  assert.equal(filas.length, 2);
  assert.equal(filas[0].Conversion_30d, 0.02);
  assert.equal(filas[1].Visitas_30d, null);
  assert.equal(filas[1].Conversion_30d, null);
  assert.equal(filas[1].Ads_clics, 0);
  assert.equal(filas[0].Ventana, "2026-09-30 a 2026-10-29");
});

test("los anuncios: cada publicación tiene las suyas aunque su grupo junte varios colores", () => {
  const v = ventanas(AHORA);
  const anuncios = [
    anuncio({ grupoId: "10", externo: "MLA1", tipo: "ITEM", titulo: "Rectangular", impresiones: 1000, clics: 20, costo: 3_000, ventas: 30_000, unidades: 2, acos: 10 }),
    anuncio({ grupoId: "20", externo: "FAM", titulo: "Citrino", campanaId: "c1", costo: 72_000, impresiones: 9 }),
    anuncio({ grupoId: "30", externo: "FAM2", titulo: "Jordan" }),
  ];
  // El ITEM se completa con sus propias métricas si falta su detalle.
  const porPublicacion = new Map(
    [deGrupo("MLA2", "20", 50_000), deGrupo("MLA3", "20", 22_000), ...anunciosDeGruposItem(anuncios)].map((a) => [a.item, a])
  );
  const filas = armarFilas({
    publicaciones: [pub("MLA1", "Rectangular"), pub("MLA2", "Citrino negro"), pub("MLA3", "Citrino carey"), pub("MLA4", "Sin anuncio")],
    visitas: new Map(),
    ventas: new Map(),
    anuncios,
    porPublicacion,
    v,
    ahora: AHORA,
    avisos: [],
  });

  assert.equal(filas[0].Ads_costo, 3_000);
  assert.equal(filas[0].Grupo_anuncios, "Rectangular");
  assert.equal(filas[1].Ads_costo, 50_000);
  assert.equal(filas[2].Ads_costo, 22_000);
  assert.equal(filas[2].Grupo_anuncios, "Citrino");
  assert.equal(filas[3].Ads_costo, 0);
  assert.equal(filas.length, 4);

  const grupos = armarFilasAnuncios({ anuncios, porPublicacion, publicaciones: [pub("MLA2", "Citrino negro"), pub("MLA3", "Citrino carey")], campanas: new Map([["c1", { nombre: "Anteojos New", roasObjetivo: 8 }]]), v, ahora: AHORA });
  // El grupo sin impresiones ni costo (Jordan) no se escribe.
  assert.deepEqual(grupos.map((g) => g.Grupo), ["Rectangular", "Citrino"]);
  assert.equal(grupos[1].Publicaciones, "MLA2 — Citrino negro\nMLA3 — Citrino carey");
  assert.equal(grupos[0].Publicaciones, "MLA1 — (no está en la cuenta)");
  assert.equal(grupos[1].Campana, "Anteojos New");
  assert.equal(grupos[1].ROAS_objetivo, 8);
  assert.equal(grupos[0].ROAS_objetivo, null);
});

test("sin Product Ads, las columnas de anuncios quedan vacías (no en cero) y el aviso va en cada fila", () => {
  const filas = armarFilas({
    publicaciones: [pub("MLA1", "Estuche")],
    visitas: new Map(),
    ventas: new Map(),
    anuncios: null,
    porPublicacion: new Map(),
    v: ventanas(AHORA),
    ahora: AHORA,
    avisos: ["Product Ads sin datos"],
  });
  assert.equal(filas[0].Ads_costo, null);
  assert.equal(filas[0].ACOS, null);
  assert.equal(filas[0].Avisos, "Product Ads sin datos");
});
