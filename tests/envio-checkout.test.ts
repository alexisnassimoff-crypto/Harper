import { test } from "node:test";
import assert from "node:assert/strict";

process.env.HARPER_FIXTURES = "1";
process.env.ENVIA_TOKEN = "token-de-prueba";
// Los mínimos de producción: gratis en AMBA desde $ 60.000 y en todo el país desde $ 150.000.
process.env.HARPER_FIXTURES_ENVIO_GRATIS_DESDE = "150000";
process.env.HARPER_FIXTURES_ENVIO_GRATIS_AMBA_DESDE = "60000";

import { camposDeEnvio, notaDeEnvio } from "../lib/envio-pedido";
import { firmarComprobante, leerComprobante } from "../lib/cotizacion-envio";
import { cotizacionParaComprador } from "../lib/envio-gratis";
import { claveDeComprobantes, entornoEnvia, vaciarCacheEnvia } from "../lib/envia";
import { resolverCarrito } from "../lib/pedidos";

/**
 * El envío de punta a punta en el servidor, con el catálogo de prueba y un
 * Envia de mentira (se intercepta `fetch` solo para api.envia.com). La
 * tarifa plana del catálogo de prueba es $ 10.100.
 *
 * El reparto de AMBA (rueddo) cotiza solo en los CP que empiezan con 1
 * (Ciudad y alrededores); Andreani y Correo Argentino, en todo el país.
 */

const CITRINO_NEGRO = "rec5h3kW0JBY8Wd7y"; // $ 89.900
const M500 = "recMyVTEzcVtTh64g"; // estuche, $ 8.990

const m500 = (cantidad: number) => ({ productoSlug: "m500", varianteId: M500, cantidad });
const citrino = (cantidad: number) => ({ productoSlug: "citrino", varianteId: CITRINO_NEGRO, cantidad });

const CORDOBA = { cp: "5000", provincia: "Córdoba", ciudad: "Córdoba", calle: "Bv. San Juan", numero: "123" };
const CABA = { cp: "1426", provincia: "Ciudad Autónoma de Buenos Aires", ciudad: "Buenos Aires", calle: "Gorostiaga", numero: "1635" };
const SAN_ISIDRO = { cp: "1642", provincia: "Buenos Aires", ciudad: "San Isidro", calle: "Av. Centenario", numero: "100" };
const UMBRALES = { amba: 60000, nacional: 150000 };

let consultas = 0;
let caido = false;
const fetchOriginal = globalThis.fetch;
globalThis.fetch = (async (entrada: RequestInfo | URL, init?: RequestInit) => {
  const url = String(entrada);
  if (!url.startsWith("https://api.envia.com/")) return fetchOriginal(entrada, init);
  consultas++;
  if (caido) throw new Error("Envia no contesta");
  const cuerpo = JSON.parse(String(init?.body));
  const carrier = cuerpo.shipment.carrier;
  const enAmba = String(cuerpo.destination.postalCode).startsWith("1");
  const data =
    carrier === "rueddo"
      ? enAmba
        ? [{ carrier, service: "next_day", serviceDescription: "Día siguiente", deliveryEstimate: "Día siguiente", totalPrice: "5063.20", currency: "ARS" }]
        : null
      : carrier === "andreani"
        ? [{ carrier, service: "ground", serviceDescription: "Estándar", deliveryEstimate: "2-4 días", totalPrice: "8120.40", currency: "ARS" }]
        : carrier === "correoArgentino"
          ? [
              // En AMBA el correo es más barato que el reparto: igual se ofrece el reparto (llega en 24 h).
              { carrier, service: "standard_dom", serviceDescription: "Clásico", deliveryEstimate: "3-6 días", totalPrice: enAmba ? 4100 : 7350.25, currency: "ARS" },
              { carrier, service: "priority_dom", serviceDescription: "Prioritario", deliveryEstimate: "1-3 días", totalPrice: "9800", currency: "ARS" },
            ]
          : null;
  return new Response(JSON.stringify(data ? { meta: "rate", data } : { meta: "error", error: { code: 1126, message: "sin cobertura" } }));
}) as typeof fetch;
console.warn = () => {};

