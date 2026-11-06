import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// Crédito Harper, paso 3: Mi Cuenta para cualquier comprador con su mail
// verificado y la billetera «Mi Crédito Harper» (lib/credito-cuenta.ts).
// Todo contra el Airtable en memoria: no se crean clientes reales ni salen mails.
process.env.HARPER_FIXTURES = "1";
process.env.MP_WEBHOOK_SECRET = "secreto-de-prueba-del-paso-3";
delete process.env.VERCEL;
delete process.env.HARPER_CREDITO_ACTIVO;
delete process.env.HARPER_DUO_ACTIVO;

import { createRecord, listRecords, TABLAS, updateRecord } from "../lib/airtable";
import { creditosPorEmail, filaDelRegistro, type CamposCredito } from "../lib/credito-airtable";
import { atenderEntrada, billeteraDeCredito, billeteraDeLaCuenta, cuentaConCredito, entrarALaCuenta, visitaDeLaCuenta } from "../lib/credito-cuenta";
import { interceptar, reiniciar, RespuestaFixture } from "../lib/fixtures/servidor";
import { comprasDeLaCuenta } from "../lib/mis-compras";
import { claveDeCodigos, crearDesafio } from "../lib/reconocer-cliente";
import { resumenDeLaCuenta, suscriptorPorEmail } from "../lib/suscriptores-cuenta";
import {
  claveDeSesionCuenta,
  claveDeSesionSuscriptor,
  COOKIE_CUENTA,
  COOKIE_SUSCRIPTOR,
  crearSesionCuenta,
  crearSesionSuscriptor,
  DURACION_SESION_MS,
  leerSesionCuenta,
} from "../lib/suscriptores-sesion";

const AHORA = Date.parse("2026-12-10T15:00:00.000Z");
const CLAVE = claveDeCodigos()!;

/** El código y el desafío como los arma /api/suscriptores/codigo. */
const conCodigo = (email: string, ahora = AHORA) => ({ email, codigo: "123456", desafio: crearDesafio(CLAVE, email.trim().toLowerCase(), "123456", ahora, "suscriptor") });
const entrar = (email: string, o: { abierta?: boolean; ahora?: number; codigo?: string } = {}) =>
  entrarALaCuenta({ ...conCodigo(email, o.ahora ?? AHORA), ...(o.codigo ? { codigo: o.codigo } : {}) }, { claveCodigos: CLAVE, abierta: o.abierta ?? true, ahora: o.ahora ?? AHORA });

/** Todo lo que no es Créditos, para comprobar que entrar no escribe nada. */
const foto = async () => {
  const tablas = [TABLAS.suscriptores, TABLAS.saldos, TABLAS.clientes, TABLAS.pedidos];
  return Promise.all(tablas.map(async (t) => (await listRecords(t, { revalidate: 0 })).map((r) => ({ id: r.id, fields: r.fields }))));
};
function anotarEscrituras() {
  const escrituras: string[] = [];
  interceptar((ruta, { method }) => {
    if (method !== "GET") escrituras.push(`${method} ${ruta.split("/")[0]}`);
  });
  return escrituras;
}

async function credito(email: string, pedido: string, campos: Partial<CamposCredito> = {}) {
  return createRecord<CamposCredito>(TABLAS.creditos, {
    Clave: `credito-harper:${pedido}`,
    Pedido: pedido,
    Email: email,
    Monto: 15_733,
    Porcentaje: 10,
    Base: 157_325,
    Anteojos: 2,
    Estado: "Pendiente",
    Generado_el: "2026-11-06T15:00:00.000Z",
    Reglas: "credito-harper-v1",
    Notas: "",
    ...campos,
  });
}

beforeEach(() => {
  reiniciar();
  interceptar(null);
});

// ---------- Entrar sin suscribirse ----------

test("Comprador nuevo sin suscripción comercial: entra con el código sin alta, cupón, cashback, cliente ni mails", async () => {
  const antes = await foto();
  const escrituras = anotarEscrituras();

  const r = await entrar("Nueva.Compradora@Ejemplo.com ");

  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.estado, "cuenta");
  assert.equal(r.email, "nueva.compradora@ejemplo.com");
  assert.equal(r.abrir.nombre, COOKIE_CUENTA);
  assert.equal(r.cerrar, COOKIE_SUSCRIPTOR, "borra la de otro suscriptor que hubiera en el navegador");
  assert.deepEqual(escrituras, [], "no escribió nada en Airtable");
  assert.deepEqual(await foto(), antes, "ni Suscriptores, ni Saldos, ni Clientes, ni Pedidos");
  assert.equal(await suscriptorPorEmail("nueva.compradora@ejemplo.com"), null, "no quedó suscripta");

  const visita = await visitaDeLaCuenta({ cuenta: r.abrir.valor }, { abierta: true, ahora: new Date(AHORA) });
  assert.deepEqual(visita, { tipo: "comprador", email: "nueva.compradora@ejemplo.com" });
});

