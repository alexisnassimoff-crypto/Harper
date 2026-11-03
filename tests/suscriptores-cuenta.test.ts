import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

// La cuenta del suscriptor contra el Airtable de prueba (Ale, 03/11/2026): la
// sesión firmada, el alta y la baja, el cupón, los movimientos de saldo, el
// carrito con sus beneficios, el pedido pagado entero con saldo y el
// arrepentimiento que anula un cashback pendiente.
process.env.HARPER_FIXTURES = "1";
process.env.MP_WEBHOOK_SECRET = "secreto-de-prueba";
// Con el mínimo de producción, un par paga envío: así se ve el envío gratis del suscriptor.
process.env.HARPER_FIXTURES_ENVIO_GRATIS_DESDE = "150000";
process.env.HARPER_FIXTURES_ENVIO_GRATIS_AMBA_DESDE = "150000";
delete process.env.VERCEL;

import { createRecord, getRecord, listRecords, TABLAS, updateRecord } from "../lib/airtable";
import { anularCashbackDelPedido } from "../lib/arrepentimiento-servidor";
import { getProductos } from "../lib/catalogo";
import { getConfig } from "../lib/config";
import { cerrojoEnMemoria, reiniciarRedis } from "../lib/fixtures/redis";
import { SUSCRIPTOR_ANA, SUSCRIPTOR_BETO, SUSCRIPTOR_CARLA } from "../lib/fixtures/datos";
import { interceptar, reiniciar, RespuestaFixture } from "../lib/fixtures/servidor";
import { resolverCarrito } from "../lib/pedidos";
import { notasDeBeneficios, sumarDias, fechaArgentina } from "../lib/suscriptores";
import {
  anularCashbackPendiente,
  claveSuscriptor,
  darDeAlta,
  darDeBaja,
  ErrorAltaEnCurso,
  movimientosDe,
  registrarCashback,
  registrarCupon,
  registrarUso,
  suscriptorDeLaSesion,
  suscriptorParaElCarrito,
  suscriptorPorEmail,
  suscriptorPorId,
} from "../lib/suscriptores-cuenta";
import {
  claveDeSesionSuscriptor,
  COOKIE_SUSCRIPTOR,
  crearSesionSuscriptor,
  crearTokenDeBaja,
  DURACION_SESION_MS,
  enlaceDeBaja,
  leerCookie,
  leerSesionSuscriptor,
  leerTokenDeBaja,
} from "../lib/suscriptores-sesion";
import { confirmarPedidoSinPago } from "../lib/suscriptores-sin-pago";
import type { DatosCliente } from "../lib/tipos";

beforeEach(() => {
  reiniciar();
  reiniciarRedis();
  interceptar(null);
});

async function par(slug = "citrino", cantidad = 1) {
  const productos = await getProductos();
  const variante = productos.find((p) => p.slug === slug)!.variantes.find((v) => !v.agotada)!;
  return { productoSlug: slug, varianteId: variante.id, cantidad };
}

async function cuenta(id: string) {
  return (await suscriptorPorId(id))!;
}

