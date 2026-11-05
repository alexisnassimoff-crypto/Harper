import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

process.env.HARPER_FIXTURES = "1";
process.env.MP_WEBHOOK_SECRET = "secreto-de-prueba";
delete process.env.VERCEL;

import { getRecord, TABLAS } from "../lib/airtable";
import { SUSCRIPTOR_ANA, SUSCRIPTOR_BETO } from "../lib/fixtures/datos";
import { interceptar, reiniciar, RespuestaFixture } from "../lib/fixtures/servidor";
import {
  cambiarDirecciones,
  direccionParaElCheckout,
  escribirDirecciones,
  leerCambioDeDireccion,
  leerDatosPersonales,
  leerDireccion,
  leerDirecciones,
  MAXIMO_DIRECCIONES,
  renglonesDeDireccion,
  type DireccionGuardada,
  type DireccionNueva,
} from "../lib/mis-datos";
import { guardarCambioDeDireccion, guardarDatosPersonales, misDatos } from "../lib/mis-datos-servidor";
import { suscriptorDeLaPeticion, suscriptorDeLaSesion, suscriptorPorId } from "../lib/suscriptores-cuenta";
import { claveDeSesionSuscriptor, COOKIE_SUSCRIPTOR, crearSesionSuscriptor } from "../lib/suscriptores-sesion";

/** «Mis datos» y «Mis direcciones» de Mi cuenta Harper (Ale, 05/11/2026). */

let escrituras: { path: string; campos: Record<string, unknown> }[] = [];

beforeEach(() => {
  reiniciar();
  escrituras = [];
  interceptar((path, { method, body }) => {
    if (method === "PATCH" || method === "POST") escrituras.push({ path, campos: JSON.parse(body ?? "{}").fields ?? {} });
  });
});

const manual = (extra: Partial<DireccionNueva> = {}): DireccionNueva => ({
  alias: "",
  direccion: "San Martín 450",
  piso: "",
  ciudad: "Rosario",
  provincia: "Santa Fe",
  cp: "2000",
  ...extra,
});
const ids = (lista: DireccionGuardada[]) => lista.map((d) => `${d.id}${d.principal ? "*" : ""}`);
const contador = () => {
  let n = 0;
  return () => `dnueva${String(++n).padStart(3, "0")}`;
};

test("mis datos: nombre obligatorio; teléfono y DNI opcionales, con las reglas del checkout", () => {
  assert.deepEqual(leerDatosPersonales({ nombre: "  Ana  Pérez ", telefono: "11 5555-1234", dni: "30.123.456" }), {
    datos: { nombre: "Ana Pérez", telefono: "11 5555-1234", dni: "30123456" },
  });
  assert.deepEqual(leerDatosPersonales({ nombre: "Ana Pérez", telefono: "", dni: "" }), { datos: { nombre: "Ana Pérez", telefono: "", dni: "" } });
  const mal = leerDatosPersonales({ nombre: "A", telefono: "llamame", dni: "123" });
  assert.ok("errores" in mal);
  assert.deepEqual(Object.keys(mal.errores).sort(), ["dni", "nombre", "telefono"]);
  assert.ok("errores" in leerDatosPersonales({ nombre: "Ana Pérez", telefono: "1234" }), "un teléfono de menos de 8 números no");
  assert.ok("errores" in leerDatosPersonales(null));
  // El mail no se cambia desde acá: ni viaja.
  const conMail = leerDatosPersonales({ nombre: "Ana Pérez", email: "otra@ejemplo.com" });
  assert.ok("datos" in conMail && !("email" in conMail.datos));
});

