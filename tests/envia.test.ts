import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PROVINCIAS } from "../components/checkout/provincias";
import { codigoEnviaDeProvincia } from "../lib/provincias-envia";
import {
  cotizarEnvia,
  cuatroDigitos,
  cuerpoDeCotizacion,
  esADomicilio,
  leerTarifas,
  paqueteParaEnvia,
  RUTA_COTIZAR,
  vaciarCacheEnvia,
  type PedidoDeCotizacion,
} from "../lib/envia";

const ORIGEN = {
  nombre: "FOCUS VISION SRL",
  telefono: "1149172061",
  calle: "Gorostiaga",
  numero: "1635",
  piso: "5",
  ciudad: "Ciudad Autónoma de Buenos Aires",
  provincia: "Ciudad Autónoma de Buenos Aires",
  cp: "1426",
};

const PEDIDO: PedidoDeCotizacion = {
  origen: ORIGEN,
  destino: { cp: "X5000ABC", provincia: "Córdoba", ciudad: "Córdoba", calle: "Bv. San Juan", numero: "123" },
  paquete: { pesoKg: 0.5, largoCm: 18.6, anchoCm: 7.8, altoCm: 5.2 },
  valorDeclarado: 89900,
  transportistas: ["rueddo", "andreani", "correoArgentino"],
};

/** Una respuesta de Envia con lo que se ve en producción: precios como texto y como número. */
function respuesta(transportista: string) {
  if (transportista === "andreani") {
    return {
      meta: "rate",
      data: [
        { carrier: "andreani", carrierDescription: "Andreani", service: "ground", serviceDescription: "Estándar", dropOffDescription: "Door - Door", deliveryEstimate: "2-4 días", totalPrice: "8120.40", currency: "ARS" },
        { carrier: "andreani", service: "sucursal", serviceDescription: "A sucursal", dropOffDescription: "Door - Branch", totalPrice: 6000, currency: "ARS" },
      ],
    };
  }
  if (transportista === "correoArgentino") {
    return {
      meta: "rate",
      data: [
        { carrier: "correoArgentino", service: "standard_dom", serviceDescription: "Clásico a domicilio", deliveryEstimate: "3-6 días", totalPrice: 7350.25, currency: "ARS" },
        { carrier: "correoArgentino", service: "priority_dom", serviceDescription: "Prioritario a domicilio", deliveryEstimate: "1-3 días", totalPrice: "9800", currency: "ARS" },
        { carrier: "correoArgentino", service: "standard_suc", totalPrice: "5000", currency: "ARS" },
      ],
    };
  }
  // Rueddo no llega a Córdoba: Envia contesta 200 con un error adentro.
  return { meta: "error", error: { code: 1126, message: "No coverage" } };
}

test("cada provincia del checkout tiene su código de Envia", () => {
  for (const p of PROVINCIAS) assert.match(codigoEnviaDeProvincia(p) ?? "", /^[A-Z]{2}$/, p);
  assert.equal(codigoEnviaDeProvincia("Ciudad Autónoma de Buenos Aires"), "DF");
  assert.equal(codigoEnviaDeProvincia("cordoba"), "CB");
  assert.equal(codigoEnviaDeProvincia("CABA"), "DF");
  assert.equal(codigoEnviaDeProvincia("Narnia"), null);
  assert.equal(new Set(PROVINCIAS.map(codigoEnviaDeProvincia)).size, PROVINCIAS.length, "sin códigos repetidos");
});

test("el paquete va en kg, con el mínimo de Config o el peso calculado, el mayor", () => {
  assert.equal(paqueteParaEnvia(null, 0.5), null);
  assert.deepEqual(paqueteParaEnvia({ pesoG: 190, largoCm: 18.6, anchoCm: 7.8, altoCm: 5.2 }, 0.5), { pesoKg: 0.5, largoCm: 18.6, anchoCm: 7.8, altoCm: 5.2 });
  assert.equal(paqueteParaEnvia({ pesoG: 670, largoCm: 18.6, anchoCm: 7.8, altoCm: 17.6 }, 0.5)?.pesoKg, 0.67);
  assert.equal(paqueteParaEnvia({ pesoG: 190, largoCm: 18.6, anchoCm: 7.8, altoCm: 5.2 }, 0)?.pesoKg, 0.19);
});