test("Suscriptor del régimen anterior: entra con su sesión de siempre, sin tocar su fila, su cupón ni su saldo", async () => {
  const fila = await createRecord(TABLAS.suscriptores, { Email: "socia@ejemplo.com", Nombre: "Socia", Alta: "2026-10-01T10:00:00.000Z", Acepta_mails: true, Cupon: "Disponible" });
  await createRecord(TABLAS.saldos, { Movimiento: "HARPER-V1 · Cashback", Email: "socia@ejemplo.com", Suscriptor_id: fila.id, Tipo: "Cashback", Monto: 8_091, Pedido: "HARPER-V1", Fecha: "2026-10-05T10:00:00.000Z", Disponible_desde: "2026-11-04" });
  const cuentaAntes = (await suscriptorPorEmail("socia@ejemplo.com"))!;
  const resumenAntes = await resumenDeLaCuenta(cuentaAntes, new Date(AHORA));
  const antes = await foto();

  const r = await entrar("socia@ejemplo.com");

  assert.equal(r.ok && r.estado, "ya");
  assert.equal(r.ok && r.abrir.nombre, COOKIE_SUSCRIPTOR);
  assert.equal(r.ok && r.cerrar, COOKIE_CUENTA);
  assert.deepEqual(await foto(), antes);
  const visita = await visitaDeLaCuenta({ suscriptor: r.ok ? r.abrir.valor : null }, { abierta: true, ahora: new Date(AHORA) });
  assert.equal(visita?.tipo, "suscriptor");
  assert.deepEqual(await resumenDeLaCuenta((await suscriptorPorEmail("socia@ejemplo.com"))!, new Date(AHORA)), resumenAntes);
});

test("Usuario que rechazó las novedades (se dio de baja): entra sin reactivarse ni volver a aceptar mails", async () => {
  await createRecord(TABLAS.suscriptores, { Email: "baja@ejemplo.com", Alta: "2026-10-01T10:00:00.000Z", Acepta_mails: false, Cupon: "Usado", Baja: "2026-10-20T10:00:00.000Z" });
  const antes = await foto();
  const r = await entrar("baja@ejemplo.com");
  assert.equal(r.ok && r.estado, "baja");
  assert.deepEqual(await foto(), antes, "sigue de baja y sin aceptar mails");
  const fila = (await suscriptorPorEmail("baja@ejemplo.com"))!;
  assert.equal(fila.baja, "2026-10-20T10:00:00.000Z");
  assert.equal(fila.aceptaMails, false);
});

test("Código incorrecto o vencido, y el interruptor apagado: no entra", async () => {
  assert.deepEqual(await entrar("x@ejemplo.com", { codigo: "654321" }), { ok: false, status: 400, error: "El código no es correcto o ya venció. Revisalo o pedí otro." });
  // El desafío es de hace 11 minutos (vence a los 10).
  const viejo = conCodigo("x@ejemplo.com", AHORA - 11 * 60_000);
  const r = await entrarALaCuenta(viejo, { claveCodigos: CLAVE, abierta: true, ahora: AHORA });
  assert.equal(r.ok, false);
  // Un desafío de otro mail no sirve para este.
  const ajeno = await entrarALaCuenta({ ...conCodigo("otra@ejemplo.com"), email: "x@ejemplo.com" }, { claveCodigos: CLAVE, abierta: true, ahora: AHORA });
  assert.equal(ajeno.ok, false);
  // Apagado (por defecto en las pruebas): la ruta contesta 404 y no abre nada.
  assert.equal(cuentaConCredito(), false);
  assert.deepEqual(await entrarALaCuenta(conCodigo("x@ejemplo.com"), { claveCodigos: CLAVE, ahora: AHORA }), { ok: false, status: 404, error: "No disponible" });
});

