import { test } from "node:test";
import assert from "node:assert/strict";

process.env.HARPER_FIXTURES = "1";

import { createRecord, TABLAS } from "../lib/airtable";
import { calcularContribucion, CASHBACK_PRINCIPAL, PARAMETROS_REFERENCIA, PRECIO_REFERENCIA, type PedidoModelo } from "../lib/contribucion";
import { fetchRedisFalso, reiniciarRedis } from "../lib/fixtures/redis";
import { canalDeCampana, canalDeLaVisita, canalDelOrigen, canalDeReferencia } from "../lib/canales";
import { direccionParaMedir, esEventoMedido, leerCuerpoDeMedicion, rutaSinMedir } from "../lib/medir";
import { claveDelDia, contarEvento, conteoVacio, leerConteos } from "../lib/medir-servidor";
import { precio } from "../lib/formato";
import {
  ACLARACION_CONTRIBUCION,
  agruparPorTramo,
  armarEmbudo,
  cifraDeContribucion,
  atajosDeMes,
  diasDe,
  diasEntre,
  etiquetaDeOrigen,
  filasPorCanal,
  leerPeriodo,
  leerRango,
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
  assert.equal(esEventoMedido("compra"), true);
  assert.equal(esEventoMedido("<script>"), false);
});

test("medir: el cuerpo es «evento:canal» y solo pasa lo conocido", () => {
  assert.deepEqual(leerCuerpoDeMedicion("carrito:meta"), { evento: "carrito", canal: "meta" });
  assert.deepEqual(leerCuerpoDeMedicion(" visita "), { evento: "visita", canal: "sin_dato" }, "sin canal, sin dato");
  assert.equal(leerCuerpoDeMedicion("carrito:inventado"), null);
  assert.equal(leerCuerpoDeMedicion("pago:meta"), null);
  assert.equal(leerCuerpoDeMedicion("carrito:meta:extra"), null);
  assert.equal(leerCuerpoDeMedicion(""), null);
});

test("canales: de la campaña, del anuncio o del sitio que la mandó", () => {
  const visita = (search: string, referencia = "", ruta = "/") => canalDeLaVisita({ search, referencia, hostPropio: "harper.ar", ruta });
  assert.deepEqual(visita("?utm_source=TikTok&utm_medium=paid"), { canal: "tiktok", cuentaComoVisita: true });
  assert.equal(visita("?utm_source=ig").canal, "meta");
  assert.equal(visita("?utm_source=facebook").canal, "meta");
  assert.equal(visita("?utm_source=mercadolibre").canal, "mercadolibre");
  assert.equal(visita("?utm_source=ml").canal, "mercadolibre");
  assert.equal(visita("?utm_source=newsletter").canal, "mail");
  assert.equal(visita("?utm_source=harper&utm_medium=email").canal, "mail");
  assert.equal(visita("?utm_source=wa").canal, "whatsapp");
  assert.equal(visita("?utm_source=un-blog").canal, "otros");
  assert.equal(visita("?fbclid=abc").canal, "meta", "anuncio de Meta sin utm");
  assert.equal(visita("?gclid=abc").canal, "google");
  assert.equal(visita("?ttclid=abc").canal, "tiktok");
  assert.equal(visita("", "https://l.instagram.com/").canal, "meta");
  assert.equal(visita("", "https://www.google.com.ar/").canal, "google");
  assert.equal(visita("", "https://mail.google.com/").canal, "mail", "Gmail no es una búsqueda de Google");
  assert.equal(visita("", "android-app://com.google.android.gm/").canal, "mail");
  assert.equal(visita("", "https://www.tiktok.com/").canal, "tiktok");
  assert.equal(visita("", "https://articulo.mercadolibre.com.ar/MLA-1").canal, "mercadolibre");
  assert.equal(visita("", "https://un-blog.com/nota").canal, "otros");
  assert.deepEqual(visita("", ""), { canal: "directo", cuentaComoVisita: true }, "sin nada: escribió harper.ar o un favorito");
  // No es una visita nueva: una pestaña abierta desde la misma tienda, o la vuelta de pagar.
  assert.deepEqual(visita("", "https://harper.ar/anteojos"), { canal: "sin_dato", cuentaComoVisita: false });
  assert.deepEqual(visita("", "https://www.mercadopago.com.ar/checkout", "/gracias"), { canal: "sin_dato", cuentaComoVisita: false });
  assert.deepEqual(visita("", "", "/gracias"), { canal: "sin_dato", cuentaComoVisita: false });
  assert.equal(canalDeReferencia("https://www.mercadopago.com.ar/"), "sin_dato", "Mercado Pago no es Mercado Libre");
  assert.equal(canalDeCampana(null), null);
  assert.equal(canalDelOrigen(null), "sin_dato");
  assert.equal(canalDelOrigen({ utm_source: "ig", utm_medium: "paid" }), "meta");
  assert.equal(canalDelOrigen({ fbclid: "x" }), "meta");
});

