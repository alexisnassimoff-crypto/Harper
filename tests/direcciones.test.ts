import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  componerDireccion,
  cpDesdeGoogle,
  detallarDireccion,
  ErrorDirecciones,
  faltantes,
  normalizarDireccion,
  placeIdValido,
  provinciaDesdeGoogle,
  sesionValida,
  sugerirDirecciones,
  type ComponenteGoogle,
} from "../lib/direcciones";
import { contadorPlaces, fetchPlacesFalso, LUGARES, reiniciarPlaces } from "../lib/fixtures/direcciones";
import { contarEnVentana, reiniciarCuotaEnMemoria } from "../lib/cuota";
import { fetchRedisFalso, reiniciarRedis } from "../lib/fixtures/redis";
import { provinciaDesdeCodigo } from "../lib/provincias-codigo";

const CONFIG = { clave: "prueba", base: "http://places.prueba" };
const SESION = "11111111-2222-4333-8444-555555555555";

beforeEach(() => {
  reiniciarPlaces();
  reiniciarRedis();
  reiniciarCuotaEnMemoria();
});

// ---------- El código postal, venga como venga ----------

test("el CP argentino se reduce a sus cuatro dígitos en todos los formatos de Google", () => {
  assert.equal(cpDesdeGoogle("1426"), "1426");
  assert.equal(cpDesdeGoogle("C1426"), "1426");
  assert.equal(cpDesdeGoogle("C1426AAG"), "1426");
  assert.equal(cpDesdeGoogle("C1426 AAG"), "1426");
  assert.equal(cpDesdeGoogle("B1638"), "1638");
  assert.equal(cpDesdeGoogle(undefined), "");
  assert.equal(cpDesdeGoogle("AAG"), "");
});

// ---------- La provincia, con todos los nombres que usa Google ----------

test("la Ciudad de Buenos Aires se reconoce por nombre, por letra del CPA o por localidad", () => {
  const CABA = "Ciudad Autónoma de Buenos Aires";
  assert.equal(provinciaDesdeGoogle({ nombres: ["Cdad. Autónoma de Buenos Aires", "CABA"] }), CABA);
  assert.equal(provinciaDesdeGoogle({ nombres: ["CABA"] }), CABA);
  assert.equal(provinciaDesdeGoogle({ nombres: ["Capital Federal"] }), CABA);
  // "Buenos Aires" a secas: la letra C desempata.
  assert.equal(provinciaDesdeGoogle({ nombres: ["Buenos Aires"], codigoPostal: "C1426" }), CABA);
  // Sin letra, la localidad "Buenos Aires" es la ciudad.
  assert.equal(provinciaDesdeGoogle({ nombres: ["Buenos Aires"], localidad: "Buenos Aires" }), CABA);
});

test("la provincia de Buenos Aires no se confunde con la ciudad", () => {
  assert.equal(provinciaDesdeGoogle({ nombres: ["Provincia de Buenos Aires"] }), "Buenos Aires");
  assert.equal(provinciaDesdeGoogle({ nombres: ["Buenos Aires"], codigoPostal: "B1638" }), "Buenos Aires");
  assert.equal(provinciaDesdeGoogle({ nombres: ["Buenos Aires"], localidad: "Vicente López" }), "Buenos Aires");
  assert.equal(provinciaDesdeGoogle({ nombres: ["Buenos Aires Province"] }), "Buenos Aires");
});

test("las demás provincias se reconocen con o sin 'Provincia de', con o sin tilde, y por la letra del CPA", () => {
  assert.equal(provinciaDesdeGoogle({ nombres: ["Córdoba"] }), "Córdoba");
  assert.equal(provinciaDesdeGoogle({ nombres: ["Provincia de Cordoba"] }), "Córdoba");
  assert.equal(provinciaDesdeGoogle({ nombres: ["Santa Fe"] }), "Santa Fe");
  assert.equal(provinciaDesdeGoogle({ nombres: ["Santiago del Estero"] }), "Santiago del Estero");
  assert.equal(
    provinciaDesdeGoogle({ nombres: ["Tierra del Fuego, Antártida e Islas del Atlántico Sur"] }),
    "Tierra del Fuego"
  );
  assert.equal(provinciaDesdeGoogle({ nombres: ["Neuquen"] }), "Neuquén");
  // Un nombre irreconocible pero con CPA: la letra manda.
  assert.equal(provinciaDesdeGoogle({ nombres: ["???"], codigoPostal: "X5000" }), "Córdoba");
  assert.equal(provinciaDesdeGoogle({ nombres: [""] }), "");
  assert.equal(provinciaDesdeCodigo("S"), "Santa Fe");
  assert.equal(provinciaDesdeCodigo("?"), null);
});