test("Con el interruptor apagado, /api/cuenta/entrar contesta 404 sin gastar la cuota compartida con los suscriptores", async () => {
  const llamadas: string[][] = [];
  const consumirCuota = async (ventanas: { clave: string }[]) => {
    llamadas.push(ventanas.map((v) => v.clave));
    return { excedida: null };
  };
  const peticion = { cuerpo: conCodigo("socia@ejemplo.com"), ip: "200.1.2.3", desdeOtroSitio: false };

  // Apagado (por defecto en las pruebas): 404 y la cuota intacta.
  assert.deepEqual(await atenderEntrada(peticion, { consumirCuota, claveCodigos: CLAVE, ahora: AHORA }), { status: 404, cuerpo: { error: "No disponible" } });
  assert.deepEqual(await atenderEntrada(peticion, { consumirCuota, claveCodigos: CLAVE, abierta: false, ahora: AHORA }), { status: 404, cuerpo: { error: "No disponible" } });
  // Desde otro sitio: 403, tampoco gasta.
  assert.equal((await atenderEntrada({ ...peticion, desdeOtroSitio: true }, { consumirCuota, claveCodigos: CLAVE, abierta: true, ahora: AHORA })).status, 403);
  assert.deepEqual(llamadas, [], "no se tocó la cuota");

  // Prendido: cuenta un intento en las mismas ventanas que /api/suscriptores/confirmar y entra.
  const r = await atenderEntrada(peticion, { consumirCuota, claveCodigos: CLAVE, abierta: true, ahora: AHORA });
  assert.equal(r.status, 200);
  assert.equal(llamadas.length, 1);
  assert.equal(llamadas[0][0], "suscriptor-confirmar-ip:200.1.2.3");
  assert.match(llamadas[0][1], /^suscriptor-confirmar-mail:/);
  // Con la cuota agotada: 429, sin comprobar el código.
  const agotada = await atenderEntrada(peticion, { consumirCuota: async () => ({ excedida: "suscriptor-confirmar-mail" }), claveCodigos: CLAVE, abierta: true, ahora: AHORA });
  assert.equal(agotada.status, 429);
  assert.equal(agotada.sesion, undefined);
});

// ---------- Sesiones ----------

test("Sesión inválida o vencida: alterada, vencida, de otra clase o con el interruptor apagado no abre la cuenta", async () => {
  const clave = claveDeSesionCuenta()!;
  const valor = crearSesionCuenta(clave, "a@ejemplo.com", AHORA);
  assert.deepEqual(leerSesionCuenta(clave, valor, AHORA), { email: "a@ejemplo.com", hasta: AHORA + DURACION_SESION_MS });
  // Vencida.
  assert.equal(leerSesionCuenta(clave, valor, AHORA + DURACION_SESION_MS + 1), null);
  // Alterada: otro mail con la firma vieja.
  const [cuerpo, firma] = valor.split(".");
  const otroCuerpo = Buffer.from(JSON.stringify({ c: "b@ejemplo.com", h: AHORA + DURACION_SESION_MS })).toString("base64url");
  assert.equal(leerSesionCuenta(clave, `${otroCuerpo}.${firma}`, AHORA), null);
  assert.equal(leerSesionCuenta(clave, `${cuerpo}.${firma}x`, AHORA), null);
  assert.equal(leerSesionCuenta(clave, `${cuerpo}.${firma}.extra`, AHORA), null);
  assert.equal(leerSesionCuenta(clave, "basura", AHORA), null);
  // La del suscriptor no sirve como la de la cuenta (otra etiqueta).
  const deSuscriptor = crearSesionSuscriptor(claveDeSesionSuscriptor()!, { suscriptorId: "recAAAAAAAAAAAAAA", email: "a@ejemplo.com" }, AHORA);
  assert.equal(leerSesionCuenta(clave, deSuscriptor, AHORA), null);
  assert.equal(await visitaDeLaCuenta({ cuenta: deSuscriptor }, { abierta: true, ahora: new Date(AHORA) }), null);
  // Y la de la cuenta no sirve como la del suscriptor: el carrito y el checkout no la reconocen.
  assert.equal(await visitaDeLaCuenta({ suscriptor: valor }, { abierta: true, ahora: new Date(AHORA) }), null);
  // Con el interruptor apagado, la cookie de la cuenta no abre nada.
  assert.equal(await visitaDeLaCuenta({ cuenta: valor }, { ahora: new Date(AHORA) }), null);
  assert.equal(await visitaDeLaCuenta({ cuenta: valor }, { abierta: false, ahora: new Date(AHORA) }), null);
  // Un suscriptor cuya fila cambió de mail: la sesión ya no vale.
  const fila = await createRecord(TABLAS.suscriptores, { Email: "cambio@ejemplo.com" });
  const sesion = crearSesionSuscriptor(claveDeSesionSuscriptor()!, { suscriptorId: fila.id, email: "antes@ejemplo.com" }, AHORA);
  assert.equal(await visitaDeLaCuenta({ suscriptor: sesion }, { abierta: true, ahora: new Date(AHORA) }), null);
});

