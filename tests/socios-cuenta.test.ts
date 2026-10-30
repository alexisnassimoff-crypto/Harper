import { test } from "node:test";
import assert from "node:assert/strict";

// El socio que entra con su mail (Ale, 30/10/2026): la sesión firmada, el
// envío gratis, el segundo par incluido y el canje sin pago, contra el
// Airtable de prueba.
process.env.HARPER_FIXTURES = "1";
process.env.MP_WEBHOOK_SECRET = "secreto-de-prueba";
delete process.env.VERCEL;

import { listRecords, TABLAS, updateRecord } from "../lib/airtable";
import type { Cerrojo } from "../lib/cerrojo";
import { getConfig } from "../lib/config";
import { getProductos } from "../lib/catalogo";
import { resolverCarrito } from "../lib/pedidos";
import { SLUG_SOCIO } from "../lib/socios";
import { registrarSocio } from "../lib/socios-alta";
import { confirmarCanjeSinPago } from "../lib/socios-canje";
import { canjePendiente, registrarCanje, socioDeLaSesion, socioParaElCarrito, socioPorEmail, socioPorId } from "../lib/socios-cuenta";
import { claveDeSesionSocio, crearSesionSocio, leerCookie, leerSesionSocio } from "../lib/socios-sesion";

const AHORA = new Date("2026-10-30T15:00:00Z");
const items = [
  { productoSlug: SLUG_SOCIO, categoria: "Membresía" as const },
  { productoSlug: "citrino", categoria: "Anteojos" as const },
];

async function nuevoSocio(numeroPedido: string, email: string) {
  await registrarSocio({ numeroPedido, items, cliente: { nombre: "Ana Pérez", email, telefono: "1144445555" }, ahora: AHORA });
  return (await socioPorEmail(email, AHORA))!;
}

async function par(slug = "citrino", cantidad = 1) {
  const productos = await getProductos();
  const variante = productos.find((p) => p.slug === slug)!.variantes.find((v) => !v.agotada)!;
  return { productoSlug: slug, varianteId: variante.id, cantidad };
}

test("la sesión: firmada, con vencimiento y sin poder fabricarla", () => {
  const clave = claveDeSesionSocio()!;
  const valor = crearSesionSocio(clave, { socioId: "recFIX00000000001", email: "ana@ejemplo.com" }, 1_000);
  assert.deepEqual(leerSesionSocio(clave, valor, 2_000), { socioId: "recFIX00000000001", email: "ana@ejemplo.com", hasta: 1_000 + 30 * 24 * 60 * 60_000 });
  // Vencida, tocada o con otra clave: no sirve.
  assert.equal(leerSesionSocio(clave, valor, 1_000 + 31 * 24 * 60 * 60_000), null);
  const [cuerpo, firma] = valor.split(".");
  const otro = Buffer.from(JSON.stringify({ s: "recFIX00000000002", e: "ana@ejemplo.com", h: 9e15 })).toString("base64url");
  assert.equal(leerSesionSocio(clave, `${otro}.${firma}`, 2_000), null);
  assert.equal(leerSesionSocio(Buffer.from("otra clave"), valor, 2_000), null);
  assert.equal(leerSesionSocio(clave, `${cuerpo}.${firma}.x`, 2_000), null);
  // No dura más que la membresía.
  assert.equal(leerSesionSocio(clave, crearSesionSocio(clave, { socioId: "recFIX00000000001", email: "a@b.c" }, 1_000, 5_000), 6_000), null);
  assert.equal(leerCookie("otra=1; harper_socio=abc%3D.def; x=2", "harper_socio"), "abc=.def");
  assert.equal(leerCookie(null, "harper_socio"), null);
});

test("un socio reconocido: envío gratis y el segundo par incluido; ya canjeado, solo el envío", async () => {
  const socio = await nuevoSocio("H-CUENTA-1", "uno@ejemplo.com");
  assert.ok(canjePendiente(socio));

  const solo = await resolverCarrito([await par()], { socio: socioParaElCarrito(socio) });
  assert.deepEqual([solo.subtotal, solo.envio, solo.total], [0, 0, 0]);
  assert.deepEqual(solo.items[0].canje, { socioId: socio.id, numero: socio.numero });
  assert.deepEqual(solo.socio, { numero: socio.numero, plan: "Socio", canjePendiente: true, canje: true });

  // Dos pares: uno va incluido, el otro se paga; el envío sigue gratis.
  const dos = await resolverCarrito([await par("citrino", 2)], { socio: socioParaElCarrito(socio) });
  assert.deepEqual([dos.subtotal, dos.envio], [89900, 0]);

  // Sin sesión, el mismo par se paga con su envío.
  const sinSocio = await resolverCarrito([await par()]);
  assert.equal(sinSocio.subtotal, 89900);
  assert.equal(sinSocio.items[0].canje, undefined);

  // Ya canjeado: no hay par incluido, pero el envío sigue gratis.
  await registrarCanje({ socioId: socio.id, numeroPedido: "H-CANJE-1" });
  const despues = (await socioPorId(socio.id))!;
  const otra = await resolverCarrito([await par()], { socio: socioParaElCarrito(despues) });
  assert.deepEqual([otra.subtotal, otra.envio], [89900, 0]);
  assert.equal(otra.socio?.canje, false);
});

