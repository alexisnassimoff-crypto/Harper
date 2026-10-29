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
import { claveDeIp, consumirCuota, reiniciarCuotaEnMemoria, type Ventana } from "../lib/cuota";
import { fetchRedisFalso, leerRedis, reiniciarRedis } from "../lib/fixtures/redis";
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

test("sin `route` (algunos edificios), la calle sale del texto completo: el tramo que termina en el número", () => {
  const d = normalizarDireccion(
    [c("1000", ["street_number"]), c("Vicente López", ["locality", "political"]), c("Provincia de Buenos Aires", ["administrative_area_level_1"])],
    "Av. Maipú 1000, Vicente López, Provincia de Buenos Aires, Argentina"
  );
  assert.equal(d.calle, "Av. Maipú");
  assert.equal(d.numero, "1000");
  assert.equal(d.provincia, "Buenos Aires");

  // Un edificio con nombre: la calle no es el nombre del edificio.
  const kavanagh = normalizarDireccion(
    [c("1065", ["street_number"]), c("Retiro", ["sublocality_level_1"]), c("Buenos Aires", ["locality"]), c("Cdad. Autónoma de Buenos Aires", ["administrative_area_level_1"]), c("C1005", ["postal_code"])],
    "Edificio Kavanagh, Florida 1065, C1005 Cdad. Autónoma de Buenos Aires, Argentina"
  );
  assert.equal(kavanagh.calle, "Florida");
  assert.equal(componerDireccion(kavanagh), "Florida 1065");

  // Sin número ni route: el primer tramo, sin un número final.
  assert.equal(normalizarDireccion([], "Ruta 9 km 120, Campana").calle, "Ruta 9 km");
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

// ---------- Las cuotas de búsqueda ----------

const ventanasDe = (ip: string): Ventana[] => [
  { clave: `ip:${ip}`, ventanaMs: 60_000, limite: 2 },
  { clave: "total", ventanaMs: 60_000, limite: 3 },
];

test("sin Redis: cuenta en memoria por ventana, informa la primera excedida y arranca de cero en la ranura siguiente", async () => {
  const antes = { url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN };
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  try {
    assert.deepEqual(await consumirCuota(ventanasDe("a"), { ahora: 1_000 }), { excedida: null, cuentas: [1, 1] });
    assert.deepEqual(await consumirCuota(ventanasDe("a"), { ahora: 2_000 }), { excedida: null, cuentas: [2, 2] });
    assert.equal((await consumirCuota(ventanasDe("a"), { ahora: 3_000 })).excedida, "ip:a");
    // Otra IP entra por la suya, pero el total ya va por cuatro.
    const otra = await consumirCuota(ventanasDe("b"), { ahora: 4_000 });
    assert.equal(otra.excedida, "total");
    assert.deepEqual(otra.cuentas, [1, 4]);
    // Pasado el minuto es otra ranura: todo vuelve a empezar.
    assert.deepEqual(await consumirCuota(ventanasDe("a"), { ahora: 61_000 }), { excedida: null, cuentas: [1, 1] });
  } finally {
    if (antes.url) process.env.KV_REST_API_URL = antes.url;
    if (antes.token) process.env.KV_REST_API_TOKEN = antes.token;
  }
});

test("con Redis: un solo viaje por consulta (pipeline), contador compartido con vencimiento, y pasado el límite no se gasta ni un comando más", async () => {
  process.env.KV_REST_API_URL = "http://redis.prueba";
  process.env.KV_REST_API_TOKEN = "t";
  try {
    let ahora = 1_000;
    const reloj = { ahora: () => ahora };
    const falso = fetchRedisFalso(reloj);
    const viajes: string[] = [];
    const fetchImpl: typeof fetch = ((url: string | URL | Request, init?: RequestInit) => {
      viajes.push(String(url));
      return falso(url, init);
    }) as typeof fetch;
    const ventanas: Ventana[] = [{ clave: "ip:x", ventanaMs: 60_000, limite: 2 }];
    const claveRedis = `harper:cuota:ip:x:${Math.floor(ahora / 60_000)}`;

    assert.deepEqual(await consumirCuota(ventanas, { fetchImpl, ahora }), { excedida: null, cuentas: [1] });
    assert.equal(viajes.length, 1);
    assert.ok(viajes[0].endsWith("/pipeline"));
    assert.equal(leerRedis(claveRedis, ahora), "1");
    // El vencimiento quedó puesto: dos ventanas después, la clave ya no está.
    assert.equal(leerRedis(claveRedis, ahora + 121_000), null);

    // El contador que manda es el de Redis: otra instancia (memoria vacía) ve lo acumulado.
    reiniciarCuotaEnMemoria();
    assert.deepEqual((await consumirCuota(ventanas, { fetchImpl, ahora })).cuentas, [2]);
    assert.equal((await consumirCuota(ventanas, { fetchImpl, ahora })).excedida, "ip:x");
    assert.equal(viajes.length, 3);

    // Ya excedida en esta instancia: se contesta sin tocar Redis.
    for (let i = 0; i < 5; i++) assert.equal((await consumirCuota(ventanas, { fetchImpl, ahora })).excedida, "ip:x");
    assert.equal(viajes.length, 3);

    ahora += 61_000;
    assert.deepEqual(await consumirCuota(ventanas, { fetchImpl, ahora }), { excedida: null, cuentas: [1] });
  } finally {
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
  }
});

test("con soloMemoria no se toca Redis aunque esté configurado, y el límite vale igual", async () => {
  process.env.KV_REST_API_URL = "http://redis.prueba";
  process.env.KV_REST_API_TOKEN = "t";
  try {
    let viajes = 0;
    const contar: typeof fetch = (async () => { viajes++; return new Response("[]"); }) as typeof fetch;
    const ventanas: Ventana[] = [{ clave: "ip:m", ventanaMs: 60_000, limite: 2 }];
    assert.deepEqual(await consumirCuota(ventanas, { fetchImpl: contar, ahora: 5_000, soloMemoria: true }), { excedida: null, cuentas: [1] });
    assert.deepEqual(await consumirCuota(ventanas, { fetchImpl: contar, ahora: 5_000, soloMemoria: true }), { excedida: null, cuentas: [2] });
    assert.equal((await consumirCuota(ventanas, { fetchImpl: contar, ahora: 5_000, soloMemoria: true })).excedida, "ip:m");
    assert.equal(viajes, 0);
  } finally {
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
  }
});

test("si Redis falla, valen los contadores en memoria: el límite no desaparece", async () => {
  process.env.KV_REST_API_URL = "http://redis.prueba";
  process.env.KV_REST_API_TOKEN = "t";
  try {
    const roto: typeof fetch = (async () => new Response(JSON.stringify({ error: "ERR" }), { status: 500 })) as typeof fetch;
    const ventanas: Ventana[] = [{ clave: "ip:y", ventanaMs: 60_000, limite: 2 }];
    assert.deepEqual(await consumirCuota(ventanas, { fetchImpl: roto, ahora: 5_000 }), { excedida: null, cuentas: [1] });
    assert.deepEqual(await consumirCuota(ventanas, { fetchImpl: roto, ahora: 5_000 }), { excedida: null, cuentas: [2] });
    assert.equal((await consumirCuota(ventanas, { fetchImpl: roto, ahora: 5_000 })).excedida, "ip:y");
  } finally {
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;
  }
});

test("la clave de cuota de una IP: IPv4 tal cual, IPv4 mapeada en IPv6, e IPv6 por su /64", () => {
  assert.equal(claveDeIp("203.0.113.9"), "203.0.113.9");
  assert.equal(claveDeIp(" 203.0.113.9 "), "203.0.113.9");
  assert.equal(claveDeIp("::ffff:203.0.113.9"), "203.0.113.9");
  assert.equal(claveDeIp("2800:810:4a9:3f0:1:2:3:4"), "2800:0810:04a9:03f0::/64");
  // Dos direcciones del mismo /64 cuentan juntas; otro /64 aparte.
  assert.equal(claveDeIp("2800:810:4a9:3f0::1"), claveDeIp("2800:810:4a9:3f0::ffff"));
  assert.notEqual(claveDeIp("2800:810:4a9:3f0::1"), claveDeIp("2800:810:4a9:3f1::1"));
  assert.equal(claveDeIp("::1"), "0000:0000:0000:0000::/64");
  assert.equal(claveDeIp(""), "sin-ip");
});