test("direcciones: a mano o del buscador, con calle y número, localidad, provincia y CP", () => {
  assert.deepEqual(leerDireccion({ alias: "Trabajo", direccion: "San Martín 450", ciudad: "Rosario", provincia: "Santa Fe", cp: "2000" }), {
    direccion: manual({ alias: "Trabajo" }),
  });
  const incompleta = leerDireccion({ direccion: "S", ciudad: "", provincia: "Narnia", cp: "12" });
  assert.ok("errores" in incompleta);
  assert.deepEqual(Object.keys(incompleta.errores).sort(), ["ciudad", "cp", "direccion", "provincia"]);

  // Del buscador: la calle y el número salen de Google (y del número que completó la persona).
  const deGoogle = leerDireccion({
    piso: "5° B",
    ciudad: "Buenos Aires",
    provincia: "Ciudad Autónoma de Buenos Aires",
    cp: "1426",
    direccion: "esto no se usa",
    lugar: { id: "ChIJabc123", calle: "Av. Cabildo", numero: "1234", barrio: "Belgrano", partido: "", texto: "Av. Cabildo 1234, Belgrano" },
  });
  assert.ok("direccion" in deGoogle);
  assert.equal(deGoogle.direccion.direccion, "Av. Cabildo 1234");
  assert.equal(deGoogle.direccion.lugar?.id, "ChIJabc123");
  const sinNumero = leerDireccion({ ciudad: "Buenos Aires", provincia: "Ciudad Autónoma de Buenos Aires", cp: "1426", lugar: { id: "ChIJabc123", calle: "Av. Cabildo", numero: "" } });
  assert.deepEqual("errores" in sinNumero && sinNumero.errores, { direccion: "Completá el número de la calle" });
  // Un id de lugar raro no es del buscador: se lee como cargada a mano.
  const raro = leerDireccion({ ...manual(), lugar: { id: "<script>", calle: "X" } });
  assert.ok("direccion" in raro && !raro.direccion.lugar);
  // Sin etiquetas ni saltos de línea.
  const sucia = leerDireccion({ ...manual(), alias: "<b>Casa</b>\n" });
  assert.ok("direccion" in sucia && sucia.direccion.alias === "b Casa /b");
});

test("direcciones: la lista guardada se lee con una sola principal, primero, y sin lo que no se entiende", () => {
  const guardada = escribirDirecciones([
    { id: "daaaaaaa1", principal: false, ...manual() },
    { id: "dbbbbbbb2", principal: true, ...manual({ direccion: "Mitre 100", cp: "2000" }) },
    { id: "dcccccc3", principal: true, ...manual({ direccion: "Corto" }) }, // id mal formado
  ]);
  assert.deepEqual(ids(leerDirecciones(guardada)), ["dbbbbbbb2*", "daaaaaaa1"]);
  assert.deepEqual(leerDirecciones("no es json"), []);
  assert.deepEqual(leerDirecciones(undefined), []);
  assert.deepEqual(leerDirecciones(JSON.stringify([{ id: "dzzzzzzz9", direccion: "Sin localidad 1", provincia: "Santa Fe", cp: "2000" }])), []);
  // Sin ninguna marcada, la primera es la principal; y nunca más de cinco.
  const muchas = Array.from({ length: 8 }, (_, i) => ({ id: `dlista00${i}`, principal: false, ...manual({ direccion: `Calle ${i}00` }) }));
  const leidas = leerDirecciones(JSON.stringify(muchas));
  assert.equal(leidas.length, MAXIMO_DIRECCIONES);
  assert.equal(leidas.filter((d) => d.principal).length, 1);
  assert.equal(leidas[0].id, "dlista000");
});