test("medir: un número por paso y canal en el hash del día (Buenos Aires), que vence solo la primera vez", async () => {
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
  assert.equal(await contarEvento("visita", "meta", { ahora, redis, fetchImpl }), true);
  assert.equal(await contarEvento("visita", "meta", { ahora, redis, fetchImpl }), true);
  assert.equal(await contarEvento("visita", "google", { ahora, redis, fetchImpl }), true);
  assert.equal(await contarEvento("compra", "meta", { ahora, redis, fetchImpl }), true);
  assert.equal(
    llamadas.filter((c) => c.includes("PEXPIRE")).length,
    3,
    "el vencimiento, solo al crear cada número del día (no en cada evento)"
  );

  const conteos = await leerConteos(["2027-01-14", "2027-01-15"], { redis, fetchImpl });
  assert.equal(conteos?.porDia["2027-01-15"].visita, 3);
  assert.equal(conteos?.porDia["2027-01-15"].compra, 1);
  assert.deepEqual(conteos?.porDia["2027-01-14"], conteoVacio());
  assert.equal(conteos?.porCanal.meta.visita, 2);
  assert.equal(conteos?.porCanal.meta.compra, 1);
  assert.equal(conteos?.porCanal.google.visita, 1);
  assert.equal(claveDelDia("2027-01-15"), "harper:medir:2027-01-15");
  assert.equal(llamadas.filter((c) => c.includes("HGETALL")).length, 1, "todo el período en un solo viaje");

  const filas = filasPorCanal(conteos);
  assert.deepEqual(
    filas.map((f) => [f.canal, f.visitas, f.compras, f.conversion]),
    [
      ["meta", 2, 1, 50],
      ["google", 1, 0, 0],
    ],
    "sin los canales en cero, primero los que más compran"
  );
});