// ---------- La billetera ----------

test("Crédito pendiente, disponible, en revisión y anulado: cada uno en su lugar; un pedido duplicado cuenta una vez", async () => {
  const mail = "billetera@ejemplo.com";
  await credito(mail, "HARPER-B1", { Estado: "Disponible", Monto: 4_495, Porcentaje: 5, Fecha_entrega: "2026-10-01", Disponible_desde: "2026-10-31", Generado_el: "2026-09-28T12:00:00.000Z" });
  await credito(mail, "HARPER-B2", { Estado: "Pendiente", Fecha_entrega: "2026-11-20", Disponible_desde: "2026-12-20", Generado_el: "2026-11-15T12:00:00.000Z" });
  await credito(mail, "HARPER-B2", { Estado: "Pendiente", Generado_el: "2026-11-15T12:00:05.000Z" }); // duplicado: no suma
  await credito(mail, "HARPER-B3", { Estado: "A revisar", Monto: 8_990, Generado_el: "2026-11-01T12:00:00.000Z" });
  await credito(mail, "HARPER-B4", { Estado: "Anulado", Monto: 6_000, Generado_el: "2026-10-10T12:00:00.000Z" });
  await credito(mail, "HARPER-B5", { Estado: "Pendiente", Monto: 2_000, Porcentaje: 5, Incidencia_abierta: true, Generado_el: "2026-12-01T12:00:00.000Z" });
  await credito(mail, "HARPER-B6", { Estado: "Anulado", Monto: 0, Porcentaje: 0, Base: 0, Anteojos: 0 }); // fila que bloquea: no se muestra

  const b = await billeteraDeLaCuenta({ tipo: "comprador", email: mail }, creditosPorEmail, new Date(AHORA));

  assert.equal(b.disponible, 4_495);
  assert.equal(b.pendiente, 15_733 + 2_000);
  assert.equal(b.enRevision, 8_990);
  assert.deepEqual(
    b.movimientos.map((m) => [m.pedido, m.estado, m.monto, m.disponibleDesde, m.conGestionAbierta]),
    [
      ["HARPER-B5", "pendiente", 2_000, null, true],
      ["HARPER-B2", "pendiente", 15_733, "2026-12-20", false],
      ["HARPER-B3", "en-revision", 8_990, null, false],
      ["HARPER-B4", "anulado", 6_000, null, false],
      ["HARPER-B1", "disponible", 4_495, "2026-10-31", false],
    ]
  );
  assert.equal(b.movimientos.find((m) => m.pedido === "HARPER-B1")?.fecha, "2026-09-28", "el día en Buenos Aires");
  // Sin créditos: todo en cero y sin movimientos (eso sí es un $ 0 real).
  assert.deepEqual(await billeteraDeLaCuenta({ tipo: "comprador", email: "sin@ejemplo.com" }, creditosPorEmail, new Date(AHORA)), { disponible: 0, pendiente: 0, enRevision: 0, movimientos: [] });
});