function reiniciar() {
  vaciarCacheEnvia();
  consultas = 0;
  caido = false;
}

function abrir(comprobante: string) {
  return leerComprobante(comprobante, claveDeComprobantes()!, { entorno: entornoEnvia() })!;
}

test("al resto del país, una sola opción: la más barata", async () => {
  reiniciar();
  const carrito = await resolverCarrito([m500(1)], { destino: CORDOBA });
  assert.equal(carrito.envioCotizado, true);
  assert.equal(carrito.envioZona, "resto");
  assert.equal(carrito.envioBonificado, false);
  assert.deepEqual(carrito.opcionesEnvio.map((o) => [o.id, o.precio]), [["correoArgentino:standard_dom", 7351]]);
  assert.ok(carrito.opcionesEnvio[0].comprobante.length > 20);
  assert.equal(carrito.envio, 7351);
  assert.equal(carrito.total, carrito.subtotal + 7351);
  assert.equal(carrito.envioDelPedido.opcion?.costo, 7350.25);
});

test("un par a Córdoba paga el envío y se le dice cuánto le falta; dos pares, gratis", async () => {
  reiniciar();
  const unPar = await resolverCarrito([citrino(1)], { destino: CORDOBA });
  assert.equal(unPar.envioBonificado, false);
  assert.equal(unPar.envio, 7351);
  const visto = cotizacionParaComprador(unPar, UMBRALES);
  assert.equal(visto.gratisDesde, 150000);
  assert.equal(visto.falta, 150000 - 89900);
  assert.equal(visto.opciones[0].plazo, "Llega en 3 a 6 días hábiles");

  const dosPares = await resolverCarrito([citrino(2)], { destino: CORDOBA });
  assert.ok(dosPares.subtotalSinCupon >= 150000);
  assert.equal(dosPares.envioBonificado, true);
  assert.equal(dosPares.envio, 0);
  assert.equal(dosPares.envioDelPedido.opcion?.costo, 7350.25, "lo que paga Harper");
  const copia = dosPares.envioDelPedido.cotizacion as { paquete: { pesoKg: number; altoCm: number }; zona: string };
  assert.equal(copia.paquete.pesoKg, 0.5);
  assert.ok(copia.paquete.altoCm > 5, "el paquete de dos es más alto");
  assert.equal(copia.zona, "resto");
});

test("en AMBA, un par tiene envío gratis por el reparto de 24 h, y el costo real queda en el pedido", async () => {
  reiniciar();
  const carrito = await resolverCarrito([citrino(1)], { destino: CABA });
  assert.equal(carrito.envioZona, "amba");
  assert.equal(carrito.envioBonificado, true);
  assert.equal(carrito.envio, 0);
  assert.deepEqual(carrito.opcionesEnvio.map((o) => o.id), ["rueddo:next_day"], "el reparto, aunque el correo sea más barato");
  assert.equal(carrito.envioDelPedido.opcion?.costo, 5063.2);

  const campos = camposDeEnvio(carrito.envioDelPedido, { calle: "Gorostiaga", numero: "1635" });
  assert.equal(campos.Envio_transportista, "Rueddo", "Harper sí sabe con quién despacha");
  assert.equal(campos.Envio_bonificado, true);
  assert.ok(!/Gorostiaga|1635/.test(campos.Envio_cotizacion), "la copia no lleva la calle");
  assert.equal(JSON.parse(campos.Envio_cotizacion).zona, "amba");

  const visto = cotizacionParaComprador(carrito, UMBRALES);
  assert.deepEqual(
    visto.opciones.map((o) => ({ id: o.id, precio: o.precio, plazo: o.plazo })),
    [{ id: "domicilio", precio: 5064, plazo: "Llega en 24 h hábiles" }]
  );
  assert.ok(!/rueddo|5063/i.test(JSON.stringify(visto)), "el comprador no ve el transportista ni el costo real");
});