test("direcciones: agregar, principal, editar y eliminar dejan siempre una principal", () => {
  const nuevoId = contador();
  let r = cambiarDirecciones([], { accion: "agregar", direccion: manual(), principal: false }, nuevoId);
  assert.equal(r.estado, "ok");
  let lista = r.estado === "ok" ? r.direcciones : [];
  assert.deepEqual(ids(lista), ["dnueva001*"], "la primera es la principal aunque no se marque");

  r = cambiarDirecciones(lista, { accion: "agregar", direccion: manual({ direccion: "Mitre 100" }), principal: false }, nuevoId);
  lista = r.estado === "ok" ? r.direcciones : lista;
  assert.deepEqual(ids(lista), ["dnueva001*", "dnueva002"]);

  r = cambiarDirecciones(lista, { accion: "agregar", direccion: manual({ direccion: "Belgrano 300" }), principal: true }, nuevoId);
  lista = r.estado === "ok" ? r.direcciones : lista;
  assert.deepEqual(ids(lista), ["dnueva003*", "dnueva001", "dnueva002"], "la nueva principal va primero");

  assert.deepEqual(cambiarDirecciones(lista, { accion: "agregar", direccion: manual({ direccion: "san martín  450" }), principal: false }, nuevoId), { estado: "repetida" });

  r = cambiarDirecciones(lista, { accion: "principal", id: "dnueva002" });
  lista = r.estado === "ok" ? r.direcciones : lista;
  assert.deepEqual(ids(lista), ["dnueva002*", "dnueva003", "dnueva001"]);

  // Editar la principal sin marcarla: sigue siéndolo.
  r = cambiarDirecciones(lista, { accion: "editar", id: "dnueva002", direccion: manual({ direccion: "Mitre 102", alias: "Casa" }), principal: false });
  lista = r.estado === "ok" ? r.direcciones : lista;
  assert.equal(lista[0].direccion, "Mitre 102");
  assert.equal(lista[0].principal, true);
  assert.deepEqual(cambiarDirecciones(lista, { accion: "editar", id: "dnueva003", direccion: manual({ direccion: "Mitre 102" }), principal: false }), { estado: "repetida" });

  // Eliminar la principal: pasa a serlo la que sigue.
  r = cambiarDirecciones(lista, { accion: "eliminar", id: "dnueva002" });
  lista = r.estado === "ok" ? r.direcciones : lista;
  assert.deepEqual(ids(lista), ["dnueva003*", "dnueva001"]);
  assert.deepEqual(cambiarDirecciones(lista, { accion: "eliminar", id: "dnoexiste" }), { estado: "no-existe" });

  // Hasta cinco.
  for (let i = 0; i < 3; i++) {
    r = cambiarDirecciones(lista, { accion: "agregar", direccion: manual({ direccion: `Otra ${i}00` }), principal: false }, nuevoId);
    lista = r.estado === "ok" ? r.direcciones : lista;
  }
  assert.equal(lista.length, MAXIMO_DIRECCIONES);
  assert.deepEqual(cambiarDirecciones(lista, { accion: "agregar", direccion: manual({ direccion: "Una más 1" }), principal: false }, nuevoId), { estado: "tope" });
});

test("direcciones: el pedido a la ruta tiene que ser una acción conocida, con id válido", () => {
  assert.equal(leerCambioDeDireccion(null), null);
  assert.equal(leerCambioDeDireccion({ accion: "borrar-todo" }), null);
  assert.equal(leerCambioDeDireccion({ accion: "eliminar", id: "' OR 1=1" }), null);
  assert.equal(leerCambioDeDireccion({ accion: "editar", direccion: manual() }), null, "editar sin id");
  assert.deepEqual(leerCambioDeDireccion({ accion: "principal", id: "dcasa0001" }), { accion: "principal", id: "dcasa0001" });
  const incompleta = leerCambioDeDireccion({ accion: "agregar", direccion: { direccion: "Mitre 100" } });
  assert.ok(incompleta && "errores" in incompleta);
  assert.deepEqual(leerCambioDeDireccion({ accion: "agregar", direccion: manual(), principal: true }), { accion: "agregar", direccion: manual(), principal: true });
});