test("Acceso indebido: solo los créditos del mail de la sesión; no sirve otro mail ni uno parecido", async () => {
  await credito("ana@ejemplo.com", "HARPER-A1", { Estado: "Disponible" });
  await credito("Juana.Ana@Ejemplo.com", "HARPER-J1", { Estado: "Disponible", Monto: 9_999 });
  await credito("otra@ejemplo.com", "HARPER-O1", { Estado: "Disponible", Monto: 1_111 });

  const ana = await billeteraDeLaCuenta({ tipo: "comprador", email: "ana@ejemplo.com" }, creditosPorEmail, new Date(AHORA));
  assert.deepEqual(ana.movimientos.map((m) => m.pedido), ["HARPER-A1"]);
  assert.equal(ana.disponible, 15_733);
  // Mayúsculas en Airtable: es el mismo mail.
  const juana = await billeteraDeLaCuenta({ tipo: "comprador", email: "juana.ana@ejemplo.com" }, creditosPorEmail, new Date(AHORA));
  assert.deepEqual(juana.movimientos.map((m) => m.pedido), ["HARPER-J1"]);
  // Aunque la lectura trajera de más, solo cuenta lo del mail de la sesión.
  const todas = (await listRecords<CamposCredito>(TABLAS.creditos, { revalidate: 0 })).map(filaDelRegistro);
  assert.deepEqual(billeteraDeCredito(todas, "ana@ejemplo.com", new Date(AHORA)).movimientos.map((m) => m.pedido), ["HARPER-A1"]);
  // Fórmulas raras: nada.
  assert.deepEqual(await creditosPorEmail("' OR TRUE() OR '"), []);
  assert.deepEqual(await creditosPorEmail(""), []);
  // Una cookie con el mail de otra persona no se puede fabricar sin la clave.
  const falsa = `${Buffer.from(JSON.stringify({ c: "otra@ejemplo.com", h: AHORA + 1_000_000 })).toString("base64url")}.firma-inventada`;
  assert.equal(await visitaDeLaCuenta({ cuenta: falsa }, { abierta: true, ahora: new Date(AHORA) }), null);
  // Y no hay ninguna ruta que reciba un mail del navegador para leer créditos.
  const raiz = path.resolve(__dirname, "..", "..");
  const usos: string[] = [];
  const recorrer = (dir: string) => {
    for (const e of fs.readdirSync(path.join(raiz, dir), { withFileTypes: true })) {
      const rel = path.join(dir, e.name);
      if (e.isDirectory()) recorrer(rel);
      else if (/\.(ts|tsx)$/.test(e.name) && /billeteraDeLaCuenta|creditosPorEmail/.test(fs.readFileSync(path.join(raiz, rel), "utf8"))) usos.push(rel);
    }
  };
  for (const dir of ["app", "components"]) recorrer(dir);
  assert.deepEqual(usos, [path.join("app", "suscriptores", "mi-cuenta", "page.tsx")]);
});