// ---------- Desarmar la respuesta de Google ----------

const c = (longText: string, types: string[], shortText = longText): ComponenteGoogle => ({ longText, shortText, types });

test("una dirección de CABA: calle, número, barrio, localidad, provincia y CP de cuatro dígitos", () => {
  const d = normalizarDireccion(
    [
      c("1234", ["street_number"]),
      c("Avenida Cabildo", ["route"], "Av. Cabildo"),
      c("Núñez", ["sublocality_level_1", "sublocality", "political"]),
      c("Buenos Aires", ["locality", "political"]),
      c("Cdad. Autónoma de Buenos Aires", ["administrative_area_level_1", "political"], "CABA"),
      c("Argentina", ["country", "political"], "AR"),
      c("C1426", ["postal_code"]),
    ],
    "Av. Cabildo 1234, C1426 Cdad. Autónoma de Buenos Aires, Argentina"
  );

  assert.deepEqual(d, {
    calle: "Avenida Cabildo",
    numero: "1234",
    localidad: "Buenos Aires",
    barrio: "Núñez",
    provincia: "Ciudad Autónoma de Buenos Aires",
    cp: "1426",
    texto: "Av. Cabildo 1234, C1426 Cdad. Autónoma de Buenos Aires, Argentina",
  });
  assert.deepEqual(faltantes(d), []);
  assert.equal(componerDireccion(d), "Avenida Cabildo 1234");
  assert.equal(componerDireccion(d, " 5° B "), "Avenida Cabildo 1234, 5° B");
});

test("sin código postal en los componentes, lo toma de postalAddress; sin nada, queda faltante", () => {
  const componentes = [
    c("150", ["street_number"]),
    c("San Martín", ["route"]),
    c("Villa General Belgrano", ["locality", "political"]),
    c("Córdoba", ["administrative_area_level_1", "political"]),
  ];

  const conPostal = normalizarDireccion(componentes, "San Martín 150, Villa General Belgrano, Córdoba", {
    postalCode: "X5194",
  });
  assert.equal(conPostal.cp, "5194");

  const sinNada = normalizarDireccion(componentes, "San Martín 150, Villa General Belgrano, Córdoba");
  assert.equal(sinNada.cp, "");
  assert.equal(sinNada.provincia, "Córdoba");
  assert.deepEqual(faltantes(sinNada), ["cp"]);
});

test("una calle elegida sin número queda con el número faltante", () => {
  const d = normalizarDireccion(
    [
      c("Avenida Santa Fe", ["route"], "Av. Santa Fe"),
      c("Buenos Aires", ["locality", "political"]),
      c("Cdad. Autónoma de Buenos Aires", ["administrative_area_level_1", "political"], "CABA"),
    ],
    "Av. Santa Fe, Cdad. Autónoma de Buenos Aires, Argentina"
  );
  assert.equal(d.numero, "");
  assert.deepEqual(faltantes(d), ["numero", "cp"]);
  assert.equal(componerDireccion({ calle: d.calle, numero: "2200" }), "Avenida Santa Fe 2200");
});

test("sin `route` (algunos edificios), la calle sale del texto completo", () => {
  const d = normalizarDireccion(
    [c("1000", ["street_number"]), c("Vicente López", ["locality", "political"]), c("Provincia de Buenos Aires", ["administrative_area_level_1"])],
    "Av. Maipú 1000, Vicente López, Provincia de Buenos Aires, Argentina"
  );
  assert.equal(d.calle, "Av. Maipú");
  assert.equal(d.numero, "1000");
  assert.equal(d.provincia, "Buenos Aires");
});

test("el barrio no se repite cuando es la misma localidad", () => {
  const d = normalizarDireccion(
    [c("Rosario", ["locality", "political"]), c("Rosario", ["sublocality_level_1", "sublocality"]), c("Santa Fe", ["administrative_area_level_1"])],
    "Rosario, Santa Fe"
  );
  assert.equal(d.barrio, "");
  assert.equal(d.localidad, "Rosario");
});

