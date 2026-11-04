import { test } from "node:test";
import assert from "node:assert/strict";

process.env.HARPER_FIXTURES = "1";

import { createRecord, TABLAS } from "../lib/airtable";
import { fetchRedisFalso, reiniciarRedis } from "../lib/fixtures/redis";
import { direccionParaMedir, esEventoMedido, rutaSinMedir } from "../lib/medir";
import { claveDeConteo, contarEvento, leerConteos } from "../lib/medir-servidor";
import {
  armarEmbudo,
  diasEntre,
  etiquetaDeOrigen,
  leerPeriodo,
  margenDe,
  pedidoDelPanel,
  rangoDe,
  resumirML,
  resumirSaldos,
  resumirSuscriptores,
  resumirVentas,
  type PedidoPanel,
} from "../lib/panel-datos";
import {
  claveDelPanel,
  crearSesionPanel,
  DURACION_SESION_PANEL_MS,
  esMailDelPanel,
  leerListaDeMails,
  leerSesionPanel,
  mailDeLaSesionPanel,
} from "../lib/panel-sesion";
import { codigoCorrecto, crearDesafio } from "../lib/reconocer-cliente";

const CLAVE = Buffer.from("clave-de-prueba-de-32-bytes-0000");
const AHORA = 1_800_000_000_000;

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------

test("panel: la lista de mails autorizados se lee sin espacios ni mayúsculas y descarta lo que no es un mail", () => {
  assert.deepEqual(leerListaDeMails(" Ale@Harper.ar, otra@x.com;nada  tres@y.com.ar"), ["ale@harper.ar", "otra@x.com", "tres@y.com.ar"]);
  assert.deepEqual(leerListaDeMails(undefined), []);
  assert.deepEqual(leerListaDeMails(""), []);
});

test("panel: solo entran los mails de PANEL_EMAILS (y sin lista, nadie)", async () => {
  const antes = process.env.PANEL_EMAILS;
  try {
    delete process.env.PANEL_EMAILS;
    assert.equal(await esMailDelPanel("ale@harper.ar"), false, "sin lista no entra nadie");
    process.env.PANEL_EMAILS = "ale@harper.ar";
    assert.equal(await esMailDelPanel(" ALE@harper.ar "), true);
    assert.equal(await esMailDelPanel("otro@harper.ar"), false);
  } finally {
    if (antes === undefined) delete process.env.PANEL_EMAILS;
    else process.env.PANEL_EMAILS = antes;
  }
});

test("panel: también entra un mail de la fila panel_emails de Config", async () => {
  const antes = process.env.PANEL_EMAILS;
  try {
    delete process.env.PANEL_EMAILS;
    await createRecord(TABLAS.config, { Clave: "panel_emails", Valor: "socia@harper.ar" });
    assert.equal(await esMailDelPanel("socia@harper.ar"), true);
    assert.equal(await esMailDelPanel("ale@harper.ar"), false);
  } finally {
    if (antes === undefined) delete process.env.PANEL_EMAILS;
    else process.env.PANEL_EMAILS = antes;
  }
});

test("panel: la sesión firmada dura 7 días y no se puede fabricar ni estirar", () => {
  const valor = crearSesionPanel(CLAVE, " Ale@Harper.ar ", AHORA);
  assert.deepEqual(leerSesionPanel(CLAVE, valor, AHORA + 1000), { email: "ale@harper.ar", hasta: AHORA + DURACION_SESION_PANEL_MS });
  assert.equal(leerSesionPanel(CLAVE, valor, AHORA + DURACION_SESION_PANEL_MS), null, "vencida");
  assert.equal(leerSesionPanel(Buffer.from("otra-clave-de-prueba-32-bytes-00"), valor, AHORA), null, "otra clave");

  // Cambiar el mail o el vencimiento rompe la firma.
  const [, firma] = valor.split(".");
  const otroCuerpo = Buffer.from(JSON.stringify({ e: "intruso@x.com", h: AHORA + 10 * DURACION_SESION_PANEL_MS })).toString("base64url");
  assert.equal(leerSesionPanel(CLAVE, `${otroCuerpo}.${firma}`, AHORA), null);
  assert.equal(leerSesionPanel(CLAVE, `${valor}.extra`, AHORA), null);
  assert.equal(leerSesionPanel(CLAVE, 42, AHORA), null);
});