test("Si Airtable no responde, la billetera no da $ 0: falla y la página muestra el error", async () => {
  await credito("ana@ejemplo.com", "HARPER-E1", { Estado: "Disponible" });
  interceptar((ruta, { method }) => {
    if (method === "GET" && ruta.startsWith(TABLAS.creditos)) throw new RespuestaFixture(503, "Airtable caído");
  });
  await assert.rejects(billeteraDeLaCuenta({ tipo: "comprador", email: "ana@ejemplo.com" }, creditosPorEmail, new Date(AHORA)));
  interceptar(null);
  // La página: si falla, la sección recibe null y muestra el aviso (nunca los números).
  const pagina = fs.readFileSync(path.resolve(__dirname, "..", "..", "app", "suscriptores", "mi-cuenta", "page.tsx"), "utf8");
  assert.match(pagina, /return billeteraDeLaCuenta\(visita\)\.catch\(\(error\) => \{[\s\S]*?return null;/);
  const seccion = fs.readFileSync(path.resolve(__dirname, "..", "..", "components", "suscriptores", "MiCreditoHarper.tsx"), "utf8");
  assert.match(seccion, /billetera === null \? \(\s*<p className="suscripcion__error" role="alert">\s*\{T\.error\}/);
});

// ---------- Lo anterior, intacto ----------

test("Saldos anteriores intactos: el saldo de Suscriptores no cambia ni se mezcla con el Crédito Harper", async () => {
  const fila = await createRecord(TABLAS.suscriptores, { Email: "dos@ejemplo.com", Alta: "2026-10-01T10:00:00.000Z", Acepta_mails: true, Cupon: "Usado", Cupon_pedido: "HARPER-V0" });
  await createRecord(TABLAS.saldos, { Movimiento: "HARPER-V1 · Cashback", Email: "dos@ejemplo.com", Suscriptor_id: fila.id, Tipo: "Cashback", Monto: 8_091, Pedido: "HARPER-V1", Fecha: "2026-10-05T10:00:00.000Z", Disponible_desde: "2026-11-04" });
  await createRecord(TABLAS.saldos, { Movimiento: "HARPER-V2 · Cashback", Email: "dos@ejemplo.com", Suscriptor_id: fila.id, Tipo: "Cashback", Monto: 4_000, Pedido: "HARPER-V2", Fecha: "2026-12-01T10:00:00.000Z", Disponible_desde: "2026-12-31" });
  await createRecord(TABLAS.saldos, { Movimiento: "HARPER-V3 · Uso", Email: "dos@ejemplo.com", Suscriptor_id: fila.id, Tipo: "Uso", Monto: -2_000, Pedido: "HARPER-V3", Fecha: "2026-11-10T10:00:00.000Z" });
  await credito("dos@ejemplo.com", "HARPER-N1", { Estado: "Disponible", Monto: 15_733 });
  const cuenta = (await suscriptorPorEmail("dos@ejemplo.com"))!;
  const antes = await foto();
  const escrituras = anotarEscrituras();

  const resumen = await resumenDeLaCuenta(cuenta, new Date(AHORA));
  const billetera = await billeteraDeLaCuenta({ tipo: "suscriptor", email: cuenta.email, cuenta }, creditosPorEmail, new Date(AHORA));

  assert.equal(resumen.saldoDisponible, 8_091 - 2_000, "el saldo de siempre, con sus reglas");
  assert.equal(resumen.saldoEnCamino, 4_000);
  assert.equal(billetera.disponible, 15_733, "el crédito, aparte");
  assert.deepEqual(billetera.movimientos.map((m) => m.pedido), ["HARPER-N1"], "ningún movimiento de Saldos en la billetera");
  assert.deepEqual(escrituras, []);
  assert.deepEqual(await foto(), antes);
});

test("Compatibilidad: Mis compras funciona con el mail del comprador; favoritos, datos y beneficios siguen solo con la sesión del suscriptor", async () => {
  const pedido = await createRecord(TABLAS.pedidos, { Numero: "HARPER-C1", Estado: "pagado", MP_status: "approved", Total: 89_900, Envio: 0, Fecha: "2026-11-20T10:00:00.000Z", Items: JSON.stringify([{ productoSlug: "citrino", nombre: "CITRINO", categoria: "Anteojos", sku: "CITRINO-NEGRO", color: "Negro", cantidad: 1, subtotal: 89_900, precioUnitario: 89_900 }]) });
  const cliente = await createRecord(TABLAS.clientes, { Email: "Compradora@Ejemplo.com", Pedidos: [pedido.id] });
  await updateRecord(TABLAS.pedidos, pedido.id, { Cliente: [cliente.id] });
  assert.deepEqual((await comprasDeLaCuenta("compradora@ejemplo.com")).map((c) => c.numero), ["HARPER-C1"]);

  // Las rutas de favoritos, datos y direcciones, el carrito y el checkout solo reconocen la sesión del suscriptor.
  const raiz = path.resolve(__dirname, "..", "..");
  const leer = (...p: string[]) => fs.readFileSync(path.join(raiz, ...p), "utf8");
  for (const ruta of ["favoritos", "datos", "direcciones"]) {
    const texto = leer("app", "api", "suscriptores", ruta, "route.ts");
    assert.match(texto, /suscriptorDeLaPeticion/, ruta);
    assert.doesNotMatch(texto, /COOKIE_CUENTA|harper_cuenta/, ruta);
  }
  const usanLaCuenta: string[] = [];
  const recorrer = (dir: string) => {
    for (const e of fs.readdirSync(path.join(raiz, dir), { withFileTypes: true })) {
      const rel = path.join(dir, e.name);
      if (e.isDirectory()) recorrer(rel);
      else if (/\.(ts|tsx)$/.test(e.name) && /COOKIE_CUENTA|harper_cuenta/.test(leer(rel))) usanLaCuenta.push(rel);
    }
  };
  for (const dir of ["app", "components", "lib"]) recorrer(dir);
  // (La ruta de entrada pone la cookie que le dice lib/credito-cuenta.ts.)
  assert.deepEqual(usanLaCuenta.sort(), [
    path.join("app", "api", "suscriptores", "salir", "route.ts"),
    path.join("app", "suscriptores", "mi-cuenta", "page.tsx"),
    path.join("lib", "credito-cuenta.ts"),
    path.join("lib", "suscriptores-sesion.ts"),
  ]);
  // La entrada a la cuenta no da de alta: no llama a darDeAlta ni escribe en Airtable.
  const entrada = leer("lib", "credito-cuenta.ts") + leer("app", "api", "cuenta", "entrar", "route.ts");
  assert.doesNotMatch(entrada, /darDeAlta|createRecord|updateRecord|enviarMail/);
  // Y la página muestra el crédito y abre la cuenta del comprador solo con el interruptor.
  const pagina = leer("app", "suscriptores", "mi-cuenta", "page.tsx");
  assert.match(pagina, /const conCredito = cuentaConCredito\(\);/);
  assert.match(pagina, /\{ abierta: conCredito \}/);
  assert.match(pagina, /\.\.\.\(conCredito \? \[seccionCredito\(billetera\)\] : \[\]\)/);
  assert.match(leer("app", "api", "cuenta", "entrar", "route.ts"), /atenderEntrada\(/);
});