test("los códigos postales van con cuatro dígitos", () => {
  assert.equal(cuatroDigitos("C1426ABC"), "1426");
  assert.equal(cuatroDigitos("5000"), "5000");
  assert.equal(cuatroDigitos("ABC"), "");
});

test("la consulta a Envia no lleva datos del comprador y usa los códigos de Envia", () => {
  const cuerpo = cuerpoDeCotizacion(PEDIDO, "andreani");
  assert.equal(cuerpo.origin.state, "DF");
  assert.equal(cuerpo.origin.postalCode, "1426");
  assert.equal(cuerpo.destination.state, "CB");
  assert.equal(cuerpo.destination.postalCode, "5000");
  assert.equal(cuerpo.destination.name, "Cliente Harper");
  assert.equal(cuerpo.destination.phone, ORIGEN.telefono, "el teléfono es el de Harper, no el del comprador");
  assert.equal(cuerpo.shipment.carrier, "andreani");
  assert.equal(cuerpo.shipment.type, 1);
  assert.equal(cuerpo.packages[0].weight, 0.5);
  assert.equal(cuerpo.packages[0].weightUnit, "KG");
  assert.equal(cuerpo.packages[0].insurance, 0, "sin seguro adicional");
  assert.equal(cuerpo.settings.currency, "ARS");
  const texto = JSON.stringify(cuerpo);
  assert.ok(!/email|dni|identification/i.test(texto));
});

test("solo entregas a domicilio: sin sucursales ni Mercado Libre Flex", () => {
  assert.equal(esADomicilio({ service: "standard_dom" }), true);
  assert.equal(esADomicilio({ service: "ground", dropOffDescription: "Branch - Door" }), true);
  assert.equal(esADomicilio({ service: "standard_suc" }), false);
  assert.equal(esADomicilio({ service: "sucursal" }), false);
  assert.equal(esADomicilio({ service: "meli_flex" }), false);
  assert.equal(esADomicilio({ service: "oca_PS" }), false);
  assert.equal(esADomicilio({ service: "ground", dropOffDescription: "Door - Branch" }), false);
});

test("las tarifas se leen con precios de texto o número y se cobran en pesos enteros hacia arriba", () => {
  const andreani = leerTarifas(respuesta("andreani"), "andreani");
  assert.equal(andreani.length, 1);
  assert.deepEqual(andreani[0].opcion, {
    id: "andreani:ground",
    transportista: "andreani",
    transportistaNombre: "Andreani",
    servicio: "ground",
    servicioNombre: "Estándar",
    costo: 8120.4,
    precio: 8121,
    plazo: "2-4 días",
  });
  assert.equal(andreani[0].detalle.dropOffDescription, "Door - Door");

  const correo = leerTarifas(respuesta("correoArgentino"), "correoArgentino");
  assert.deepEqual(correo.map((t) => [t.opcion.id, t.opcion.precio, t.opcion.transportistaNombre]), [
    ["correoArgentino:standard_dom", 7351, "Correo Argentino"],
    ["correoArgentino:priority_dom", 9800, "Correo Argentino"],
  ]);

  assert.deepEqual(leerTarifas(respuesta("rueddo"), "rueddo"), [], "meta error = nada");
  assert.deepEqual(leerTarifas(null, "x"), []);
  assert.deepEqual(leerTarifas({ meta: "rate", data: [{ service: "x", totalPrice: "10", currency: "USD" }] }, "x"), [], "otra moneda, afuera");
  assert.deepEqual(leerTarifas({ meta: "rate", data: [{ service: "x", totalPrice: "0" }] }, "x"), [], "sin precio, afuera");

  // El mismo servicio dos veces: queda el más barato.
  const doble = leerTarifas({ meta: "rate", data: [
    { carrier: "andreani", service: "ground", dropOffDescription: "Door - Door", totalPrice: "9000" },
    { carrier: "andreani", service: "ground", dropOffDescription: "Branch - Door", totalPrice: "8000" },
  ] }, "andreani");
  assert.equal(doble.length, 1);
  assert.equal(doble[0].opcion.costo, 8000);
});

