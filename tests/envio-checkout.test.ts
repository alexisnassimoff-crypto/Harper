import { test } from "node:test";
import assert from "node:assert/strict";

process.env.HARPER_FIXTURES = "1";
process.env.ENVIA_TOKEN = "token-de-prueba";

import { camposDeEnvio, descripcionDelEnvio, notaDeEnvio } from "../lib/envio-pedido";
import { firmarComprobante } from "../lib/cotizacion-envio";
import { claveDeComprobantes, vaciarCacheEnvia } from "../lib/envia";
import { resolverCarrito } from "../lib/pedidos";

/**
 * El envío de punta a punta en el servidor, con el catálogo de prueba y un
 * Envia de mentira (se intercepta `fetch` solo para api.envia.com). En el
 * catálogo de prueba el envío gratis arranca en $ 80.000 y la tarifa plana
 * es $ 10.100.
 */

const CITRINO_NEGRO = "rec5h3kW0JBY8Wd7y"; // $ 89.900: con envío gratis
const M500 = "recMyVTEzcVtTh64g"; // estuche: paga envío

const m500 = (cantidad: number) => ({ productoSlug: "m500", varianteId: M500, cantidad });
const citrino = (cantidad: number) => ({ productoSlug: "citrino", varianteId: CITRINO_NEGRO, cantidad });

const DESTINO = { cp: "5000", provincia: "Córdoba", ciudad: "Córdoba", calle: "Bv. San Juan", numero: "123" };