test("en AMBA, un estuche solo paga el reparto y se le dice cuánto le falta", async () => {
  reiniciar();
  const carrito = await resolverCarrito([m500(1)], { destino: SAN_ISIDRO });
  assert.equal(carrito.envioZona, "amba");
  assert.equal(carrito.envioBonificado, false);
  assert.equal(carrito.envio, 5064);
  const visto = cotizacionParaComprador(carrito, UMBRALES);
  assert.equal(visto.gratisDesde, 60000);
  assert.equal(visto.falta, 60000 - 8990);
});

test("el cupón no cambia quién tiene envío gratis", async () => {
  reiniciar();
  const carrito = await resolverCarrito([citrino(1)], { destino: CABA, cupon: "HARPER10" });
  assert.equal(carrito.cupon?.estado, "aplicado");
  assert.ok(carrito.subtotal < 89900);
  assert.equal(carrito.envioBonificado, true);
  assert.equal(carrito.envio, 0);
});

test("con el comprobante se cobra eso sin volver a cotizar", async () => {
  reiniciar();
  const cotizado = await resolverCarrito([m500(1)], { destino: CORDOBA });
  const opcion = cotizado.opcionesEnvio[0];
  consultas = 0;
  caido = true; // si consultara, fallaría

  const cobrado = await resolverCarrito([m500(1)], {
    paraCobrar: true,
    destino: CORDOBA,
    eleccion: { id: "domicilio", comprobante: opcion.comprobante },
  });
  assert.equal(consultas, 0);
  assert.equal(cobrado.envio, 7351);
  assert.equal(cobrado.envioZona, "resto");
  assert.equal(cobrado.envioDelPedido.opcion?.id, "correoArgentino:standard_dom");
  assert.equal(cobrado.envioDelPedido.cotizadoEn, cotizado.envioDelPedido.cotizadoEn);
});

test("un comprobante tocado, de otro destino o de otro carrito no se acepta: se cotiza de nuevo", async () => {
  reiniciar();
  const cotizado = await resolverCarrito([m500(1)], { destino: CORDOBA });
  const opcion = cotizado.opcionesEnvio[0];
  const [iv, cifrado, etiqueta] = opcion.comprobante.split(".");
  const bytes = Buffer.from(cifrado, "base64url");
  bytes[5] ^= 1;
  const tocado = [iv, bytes.toString("base64url"), etiqueta].join(".");

  const conTocado = await resolverCarrito([m500(1)], { destino: CORDOBA, eleccion: { comprobante: tocado } });
  assert.equal(conTocado.envio, 7351);
  assert.ok(conTocado.opcionesEnvio.length > 0, "se volvió a cotizar (del cache de Envia, que es lo mismo)");

  const otroDestino = await resolverCarrito([m500(1)], { destino: CABA, eleccion: { comprobante: opcion.comprobante } });
  assert.equal(otroDestino.envioZona, "amba");
  assert.equal(otroDestino.envio, 5064, "el precio de este destino, no el del comprobante");
  assert.ok(otroDestino.opcionesEnvio.length > 0, "otro destino: cotización nueva, no el comprobante");

  const otroCarrito = await resolverCarrito([m500(2)], { destino: CORDOBA, eleccion: { comprobante: opcion.comprobante } });
  assert.ok(otroCarrito.opcionesEnvio.length > 0, "otro carrito: cotización nueva");
});