test("direcciones: en el checkout, la del buscador vuelve elegida y la de a mano a los campos, con el piso", () => {
  const ana = leerDireccion({
    piso: "5° B",
    ciudad: "Buenos Aires",
    provincia: "Ciudad Autónoma de Buenos Aires",
    cp: "1426",
    lugar: { id: "ChIJabc123", calle: "Av. Cabildo", numero: "1234", barrio: "Belgrano", partido: "", texto: "Av. Cabildo 1234" },
  });
  assert.ok("direccion" in ana);
  const uso = direccionParaElCheckout(ana.direccion);
  assert.equal(uso.modo, "buscador");
  assert.deepEqual(uso.modo === "buscador" && [uso.elegida.id, uso.elegida.calle, uso.elegida.numero, uso.elegida.localidad, uso.piso], ["ChIJabc123", "Av. Cabildo", "1234", "Buenos Aires", "5° B"]);
  assert.deepEqual(direccionParaElCheckout(manual({ piso: "2° A" })), { modo: "manual", direccion: "San Martín 450, 2° A", ciudad: "Rosario", provincia: "Santa Fe", cp: "2000" });
  assert.deepEqual(renglonesDeDireccion(ana.direccion), ["Av. Cabildo 1234, 5° B", "Belgrano, CABA · CP 1426"]);
  assert.deepEqual(renglonesDeDireccion(manual({ ciudad: "Córdoba", provincia: "Córdoba", cp: "5000" })), ["San Martín 450", "Córdoba · CP 5000"]);
});

/** La cuenta de la sesión, como la lee la ruta: la cookie firmada, releída de Airtable. */
const cuentaDe = async (id: string, email: string) => (await suscriptorDeLaSesion(crearSesionSuscriptor(claveDeSesionSuscriptor()!, { suscriptorId: id, email })))!;

test("mis datos: solo con la sesión verificada; con un mail escrito o una cookie falsa, nada", async () => {
  const pedir = (cookie?: string) => new Request("https://harper.ar/api/suscriptores/datos", { headers: cookie ? { cookie: `${COOKIE_SUSCRIPTOR}=${cookie}` } : {} });
  assert.equal(await suscriptorDeLaPeticion(pedir()), null);
  assert.equal(await suscriptorDeLaPeticion(pedir("v1.recSUSCANA0000001.ana@ejemplo.com.9999999999999.firma")), null);
  const otraClave = crearSesionSuscriptor(Buffer.from("otra-clave-de-32-caracteres-minimo-xx"), { suscriptorId: SUSCRIPTOR_ANA, email: "ana@ejemplo.com" });
  assert.equal(await suscriptorDeLaPeticion(pedir(otraClave)), null);
  // La firma de Ana con otro mail no coincide con la fila.
  assert.equal(await suscriptorDeLaSesion(crearSesionSuscriptor(claveDeSesionSuscriptor()!, { suscriptorId: SUSCRIPTOR_ANA, email: "beto@ejemplo.com" })), null);

  const ana = await cuentaDe(SUSCRIPTOR_ANA, "ana@ejemplo.com");
  const vista = await misDatos(ana, async () => assert.fail("con todo guardado, no hace falta leer la última compra"));
  assert.deepEqual(vista.datos, { nombre: "Ana Pérez", email: "ana@ejemplo.com", telefono: "11 5555 1234", dni: "30123456" });
  assert.deepEqual(vista.deLaUltimaCompra, []);
  assert.deepEqual(ids(vista.direcciones), ["dcasa0001*", "dtrab0002"]);
  assert.equal(vista.sugerida, null);
});

test("mis datos: lo que falta en la cuenta sale de la última compra de ese mail, marcado, y la dirección se sugiere", async () => {
  const beto = await cuentaDe(SUSCRIPTOR_BETO, "beto@ejemplo.com");
  const pedidosA: string[] = [];
  const vista = await misDatos(beto, async (email) => {
    pedidosA.push(email);
    return { email, nombre: "Roberto Gómez", telefono: "11 4444 0000", dni: "28.111.222", direccion: "Mitre 100, 3° A", ciudad: "Rosario", provincia: "Santa Fe", cp: "2000" };
  });
  assert.deepEqual(pedidosA, ["beto@ejemplo.com"], "solo con el mail de la sesión");
  assert.deepEqual(vista.datos, { nombre: "Beto Gómez", email: "beto@ejemplo.com", telefono: "11 4444 0000", dni: "28111222" }, "el nombre guardado manda");
  assert.deepEqual(vista.deLaUltimaCompra, ["telefono", "dni"]);
  assert.deepEqual(vista.sugerida, manual({ direccion: "Mitre 100, 3° A" }));

  // Si Airtable no deja leer la compra, la cuenta se muestra igual.
  const sinCompra = await misDatos(beto, async () => {
    throw new Error("Airtable caído");
  });
  assert.deepEqual(sinCompra.datos, { nombre: "Beto Gómez", email: "beto@ejemplo.com", telefono: "", dni: "" });
  assert.equal(sinCompra.sugerida, null);
});

