import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

// La cuenta del suscriptor contra el Airtable de prueba (Ale, 03/11/2026): la
// sesión firmada, el alta y la baja, el cupón, los movimientos de saldo, el
// carrito, el pedido pagado entero con saldo y el arrepentimiento que anula
// un cashback pendiente.
//
// Ale, 18/11/2026: los beneficios en plata de la suscripción terminaron para
// todos. El alta ya no da cupón, el carrito de una cuenta es el de cualquiera
// (sin cupón, sin envío gratis, sin cashback, con las cuotas de todos) y lo
// único que sigue es usar el saldo que alguien tuviera de antes. Las pruebas
// del cupón, del cashback y de sus movimientos quedan para lo que el código
// todavía lee de los pedidos y las filas anteriores a ese día.
process.env.HARPER_FIXTURES = "1";
process.env.MP_WEBHOOK_SECRET = "secreto-de-prueba";
// Con este mínimo un par paga envío: así se ve que una cuenta ya no tiene envío gratis por serlo.
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
import { VERSION_CONDICIONES_SUSCRIPTORES } from "../lib/legales";
import { MINUTOS_RESERVA, notasDeBeneficios, sumarDias, fechaArgentina, type SuscriptorDelCarrito } from "../lib/suscriptores";
import { emailCanonico, guardarCliente, yaCompro } from "../lib/clientes";
import {
  anularCashbackPendiente,
  claveSuscriptor,
  cuponVigente,
  darDeAlta,
  darDeBaja,
  ErrorAltaEnCurso,
  movimientosDe,
  registrarCashback,
  registrarCupon,
  registrarUso,
  reservasDe,
  resumenDeLaCuenta,
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

test("el enlace de baja: firmado, sin vencimiento y sin el mail adentro (solo su huella)", () => {
  const token = crearTokenDeBaja({ suscriptorId: SUSCRIPTOR_ANA, email: "Ana@Ejemplo.com" })!;
  const leido = leerTokenDeBaja(token)!;
  assert.equal(leido.suscriptorId, SUSCRIPTOR_ANA);
  assert.equal(leido.esDelMail("ana@ejemplo.com"), true);
  assert.equal(leido.esDelMail(" ANA@ejemplo.com "), true);
  assert.equal(leido.esDelMail("otra@ejemplo.com"), false);
  const [cuerpo] = token.split(".");
  // Decodificado, no tiene el mail: la dirección de la página no lo muestra.
  assert.doesNotMatch(Buffer.from(cuerpo, "base64url").toString("utf8"), /@|ejemplo/);
  assert.equal(leerTokenDeBaja(`${cuerpo}.firma-inventada`), null);
  assert.equal(leerTokenDeBaja("nada"), null);
  assert.match(enlaceDeBaja("https://harper.ar", { suscriptorId: SUSCRIPTOR_ANA, email: "ana@ejemplo.com" })!, /^https:\/\/harper\.ar\/suscriptores\/baja\?t=/);
});

test("la sesión vale si la fila existe, con el mismo mail; dado de baja, solo con su saldo", async () => {
  const clave = claveDeSesionSuscriptor()!;
  const ahora = new Date();
  const ana = crearSesionSuscriptor(clave, { suscriptorId: SUSCRIPTOR_ANA, email: "ana@ejemplo.com" }, ahora.getTime());
  assert.equal((await suscriptorDeLaSesion(ana, ahora))?.id, SUSCRIPTOR_ANA);

  // Carla se dio de baja: su sesión sirve para usar el saldo que ya ganó, sin beneficios nuevos.
  const carla = crearSesionSuscriptor(clave, { suscriptorId: SUSCRIPTOR_CARLA, email: "carla@ejemplo.com" }, ahora.getTime());
  const deCarla = await suscriptorDeLaSesion(carla, ahora);
  assert.equal(deCarla?.id, SUSCRIPTOR_CARLA);
  const enElCarrito = await suscriptorParaElCarrito(deCarla!, ahora);
  assert.deepEqual([enElCarrito.activo, enElCarrito.cuponDisponible], [false, false]);
  const carrito = await resolverCarrito([await par()], { suscriptor: enElCarrito, usarSaldo: true });
  assert.equal(carrito.suscriptor?.activo, false);
  assert.equal(carrito.suscriptor?.cupon, 0, "sin cupón");
  assert.equal(carrito.suscriptor?.cashbackPrevisto, 0, "sin cashback nuevo");

  // Le cambiaron el mail en Airtable: esa sesión ya no sirve.
  await updateRecord(TABLAS.suscriptores, SUSCRIPTOR_ANA, { Email: "otra@ejemplo.com" });
  assert.equal(await suscriptorDeLaSesion(ana, ahora), null);
  // Una fila que no existe, tampoco.
  const fantasma = crearSesionSuscriptor(clave, { suscriptorId: "recFIX99999999999", email: "x@y.z" }, ahora.getTime());
  assert.equal(await suscriptorDeLaSesion(fantasma, ahora), null);
});

test("el alta es por mail en minúsculas: nunca dos filas, y la fila nueva nace sin cupón de bienvenida (Ale, 18/11/2026)", async () => {
  const ahora = new Date("2026-11-18T15:00:00Z");
  const nueva = await darDeAlta({ email: "Nuevo@Ejemplo.com ", nombre: "Nico", origen: "Portada", ahora, cerrojo: null });
  assert.equal(nueva.estado, "nueva");
  const fila = await getRecord<Record<string, unknown>>(TABLAS.suscriptores, nueva.cuenta.id);
  assert.equal(VERSION_CONDICIONES_SUSCRIPTORES, "2026-11-18");
  assert.deepEqual(
    [fila.fields.Email, fila.fields.Nombre, fila.fields.Alta, fila.fields.Acepta_mails, fila.fields.Origen, fila.fields.Version_condiciones],
    ["nuevo@ejemplo.com", "Nico", "2026-11-18T15:00:00.000Z", true, "Portada", VERSION_CONDICIONES_SUSCRIPTORES]
  );
  // Sin cupón: el campo ni se escribe (antes nacía «Disponible»), y nada lo ofrece.
  assert.equal("Cupon" in fila.fields, false, "la fila nueva no tiene Cupon");
  assert.equal("Cupon_pedido" in fila.fields, false);
  assert.equal(nueva.cuenta.cupon, "");
  assert.equal(await cuponVigente(nueva.cuenta), false);
  assert.deepEqual(await suscriptorParaElCarrito(nueva.cuenta), {
    id: nueva.cuenta.id,
    email: "nuevo@ejemplo.com",
    cuponDisponible: false,
    saldoDisponible: 0,
    saldoReservado: 0,
    activo: true,
  });

  // Otra vez (otra pestaña, otro día): la misma fila.
  const otra = await darDeAlta({ email: "NUEVO@ejemplo.com", origen: "Checkout", cerrojo: null });
  assert.deepEqual([otra.estado, otra.cuenta.id], ["ya", nueva.cuenta.id]);
  const filas = await listRecords<{ Email?: string }>(TABLAS.suscriptores, { filterByFormula: "LOWER({Email}) = 'nuevo@ejemplo.com'" });
  assert.equal(filas.length, 1);

  // Se da de baja y vuelve: se reactiva la misma fila, y sigue sin cupón (volver no regala nada).
  assert.equal(await darDeBaja({ suscriptorId: nueva.cuenta.id, ahora }), "baja");
  assert.equal(await darDeBaja({ suscriptorId: nueva.cuenta.id, ahora }), "ya");
  const baja = await cuenta(nueva.cuenta.id);
  assert.ok(baja.baja);
  assert.equal(baja.aceptaMails, false);
  const vuelve = await darDeAlta({ email: "nuevo@ejemplo.com", origen: "Suscriptores", cerrojo: null });
  assert.deepEqual([vuelve.estado, vuelve.cuenta.id, vuelve.cuenta.baja, vuelve.cuenta.cupon], ["reactivada", nueva.cuenta.id, null, ""]);
  assert.equal("Cupon" in (await getRecord<Record<string, unknown>>(TABLAS.suscriptores, nueva.cuenta.id)).fields, false);
  assert.match((await getRecord<{ Notas?: string }>(TABLAS.suscriptores, nueva.cuenta.id)).fields.Notas ?? "", /Volvió a suscribirse/);

  // Carla se suscribió antes del 18/11 y su fila dice «Disponible». Vuelve de
  // la baja: la fila queda como estaba, pero ese cupón ya no vale ni se ofrece.
  const carla = await darDeAlta({ email: "carla@ejemplo.com", origen: "Portada", cerrojo: null });
  assert.deepEqual([carla.estado, carla.cuenta.id, carla.cuenta.cupon], ["reactivada", SUSCRIPTOR_CARLA, "Disponible"]);
  assert.equal((await suscriptorPorEmail("CARLA@ejemplo.com"))?.baja, null);
  assert.equal(await cuponVigente(carla.cuenta), false);
  assert.equal((await suscriptorParaElCarrito(carla.cuenta)).cuponDisponible, false);
  const resumen = await resumenDeLaCuenta(carla.cuenta);
  assert.deepEqual([resumen.cupon, resumen.cuponYaCompro], ["Usado", false], "Mi cuenta y la sesión nunca anuncian un cupón que el carrito no aplica");
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
  // El enlace de un mail viejo (otro mail en la huella) no da de baja a esta fila.
  const viejo = leerTokenDeBaja(crearTokenDeBaja({ suscriptorId: SUSCRIPTOR_ANA, email: "otro@ejemplo.com" }))!;
  assert.equal(await darDeBaja({ suscriptorId: SUSCRIPTOR_ANA, esDelMail: viejo.esDelMail }), "sin-suscriptor");
  assert.equal((await cuenta(SUSCRIPTOR_ANA)).baja, null);
  assert.equal(await darDeBaja({ suscriptorId: "recFIX99999999999" }), "sin-suscriptor");
  const suyo = leerTokenDeBaja(crearTokenDeBaja({ suscriptorId: SUSCRIPTOR_ANA, email: "ANA@ejemplo.com" }))!;
  assert.equal(await darDeBaja({ suscriptorId: SUSCRIPTOR_ANA, esDelMail: suyo.esDelMail }), "baja");
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

test("lo que ve el carrito: el saldo que Ana tenía de antes, y ningún cupón, aunque la fila de Beto lo tenga «Disponible» (Ale, 18/11/2026)", async () => {
  const ana = await suscriptorParaElCarrito(await cuenta(SUSCRIPTOR_ANA));
  assert.deepEqual(ana, { id: SUSCRIPTOR_ANA, email: "ana@ejemplo.com", cuponDisponible: false, saldoDisponible: 92081, saldoReservado: 0, activo: true });
  // Beto se suscribió antes del 18/11: su fila conserva el cupón «Disponible» y
  // su mail nunca compró. Antes el carrito se lo ofrecía; ya no.
  const filaDeBeto = await cuenta(SUSCRIPTOR_BETO);
  assert.equal(filaDeBeto.cupon, "Disponible");
  assert.equal(await cuponVigente(filaDeBeto), false);
  const beto = await suscriptorParaElCarrito(filaDeBeto);
  assert.deepEqual(beto, { id: SUSCRIPTOR_BETO, email: "beto@ejemplo.com", cuponDisponible: false, saldoDisponible: 0, saldoReservado: 0, activo: true });
  assert.deepEqual([(await resumenDeLaCuenta(filaDeBeto)).cupon, (await resumenDeLaCuenta(filaDeBeto)).cuponYaCompro], ["Usado", false]);

  // Con una compra confirmada con su mail, tampoco (como siempre).
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

test("el carrito de una cuenta es el de cualquiera: sin cupón de bienvenida, sin envío gratis, sin cashback y con el tope de 3 cuotas (Ale, 18/11/2026)", async () => {
  const sinSesion = await resolverCarrito([await par()]);
  assert.deepEqual([sinSesion.subtotal, sinSesion.envio > 0, sinSesion.suscriptor], [89900, true, null]);

  // Beto: recién suscripto, con el cupón «Disponible» en su fila (de antes del 18/11).
  const beto = await suscriptorParaElCarrito(await cuenta(SUSCRIPTOR_BETO));
  const c = await resolverCarrito([await par()], { suscriptor: beto });
  // Paga lo mismo que sin sesión: el par a precio de lista y el envío.
  assert.deepEqual(c.items, sinSesion.items);
  assert.deepEqual([c.subtotal, c.envio, c.total], [sinSesion.subtotal, sinSesion.envio, sinSesion.total]);
  assert.deepEqual([c.subtotal, c.envio, c.total], [89900, 10100, 100000]);
  assert.equal(c.envioBonificado, false);
  assert.equal(c.items[0].cupon, undefined);
  assert.equal(c.subtotalSinCupon, 89900);
  assert.deepEqual(c.suscriptor, {
    email: "beto@ejemplo.com",
    cupon: 0,
    cuponDisponible: false,
    saldoUsado: 0,
    saldoDisponible: 0,
    saldoReservado: 0,
    cashbackPrevisto: 0,
    cashbackDineroMP: null,
    cuotas: 3,
    activo: true,
  });
  // El 10% de dinero en Mercado Pago, sobre el precio de cualquiera.
  assert.equal(c.dineroMP?.subtotal, 80910);
  assert.equal(c.dineroMP?.subtotal, sinSesion.dineroMP?.subtotal);

  // Aunque al carrito le llegara «cupón disponible» (una fila de antes, o un
  // pedido que lo fuerce), no lo aplica, ni pidiéndolo ni sin pedirlo.
  const conCuponALaFuerza: SuscriptorDelCarrito = { ...beto, cuponDisponible: true };
  for (const usarCupon of [undefined, true, false]) {
    const forzado = await resolverCarrito([await par()], { suscriptor: conCuponALaFuerza, usarCupon, paraCobrar: true });
    assert.deepEqual([forzado.subtotal, forzado.envio, forzado.total], [89900, 10100, 100000], `usarCupon=${usarCupon}`);
    assert.deepEqual([forzado.suscriptor?.cupon, forzado.suscriptor?.cuponDisponible, forzado.suscriptor?.cashbackPrevisto], [0, false, 0]);
  }

  // Donde el envío es gratis, lo es por el mínimo (acá, $ 150.000) y para cualquiera: no por tener cuenta.
  const dosSinSesion = await resolverCarrito([await par("citrino", 2)]);
  const dosConCuenta = await resolverCarrito([await par("citrino", 2)], { suscriptor: beto });
  assert.deepEqual([dosConCuenta.subtotal, dosConCuenta.envio, dosConCuenta.total], [179800, 0, 179800]);
  assert.deepEqual([dosConCuenta.subtotal, dosConCuenta.envio, dosConCuenta.total], [dosSinSesion.subtotal, dosSinSesion.envio, dosSinSesion.total]);
});

test("el saldo de antes, solo si lo pide: cubre los productos, no el envío, y ninguna compra devuelve cashback (Ale, 18/11/2026)", async () => {
  const ana = await suscriptorParaElCarrito(await cuenta(SUSCRIPTOR_ANA));
  // Sin pedirlo, Ana paga como cualquiera (un par no llega al mínimo de este archivo: paga el envío).
  const sinPedir = await resolverCarrito([await par()], { suscriptor: ana });
  assert.deepEqual([sinPedir.subtotal, sinPedir.envio, sinPedir.total], [89900, 10100, 100000]);
  assert.deepEqual([sinPedir.suscriptor?.saldoUsado, sinPedir.suscriptor?.cashbackPrevisto, sinPedir.suscriptor?.cashbackDineroMP], [0, 0, null]);

  // Con su saldo paga el par entero; el envío lo paga aparte, porque ya no es gratis por tener cuenta.
  const entero = await resolverCarrito([await par()], { suscriptor: ana, usarSaldo: true });
  assert.deepEqual([entero.subtotal, entero.envio, entero.total], [0, 10100, 10100]);
  assert.deepEqual([entero.suscriptor?.saldoUsado, entero.suscriptor?.cashbackPrevisto, entero.suscriptor?.cashbackDineroMP], [89900, 0, null]);
  assert.equal(entero.dineroMP?.subtotal, 0);

  // Dos pares llegan al mínimo ($ 150.000 acá): envío gratis como para cualquiera, y el saldo cubre una parte.
  const dos = await resolverCarrito([await par("citrino", 2)], { suscriptor: ana, usarSaldo: true });
  assert.deepEqual([dos.subtotal, dos.envio, dos.total], [87719, 0, 87719]);
  assert.deepEqual([dos.suscriptor?.saldoUsado, dos.suscriptor?.cashbackPrevisto, dos.suscriptor?.cashbackDineroMP], [92081, 0, null]);
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

/**
 * El carrito de Ana pagado entero con el saldo que tenía de antes. Para que
 * quede en $ 0 el envío tiene que ser gratis: el saldo paga productos, no el
 * envío, y desde el 18/11/2026 una cuenta no tiene envío gratis por serlo.
 * Acá, con un mínimo que un par alcanza (como hoy en AMBA), solo mientras se
 * arma este carrito.
 */
async function carritoEnCero() {
  const fila = (await listRecords<{ Clave?: string; Valor?: string }>(TABLAS.config)).find((f) => f.fields.Clave === "envio_gratis_desde")!;
  const antes = fila.fields.Valor;
  await updateRecord(TABLAS.config, fila.id, { Valor: "80000" });
  try {
    const ana = await suscriptorParaElCarrito(await cuenta(SUSCRIPTOR_ANA));
    const carrito = await resolverCarrito([await par()], { suscriptor: ana, usarSaldo: true, paraCobrar: true });
    assert.deepEqual([carrito.subtotal, carrito.envio, carrito.total], [0, 0, 0], "sin nada que pagar: no pasa por Mercado Pago");
    return { ana, carrito };
  } finally {
    await updateRecord(TABLAS.config, fila.id, { Valor: antes });
  }
}

async function pedidoSinPago(numero: string, cerrojo = cerrojoEnMemoria()) {
  const { ana, carrito } = await carritoEnCero();
  const anulados: string[] = [];
  const resultado = await confirmarPedidoSinPago({
    suscriptor: ana,
    numero,
    cupon: carrito.suscriptor!.cupon,
    saldoUsado: carrito.suscriptor!.saldoUsado,
    clienteId: "recFIXCLIENTE0001",
    crearPedido: () => createRecord(TABLAS.pedidos, { Numero: numero, Estado: "pendiente", Total: 0, Items: JSON.stringify(carrito.items) }),
    marcarPagado: async (id) => {
      await updateRecord(TABLAS.pedidos, id, { Estado: "pagado" });
    },
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
  // Nació pendiente y pasó a pagado con el saldo ya anotado.
  assert.equal((await listRecords<{ Estado?: string }>(TABLAS.pedidos, { filterByFormula: "{Numero} = 'H-SALDO-1'" }))[0].fields.Estado, "pagado");
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
    marcarPagado: async () => assert.fail("no tiene que crear el pedido"),
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

  // Si además falla anular el pedido, queda «pendiente» (nadie lo despacha), nunca «pagado».
  interceptar((path, { method }) => {
    if (method === "POST" && decodeURIComponent(path) === TABLAS.saldos) throw new RespuestaFixture(429, "TOO_MANY_REQUESTS");
  });
  const r = await (async () => {
    const { ana, carrito } = await carritoEnCero();
    return confirmarPedidoSinPago({
      suscriptor: ana,
      numero: "H-FALLA-2",
      cupon: carrito.suscriptor!.cupon,
      saldoUsado: carrito.suscriptor!.saldoUsado,
      clienteId: "recFIXCLIENTE0001",
      crearPedido: () => createRecord(TABLAS.pedidos, { Numero: "H-FALLA-2", Estado: "pendiente", Total: 0 }),
      marcarPagado: async (id) => {
        await updateRecord(TABLAS.pedidos, id, { Estado: "pagado" });
      },
      anularPedido: async () => {
        // Airtable tampoco deja anularlo.
      },
      datosMail: { numero: "H-FALLA-2", items: carrito.items, subtotal: 0, envio: 0, total: 0, cliente: CLIENTE, config: await getConfig(), sitio: "" },
      cerrojo: cerrojoEnMemoria(),
    }).catch((e: unknown) => e);
  })();
  interceptar(null);
  assert.ok(r instanceof Error);
  const huerfano = (await listRecords<{ Estado?: string }>(TABLAS.pedidos, { filterByFormula: "{Numero} = 'H-FALLA-2'" }))[0];
  assert.equal(huerfano.fields.Estado, "pendiente");
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

test("un pedido sin pagar aparta su saldo y su cupón: mientras su link cobra, o mientras el pago está en revisión", async () => {
  const ahora = new Date();
  const notas = (suscriptorId: string, email: string, cupon: number, saldoUsado: number) =>
    notasDeBeneficios({ suscriptorId, email, cupon, saldoUsado, cashback: 3990 }).join("\n");
  // Ana tiene $ 92.081 para usar; un pedido de recién, sin pagar, aparta $ 50.000.
  const reciente = await createRecord(TABLAS.pedidos, {
    Numero: "H-RES-1",
    Estado: "pendiente",
    Fecha: ahora.toISOString(),
    Notas: notas(SUSCRIPTOR_ANA, "ana@ejemplo.com", 0, 50000),
  });
  // Uno de hace una hora, con el link ya vencido, no aparta nada.
  await createRecord(TABLAS.pedidos, {
    Numero: "H-RES-2",
    Estado: "pendiente",
    Fecha: new Date(ahora.getTime() - (MINUTOS_RESERVA + 30) * 60_000).toISOString(),
    Notas: notas(SUSCRIPTOR_ANA, "ana@ejemplo.com", 0, 30000),
  });
  let ana = await suscriptorParaElCarrito(await cuenta(SUSCRIPTOR_ANA), ahora);
  assert.deepEqual([ana.saldoDisponible, ana.saldoReservado], [42081, 50000]);
  assert.deepEqual((await reservasDe(SUSCRIPTOR_ANA, ahora)).pedidos, ["H-RES-1"]);

  // Un pedido en $ 0 armado antes (con los $ 89.900 de saldo a la vista) ya no puede usar lo apartado.
  const sinPago = await confirmarPedidoSinPago({
    suscriptor: { id: SUSCRIPTOR_ANA, email: "ana@ejemplo.com" },
    numero: "H-RES-3",
    cupon: 0,
    saldoUsado: 89900,
    clienteId: "x",
    crearPedido: async () => assert.fail("no tiene que crear el pedido"),
    marcarPagado: async () => assert.fail("no tiene que crear el pedido"),
    anularPedido: async () => {},
    datosMail: { numero: "H-RES-3", items: [], subtotal: 0, envio: 0, total: 0, cliente: CLIENTE, config: await getConfig(), sitio: "" },
    cerrojo: cerrojoEnMemoria(),
  });
  assert.equal(sinPago.ok === false && sinPago.status, 409);

  // Pagado, deja de apartar (lo descuenta su Uso, que anota el webhook).
  await updateRecord(TABLAS.pedidos, reciente.id, { Estado: "pagado" });
  ana = await suscriptorParaElCarrito(await cuenta(SUSCRIPTOR_ANA), ahora);
  assert.deepEqual([ana.saldoDisponible, ana.saldoReservado], [92081, 0]);

  // Con el pago en revisión aparta aunque sea viejo: se puede aprobar después.
  await createRecord(TABLAS.pedidos, {
    Numero: "H-RES-4",
    Estado: "pendiente",
    MP_status: "in_process",
    Fecha: new Date(ahora.getTime() - 3 * 3600_000).toISOString(),
    Notas: notas(SUSCRIPTOR_ANA, "ana@ejemplo.com", 0, 20000),
  });
  ana = await suscriptorParaElCarrito(await cuenta(SUSCRIPTOR_ANA), ahora);
  assert.equal(ana.saldoDisponible, 72081);

  // El cupón de Beto, apartado por un pedido sin pagar, no se ofrece en otro.
  await createRecord(TABLAS.pedidos, {
    Numero: "H-RES-5",
    Estado: "pendiente",
    Fecha: ahora.toISOString(),
    Notas: notas(SUSCRIPTOR_BETO, "beto@ejemplo.com", 10000, 0),
  });
  assert.equal((await suscriptorParaElCarrito(await cuenta(SUSCRIPTOR_BETO), ahora)).cuponDisponible, false);
});

test("el cupón de bienvenida mira el buzón real del mail, y un checkout sin pagar no le cambia el DNI a quien ya compró", async () => {
  assert.equal(emailCanonico(" Ana.Perez+promo@GoogleMail.com "), "anaperez@gmail.com");
  assert.equal(emailCanonico("ana+harper@empresa.com.ar"), "ana@empresa.com.ar");
  assert.equal(emailCanonico("a.b@empresa.com"), "a.b@empresa.com", "fuera de Gmail los puntos cuentan");
  assert.equal(emailCanonico("+x@empresa.com"), "+x@empresa.com");

  const cliente = await createRecord(TABLAS.clientes, { Email: "compro@gmail.com", DNI: "30123456", Primera_compra: "2026-10-01" });
  assert.equal(await yaCompro("com.pro+2@gmail.com", ""), true, "otro alias del mismo buzón ya compró");
  assert.equal(await yaCompro("otra@gmail.com", ""), false);

  // Vuelve al checkout con el mismo mail y otro DNI, y no paga.
  const guardado = await guardarCliente({ ...CLIENTE, email: "compro@gmail.com", dni: "11111111" });
  assert.deepEqual(guardado, { id: cliente.id, dniAnterior: "30123456" });
  assert.equal((await getRecord<{ DNI?: string }>(TABLAS.clientes, cliente.id)).fields.DNI, "30123456");
  // Con el DNI de su compra, sigue contando como que ya compró, con cualquier mail.
  assert.equal(await yaCompro("nuevo@ejemplo.com", "30.123.456"), true);
});

test("arrepentimiento: el cashback se anula aunque ya se pueda usar, y el saldo usado queda a la vista para devolverlo", async () => {
  const hace40 = new Date(Date.now() - 40 * 86_400_000);
  const hoy = new Date();
  const notas = notasDeBeneficios({ suscriptorId: SUSCRIPTOR_BETO, email: "beto@ejemplo.com", cupon: 0, saldoUsado: 15000, cashback: 7490 }).join("\n");
  await createRecord(TABLAS.pedidos, { Numero: "HARPER-ARR02", Estado: "entregado", Notas: notas });
  await registrarCashback({ suscriptorId: SUSCRIPTOR_BETO, email: "beto@ejemplo.com", numeroPedido: "HARPER-ARR02", fecha: hace40, monto: 7490 });
  const nota = await anularCashbackDelPedido({ nombre: "Beto", email: "beto@ejemplo.com", pedido: "HARPER-ARR02", producto: "", motivo: "" }, "ARR-9", hoy);
  assert.match(nota ?? "", /ya se podía usar y quedó Anulado/);
  assert.match(nota ?? "", /Usó \$\s15\.000 de saldo en el pedido HARPER-ARR02: cuando se concrete la devolución, marcá Anulado el Uso/);
  assert.equal((await movimientosDe(SUSCRIPTOR_BETO)).find((m) => m.pedido === "HARPER-ARR02")?.anulado, true);

  // Un pedido pagado entero con saldo (sin cashback): también se avisa del saldo.
  const todoSaldo = notasDeBeneficios({ suscriptorId: SUSCRIPTOR_BETO, email: "beto@ejemplo.com", cupon: 0, saldoUsado: 89900, cashback: 0 }).join("\n");
  await createRecord(TABLAS.pedidos, { Numero: "HARPER-ARR03", Estado: "pagado", Notas: todoSaldo });
  const notaSaldo = await anularCashbackDelPedido({ nombre: "Beto", email: "beto@ejemplo.com", pedido: "HARPER-ARR03", producto: "", motivo: "" }, "ARR-10", hoy);
  assert.match(notaSaldo ?? "", /Usó \$\s89\.900 de saldo/);
});