test("panel: sacar el mail de la lista cierra la sesión al instante", async () => {
  const antes = { emails: process.env.PANEL_EMAILS, secreto: process.env.MP_WEBHOOK_SECRET };
  try {
    process.env.MP_WEBHOOK_SECRET = "secreto-de-prueba";
    process.env.PANEL_EMAILS = "ale@harper.ar";
    const valor = crearSesionPanel(claveDelPanel()!, "ale@harper.ar");
    assert.equal(await mailDeLaSesionPanel(valor), "ale@harper.ar");
    process.env.PANEL_EMAILS = "otra@harper.ar";
    assert.equal(await mailDeLaSesionPanel(valor), null);
    assert.equal(await mailDeLaSesionPanel(null), null);
  } finally {
    for (const [k, v] of [["PANEL_EMAILS", antes.emails], ["MP_WEBHOOK_SECRET", antes.secreto]] as const) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

test("panel: el código del panel no sirve para suscribirse ni para reconocer al comprador (ni al revés)", () => {
  const desafio = crearDesafio(CLAVE, "ale@harper.ar", "123456", AHORA, "panel");
  assert.equal(codigoCorrecto(CLAVE, desafio, "ale@harper.ar", "123456", AHORA + 1000, "panel"), true);
  assert.equal(codigoCorrecto(CLAVE, desafio, "ale@harper.ar", "123456", AHORA + 1000, "suscriptor"), false);
  assert.equal(codigoCorrecto(CLAVE, desafio, "ale@harper.ar", "123456", AHORA + 1000), false);
  const deSuscriptor = crearDesafio(CLAVE, "ale@harper.ar", "123456", AHORA, "suscriptor");
  assert.equal(codigoCorrecto(CLAVE, deSuscriptor, "ale@harper.ar", "123456", AHORA + 1000, "panel"), false);
});

// ---------------------------------------------------------------------------
// Medición
// ---------------------------------------------------------------------------

test("medir: a Vercel no viaja el panel, la baja ni la búsqueda salvo los utm_", () => {
  assert.equal(direccionParaMedir("https://harper.ar/panel?dias=7"), null);
  assert.equal(direccionParaMedir("https://harper.ar/suscriptores/baja?t=firmado"), null);
  assert.equal(direccionParaMedir("https://harper.ar/gracias?pedido=HARPER-1"), "https://harper.ar/gracias");
  assert.equal(
    direccionParaMedir("https://harper.ar/?utm_source=ig&utm_medium=paid&email=a@b.com&fbclid=x"),
    "https://harper.ar/?utm_source=ig&utm_medium=paid"
  );
  assert.equal(direccionParaMedir("no es una dirección"), null);
  assert.equal(rutaSinMedir("/panelito"), false, "solo /panel y lo de adentro");
  assert.equal(rutaSinMedir("/panel/algo"), true);
  assert.equal(esEventoMedido("visita"), true);
  assert.equal(esEventoMedido("compra"), false, "la compra la cuenta el panel desde Airtable");
  assert.equal(esEventoMedido("<script>"), false);
});

test("medir: cada evento suma en la clave del día (Buenos Aires) y vence solo la primera vez", async () => {
  reiniciarRedis();
  const redis = { url: "https://redis.prueba", token: "t" };
  const llamadas: string[] = [];
  const falso = fetchRedisFalso({ ahora: () => AHORA });
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    llamadas.push(String(init?.body));
    return falso(url, init);
  }) as typeof fetch;

  // 03:00 UTC del 15 es la medianoche del 15 en Buenos Aires: cuenta para el 15.
  const ahora = Date.UTC(2027, 0, 15, 3, 0);
  assert.equal(await contarEvento("visita", { ahora, redis, fetchImpl }), true);
  assert.equal(await contarEvento("visita", { ahora, redis, fetchImpl }), true);
  assert.equal(await contarEvento("carrito", { ahora, redis, fetchImpl }), true);
  assert.equal(llamadas.filter((c) => c.includes("PEXPIRE")).length, 2, "un vencimiento por clave, no por evento");

  const conteos = await leerConteos(["2027-01-14", "2027-01-15"], { redis, fetchImpl });
  assert.equal(conteos?.visita, 2);
  assert.equal(conteos?.carrito, 1);
  assert.equal(conteos?.porDia["2027-01-15"].visita, 2);
  assert.equal(conteos?.porDia["2027-01-14"].visita, 0);
  assert.equal(claveDeConteo("2027-01-15", "visita"), "harper:medir:2027-01-15:visita");
  assert.equal(llamadas.filter((c) => c.includes("MGET")).length, 1, "todo el período en un solo comando");
});

test("medir: sin Redis no cuenta ni rompe", async () => {
  assert.equal(await contarEvento("visita", { redis: null }), false);
  assert.equal(await leerConteos(["2027-01-15"], { redis: null }), null);
  const roto = (async () => new Response("caído", { status: 500 })) as typeof fetch;
  const redis = { url: "https://redis.prueba", token: "t" };
  assert.equal(await contarEvento("visita", { redis, fetchImpl: roto }), false);
  assert.equal(await leerConteos(["2027-01-15"], { redis, fetchImpl: roto }), null);
});

// ---------------------------------------------------------------------------
// Cuentas
// ---------------------------------------------------------------------------

const HOY = "2027-01-15";
const RANGO = rangoDe(HOY, 7);

function pedido(numero: string, cambios: Partial<PedidoPanel> = {}): PedidoPanel {
  return {
    numero,
    estado: "pagado",
    dia: HOY,
    total: 121_000,
    envio: 0,
    items: [{ varianteId: "recVARIANTE00001", nombre: "CITRINO", color: "Negro", categoria: "Anteojos", cantidad: 1, subtotal: 121_000 }],
    origen: "Directo o sin dato",
    provincia: "Buenos Aires",
    cupon: 0,
    saldoUsado: 0,
    cashback: 0,
    suscriptor: false,
    dineroMP: false,
    envioCostoReal: 12_100,
    envioBonificado: true,
    ...cambios,
  };
}

test("panel: el período elegido es 7, 30 o 90 días (30 si no)", () => {
  assert.equal(leerPeriodo("7"), 7);
  assert.equal(leerPeriodo(["90", "7"]), 90);
  assert.equal(leerPeriodo("365"), 30);
  assert.equal(leerPeriodo(undefined), 30);
  assert.deepEqual(rangoDe(HOY, 7), { desde: "2027-01-09", hasta: HOY, anteriorDesde: "2027-01-02", anteriorHasta: "2027-01-08" });
  assert.equal(diasEntre("2026-12-30", "2027-01-02").length, 4);
});

test("panel: una fila de Pedidos se lee con su día en Buenos Aires, sus beneficios y su origen", () => {
  const p = pedidoDelPanel({
    Numero: "HARPER-1",
    Estado: "pagado",
    // 02:30 UTC del 15 es todavía el 14 en Buenos Aires.
    Fecha: "2027-01-15T02:30:00.000Z",
    Total: 79_900,
    Items: JSON.stringify([{ varianteId: "recA", nombre: "CUARZO", color: "Ámbar", categoria: "Anteojos", cantidad: 2, subtotal: 89_900 }]),
    Notas: "Suscriptor: ana@ejemplo.com (recSUSCANA0000001)\nCupón de bienvenida: −$ 10.000\nCashback a acreditar: $ 7.990",
    Origen: JSON.stringify({ utm_source: "IG", utm_medium: "Paid" }),
    Envio_costo_real: 9_000,
  })!;
  assert.equal(p.dia, "2027-01-14");
  assert.equal(p.items[0].cantidad, 2);
  assert.equal(p.suscriptor, true);
  assert.equal(p.cupon, 10_000);
  assert.equal(p.cashback, 7_990);
  assert.equal(p.origen, "ig / paid");
  assert.equal(p.envioCostoReal, 9_000);
  assert.equal(pedidoDelPanel({ Estado: "pagado" }), null, "sin número no es un pedido");
  assert.deepEqual(pedidoDelPanel({ Numero: "X", Items: "{roto" })?.items, [], "Items ilegible: sin productos, sin romper");
});

test("panel: el origen dice de dónde llegó en palabras", () => {
  assert.equal(etiquetaDeOrigen(null), "Directo o sin dato");
  assert.equal(etiquetaDeOrigen({ fbclid: "abc" }), "Meta (anuncio)");
  assert.equal(etiquetaDeOrigen({ gclid: "abc" }), "Google (anuncio)");
  assert.equal(etiquetaDeOrigen({ referrer: "https://www.instagram.com/harper" }), "instagram.com");
  assert.equal(etiquetaDeOrigen({ referrer: "https://harper.ar/anteojos" }), "Directo o sin dato", "de la propia tienda no cuenta");
});

test("panel: ventas del período solo con pedidos confirmados, comparadas con el período anterior", () => {
  const pedidos = [
    pedido("A"),
    pedido("B", { estado: "enviado", total: 200_000, items: [{ varianteId: "recVARIANTE00001", nombre: "AMATISTA", color: "Gris", categoria: "Anteojos", cantidad: 2, subtotal: 200_000 }], origen: "ig / paid", cupon: 10_000, suscriptor: true }),
    pedido("C", { estado: "pendiente" }),
    pedido("D", { estado: "rechazado" }),
    pedido("E", { dia: "2027-01-05" }), // período anterior
    pedido("F", { dia: "2026-12-01", estado: "preparando" }), // viejo, pero todavía sin despachar
  ];
  const v = resumirVentas(pedidos, RANGO);
  assert.equal(v.pedidos, 2);
  assert.equal(v.facturado, 321_000);
  assert.equal(v.ticket, 160_500);
  assert.equal(v.unidades, 3);
  assert.deepEqual(v.anterior, { pedidos: 1, facturado: 121_000 });
  assert.deepEqual(v.estados, { pagado: 1, enviado: 1, pendiente: 1, rechazado: 1 });
  assert.deepEqual(v.porModelo.map((m) => m.nombre), ["AMATISTA", "CITRINO"]);
  assert.deepEqual(v.porOrigen.map((o) => [o.origen, o.pedidos]), [["ig / paid", 1], ["Directo o sin dato", 1]]);
  assert.equal(v.beneficios.conCupon, 1);
  assert.equal(v.beneficios.deSuscriptores, 1);
  assert.deepEqual(v.paraDespachar.map((p) => p.numero), ["F", "E", "A"], "pagados y preparando de cualquier fecha, el más viejo primero");
  assert.equal(v.porDia.length, 7);
  assert.equal(v.porDia.at(-1)?.facturado, 321_000);
  assert.equal(v.ultimos.length, 4);
});

test("panel: cuánto dejó cada venta, sin IVA, con costo, packaging, envío y cashback (sin Mercado Pago)", () => {
  const costoDe = (id: string) => (id === "recVARIANTE00001" ? { costo: 20_000, packaging: 1_000 } : null);
  const m = margenDe(
    [
      pedido("A", { cashback: 10_000 }),
      // Sin envío cotizado: se estima con la tarifa plana.
      pedido("B", { envioCostoReal: null }),
      // A un producto le falta el costo: queda afuera, y se avisa.
      pedido("C", { items: [{ varianteId: "recSINCOSTO00001", nombre: "X", color: "", categoria: "Anteojos", cantidad: 1, subtotal: 1 }] }),
      pedido("D", { estado: "cancelado" }),
    ],
    { tasa: 21, costoDe, envioPorDefecto: 24_200 }
  )!;
  assert.equal(m.pedidos, 2);
  assert.equal(m.sinCosto, 1);
  assert.equal(m.enviosEstimados, 1);
  assert.equal(Math.round(m.ventasNetas), 200_000); // 2 × 121.000 / 1,21
  assert.equal(m.productos, 40_000);
  assert.equal(m.packaging, 2_000);
  assert.equal(Math.round(m.envios), 30_000); // 12.100 / 1,21 + 24.200 / 1,21
  assert.equal(m.cashback, 10_000);
  assert.equal(Math.round(m.contribucion), 118_000);
  assert.equal(Math.round(m.porPedido!), 59_000);
  assert.equal(Math.round(m.porcentaje!), 59);

  assert.equal(margenDe([pedido("A")], { tasa: null, costoDe, envioPorDefecto: 0 }), null, "sin la tasa no se inventa un margen");
});

test("panel: el embudo usa solo los días con visitas contadas", () => {
  const conteos = {
    porDia: {
      "2027-01-14": { visita: 100, producto: 60, carrito: 10, checkout: 5 },
      "2027-01-15": { visita: 100, producto: 40, carrito: 10, checkout: 5 },
    },
  };
  const pedidos = [pedido("A"), pedido("B", { estado: "pendiente" }), pedido("C", { dia: "2027-01-10" })];
  const e = armarEmbudo(conteos, pedidos, RANGO)!;
  assert.equal(e.desde, "2027-01-14");
  assert.deepEqual(e.pasos.map((p) => p.valor), [200, 100, 20, 10, 2, 1], "el pedido del 10, antes de los contadores, no entra");
  assert.equal(e.pasos.at(-1)?.deLasVisitas, 0.5);
  assert.equal(armarEmbudo(null, pedidos, RANGO), null);
  assert.equal(armarEmbudo({ porDia: {} }, pedidos, RANGO)?.desde, null);
});

test("panel: suscriptores activos, nuevos y bajas del período", () => {
  const s = resumirSuscriptores(
    [
      { Alta: "2027-01-14T15:00:00.000Z", Origen: "Portada", Cupon: "Disponible" },
      { Alta: "2027-01-10T15:00:00.000Z", Origen: "Checkout", Cupon: "Usado" },
      { Alta: "2026-10-01T15:00:00.000Z", Origen: "Portada", Cupon: "Disponible", Baja: "2027-01-12T15:00:00.000Z" },
    ],
    RANGO
  );
  assert.deepEqual(s, {
    activos: 2,
    nuevos: 2,
    bajas: 1,
    porOrigen: [
      { origen: "Portada", nuevos: 1 },
      { origen: "Checkout", nuevos: 1 },
    ],
    cuponesDisponibles: 1,
    cuponesUsados: 1,
  });
});

test("panel: los saldos suman lo que Harper debe en descuentos, por suscriptor y sin negativos", () => {
  const mov = (suscriptorId: string, tipo: "Cashback" | "Uso" | "Ajuste", monto: number, fecha: string, disponibleDesde: string | null, anulado = false) => ({
    id: `${suscriptorId}${monto}`,
    suscriptorId,
    tipo,
    monto,
    pedido: "",
    fecha,
    disponibleDesde,
    anulado,
  });
  const s = resumirSaldos(
    [
      mov("ana", "Cashback", 10_000, "2026-12-01T12:00:00.000Z", "2026-12-31"),
      mov("ana", "Uso", -4_000, "2027-01-14T12:00:00.000Z", null),
      mov("ana", "Cashback", 5_000, "2027-01-14T12:00:00.000Z", "2027-02-13"),
      mov("beto", "Uso", -3_000, "2027-01-14T12:00:00.000Z", null), // sin saldo: no resta a Ana
      mov("beto", "Cashback", 2_000, "2027-01-13T12:00:00.000Z", "2027-02-12", true),
    ],
    RANGO,
    HOY
  );
  assert.deepEqual(s, { disponible: 6_000, enCamino: 5_000, emitido: 5_000, usado: 7_000, anulado: 2_000 });
});

test("panel: Mercado Libre, los totales de 30 días y las publicaciones que más facturan", () => {
  const ml = resumirML([
    { Titulo: "Anteojos Citrino", Visitas_30d: 1000, Unidades_30d: 20, Unidades_7d: 5, Facturado_30d: 1_000_000, Comision_ML_30d: 150_000, Ads_costo: 100_000, Ads_ventas: 700_000, Actualizado: "2027-01-15T09:00:00.000Z" },
    { Titulo: "Estuche", Visitas_30d: 500, Unidades_30d: 5, Facturado_30d: 50_000, Ads_costo: null, Ads_ventas: null, Actualizado: "2027-01-14T09:00:00.000Z" },
    { Titulo: "Sin ventas", Visitas_30d: 10, Unidades_30d: 0, Facturado_30d: 0 },
  ])!;
  assert.equal(ml.visitas, 1510);
  assert.equal(ml.unidades, 25);
  assert.equal(ml.facturado, 1_050_000);
  assert.equal(ml.roas, 7);
  assert.equal(ml.actualizado, "2027-01-15T09:00:00.000Z");
  assert.deepEqual(ml.top.map((t) => [t.titulo, t.roas]), [["Anteojos Citrino", 7], ["Estuche", null]]);
  assert.equal(resumirML([]), null);
});