test("mis datos: guardar escribe solo nombre, teléfono y DNI en la fila de la sesión; ni pedidos ni clientes", async () => {
  const beto = await cuentaDe(SUSCRIPTOR_BETO, "beto@ejemplo.com");
  const leido = leerDatosPersonales({ nombre: "Beto Gómez", telefono: "341 555 0000", dni: "28111222" });
  assert.ok("datos" in leido);
  assert.deepEqual(await guardarDatosPersonales(beto, leido.datos), { nombre: "Beto Gómez", telefono: "341 555 0000", dni: "28111222", email: "beto@ejemplo.com" });
  assert.equal(escrituras.length, 1);
  assert.ok(escrituras[0].path.includes(SUSCRIPTOR_BETO));
  assert.ok(escrituras[0].path.startsWith(encodeURIComponent(TABLAS.suscriptores)));
  assert.deepEqual(Object.keys(escrituras[0].campos).sort(), ["DNI", "Nombre", "Telefono"]);
  const fila = (await getRecord<{ Telefono?: string }>(TABLAS.suscriptores, SUSCRIPTOR_BETO)).fields;
  assert.equal(fila.Telefono, "341 555 0000");
  // La de Ana no se tocó.
  assert.equal((await suscriptorPorId(SUSCRIPTOR_ANA))!.telefono, "11 5555 1234");
});

test("mis direcciones: cada cambio escribe solo «Direcciones» de esa cuenta y vuelve a leerse igual", async () => {
  const ana = await cuentaDe(SUSCRIPTOR_ANA, "ana@ejemplo.com");
  const r = await guardarCambioDeDireccion(ana, { accion: "principal", id: "dtrab0002" });
  assert.equal(r.estado, "ok");
  assert.deepEqual(escrituras.map((e) => Object.keys(e.campos)), [["Direcciones"]]);
  assert.ok(escrituras[0].path.includes(SUSCRIPTOR_ANA));
  const releida = await suscriptorPorId(SUSCRIPTOR_ANA);
  assert.deepEqual(ids(releida!.direcciones), ["dtrab0002*", "dcasa0001"]);
  assert.equal(releida!.direcciones[1].lugar?.id, "ChIJprueba-cabildo-1234", "la del buscador conserva su lugar");

  // Lo que no cambia nada no escribe.
  escrituras = [];
  assert.deepEqual(await guardarCambioDeDireccion(releida!, { accion: "eliminar", id: "dnoexiste" }), { estado: "no-existe" });
  assert.deepEqual(escrituras, []);
});

test("mis direcciones: si falta el campo en Airtable, el error sube y la cuenta se sigue leyendo", async () => {
  interceptar((_path, { method }) => {
    if (method === "PATCH") throw new RespuestaFixture(422, JSON.stringify({ error: { type: "UNKNOWN_FIELD_NAME", message: 'Unknown field name: "Direcciones"' } }));
  });
  const beto = await cuentaDe(SUSCRIPTOR_BETO, "beto@ejemplo.com");
  assert.deepEqual(beto.direcciones, []);
  assert.equal(beto.telefono, "");
  await assert.rejects(guardarCambioDeDireccion(beto, { accion: "agregar", direccion: manual(), principal: false }), /422/);
});