test("cotiza con cada transportista a la vez, junta lo que contestó y ordena por precio", async () => {
  vaciarCacheEnvia();
  process.env.ENVIA_TOKEN = "token-de-prueba";
  const pedidos: { url: string; auth: string | null; carrier: string }[] = [];
  const fetchFalso = (async (url: string, init: RequestInit) => {
    const cuerpo = JSON.parse(String(init.body));
    pedidos.push({ url, auth: new Headers(init.headers).get("authorization"), carrier: cuerpo.shipment.carrier });
    if (cuerpo.shipment.carrier === "rueddo") return new Response(JSON.stringify(respuesta("rueddo")), { status: 200 });
    return new Response(JSON.stringify(respuesta(cuerpo.shipment.carrier)), { status: 200 });
  }) as unknown as typeof fetch;

  const advertencias: string[] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => advertencias.push(args.join(" "));
  try {
    const resultado = await cotizarEnvia(PEDIDO, { fetchImpl: fetchFalso });
    assert.ok(resultado);
    assert.deepEqual(resultado.tarifas.map((t) => t.opcion.id), ["correoArgentino:standard_dom", "andreani:ground", "correoArgentino:priority_dom"]);
    assert.equal(pedidos.length, 3);
    assert.ok(pedidos.every((p) => p.url === `https://api.envia.com${RUTA_COTIZAR}` && p.auth === "Bearer token-de-prueba"));
    assert.equal(resultado.fallas.length, 1);
    assert.ok(advertencias.every((a) => !a.includes("token-de-prueba")), "el token no va a los logs");
    assert.deepEqual(resultado.consulta.destino, { cp: "5000", provincia: "CB", ciudad: "Córdoba" });

    // La misma consulta otra vez sale del cache, sin preguntarle a Envia.
    await cotizarEnvia(PEDIDO, { fetchImpl: fetchFalso });
    assert.equal(pedidos.length, 3);
  } finally {
    console.warn = original;
  }
});

test("sin respuesta útil, sin token o con datos incompletos devuelve null", async () => {
  vaciarCacheEnvia();
  process.env.ENVIA_TOKEN = "token-de-prueba";
  const caido = (async () => new Response("error", { status: 502 })) as unknown as typeof fetch;
  const original = console.warn;
  console.warn = () => {};
  try {
    assert.equal(await cotizarEnvia(PEDIDO, { fetchImpl: caido }), null);
    const tiraError = (async () => { throw new Error("red"); }) as unknown as typeof fetch;
    assert.equal(await cotizarEnvia(PEDIDO, { fetchImpl: tiraError }), null);
    assert.equal(await cotizarEnvia({ ...PEDIDO, destino: { ...PEDIDO.destino, provincia: "Narnia" } }, { fetchImpl: caido }), null);
    assert.equal(await cotizarEnvia({ ...PEDIDO, transportistas: [] }, { fetchImpl: caido }), null);
    delete process.env.ENVIA_TOKEN;
    let llamadas = 0;
    const contar = (async () => { llamadas++; return new Response("{}"); }) as unknown as typeof fetch;
    assert.equal(await cotizarEnvia(PEDIDO, { fetchImpl: contar }), null);
    assert.equal(llamadas, 0, "sin token no se consulta");
  } finally {
    console.warn = original;
  }
});

