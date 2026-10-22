import { test } from "node:test";
import assert from "node:assert/strict";
import { armarEventoCompra, enviarEventosAMeta, hash, metaCapiConfigurada, telefonoParaMeta } from "../lib/meta";
import { datosDeCompra, idEventoCompra } from "../lib/pixel";
import type { ItemResuelto } from "../lib/tipos";

const items: ItemResuelto[] = [
  { productoId: "p1", productoSlug: "citrino", nombre: "CITRINO", categoria: "Anteojos", varianteId: "v1", sku: "CITRINO-CAREY", color: "Carey", foto: null, precioLista: 89900, precioUnitario: 85405, descuento: 5, cantidad: 1, subtotal: 85405, stockDisponible: 3 },
  { productoId: "p2", productoSlug: "amatista", nombre: "AMATISTA", categoria: "Anteojos", varianteId: "v2", sku: "AMATISTA-NEGRO", color: "Negro", foto: null, precioLista: 89900, precioUnitario: 85405, descuento: 5, cantidad: 1, subtotal: 85405, stockDisponible: 12 },
];

const cliente = {
  email: " Ale@Harper.AR ",
  nombre: "Alexis Nassimoff",
  telefono: "11 4917-2061",
  dni: "",
  direccion: "Núñez 2422",
  ciudad: "Ciudad Autónoma de Buenos Aires",
  provincia: "Ciudad Autónoma de Buenos Aires",
  cp: "1429",
  aceptaPromos: false,
};

test("los datos de compra del píxel: SKU como id, valor sin envío, num_items", () => {
  const d = datosDeCompra({ items, valor: 170810 });
  assert.deepEqual(d.content_ids, ["CITRINO-CAREY", "AMATISTA-NEGRO"]);
  assert.equal(d.value, 170810);
  assert.equal(d.currency, "ARS");
  assert.equal(d.num_items, 2);
  assert.deepEqual(d.contents[0], { id: "CITRINO-CAREY", quantity: 1, item_price: 85405 });
});

test("el event_id es determinístico a partir del número de pedido", () => {
  assert.equal(idEventoCompra("HARPER-12345AB"), "compra-HARPER-12345AB");
});

test("el evento Purchase del servidor va hasheado y con el mismo event_id", () => {
  const e = armarEventoCompra({
    numero: "HARPER-12345AB",
    items,
    subtotal: 170810,
    cliente,
    clienteId: "recCLI",
    origen: { utm_campaign: "lanzamiento", fbp: "fb.1.1.1", fbc: "fb.1.2.XYZ" },
    sitio: "https://harper.ar",
    ahora: 1761000000000,
  });

  assert.equal(e.event_name, "Purchase");
  assert.equal(e.event_id, "compra-HARPER-12345AB");
  assert.equal(e.event_time, 1761000000);
  assert.equal(e.action_source, "website");
  assert.equal(e.event_source_url, "https://harper.ar/gracias?pedido=HARPER-12345AB");

  // Hasheado con el valor normalizado (minúsculas, sin espacios ni tildes).
  assert.deepEqual(e.user_data.em, [hash("ale@harper.ar")]);
  assert.deepEqual(e.user_data.ph, [hash("541149172061")]);
  assert.deepEqual(e.user_data.fn, [hash("alexis")]);
  assert.deepEqual(e.user_data.ln, [hash("nassimoff")]);
  assert.deepEqual(e.user_data.ct, [hash("ciudadautonomadebuenosaires")]);
  assert.deepEqual(e.user_data.zp, [hash("1429")]);
  assert.deepEqual(e.user_data.country, [hash("ar")]);
  assert.deepEqual(e.user_data.external_id, [hash("recCLI")]);
  // Las cookies del píxel van tal cual.
  assert.equal(e.user_data.fbp, "fb.1.1.1");
  assert.equal(e.user_data.fbc, "fb.1.2.XYZ");

  // Nada en claro de la persona.
  const texto = JSON.stringify(e);
  for (const prohibido of ["ale@harper.ar", "Nassimoff", "4917", "Núñez"]) {
    assert.ok(!texto.includes(prohibido), `no debería incluir "${prohibido}"`);
  }

  assert.equal(e.custom_data.value, 170810);
  assert.equal(e.custom_data.order_id, "HARPER-12345AB");
  assert.equal(e.custom_data.campaign, "lanzamiento");
});

test("teléfonos argentinos reciben el 54", () => {
  assert.equal(telefonoParaMeta("11 4917-2061"), "541149172061");
  assert.equal(telefonoParaMeta("+54 9 11 4917 2061"), "5491149172061");
  assert.equal(telefonoParaMeta(""), undefined);
});

test("sin token no se manda nada; con token, el envío va al píxel con test_event_code si está", async () => {
  delete process.env.META_CAPI_TOKEN;
  process.env.NEXT_PUBLIC_META_PIXEL_ID = "123";
  assert.equal(metaCapiConfigurada(), false);
  const sin = await enviarEventosAMeta([]);
  assert.equal(sin.ok, false);

  process.env.META_CAPI_TOKEN = "TOKEN-PRUEBA";
  process.env.META_TEST_EVENT_CODE = "TEST42";
  assert.equal(metaCapiConfigurada(), true);

  const llamadas: { url: string; cuerpo: Record<string, unknown> }[] = [];
  const fetchFalso = (async (url: string | URL | Request, init?: RequestInit) => {
    llamadas.push({ url: String(url), cuerpo: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify({ events_received: 1 }), { status: 200 });
  }) as typeof fetch;

  const evento = armarEventoCompra({ numero: "HARPER-1", items, subtotal: 170810, cliente, origen: null, sitio: "https://harper.ar", ahora: 1761000000000 });
  const r = await enviarEventosAMeta([evento], fetchFalso);

  assert.equal(r.ok, true);
  assert.equal(llamadas.length, 1);
  assert.match(llamadas[0].url, /^https:\/\/graph\.facebook\.com\/v\d+\.\d+\/123\/events\?access_token=TOKEN-PRUEBA$/);
  assert.equal(llamadas[0].cuerpo.test_event_code, "TEST42");
  assert.equal((llamadas[0].cuerpo.data as unknown[]).length, 1);

  // Un fallo de red no tira: devuelve ok=false.
  const fetchRoto = (async () => { throw new Error("sin red"); }) as unknown as typeof fetch;
  const caido = await enviarEventosAMeta([evento], fetchRoto);
  assert.equal(caido.ok, false);
  assert.equal(caido.cuerpo, "sin red");

  delete process.env.META_CAPI_TOKEN;
  delete process.env.META_TEST_EVENT_CODE;
  delete process.env.NEXT_PUBLIC_META_PIXEL_ID;
});