// ---------- Validaciones de lo que manda el navegador ----------

test("la sesión es base64 apto para URL de hasta 36 caracteres, como exige Google", () => {
  assert.ok(sesionValida(SESION));
  assert.ok(sesionValida("abc_DEF-123"));
  assert.ok(!sesionValida("corta"));
  assert.ok(!sesionValida("x".repeat(37)));
  assert.ok(!sesionValida("con espacios no"));
  assert.ok(!sesionValida(undefined));
  assert.ok(placeIdValido("ChIJ5YQQf1GHhYARPKG7WLIaOko"));
  assert.ok(placeIdValido("fix-cabildo-1234"));
  assert.ok(!placeIdValido("../otra"));
  assert.ok(!placeIdValido(""));
});

// ---------- La API, contra el Google de mentira ----------

test("sugerir manda la clave en el header, Argentina, español y la sesión; devuelve hasta cinco", async () => {
  const pedidos: { url: string; init: RequestInit }[] = [];
  const espia: typeof fetch = ((url: string | URL | Request, init?: RequestInit) => {
    pedidos.push({ url: String(url), init: init ?? {} });
    return fetchPlacesFalso(url, init);
  }) as typeof fetch;

  const sugerencias = await sugerirDirecciones("cabildo 12", SESION, CONFIG, espia);

  assert.equal(pedidos.length, 1);
  assert.equal(pedidos[0].url, "http://places.prueba/v1/places:autocomplete");
  const cabeceras = pedidos[0].init.headers as Record<string, string>;
  assert.equal(cabeceras["X-Goog-Api-Key"], "prueba");
  assert.ok(cabeceras["X-Goog-FieldMask"].includes("placeId"));
  const cuerpo = JSON.parse(String(pedidos[0].init.body));
  assert.equal(cuerpo.input, "cabildo 12");
  assert.equal(cuerpo.sessionToken, SESION);
  assert.deepEqual(cuerpo.includedRegionCodes, ["ar"]);
  assert.equal(cuerpo.languageCode, "es-419");
  assert.ok(cuerpo.includedPrimaryTypes.length <= 5);

  assert.deepEqual(sugerencias, [
    { id: "fix-cabildo-1234", principal: "Av. Cabildo 1234", secundario: "Núñez, Buenos Aires, Argentina" },
  ]);
});

test("con menos de cuatro caracteres no se consulta a Google (no cuesta nada)", async () => {
  assert.deepEqual(await sugerirDirecciones("ca", SESION, CONFIG, fetchPlacesFalso), []);
  assert.equal(contadorPlaces.get("autocomplete"), undefined);
});

test("sin coincidencias devuelve lista vacía, no error", async () => {
  assert.deepEqual(await sugerirDirecciones("calle inexistente 999", SESION, CONFIG, fetchPlacesFalso), []);
});

test("detallar cierra la sesión por URL, pide solo campos Essentials y desarma la dirección", async () => {
  const pedidos: { url: string; init: RequestInit }[] = [];
  const espia: typeof fetch = ((url: string | URL | Request, init?: RequestInit) => {
    pedidos.push({ url: String(url), init: init ?? {} });
    return fetchPlacesFalso(url, init);
  }) as typeof fetch;

  const d = await detallarDireccion("fix-nunez-2422", SESION, CONFIG, espia);

  const url = new URL(pedidos[0].url);
  assert.equal(url.pathname, "/v1/places/fix-nunez-2422");
  assert.equal(url.searchParams.get("sessionToken"), SESION);
  assert.equal(url.searchParams.get("languageCode"), "es-419");
  const mascara = (pedidos[0].init.headers as Record<string, string>)["X-Goog-FieldMask"];
  assert.equal(mascara, "formattedAddress,addressComponents,postalAddress");
  // displayName es del tier Pro y encarece la sesión: nunca se pide.
  assert.ok(!mascara.includes("displayName"));

  assert.equal(d.calle, "Núñez");
  assert.equal(d.numero, "2422");
  assert.equal(d.cp, "1429"); // de "C1429AAG"
  assert.equal(d.provincia, "Ciudad Autónoma de Buenos Aires");
  assert.equal(d.localidad, "Buenos Aires");
});