test("la sesión: cookie harper_suscriptor firmada, de 90 días, que no se puede fabricar", () => {
  const clave = claveDeSesionSuscriptor()!;
  assert.equal(COOKIE_SUSCRIPTOR, "harper_suscriptor");
  assert.equal(DURACION_SESION_MS, 90 * 24 * 60 * 60_000);
  const valor = crearSesionSuscriptor(clave, { suscriptorId: SUSCRIPTOR_ANA, email: "ana@ejemplo.com" }, 1_000);
  assert.deepEqual(leerSesionSuscriptor(clave, valor, 2_000), { suscriptorId: SUSCRIPTOR_ANA, email: "ana@ejemplo.com", hasta: 1_000 + DURACION_SESION_MS });
  // Vencida, tocada, con otra clave o con la de otro uso: no sirve.
  assert.equal(leerSesionSuscriptor(clave, valor, 1_000 + DURACION_SESION_MS + 1), null);
  const [cuerpo, firma] = valor.split(".");
  const otro = Buffer.from(JSON.stringify({ s: SUSCRIPTOR_BETO, e: "ana@ejemplo.com", h: 9e15 })).toString("base64url");
  assert.equal(leerSesionSuscriptor(clave, `${otro}.${firma}`, 2_000), null);
  assert.equal(leerSesionSuscriptor(Buffer.from("otra clave"), valor, 2_000), null);
  assert.equal(leerSesionSuscriptor(clave, `${cuerpo}.${firma}.x`, 2_000), null);
  assert.equal(leerSesionSuscriptor(clave, 42, 2_000), null);
  // El enlace de baja no sirve como sesión, ni la sesión como enlace de baja.
  const token = crearTokenDeBaja({ suscriptorId: SUSCRIPTOR_ANA, email: "ana@ejemplo.com" })!;
  assert.equal(leerSesionSuscriptor(clave, token, 2_000), null);
  assert.equal(leerTokenDeBaja(valor), null);
  assert.equal(leerCookie("otra=1; harper_suscriptor=abc%3D.def; x=2", "harper_suscriptor"), "abc=.def");
  assert.equal(leerCookie("harper_suscriptor=%E0%A4%A", "harper_suscriptor"), null);
  assert.equal(leerCookie(null, "harper_suscriptor"), null);
});

test("el enlace de baja: firmado, sin vencimiento y con el mail en minúsculas", () => {
  const token = crearTokenDeBaja({ suscriptorId: SUSCRIPTOR_ANA, email: "Ana@Ejemplo.com" })!;
  assert.deepEqual(leerTokenDeBaja(token), { suscriptorId: SUSCRIPTOR_ANA, email: "ana@ejemplo.com" });
  const [cuerpo] = token.split(".");
  assert.equal(leerTokenDeBaja(`${cuerpo}.firma-inventada`), null);
  assert.equal(leerTokenDeBaja("nada"), null);
  assert.match(enlaceDeBaja("https://harper.ar", { suscriptorId: SUSCRIPTOR_ANA, email: "ana@ejemplo.com" })!, /^https:\/\/harper\.ar\/suscriptores\/baja\?t=/);
});

test("la sesión vale si la fila existe, con el mismo mail y sin baja", async () => {
  const clave = claveDeSesionSuscriptor()!;
  const ahora = new Date();
  const ana = crearSesionSuscriptor(clave, { suscriptorId: SUSCRIPTOR_ANA, email: "ana@ejemplo.com" }, ahora.getTime());
  assert.equal((await suscriptorDeLaSesion(ana, ahora))?.id, SUSCRIPTOR_ANA);

  // Carla se dio de baja: su sesión ya no sirve.
  const carla = crearSesionSuscriptor(clave, { suscriptorId: SUSCRIPTOR_CARLA, email: "carla@ejemplo.com" }, ahora.getTime());
  assert.equal(await suscriptorDeLaSesion(carla, ahora), null);

  // Le cambiaron el mail en Airtable: esa sesión ya no sirve.
  await updateRecord(TABLAS.suscriptores, SUSCRIPTOR_ANA, { Email: "otra@ejemplo.com" });
  assert.equal(await suscriptorDeLaSesion(ana, ahora), null);
  // Una fila que no existe, tampoco.
  const fantasma = crearSesionSuscriptor(clave, { suscriptorId: "recFIX99999999999", email: "x@y.z" }, ahora.getTime());
  assert.equal(await suscriptorDeLaSesion(fantasma, ahora), null);
});