test("el canje se anota una sola vez: el mismo pedido es idempotente y otro pedido es conflicto", async () => {
  const socio = await nuevoSocio("H-CUENTA-2", "dos@ejemplo.com");
  const primero = await registrarCanje({ socioId: socio.id, numeroPedido: "H-A" });
  assert.equal(primero.estado, "registrado");
  assert.equal((await registrarCanje({ socioId: socio.id, numeroPedido: "H-A" })).estado, "ya");
  const otro = await registrarCanje({ socioId: socio.id, numeroPedido: "H-B" });
  assert.equal(otro.estado, "conflicto");
  const fila = (await socioPorId(socio.id))!;
  assert.deepEqual([fila.segundoPar, fila.segundoParPedido], ["Pedido", "H-A"]);
  assert.equal((await registrarCanje({ socioId: "recFIX99999999999", numeroPedido: "H-C" })).estado, "sin-socio");
});

test("la sesión vale si la fila existe, con el mismo mail y la membresía vigente", async () => {
  const clave = claveDeSesionSocio()!;
  const socio = await nuevoSocio("H-CUENTA-3", "tres@ejemplo.com");
  const valor = crearSesionSocio(clave, { socioId: socio.id, email: "tres@ejemplo.com" }, AHORA.getTime());
  assert.equal((await socioDeLaSesion(valor, AHORA))?.numero, socio.numero);

  // Le cambiaron el mail en Airtable: esa sesión ya no sirve.
  await updateRecord(TABLAS.socios, socio.id, { Email: "otro@ejemplo.com" });
  assert.equal(await socioDeLaSesion(valor, AHORA), null);
  await updateRecord(TABLAS.socios, socio.id, { Email: "tres@ejemplo.com" });

  // Vencida la membresía, tampoco (y por mail no aparece).
  assert.equal(await socioDeLaSesion(valor, new Date("2027-11-01T12:00:00Z")), null);
  assert.equal(await socioPorEmail("tres@ejemplo.com", new Date("2027-11-01T12:00:00Z")), null);
  assert.equal((await socioPorEmail("TRES@ejemplo.com", AHORA))?.id, socio.id);
});

/** Un cerrojo en memoria, como Redis. */
function cerrojoEnMemoria(): Cerrojo & { tomadas: Set<string> } {
  const tomadas = new Set<string>();
  return {
    tomadas,
    async tomar(clave) {
      if (tomadas.has(clave)) return false;
      tomadas.add(clave);
      return true;
    },
    async soltar(clave) {
      tomadas.delete(clave);
    },
  };
}

test("el canje sin pago: un pedido pagado, el canje anotado y el stock descontado; la segunda vez no", async () => {
  const socio = await nuevoSocio("H-CUENTA-4", "cuatro@ejemplo.com");
  const carrito = await resolverCarrito([await par()], { socio: socioParaElCarrito(socio), paraCobrar: true });
  const stockAntes = carrito.items[0].stockDisponible;
  const config = await getConfig();
  const cerrojo = cerrojoEnMemoria();
  const anulados: string[] = [];
  const confirmar = (numero: string) =>
    confirmarCanjeSinPago({
      socio,
      numero,
      clienteId: "recFIXCLIENTE0001",
      crearPedido: async () => {
        const { createRecord } = await import("../lib/airtable");
        return createRecord(TABLAS.pedidos, { Numero: numero, Estado: "pagado", Total: 0, Items: JSON.stringify(carrito.items) });
      },
      anularPedido: async (id) => {
        anulados.push(id);
      },
      datosMail: {
        numero,
        items: carrito.items,
        subtotal: 0,
        envio: 0,
        total: 0,
        cliente: { email: "cuatro@ejemplo.com", nombre: "Ana", telefono: "1", dni: "1", direccion: "x", ciudad: "x", provincia: "x", cp: "1", aceptaPromos: false },
        config,
        sitio: "https://harper.ar",
      },
      cerrojo,
    });

  assert.deepEqual(await confirmar("H-CANJE-SIN-PAGO"), { ok: true });
  assert.equal(cerrojo.tomadas.size, 0, "suelta el cerrojo");
  const fila = (await socioPorId(socio.id))!;
  assert.deepEqual([fila.segundoPar, fila.segundoParPedido], ["Pedido", "H-CANJE-SIN-PAGO"]);
  const despues = await resolverCarrito([await par()]);
  assert.equal(despues.items[0].stockDisponible, stockAntes - 1);

  // Otra vez (otra pestaña, o volvió atrás): no se canjea dos veces.
  const segunda = await confirmar("H-CANJE-OTRO");
  assert.equal(segunda.ok, false);
  assert.equal(segunda.ok === false && segunda.status, 409);
  const pedidos = await listRecords<{ Numero?: string }>(TABLAS.pedidos, { filterByFormula: `{Numero} = 'H-CANJE-OTRO'` });
  assert.equal(pedidos.length, 0, "ni siquiera crea el pedido");

  // Con el cerrojo tomado por otra confirmación en curso, espera.
  const otro = await nuevoSocio("H-CUENTA-5", "cinco@ejemplo.com");
  cerrojo.tomadas.add(`harper:socio:${otro.id}`);
  const ocupado = await confirmarCanjeSinPago({
    socio: otro,
    numero: "H-OCUPADO",
    clienteId: "x",
    crearPedido: async () => assert.fail("no tiene que crear el pedido"),
    anularPedido: async () => {},
    datosMail: { numero: "H-OCUPADO", items: [], subtotal: 0, envio: 0, total: 0, cliente: { email: "", nombre: "", telefono: "", dni: "", direccion: "", ciudad: "", provincia: "", cp: "", aceptaPromos: false }, config, sitio: "" },
    cerrojo,
  });
  assert.equal(ocupado.ok === false && ocupado.status, 409);
  assert.equal(anulados.length, 0);
});