test("un comprobante firmado para otro caso de envío gratis no se acepta: se cotiza de nuevo", async () => {
  reiniciar();
  const cotizado = await resolverCarrito([m500(1)], { destino: CORDOBA });
  const datos = abrir(cotizado.opcionesEnvio[0].comprobante);
  assert.equal(datos.bonificado, false);
  // Bien firmado, pero dice que el envío era gratis: con el carrito de ahora no lo es.
  const gratis = firmarComprobante({ ...datos, bonificado: true }, claveDeComprobantes()!);
  consultas = 0;
  const cobrado = await resolverCarrito([m500(1)], { paraCobrar: true, destino: CORDOBA, eleccion: { comprobante: gratis } });
  assert.equal(cobrado.envio, 7351);
  assert.equal(cobrado.envioBonificado, false);
  assert.ok(cobrado.opcionesEnvio.length > 0, "se volvió a cotizar");

  // Bien firmado, mismo destino y carrito, pero dice AMBA y gratis: no cierra
  // con la regla (un estuche no llega al mínimo ni en AMBA), se cotiza de nuevo.
  const enAmba = firmarComprobante({ ...datos, zona: "amba", bonificado: true }, claveDeComprobantes()!);
  const conAmba = await resolverCarrito([m500(1)], { paraCobrar: true, destino: CORDOBA, eleccion: { comprobante: enAmba } });
  assert.equal(conAmba.envioBonificado, false);
  assert.equal(conAmba.envioZona, "resto", "la zona sale de la cotización nueva");
});

test("el comprobante vence media hora después de la consulta a Envia", async () => {
  reiniciar();
  const antes = Date.now();
  const cotizado = await resolverCarrito([m500(1)], { destino: CORDOBA });
  const datos = abrir(cotizado.opcionesEnvio[0].comprobante);
  assert.equal(datos.exp, Date.parse(datos.cotizadoEn) + 30 * 60_000);
  assert.ok(Date.parse(datos.cotizadoEn) >= antes - 1000);
  assert.equal(cotizado.envioDelPedido.cotizadoEn, datos.cotizadoEn);
});

test("con Envia caído, sin destino completo o sin token: la tarifa plana (gratis en la Ciudad desde el mínimo de AMBA)", async () => {
  reiniciar();
  caido = true;
  const caida = await resolverCarrito([m500(1)], { destino: CORDOBA });
  assert.equal(caida.envioCotizado, false);
  assert.equal(caida.envio, 10100);
  assert.equal(caida.envioZona, null);
  assert.equal(caida.envioDelPedido.origen, "plano");
  assert.equal(notaDeEnvio(caida.envioDelPedido).replace(/\s/g, " "), "Envío: tarifa plana $ 10.100, sin cotizar.");

  // La Ciudad es AMBA entera: sin cotizar, igual es gratis desde el mínimo de AMBA.
  const caidaCaba = await resolverCarrito([citrino(1)], { destino: CABA });
  assert.equal(caidaCaba.envioZona, "amba");
  assert.equal(caidaCaba.envio, 0);
  assert.equal(caidaCaba.envioBonificado, true);

  // En la provincia no se sabe sin cotizar: vale solo el mínimo de todo el país.
  const caidaGba = await resolverCarrito([citrino(1)], { destino: SAN_ISIDRO });
  assert.equal(caidaGba.envioZona, null);
  assert.equal(caidaGba.envio, 10100);

  reiniciar();
  const sinCalle = await resolverCarrito([m500(1)], { destino: { ...CORDOBA, calle: "" } });
  assert.equal(sinCalle.envio, 10100);
  assert.equal(consultas, 0);

  const sinDestino = await resolverCarrito([m500(1)]);
  assert.equal(sinDestino.envio, 10100);
  assert.equal(sinDestino.envioZona, null);
  assert.equal(consultas, 0);

  const token = process.env.ENVIA_TOKEN;
  delete process.env.ENVIA_TOKEN;
  try {
    const sinToken = await resolverCarrito([m500(1)], { destino: CORDOBA });
    assert.equal(sinToken.envio, 10100);
    assert.equal(consultas, 0);
  } finally {
    process.env.ENVIA_TOKEN = token;
  }
});