test("el alta es por mail en minúsculas: nunca dos filas, y el cupón nace disponible solo la primera vez", async () => {
  const ahora = new Date("2026-11-03T15:00:00Z");
  const nueva = await darDeAlta({ email: "Nuevo@Ejemplo.com ", nombre: "Nico", origen: "Portada", ahora, cerrojo: null });
  assert.equal(nueva.estado, "nueva");
  const fila = await getRecord<Record<string, unknown>>(TABLAS.suscriptores, nueva.cuenta.id);
  assert.deepEqual(
    [fila.fields.Email, fila.fields.Nombre, fila.fields.Alta, fila.fields.Acepta_mails, fila.fields.Origen, fila.fields.Cupon, fila.fields.Version_condiciones],
    ["nuevo@ejemplo.com", "Nico", "2026-11-03T15:00:00.000Z", true, "Portada", "Disponible", "2026-11-03"]
  );

  // Otra vez (otra pestaña, otro día): la misma fila.
  const otra = await darDeAlta({ email: "NUEVO@ejemplo.com", origen: "Checkout", cerrojo: null });
  assert.deepEqual([otra.estado, otra.cuenta.id], ["ya", nueva.cuenta.id]);
  const filas = await listRecords<{ Email?: string }>(TABLAS.suscriptores, { filterByFormula: "LOWER({Email}) = 'nuevo@ejemplo.com'" });
  assert.equal(filas.length, 1);

  // Usa el cupón, se da de baja y vuelve: se reactiva la misma fila y el cupón sigue usado.
  assert.equal((await registrarCupon({ suscriptorId: nueva.cuenta.id, numeroPedido: "HARPER-A" })).estado, "registrado");
  assert.equal(await darDeBaja({ suscriptorId: nueva.cuenta.id, ahora }), "baja");
  assert.equal(await darDeBaja({ suscriptorId: nueva.cuenta.id, ahora }), "ya");
  const baja = await cuenta(nueva.cuenta.id);
  assert.ok(baja.baja);
  assert.equal(baja.aceptaMails, false);
  const vuelve = await darDeAlta({ email: "nuevo@ejemplo.com", origen: "Suscriptores", cerrojo: null });
  assert.deepEqual([vuelve.estado, vuelve.cuenta.id, vuelve.cuenta.baja, vuelve.cuenta.cupon], ["reactivada", nueva.cuenta.id, null, "Usado"]);
  assert.match((await getRecord<{ Notas?: string }>(TABLAS.suscriptores, nueva.cuenta.id)).fields.Notas ?? "", /Volvió a suscribirse/);

  // Carla (de baja, sin usar el cupón) vuelve con su cupón.
  const carla = await darDeAlta({ email: "carla@ejemplo.com", origen: "Portada", cerrojo: null });
  assert.deepEqual([carla.estado, carla.cuenta.id, carla.cuenta.cupon], ["reactivada", SUSCRIPTOR_CARLA, "Disponible"]);
  assert.equal((await suscriptorPorEmail("CARLA@ejemplo.com"))?.baja, null);
});

test("dos altas del mismo mail a la vez: con el cerrojo, la segunda contesta «en curso» y no crea otra fila", async () => {
  const cerrojo = cerrojoEnMemoria();
  const [a, b] = await Promise.allSettled([
    darDeAlta({ email: "doble@ejemplo.com", origen: "Portada", cerrojo }),
    darDeAlta({ email: "doble@ejemplo.com", origen: "Portada", cerrojo }),
  ]);
  const ok = [a, b].filter((r) => r.status === "fulfilled");
  const enCurso = [a, b].filter((r) => r.status === "rejected" && r.reason instanceof ErrorAltaEnCurso);
  assert.equal(ok.length + enCurso.length, 2);
  assert.ok(ok.length >= 1);
  const filas = await listRecords(TABLAS.suscriptores, { filterByFormula: "LOWER({Email}) = 'doble@ejemplo.com'" });
  assert.equal(filas.length, 1);
});