test("la calle y el número no cambian la consulta: otra calle del mismo CP sale del cache", async () => {
  vaciarCacheEnvia();
  process.env.ENVIA_TOKEN = "token-de-prueba";
  let llamadas = 0;
  const fetchFalso = (async (_url: string, init: RequestInit) => {
    llamadas++;
    return new Response(JSON.stringify(respuesta(JSON.parse(String(init.body)).shipment.carrier)));
  }) as unknown as typeof fetch;
  const original = console.warn;
  console.warn = () => {};
  try {
    const primera = await cotizarEnvia(PEDIDO, { fetchImpl: fetchFalso, ahora: 1_000_000 });
    assert.equal(llamadas, 3);
    assert.equal(primera?.cotizadoEn, new Date(1_000_000).toISOString());
    const otraCalle = await cotizarEnvia(
      { ...PEDIDO, destino: { ...PEDIDO.destino, calle: "Colón", numero: "999" } },
      { fetchImpl: fetchFalso, ahora: 1_000_000 + 60_000 }
    );
    assert.equal(llamadas, 3, "sin consultar de nuevo");
    assert.equal(otraCalle?.cotizadoEn, new Date(1_000_000).toISOString(), "con la hora real de la consulta");
    // Rueddo contestó "no llega" (un 200 con meta error): es una respuesta, se guarda.
    assert.equal(otraCalle?.fallas.length, 1);
  } finally {
    console.warn = original;
  }
});

test("si un transportista no contestó (red, 5xx), el resultado no se guarda y se le vuelve a preguntar", async () => {
  vaciarCacheEnvia();
  process.env.ENVIA_TOKEN = "token-de-prueba";
  const pedidos: string[] = [];
  let andreaniCaido = true;
  const fetchFalso = (async (_url: string, init: RequestInit) => {
    const carrier = JSON.parse(String(init.body)).shipment.carrier;
    pedidos.push(carrier);
    if (carrier === "andreani" && andreaniCaido) return new Response("Bad Gateway", { status: 502 });
    return new Response(JSON.stringify(respuesta(carrier)));
  }) as unknown as typeof fetch;
  const original = console.warn;
  console.warn = () => {};
  try {
    const incompleta = await cotizarEnvia(PEDIDO, { fetchImpl: fetchFalso });
    assert.deepEqual(incompleta?.tarifas.map((t) => t.opcion.id), ["correoArgentino:standard_dom", "correoArgentino:priority_dom"]);
    andreaniCaido = false;
    const completa = await cotizarEnvia(PEDIDO, { fetchImpl: fetchFalso });
    assert.equal(pedidos.length, 6, "se volvió a consultar a todos");
    assert.deepEqual(completa?.tarifas.map((t) => t.opcion.id), ["correoArgentino:standard_dom", "andreani:ground", "correoArgentino:priority_dom"]);
    await cotizarEnvia(PEDIDO, { fetchImpl: fetchFalso });
    assert.equal(pedidos.length, 6, "la completa sí quedó guardada");
  } finally {
    console.warn = original;
  }
});

test("un precio con otra escritura no se adivina: esa tarifa se descarta", () => {
  const tarifas = leerTarifas({ meta: "rate", data: [
    { carrier: "andreani", service: "ground", totalPrice: "7.350,25", currency: "ARS" },
    { carrier: "andreani", service: "express", totalPrice: " 9800.5 ", currency: "ARS" },
  ] }, "andreani");
  assert.deepEqual(tarifas.map((t) => [t.opcion.id, t.opcion.costo]), [["andreani:express", 9800.5]]);
});

test("el módulo solo conoce la ruta de cotizar: nada de etiquetas, envíos, retiros ni webhooks", () => {
  const fuente = readFileSync(join(__dirname, "..", "..", "lib", "envia.ts"), "utf8");
  for (const prohibida of ["/ship/generate", "/ship/cancel", "/ship/pickup", "/ship/manifest", "/webhooks", "/ship/track"]) {
    assert.ok(!fuente.includes(prohibida), `no debería mencionar ${prohibida}`);
  }
  assert.equal(RUTA_COTIZAR, "/ship/rate/");
  // Y el token no se expone al navegador.
  assert.ok(!fuente.includes("NEXT_PUBLIC"));
});