test("medir: sin Redis no cuenta ni rompe", async () => {
  assert.equal(await contarEvento("visita", "directo", { redis: null }), false);
  assert.equal(await leerConteos(["2027-01-15"], { redis: null }), null);
  const roto = (async () => new Response("caído", { status: 500 })) as typeof fetch;
  const redis = { url: "https://redis.prueba", token: "t" };
  assert.equal(await contarEvento("visita", "directo", { redis, fetchImpl: roto }), false);
  assert.equal(await leerConteos(["2027-01-15"], { redis, fetchImpl: roto }), null);
  assert.deepEqual(filasPorCanal(null), []);
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
    canal: "sin_dato",
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

test("panel: los atajos son 7, 30 o 90 días hasta hoy (30 si no)", () => {
  assert.equal(leerPeriodo("7"), 7);
  assert.equal(leerPeriodo(["90", "7"]), 90);
  assert.equal(leerPeriodo("365"), 30);
  assert.equal(leerPeriodo(undefined), 30);
  assert.deepEqual(rangoDe(HOY, 7), {
    desde: "2027-01-09",
    hasta: HOY,
    dias: 7,
    anteriorDesde: "2027-01-02",
    anteriorHasta: "2027-01-08",
    periodo: 7,
  });
  assert.equal(diasEntre("2026-12-30", "2027-01-02").length, 4);
  assert.equal(diasDe("2026-12-30", "2027-01-02"), 4);
  assert.equal(diasDe("2027-01-15", "2027-01-15"), 1);
});

test("panel: fechas a elección, ordenadas, sin pasar de hoy y de hasta un año, con el período anterior del mismo largo", () => {
  // Octubre entero: 31 días, contra los 31 anteriores.
  assert.deepEqual(leerRango({ desde: "2026-10-01", hasta: "2026-10-31" }, HOY), {
    desde: "2026-10-01",
    hasta: "2026-10-31",
    dias: 31,
    anteriorDesde: "2026-08-31",
    anteriorHasta: "2026-09-30",
    periodo: null,
  });
  // Al revés se ordenan; un solo día también vale.
  assert.equal(leerRango({ desde: "2026-10-31", hasta: "2026-10-01" }, HOY).desde, "2026-10-01");
  assert.equal(leerRango({ desde: "2027-01-10", hasta: "2027-01-10" }, HOY).dias, 1);
  // El futuro se corta en hoy; sin «hasta», hasta hoy; sin «desde», ese día solo.
  assert.equal(leerRango({ desde: "2027-01-10", hasta: "2027-03-01" }, HOY).hasta, HOY);
  assert.deepEqual([leerRango({ desde: "2027-01-10" }, HOY).desde, leerRango({ desde: "2027-01-10" }, HOY).hasta], ["2027-01-10", HOY]);
  assert.equal(leerRango({ desde: "2027-02-01" }, HOY).desde, HOY, "un desde futuro queda en hoy");
  // Más de un año: se queda con los últimos 366 días hasta «hasta» (2026 tiene 365: entra el 31/12 anterior).
  const largo = leerRango({ desde: "2020-01-01", hasta: "2026-12-31" }, HOY);
  assert.deepEqual([largo.desde, largo.hasta, largo.dias], ["2025-12-31", "2026-12-31", 366]);
  assert.equal(leerRango({ desde: "2026-01-01", hasta: "2026-12-31" }, HOY).dias, 365, "un año calendario entra entero");
  // Fechas que no existen o cualquier otra cosa: los últimos 30 días.
  assert.equal(leerRango({ desde: "2026-02-30", hasta: "2026-03-05" }, HOY).desde, "2026-03-05", "el 30 de febrero no existe: vale solo «hasta»");
  assert.equal(leerRango({ desde: "hoy", hasta: "<script>" }, HOY).dias, 30);
  assert.equal(leerRango({ dias: "7" }, HOY).periodo, 7);
  assert.equal(leerRango({}, HOY).periodo, 30);
  // Atajos de mes.
  assert.deepEqual(atajosDeMes("2027-01-15"), [
    { nombre: "Este mes", desde: "2027-01-01", hasta: "2027-01-15" },
    { nombre: "Mes pasado", desde: "2026-12-01", hasta: "2026-12-31" },
  ]);
  assert.deepEqual(atajosDeMes("2026-03-31")[1], { nombre: "Mes pasado", desde: "2026-02-01", hasta: "2026-02-28" });
});

test("panel: las barras van por día hasta 2 meses, por semana hasta 6 y por mes después, sin perder pesos", () => {
  const dias = (desde: string, n: number) =>
    diasEntre(desde, "2099-01-01")
      .slice(0, n)
      .map((dia, i) => ({ dia, pedidos: 1, facturado: 1_000 * (i + 1) }));
  const suma = (t: { facturado: number }[]) => t.reduce((a, x) => a + x.facturado, 0);

  const corto = agruparPorTramo(dias("2027-01-01", 31));
  assert.equal(corto.unidad, "día");
  assert.equal(corto.tramos.length, 31);
  assert.equal(corto.tramos[0].etiqueta, "01/01/2027");

  const medio = agruparPorTramo(dias("2027-01-01", 90));
  assert.equal(medio.unidad, "semana");
  assert.equal(medio.tramos.length, 13, "12 semanas enteras y una de 6 días");
  assert.equal(medio.tramos[0].etiqueta, "Del 01/01 al 07/01");
  assert.equal(medio.tramos.at(-1)?.hasta, "2027-03-31");
  assert.equal(suma(medio.tramos), suma(dias("2027-01-01", 90)));

  const largo = agruparPorTramo(dias("2026-01-15", 366));
  assert.equal(largo.unidad, "mes");
  assert.equal(largo.tramos.length, 13, "de mediados de enero a mediados del enero siguiente");
  assert.equal(largo.tramos[0].etiqueta, "ene 2026");
  assert.equal(largo.tramos[1].desde, "2026-02-01");
  assert.equal(suma(largo.tramos), suma(dias("2026-01-15", 366)));
  assert.deepEqual(agruparPorTramo([]), { unidad: "día", tramos: [] });
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
  assert.equal(p.canal, "meta");
  assert.equal(p.envioCostoReal, 9_000);
  assert.equal(pedidoDelPanel({ Estado: "pagado" }), null, "sin número no es un pedido");
  assert.deepEqual(pedidoDelPanel({ Numero: "X", Items: "{roto" })?.items, [], "Items ilegible: sin productos, sin romper");
});

test("panel: el origen dice de dónde llegó en palabras", () => {
  assert.equal(etiquetaDeOrigen(null), "Directo o sin dato");
  assert.equal(etiquetaDeOrigen({ fbclid: "abc" }), "Meta (anuncio)");
  assert.equal(etiquetaDeOrigen({ gclid: "abc" }), "Google (anuncio)");
  assert.equal(etiquetaDeOrigen({ utm_source: "ig", utm_medium: "paid", utm_campaign: "Verano" }), "ig / paid · verano");
  assert.equal(etiquetaDeOrigen({ referrer: "https://www.instagram.com/harper" }), "instagram.com");
  assert.equal(etiquetaDeOrigen({ referrer: "https://harper.ar/anteojos" }), "Directo o sin dato", "de la propia tienda no cuenta");
});

test("panel: ventas del período solo con pedidos confirmados, comparadas con el período anterior", () => {
  const pedidos = [
    pedido("A"),
    pedido("B", { estado: "enviado", total: 200_000, items: [{ varianteId: "recVARIANTE00001", nombre: "AMATISTA", color: "Gris", categoria: "Anteojos", cantidad: 2, subtotal: 200_000 }], canal: "meta", origen: "ig / paid", cupon: 10_000, suscriptor: true }),
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
  assert.deepEqual(v.porCanal.map((c) => [c.canal, c.pedidos, c.facturado]), [["meta", 1, 200_000], ["sin_dato", 1, 121_000]]);
  assert.equal(v.beneficios.conCupon, 1);
  assert.equal(v.beneficios.deSuscriptores, 1);
  assert.deepEqual(v.paraDespachar.map((p) => p.numero), ["F", "E", "A"], "pagados y preparando de cualquier fecha, el más viejo primero");
  assert.equal(v.porDia.length, 7);
  assert.equal(v.porDia.at(-1)?.facturado, 321_000);
  assert.equal(v.ultimos.length, 4);
});

// Tarea 15: «Cuánto dejó» con el motor de contribución (lib/contribucion.ts).
const cerca = (real: number, esperado: number, que: string) => assert.ok(Math.abs(real - esperado) < 0.01, `${que}: ${real} ≠ ${esperado}`);

test("panel: cuánto dejó, con el motor de contribución: del pedido, estimado con tasas de referencia y pendiente sin restar", () => {
  const costoDe = (id: string) => (id === "recVARIANTE00001" ? { costo: 20_000, packaging: 1_000 } : null);
  const m = margenDe(
    [
      // Promete $ 12.100 de crédito para la próxima compra. Pagó con tarjeta: no se sabe en cuántas cuotas.
      pedido("A", { cashback: 12_100 }),
      // Sin envío cotizado: se estima con la tarifa plana, y se dice.
      pedido("B", { envioCostoReal: null }),
      // A un producto le falta el costo: queda afuera, y se avisa.
      pedido("C", { items: [{ varianteId: "recSINCOSTO00001", nombre: "X", color: "", categoria: "Anteojos", cantidad: 1, subtotal: 1 }] }),
      pedido("D", { estado: "cancelado" }),
      // Usa $ 12.100 de saldo (ya provisionado cuando se prometió) y paga con dinero en Mercado Pago: un solo pago.
      pedido("E", { total: 108_900, saldoUsado: 12_100, dineroMP: true }),
    ],
    { tasa: 21, costoDe, envioPorDefecto: 24_200 }
  )!;
  assert.equal(m.pedidos, 3);
  assert.equal(m.sinCosto, 1);
  assert.equal(m.enviosEstimados, 1);

  // Ventas sin IVA antes del saldo: E cuenta 121.000 / 1,21, no 108.900 / 1,21 (el crédito no se resta dos veces).
  cerca(m.ventasNetas, 300_000, "ventas");
  // Del pedido.
  assert.equal(m.productos, 60_000);
  assert.equal(m.packaging, 3_000);
  cerca(m.envios, 40_000, "envíos"); // 12.100 / 1,21 + 24.200 / 1,21 + 12.100 / 1,21
  cerca(m.cashback, 10_000, "cashback sin IVA"); // 12.100 / 1,21
  assert.equal(m.cuotas, 0, "dinero en Mercado Pago: un pago, sin costo de cuotas");
  // Estimados con las tasas de referencia: Mercado Pago sobre lo cobrado (E cobró 108.900), IIBB sobre lo facturado, devoluciones sobre la venta.
  cerca(m.mercadoPago, (121_000 + 121_000 + 108_900) * 0.0339, "Mercado Pago");
  cerca(m.iibb, (100_000 + 100_000 + 90_000) * 0.03, "IIBB");
  cerca(m.devoluciones, 300_000 * 0.03, "devoluciones");
  assert.deepEqual(m.tasas, { mercadoPago: 0.0339, iibb: 0.03, devoluciones: 0.03, seisCuotas: 0.103 });

  cerca(m.contribucion, 300_000 - 60_000 - 3_000 - 40_000 - 10_000 - 11_895.51 - 8_700 - 9_000, "contribución estimada");
  cerca(m.porPedido!, m.contribucion / 3, "por pedido");
  cerca(m.porcentaje!, (m.contribucion / 300_000) * 100, "porcentaje");

  // Pendiente: no se resta.
  assert.equal(m.pendientes.cuotasSinDato, 2, "A y B pagaron con tarjeta");
  cerca(m.pendientes.cuotasHasta, 2 * 121_000 * 0.103, "cuotas si fueran 6");
  assert.equal(m.pendientes.preparacionDeReferencia, 2_000);
  assert.equal(m.pendientes.publicidadDeReferencia, 20_000);

  // Ganancia neta final: no hay, y dice qué falta.
  assert.deepEqual(m.faltaParaLaGanancia, [
    "el gasto en publicidad de la tienda web del período (no está cargado en ninguna tabla)",
    "el costo de armar y despachar cada pedido (no está cargado)",
    "las cuotas que eligió el comprador en 2 pedidos con tarjeta (Mercado Pago lo sabe, el pedido no lo guarda)",
    "la comisión real de Mercado Pago de cada pago (se estimó con el 3,39 %)",
    "la alícuota real de IIBB y las devoluciones reales (se estimaron con el 3 % y el 3 %)",
    "el envío cotizado de 1 pedido (se usó la tarifa plana de Config)",
    "el costo en Costos ML de algún producto de 1 pedido, que queda afuera de la cuenta",
  ]);

  assert.equal(margenDe([pedido("A")], { tasa: null, costoDe, envioPorDefecto: 0 }), null, "sin la tasa no se inventa un margen");
});

test("panel: «Cuánto dejó» da lo mismo que el motor de contribución para el mismo pedido (sin la preparación ni la publicidad, que quedan pendientes)", () => {
  const costoDe = (id: string) => (id === "recVARIANTE00001" ? { costo: PARAMETROS_REFERENCIA.costoUnitarioNeto, packaging: 0 } : null);
  const casos: { nombre: string; modelo: PedidoModelo; total: number; saldo: number }[] = [
    { nombre: "un par a precio completo", modelo: { pares: [PRECIO_REFERENCIA], descuentoSegundo: 0, cuotas: 1, costoEnvio: 5_500 }, total: PRECIO_REFERENCIA, saldo: 0 },
    {
      nombre: "una recompra con saldo que promete su cashback",
      modelo: { pares: [PRECIO_REFERENCIA], descuentoSegundo: 0, saldoAplicado: 15_733, cashback: CASHBACK_PRINCIPAL, cuotas: 1, costoEnvio: 10_000 },
      total: PRECIO_REFERENCIA - 15_733,
      saldo: 15_733,
    },
  ];
  for (const c of casos) {
    const motor = calcularContribucion(c.modelo);
    const m = margenDe(
      [pedido(c.nombre, { total: c.total, saldoUsado: c.saldo, cashback: motor.bruto.cashbackComprometido, dineroMP: true, envioCostoReal: c.modelo.costoEnvio })],
      { tasa: 21, costoDe, envioPorDefecto: 0 }
    )!;
    cerca(m.ventasNetas, motor.ventaNeta, `${c.nombre}: venta neta`);
    cerca(m.mercadoPago, motor.costos.mercadoPago, `${c.nombre}: Mercado Pago`);
    cerca(m.iibb, motor.costos.iibb, `${c.nombre}: IIBB`);
    cerca(m.devoluciones, motor.costos.devoluciones, `${c.nombre}: devoluciones`);
    cerca(m.cashback, motor.costos.cashback, `${c.nombre}: cashback`);
    cerca(m.envios, motor.costos.envio, `${c.nombre}: envío`);
    cerca(m.contribucion, motor.contribucionAntesDePublicidad + motor.costos.preparacion, `${c.nombre}: contribución`);
  }
});

test("panel: la cifra de «Contribución estimada» siempre aclara que no descuenta cuotas desconocidas, preparación ni publicidad", () => {
  const costoDe = (id: string) => (id === "recVARIANTE00001" ? { costo: 20_000, packaging: 1_000 } : null);
  const m = margenDe([pedido("A"), pedido("B")], { tasa: 21, costoDe, envioPorDefecto: 0 })!;
  assert.equal(m.sinDatosSuficientes, false);
  const cifra = cifraDeContribucion(m);
  assert.equal(cifra.valor, precio(Math.round(m.contribucion)));
  assert.ok(cifra.detalle.startsWith(`${precio(Math.round(m.porPedido!))} por pedido · `), cifra.detalle);
  assert.ok(cifra.detalle.endsWith(ACLARACION_CONTRIBUCION), "la aclaración va siempre, también en la sección");
  assert.equal(ACLARACION_CONTRIBUCION, "Todavía no descuenta cuotas desconocidas, preparación ni publicidad: no es la ganancia real.");

  // Con pérdida, el signo se ve y la aclaración sigue.
  const perdida = cifraDeContribucion({ ...m, contribucion: -1_500 });
  assert.equal(perdida.valor, `−${precio(1_500)}`);
  assert.ok(perdida.detalle.endsWith(ACLARACION_CONTRIBUCION));
});

test("panel: con pedidos confirmados pero ninguno con costos, «Sin datos suficientes» y cuántos quedaron afuera, nunca $ 0", () => {
  const sinCostos = () => null;
  const dos = margenDe([pedido("A"), pedido("B", { estado: "enviado" }), pedido("C", { estado: "pendiente" })], { tasa: 21, costoDe: sinCostos, envioPorDefecto: 0 })!;
  assert.equal(dos.pedidos, 0);
  assert.equal(dos.sinCosto, 2, "el pendiente de pago no cuenta");
  assert.equal(dos.sinDatosSuficientes, true);
  assert.deepEqual(cifraDeContribucion(dos), {
    valor: "Sin datos suficientes",
    detalle: "2 pedidos confirmados quedaron afuera: a sus productos les falta el costo en Costos ML.",
  });
  assert.notEqual(cifraDeContribucion(dos).valor, precio(0));

  const uno = margenDe([pedido("A")], { tasa: 21, costoDe: sinCostos, envioPorDefecto: 0 })!;
  assert.equal(cifraDeContribucion(uno).detalle, "1 pedido confirmado quedó afuera: a sus productos les falta el costo en Costos ML.");

  // Si al menos uno tiene costos, hay contribución (y el resto se avisa aparte en la sección).
  const costoDe = (id: string) => (id === "recVARIANTE00001" ? { costo: 20_000, packaging: 1_000 } : null);
  const sinCosto = { items: [{ varianteId: "recSINCOSTO00001", nombre: "X", color: "", categoria: "Anteojos", cantidad: 1, subtotal: 1 }] };
  const parcial = margenDe([pedido("A"), pedido("B", sinCosto)], { tasa: 21, costoDe, envioPorDefecto: 0 })!;
  assert.equal(parcial.sinDatosSuficientes, false);
  assert.equal(parcial.sinCosto, 1);
  assert.notEqual(cifraDeContribucion(parcial).valor, "Sin datos suficientes");

  // Sin ningún pedido confirmado no hay ventas: $ 0 es el dato real, no falta de datos.
  const vacio = margenDe([pedido("P", { estado: "pendiente" })], { tasa: 21, costoDe, envioPorDefecto: 0 })!;
  assert.equal(vacio.sinDatosSuficientes, false);
  assert.equal(cifraDeContribucion(vacio).valor, precio(0));
});

test("panel: sin pedidos confirmados, la contribución es cero y la ganancia neta igual dice qué falta", () => {
  const m = margenDe([pedido("P", { estado: "pendiente" })], { tasa: 21, costoDe: () => ({ costo: 1, packaging: 0 }), envioPorDefecto: 0 })!;
  assert.equal(m.pedidos, 0);
  assert.equal(m.contribucion, 0);
  assert.equal(m.porPedido, null);
  assert.equal(m.porcentaje, null);
  assert.deepEqual(m.faltaParaLaGanancia, [
    "el gasto en publicidad de la tienda web del período (no está cargado en ninguna tabla)",
    "el costo de armar y despachar cada pedido (no está cargado)",
  ]);
});

test("panel: el embudo usa solo los días con visitas contadas", () => {
  const conteos = {
    porDia: {
      "2027-01-14": { visita: 100, producto: 60, carrito: 10, checkout: 5, compra: 1 },
      "2027-01-15": { visita: 100, producto: 40, carrito: 10, checkout: 5, compra: 1 },
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