test("la baja con el mail de otra fila (un enlace viejo) no da de baja a nadie", async () => {
  assert.equal(await darDeBaja({ suscriptorId: SUSCRIPTOR_ANA, email: "otro@ejemplo.com" }), "sin-suscriptor");
  assert.equal((await cuenta(SUSCRIPTOR_ANA)).baja, null);
  assert.equal(await darDeBaja({ suscriptorId: "recFIX99999999999" }), "sin-suscriptor");
  assert.equal(await darDeBaja({ suscriptorId: SUSCRIPTOR_ANA, email: "ANA@ejemplo.com" }), "baja");
});

test("el cupón se anota una sola vez: el mismo pedido es idempotente y otro pedido es conflicto", async () => {
  assert.equal((await registrarCupon({ suscriptorId: SUSCRIPTOR_BETO, numeroPedido: "H-A" })).estado, "registrado");
  assert.equal((await registrarCupon({ suscriptorId: SUSCRIPTOR_BETO, numeroPedido: "H-A" })).estado, "ya");
  const otro = await registrarCupon({ suscriptorId: SUSCRIPTOR_BETO, numeroPedido: "H-B" });
  assert.equal(otro.estado, "conflicto");
  const fila = await getRecord<{ Cupon?: string; Cupon_pedido?: string }>(TABLAS.suscriptores, SUSCRIPTOR_BETO);
  assert.deepEqual([fila.fields.Cupon, fila.fields.Cupon_pedido], ["Usado", "H-A"]);
  // Ana ya lo había usado: conflicto. Un id que no existe: sin suscriptor.
  assert.equal((await registrarCupon({ suscriptorId: SUSCRIPTOR_ANA, numeroPedido: "H-C" })).estado, "conflicto");
  assert.equal((await registrarCupon({ suscriptorId: "recFIX99999999999", numeroPedido: "H-C" })).estado, "sin-suscriptor");
});

test("lo que ve el carrito: el saldo de Ana, el cupón de Beto, y sin cupón si ese mail ya compró", async () => {
  const ana = await suscriptorParaElCarrito(await cuenta(SUSCRIPTOR_ANA));
  assert.deepEqual(ana, { id: SUSCRIPTOR_ANA, email: "ana@ejemplo.com", cuponDisponible: false, saldoDisponible: 92081 });
  const beto = await suscriptorParaElCarrito(await cuenta(SUSCRIPTOR_BETO));
  assert.deepEqual(beto, { id: SUSCRIPTOR_BETO, email: "beto@ejemplo.com", cuponDisponible: true, saldoDisponible: 0 });

  // Beto ya tiene una compra confirmada con su mail (como el viejo HARPER10): sin cupón.
  await createRecord(TABLAS.clientes, { Email: "Beto@ejemplo.com", Primera_compra: "2026-10-01" });
  assert.equal((await suscriptorParaElCarrito(await cuenta(SUSCRIPTOR_BETO))).cuponDisponible, false);
});

test("los movimientos: cashback a los 30 días (Buenos Aires) y uso, una sola vez por pedido y tipo", async () => {
  const fecha = new Date("2026-11-03T02:30:00Z"); // 23:30 del 2/11 en Buenos Aires
  const datos = { suscriptorId: SUSCRIPTOR_BETO, email: "beto@ejemplo.com", numeroPedido: "H-1", fecha };
  const cb = await registrarCashback({ ...datos, monto: 7490 });
  assert.deepEqual(cb, { estado: "creado", disponibleDesde: "2026-12-02" });
  assert.deepEqual(await registrarCashback({ ...datos, monto: 7490 }), { estado: "ya", disponibleDesde: "2026-12-02" });

  // Beto no tiene saldo: el uso se anota igual (en negativo) y dice que no alcanzaba.
  assert.deepEqual(await registrarUso({ ...datos, monto: 1000 }), { estado: "creado", alcanzaba: false });
  // Ana sí: alcanza, y al retomar sigue diciendo que alcanzaba (no cuenta su propio uso).
  const deAna = { suscriptorId: SUSCRIPTOR_ANA, email: "ana@ejemplo.com", numeroPedido: "H-2", fecha };
  assert.deepEqual(await registrarUso({ ...deAna, monto: 92081 }), { estado: "creado", alcanzaba: true });
  assert.deepEqual(await registrarUso({ ...deAna, monto: 92081 }), { estado: "ya", alcanzaba: true });

  const movimientos = (await movimientosDe(SUSCRIPTOR_BETO)).map((m) => [m.tipo, m.monto, m.pedido, m.disponibleDesde]);
  assert.deepEqual(movimientos.sort(), [
    ["Cashback", 7490, "H-1", "2026-12-02"],
    ["Uso", -1000, "H-1", null],
  ]);
  const fila = (await listRecords<{ Movimiento?: string }>(TABLAS.saldos, { filterByFormula: "AND({Pedido} = 'H-1', {Tipo} = 'Cashback')" }))[0];
  assert.equal(fila.fields.Movimiento, "H-1 · Cashback");
});