test("todas las direcciones de prueba se desarman con provincia reconocida", async () => {
  for (const lugar of LUGARES) {
    const d = await detallarDireccion(lugar.id, SESION, CONFIG, fetchPlacesFalso);
    assert.ok(d.provincia, `sin provincia: ${lugar.id}`);
    assert.ok(d.calle, `sin calle: ${lugar.id}`);
  }
  const sinCp = await detallarDireccion("fix-villa-general-belgrano", SESION, CONFIG, fetchPlacesFalso);
  assert.deepEqual(faltantes(sinCp), ["cp"]);
  const sinNumero = await detallarDireccion("fix-av-santa-fe", SESION, CONFIG, fetchPlacesFalso);
  assert.deepEqual(faltantes(sinNumero), ["numero", "cp"]);
});

test("un error de Google distingue permanente (clave, cuota) de transitorio", async () => {
  const contestar = (status: number): typeof fetch =>
    (async () => new Response(JSON.stringify({ error: { message: "x", status: "ERR" } }), { status })) as typeof fetch;

  for (const status of [400, 403, 429]) {
    const error = await sugerirDirecciones("cabildo 1234", SESION, CONFIG, contestar(status)).catch((e) => e);
    assert.ok(error instanceof ErrorDirecciones);
    assert.equal(error.status, status);
    assert.ok(error.permanente, `${status} debería ser permanente`);
  }

  const caido = await sugerirDirecciones("cabildo 1234", SESION, CONFIG, contestar(503)).catch((e) => e);
  assert.ok(caido instanceof ErrorDirecciones && !caido.permanente);

  const sinRed: typeof fetch = (async () => {
    throw new TypeError("fetch failed");
  }) as typeof fetch;
  const noContesto = await detallarDireccion("fix-cabildo-1234", SESION, CONFIG, sinRed).catch((e) => e);
  assert.ok(noContesto instanceof ErrorDirecciones && noContesto.status === 0 && !noContesto.permanente);
});

test("el Google de mentira simula una caída con la palabra 'falla'", async () => {
  const error = await sugerirDirecciones("falla total", SESION, CONFIG, fetchPlacesFalso).catch((e) => e);
  assert.ok(error instanceof ErrorDirecciones && error.status === 503);
});

// ---------- El límite de búsquedas por IP ----------

test("sin Redis, el contador en memoria cuenta dentro de la ventana y vuelve a uno al vencer", async () => {
  const antes = { url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN };
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  try {
    assert.equal(await contarEnVentana("ip:1", 60_000, { ahora: 1_000 }), 1);
    assert.equal(await contarEnVentana("ip:1", 60_000, { ahora: 2_000 }), 2);
    assert.equal(await contarEnVentana("ip:2", 60_000, { ahora: 2_000 }), 1);
    assert.equal(await contarEnVentana("ip:1", 60_000, { ahora: 61_001 }), 1);
  } finally {
    if (antes.url) process.env.KV_REST_API_URL = antes.url;
    if (antes.token) process.env.KV_REST_API_TOKEN = antes.token;
  }
});

test("con Redis, cuenta con INCR y pone el vencimiento una sola vez; si Redis falla, deja pasar", async () => {
  process.env.KV_REST_API_URL = "http://redis.prueba";
  process.env.KV_REST_API_TOKEN = "t";
  try {
    let ahora = 1_000;
    const reloj = { ahora: () => ahora };
    const fetchImpl = fetchRedisFalso(reloj);

    assert.equal(await contarEnVentana("harper:direcciones:ip", 60_000, { fetchImpl }), 1);
    assert.equal(await contarEnVentana("harper:direcciones:ip", 60_000, { fetchImpl }), 2);
    assert.equal(await contarEnVentana("harper:direcciones:ip", 60_000, { fetchImpl }), 3);
    ahora += 61_000;
    assert.equal(await contarEnVentana("harper:direcciones:ip", 60_000, { fetchImpl }), 1);

    const roto: typeof fetch = (async () => new Response(JSON.stringify({ error: "ERR" }), { status: 500 })) as typeof fetch;
    assert.equal(await contarEnVentana("harper:direcciones:ip", 60_000, { fetchImpl: roto }), 1);
  } finally {
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
  }
});