let consultas = 0;
let caido = false;
const fetchOriginal = globalThis.fetch;
globalThis.fetch = (async (entrada: RequestInfo | URL, init?: RequestInit) => {
  const url = String(entrada);
  if (!url.startsWith("https://api.envia.com/")) return fetchOriginal(entrada, init);
  consultas++;
  if (caido) throw new Error("Envia no contesta");
  const carrier = JSON.parse(String(init?.body)).shipment.carrier;
  const data =
    carrier === "andreani"
      ? [{ carrier, service: "ground", serviceDescription: "Estándar", deliveryEstimate: "2-4 días", totalPrice: "8120.40", currency: "ARS" }]
      : carrier === "correoArgentino"
        ? [
            { carrier, service: "standard_dom", serviceDescription: "Clásico", deliveryEstimate: "3-6 días", totalPrice: 7350.25, currency: "ARS" },
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

test("con un estuche (paga envío): las opciones a domicilio ordenadas y se cobra la elegida", async () => {
  reiniciar();
  const carrito = await resolverCarrito([m500(1)], { destino: DESTINO });
  assert.equal(carrito.envioCotizado, true);
  assert.equal(carrito.envioBonificado, false);
  assert.deepEqual(carrito.opcionesEnvio.map((o) => [o.id, o.precio]), [
    ["correoArgentino:standard_dom", 7351],
    ["andreani:ground", 8121],
    ["correoArgentino:priority_dom", 9800],
  ]);
  assert.ok(carrito.opcionesEnvio.every((o) => o.comprobante.length > 20));
  assert.equal(carrito.envio, 7351, "sin elección, la más barata");
  assert.equal(carrito.total, carrito.subtotal + 7351);

  const elegida = await resolverCarrito([m500(1)], { destino: DESTINO, eleccion: { id: "andreani:ground" } });
  assert.equal(elegida.envio, 8121);
  assert.equal(elegida.envioDelPedido.opcion?.id, "andreani:ground");
  assert.equal(elegida.envioDelPedido.opcion?.costo, 8120.4);
});

test("con 1 par (envío gratis): una sola opción, la más barata, y el costo real queda en el pedido", async () => {
  reiniciar();
  const carrito = await resolverCarrito([citrino(1)], { destino: DESTINO });
  assert.equal(carrito.envioBonificado, true);
  assert.equal(carrito.envio, 0);
  assert.deepEqual(carrito.opcionesEnvio.map((o) => o.id), ["correoArgentino:standard_dom"]);
  assert.equal(carrito.envioDelPedido.bonificado, true);
  assert.equal(carrito.envioDelPedido.cobrado, 0);
  assert.equal(carrito.envioDelPedido.opcion?.costo, 7350.25, "lo que paga Harper");

  const campos = camposDeEnvio(carrito.envioDelPedido, { calle: "Bv. San Juan", numero: "123" });
  assert.equal(campos.Envio_transportista, "Correo Argentino");
  assert.equal(campos.Envio_costo_real, 7350.25);
  assert.equal(campos.Envio_bonificado, true);
  assert.equal(campos.Direccion_calle, "Bv. San Juan");
  const copia = JSON.parse(campos.Envio_cotizacion);
  assert.deepEqual(copia.destino, { cp: "5000", provincia: "CB", ciudad: "Córdoba" });
  assert.equal(copia.paquete.pesoKg, 0.5, "el mínimo de Config");
  assert.ok(!/Bv\. San Juan|123/.test(campos.Envio_cotizacion), "la copia no lleva la calle");
});

test("con 2 pares también: la misma lógica, con el paquete de dos", async () => {
  reiniciar();
  const carrito = await resolverCarrito([citrino(2)], { destino: DESTINO });
  assert.equal(carrito.envio, 0);
  assert.equal(carrito.envioDelPedido.origen, "envia");
  const copia = carrito.envioDelPedido.cotizacion as { paquete: { pesoKg: number; altoCm: number } };
  assert.equal(copia.paquete.pesoKg, 0.5);
  assert.ok(copia.paquete.altoCm > 5, "el paquete de dos es más alto");
});

test("con el comprobante se cobra eso sin volver a cotizar", async () => {
  reiniciar();
  const cotizado = await resolverCarrito([m500(1)], { destino: DESTINO });
  const andreani = cotizado.opcionesEnvio.find((o) => o.id === "andreani:ground")!;
  consultas = 0;
  caido = true; // si consultara, fallaría

  const cobrado = await resolverCarrito([m500(1)], {
    paraCobrar: true,
    destino: DESTINO,
    eleccion: { id: andreani.id, comprobante: andreani.comprobante },
  });
  assert.equal(consultas, 0);
  assert.equal(cobrado.envio, 8121);
  assert.equal(cobrado.envioDelPedido.opcion?.id, "andreani:ground");
  assert.equal(cobrado.envioDelPedido.cotizadoEn, andreani && cotizado.envioDelPedido.cotizadoEn);
});

test("un comprobante tocado, de otro destino o de otro carrito no se acepta: se cotiza de nuevo", async () => {
  reiniciar();
  const cotizado = await resolverCarrito([m500(1)], { destino: DESTINO });
  const caro = cotizado.opcionesEnvio.find((o) => o.id === "correoArgentino:priority_dom")!;
  const [contenido, firma] = caro.comprobante.split(".");
  const datos = JSON.parse(Buffer.from(contenido, "base64url").toString("utf8"));
  datos.opcion.precio = 1;
  const tocado = `${Buffer.from(JSON.stringify(datos)).toString("base64url")}.${firma}`;

  const conTocado = await resolverCarrito([m500(1)], { destino: DESTINO, eleccion: { id: caro.id, comprobante: tocado } });
  assert.equal(conTocado.envio, 9800, "se cobra el precio real de la opción elegida, no el del comprobante tocado");
  assert.ok(conTocado.opcionesEnvio.length > 0, "se volvió a cotizar (del cache de Envia, que es lo mismo)");

  const otroDestino = await resolverCarrito([m500(1)], {
    destino: { ...DESTINO, cp: "1426", provincia: "Ciudad Autónoma de Buenos Aires", ciudad: "Buenos Aires" },
    eleccion: { id: caro.id, comprobante: caro.comprobante },
  });
  assert.equal(otroDestino.envioDelPedido.opcion?.id, caro.id);
  assert.equal(otroDestino.envioCotizado, true);
  assert.ok(otroDestino.opcionesEnvio.length > 0, "otro destino: cotización nueva, no el comprobante");

  const otroCarrito = await resolverCarrito([m500(2)], { destino: DESTINO, eleccion: { comprobante: caro.comprobante } });
  assert.ok(otroCarrito.opcionesEnvio.length > 0, "otro carrito: cotización nueva");
});

test("un comprobante firmado para otro caso de envío gratis no se acepta: se cotiza de nuevo", async () => {
  reiniciar();
  const cotizado = await resolverCarrito([m500(1)], { destino: DESTINO });
  const caro = cotizado.opcionesEnvio.find((o) => o.id === "correoArgentino:priority_dom")!;
  const datos = JSON.parse(Buffer.from(caro.comprobante.split(".")[0], "base64url").toString("utf8"));
  assert.equal(datos.bonificado, false);
  // Bien firmado, pero dice que el envío era gratis: con el carrito de ahora no lo es.
  const gratis = firmarComprobante({ ...datos, bonificado: true }, claveDeComprobantes()!);
  consultas = 0;
  const cobrado = await resolverCarrito([m500(1)], { paraCobrar: true, destino: DESTINO, eleccion: { id: caro.id, comprobante: gratis } });
  assert.equal(cobrado.envio, 9800);
  assert.equal(cobrado.envioBonificado, false);
  assert.ok(cobrado.opcionesEnvio.length > 0, "se volvió a cotizar");
});

test("el comprobante vence media hora después de la consulta a Envia", async () => {
  reiniciar();
  const antes = Date.now();
  const cotizado = await resolverCarrito([m500(1)], { destino: DESTINO });
  const datos = JSON.parse(Buffer.from(cotizado.opcionesEnvio[0].comprobante.split(".")[0], "base64url").toString("utf8"));
  assert.equal(datos.exp, Date.parse(datos.cotizadoEn) + 30 * 60_000);
  assert.ok(Date.parse(datos.cotizadoEn) >= antes - 1000);
  assert.equal(cotizado.envioDelPedido.cotizadoEn, datos.cotizadoEn);
});

test("con Envia caído, sin destino completo o sin token: la tarifa plana", async () => {
  reiniciar();
  caido = true;
  const caida = await resolverCarrito([m500(1)], { destino: DESTINO });
  assert.equal(caida.envioCotizado, false);
  assert.equal(caida.envio, 10100);
  assert.equal(caida.envioDelPedido.origen, "plano");
  assert.equal(notaDeEnvio(caida.envioDelPedido).replace(/\s/g, " "), "Envío: tarifa plana $ 10.100, sin cotizar.");
  assert.equal(descripcionDelEnvio(caida.envioDelPedido), "Envío a domicilio");

  reiniciar();
  const sinCalle = await resolverCarrito([m500(1)], { destino: { ...DESTINO, calle: "" } });
  assert.equal(sinCalle.envio, 10100);
  assert.equal(consultas, 0);

  const sinDestino = await resolverCarrito([m500(1)]);
  assert.equal(sinDestino.envio, 10100);
  assert.equal(consultas, 0);

  const token = process.env.ENVIA_TOKEN;
  delete process.env.ENVIA_TOKEN;
  try {
    const sinToken = await resolverCarrito([m500(1)], { destino: DESTINO });
    assert.equal(sinToken.envio, 10100);
    assert.equal(consultas, 0);
  } finally {
    process.env.ENVIA_TOKEN = token;
  }
});