test("anular el cashback pendiente de un pedido; el que ya se puede usar no se toca", async () => {
  const hoy = new Date();
  // HARPER-PRUEBA3 está en camino; HARPER-PRUEBA ya se puede usar; HARPER-PRUEBA4 ya estaba anulado.
  const r = await anularCashbackPendiente("HARPER-PRUEBA3", "Anulado por prueba", hoy);
  assert.deepEqual(r, { estado: "anulado", monto: 7191, disponibleDesde: sumarDias(fechaArgentina(hoy), 20) });
  assert.equal((await anularCashbackPendiente("HARPER-PRUEBA3", "otra vez", hoy)).estado, "ya-anulado");
  assert.equal((await anularCashbackPendiente("HARPER-PRUEBA", "no", hoy)).estado, "disponible");
  assert.equal((await anularCashbackPendiente("HARPER-NADA", "no", hoy)).estado, "sin-cashback");
  const fila = await getRecord<{ Anulado?: boolean; Notas?: string }>(TABLAS.saldos, "recSALDOANA000004");
  assert.deepEqual([fila.fields.Anulado, fila.fields.Notas], [true, "Anulado por prueba"]);
});

test("el carrito de un suscriptor: cupón, envío gratis, cashback previsto y su tope de 6 cuotas", async () => {
  const sinSesion = await resolverCarrito([await par()]);
  assert.deepEqual([sinSesion.subtotal, sinSesion.envio > 0, sinSesion.suscriptor], [89900, true, null]);

  const beto = await suscriptorParaElCarrito(await cuenta(SUSCRIPTOR_BETO));
  const c = await resolverCarrito([await par()], { suscriptor: beto });
  assert.deepEqual([c.subtotal, c.envio, c.total], [79900, 0, 79900]);
  assert.equal(c.items[0].cupon, 10000);
  assert.equal(c.subtotalSinCupon, 89900, "el envío gratis se mide sin el cupón, como siempre");
  assert.deepEqual(c.suscriptor, {
    email: "beto@ejemplo.com",
    cupon: 10000,
    cuponDisponible: true,
    saldoUsado: 0,
    saldoDisponible: 0,
    cashbackPrevisto: 7990,
    cashbackDineroMP: 7191,
    cuotas: 6,
  });
  // El 10% de dinero en Mercado Pago corre sobre lo que queda después del cupón.
  assert.equal(c.dineroMP?.subtotal, 71910);

  // Sin el cupón (el checkout lo rechazó): precio de lista, envío gratis igual.
  const sinCupon = await resolverCarrito([await par()], { suscriptor: beto, usarCupon: false });
  assert.deepEqual([sinCupon.subtotal, sinCupon.envio, sinCupon.suscriptor?.cupon, sinCupon.suscriptor?.cashbackPrevisto], [89900, 0, 0, 8990]);
});

test("el saldo solo si lo pide: puede cubrir la compra entera, y el cashback es sobre lo que paga", async () => {
  const ana = await suscriptorParaElCarrito(await cuenta(SUSCRIPTOR_ANA));
  const sinPedir = await resolverCarrito([await par()], { suscriptor: ana });
  assert.deepEqual([sinPedir.total, sinPedir.suscriptor?.saldoUsado, sinPedir.suscriptor?.cashbackPrevisto], [89900, 0, 8990]);

  const entero = await resolverCarrito([await par()], { suscriptor: ana, usarSaldo: true });
  assert.deepEqual([entero.subtotal, entero.envio, entero.total], [0, 0, 0]);
  assert.deepEqual([entero.suscriptor?.saldoUsado, entero.suscriptor?.cashbackPrevisto], [89900, 0]);
  assert.equal(entero.dineroMP?.subtotal, 0);

  const dos = await resolverCarrito([await par("citrino", 2)], { suscriptor: ana, usarSaldo: true });
  assert.deepEqual([dos.subtotal, dos.suscriptor?.saldoUsado, dos.suscriptor?.cashbackPrevisto], [87719, 92081, 8772]);
  // Sin sesión, `usarSaldo` no hace nada.
  assert.equal((await resolverCarrito([await par()], { usarSaldo: true })).subtotal, 89900);
});

const CLIENTE: DatosCliente = {
  email: "ana@ejemplo.com",
  nombre: "Ana Pérez",
  telefono: "1144445555",
  dni: "30111222",
  direccion: "Núñez 2422",
  ciudad: "CABA",
  provincia: "Ciudad Autónoma de Buenos Aires",
  cp: "1429",
  aceptaPromos: false,
};

async function pedidoSinPago(numero: string, cerrojo = cerrojoEnMemoria()) {
  const ana = await suscriptorParaElCarrito(await cuenta(SUSCRIPTOR_ANA));
  const carrito = await resolverCarrito([await par()], { suscriptor: ana, usarSaldo: true, paraCobrar: true });
  const anulados: string[] = [];
  const resultado = await confirmarPedidoSinPago({
    suscriptor: ana,
    numero,
    cupon: carrito.suscriptor!.cupon,
    saldoUsado: carrito.suscriptor!.saldoUsado,
    clienteId: "recFIXCLIENTE0001",
    crearPedido: () => createRecord(TABLAS.pedidos, { Numero: numero, Estado: "pagado", Total: 0, Items: JSON.stringify(carrito.items) }),
    anularPedido: async (id) => {
      anulados.push(id);
      await updateRecord(TABLAS.pedidos, id, { Estado: "cancelado" });
    },
    datosMail: { numero, items: carrito.items, subtotal: 0, envio: 0, total: 0, cliente: CLIENTE, config: await getConfig(), sitio: "https://harper.ar" },
    cerrojo,
  });
  return { resultado, carrito, anulados, cerrojo };
}

test("el pedido pagado entero con saldo: el uso anotado y el stock descontado; la segunda vez no alcanza", async () => {
  const { resultado, carrito, cerrojo } = await pedidoSinPago("H-SALDO-1");
  assert.deepEqual(resultado, { ok: true });
  assert.equal(await cerrojo.tomar(claveSuscriptor(SUSCRIPTOR_ANA), "x", 1000), true, "suelta el cerrojo");
  await cerrojo.soltar(claveSuscriptor(SUSCRIPTOR_ANA), "x");
  const uso = (await movimientosDe(SUSCRIPTOR_ANA)).find((m) => m.pedido === "H-SALDO-1");
  assert.deepEqual([uso?.tipo, uso?.monto], ["Uso", -89900]);
  const despues = await resolverCarrito([await par()]);
  assert.equal(despues.items[0].stockDisponible, carrito.items[0].stockDisponible - 1);

  // Otra pestaña con el mismo carrito: ya no le alcanza ($ 2.181) y ni crea el pedido.
  const ana = await suscriptorParaElCarrito(await cuenta(SUSCRIPTOR_ANA));
  assert.equal(ana.saldoDisponible, 2181);
  const segunda = await confirmarPedidoSinPago({
    suscriptor: ana,
    numero: "H-SALDO-2",
    cupon: 0,
    saldoUsado: 89900,
    clienteId: "x",
    crearPedido: async () => assert.fail("no tiene que crear el pedido"),
    anularPedido: async () => {},
    datosMail: { numero: "H-SALDO-2", items: [], subtotal: 0, envio: 0, total: 0, cliente: CLIENTE, config: await getConfig(), sitio: "" },
    cerrojo,
  });
  assert.deepEqual([segunda.ok, segunda.ok === false && segunda.status], [false, 409]);
});

test("el pedido sin pago con el cerrojo tomado espera; si anotar el saldo falla, se deshace todo", async () => {
  const cerrojo = cerrojoEnMemoria();
  await cerrojo.tomar(claveSuscriptor(SUSCRIPTOR_ANA), "otro", 60_000);
  const ocupado = await pedidoSinPago("H-OCUPADO", cerrojo);
  assert.equal(ocupado.resultado.ok === false && ocupado.resultado.status, 409);
  assert.equal((await listRecords(TABLAS.pedidos, { filterByFormula: "{Numero} = 'H-OCUPADO'" })).length, 0);
  await cerrojo.soltar(claveSuscriptor(SUSCRIPTOR_ANA), "otro");

  // Airtable rechaza la fila del Uso: el pedido se anula y el saldo queda como estaba.
  interceptar((path, { method }) => {
    if (method === "POST" && decodeURIComponent(path) === TABLAS.saldos) throw new RespuestaFixture(422, "INVALID_VALUE_FOR_COLUMN");
  });
  await assert.rejects(pedidoSinPago("H-FALLA"));
  interceptar(null);
  const pedido = (await listRecords<{ Estado?: string }>(TABLAS.pedidos, { filterByFormula: "{Numero} = 'H-FALLA'" }))[0];
  assert.equal(pedido.fields.Estado, "cancelado");
  assert.equal((await suscriptorParaElCarrito(await cuenta(SUSCRIPTOR_ANA))).saldoDisponible, 92081);
});

test("arrepentimiento: anula el cashback pendiente solo si el mail es el del pedido", async () => {
  const hoy = new Date();
  const notas = notasDeBeneficios({ suscriptorId: SUSCRIPTOR_BETO, email: "beto@ejemplo.com", cupon: 10000, saldoUsado: 0, cashback: 7990 }).join("\n");
  await createRecord(TABLAS.pedidos, { Numero: "HARPER-ARR01", Estado: "pagado", Notas: notas });
  await registrarCashback({ suscriptorId: SUSCRIPTOR_BETO, email: "beto@ejemplo.com", numeroPedido: "HARPER-ARR01", fecha: hoy, monto: 7990 });
  const solicitud = { nombre: "Beto", email: "beto@ejemplo.com", pedido: "HARPER-ARR01", producto: "", motivo: "" };

  // Otro mail: no se toca, y Harper se entera.
  const ajeno = await anularCashbackDelPedido({ ...solicitud, email: "otro@ejemplo.com" }, "ARR-1", hoy);
  assert.match(ajeno ?? "", /no es el del pedido: no se tocó/);
  assert.equal((await movimientosDe(SUSCRIPTOR_BETO))[0].anulado, false);

  const nota = await anularCashbackDelPedido(solicitud, "ARR-2", hoy);
  assert.match(nota ?? "", /quedó Anulado en Saldos/);
  const cashback = (await movimientosDe(SUSCRIPTOR_BETO)).find((m) => m.pedido === "HARPER-ARR01")!;
  assert.equal(cashback.anulado, true);
  // Un pedido sin cashback, o un número que no es de pedido: nada que decir.
  assert.equal(await anularCashbackDelPedido({ ...solicitud, pedido: "HARPER-PRUEBA" }, "ARR-3", hoy), null);
  assert.equal(await anularCashbackDelPedido({ ...solicitud, pedido: "no sé" }, "ARR-4", hoy), null);
});
