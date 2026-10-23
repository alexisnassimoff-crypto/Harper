/**
 * Un Google Places de mentira, en memoria.
 *
 * Contesta a `POST /v1/places:autocomplete` y `GET /v1/places/{id}` con la
 * misma forma que Places API (New), así `lib/direcciones.ts` corre tal cual en
 * modo de prueba y en las pruebas de recorrido, sin red ni clave.
 *
 * Las direcciones imitan lo que Google devuelve en Argentina, incluidos sus
 * agujeros: un pueblo sin código postal y una avenida elegida sin número.
 */

type Componente = { longText: string; shortText: string; types: string[]; languageCode: string };

type Lugar = {
  id: string;
  principal: string;
  secundario: string;
  texto: string;
  tipo: "street_address" | "route" | "premise";
  componentes: Componente[];
  postalAddress?: { postalCode?: string; administrativeArea?: string; locality?: string };
};

const c = (longText: string, types: string[], shortText = longText): Componente => ({
  longText,
  shortText,
  types,
  languageCode: "es-419",
});

const caba = (barrio: string, cp: string) => [
  c(barrio, ["sublocality_level_1", "sublocality", "political"]),
  c("Buenos Aires", ["locality", "political"]),
  c("Cdad. Autónoma de Buenos Aires", ["administrative_area_level_1", "political"], "CABA"),
  c("Argentina", ["country", "political"], "AR"),
  c(cp, ["postal_code"]),
];

export const LUGARES: Lugar[] = [
  {
    id: "fix-cabildo-1234",
    principal: "Av. Cabildo 1234",
    secundario: "Núñez, Buenos Aires, Argentina",
    texto: "Av. Cabildo 1234, C1426 Cdad. Autónoma de Buenos Aires, Argentina",
    tipo: "street_address",
    componentes: [c("1234", ["street_number"]), c("Avenida Cabildo", ["route"], "Av. Cabildo"), ...caba("Núñez", "C1426")],
  },
  {
    id: "fix-nunez-2422",
    principal: "Núñez 2422",
    secundario: "Núñez, Buenos Aires, Argentina",
    texto: "Núñez 2422, C1429 Cdad. Autónoma de Buenos Aires, Argentina",
    tipo: "street_address",
    componentes: [c("2422", ["street_number"]), c("Núñez", ["route"]), ...caba("Núñez", "C1429AAG")],
  },
  {
    id: "fix-maipu-1000",
    principal: "Av. Maipú 1000",
    secundario: "Vicente López, Provincia de Buenos Aires, Argentina",
    texto: "Av. Maipú 1000, B1638 Vicente López, Provincia de Buenos Aires, Argentina",
    tipo: "street_address",
    componentes: [
      c("1000", ["street_number"]),
      c("Avenida Maipú", ["route"], "Av. Maipú"),
      c("Vicente López", ["locality", "political"]),
      c("Vicente López", ["administrative_area_level_2", "political"]),
      c("Provincia de Buenos Aires", ["administrative_area_level_1", "political"], "Provincia de Buenos Aires"),
      c("Argentina", ["country", "political"], "AR"),
      c("B1638", ["postal_code"]),
    ],
  },
  {
    id: "fix-san-juan-500",
    principal: "Bv. San Juan 500",
    secundario: "Centro, Córdoba, Argentina",
    texto: "Bv. San Juan 500, X5000 Córdoba, Argentina",
    tipo: "street_address",
    componentes: [
      c("500", ["street_number"]),
      c("Boulevard San Juan", ["route"], "Bv. San Juan"),
      c("Centro", ["sublocality_level_1", "sublocality", "political"]),
      c("Córdoba", ["locality", "political"]),
      c("Capital", ["administrative_area_level_2", "political"]),
      c("Córdoba", ["administrative_area_level_1", "political"], "Córdoba"),
      c("Argentina", ["country", "political"], "AR"),
      c("X5000", ["postal_code"]),
    ],
  },
  {
    // Un pueblo donde Google no trae el código postal: el checkout lo pide.
    id: "fix-villa-general-belgrano",
    principal: "San Martín 150",
    secundario: "Villa General Belgrano, Córdoba, Argentina",
    texto: "San Martín 150, Villa General Belgrano, Córdoba, Argentina",
    tipo: "street_address",
    componentes: [
      c("150", ["street_number"]),
      c("San Martín", ["route"]),
      c("Villa General Belgrano", ["locality", "political"]),
      c("Calamuchita", ["administrative_area_level_2", "political"]),
      c("Córdoba", ["administrative_area_level_1", "political"], "Córdoba"),
      c("Argentina", ["country", "political"], "AR"),
    ],
  },
  {
    // Una avenida elegida sin número: el checkout pide el número.
    id: "fix-av-santa-fe",
    principal: "Av. Santa Fe",
    secundario: "Buenos Aires, Argentina",
    texto: "Av. Santa Fe, Cdad. Autónoma de Buenos Aires, Argentina",
    tipo: "route",
    componentes: [
      c("Avenida Santa Fe", ["route"], "Av. Santa Fe"),
      c("Buenos Aires", ["locality", "political"]),
      c("Cdad. Autónoma de Buenos Aires", ["administrative_area_level_1", "political"], "CABA"),
      c("Argentina", ["country", "political"], "AR"),
    ],
  },
  {
    id: "fix-pellegrini-1200",
    principal: "Av. Pellegrini 1200",
    secundario: "Rosario, Santa Fe, Argentina",
    texto: "Av. Pellegrini 1200, S2000 Rosario, Santa Fe, Argentina",
    tipo: "street_address",
    componentes: [
      c("1200", ["street_number"]),
      c("Avenida Pellegrini", ["route"], "Av. Pellegrini"),
      c("Rosario", ["locality", "political"]),
      c("Rosario", ["administrative_area_level_2", "political"]),
      c("Santa Fe", ["administrative_area_level_1", "political"], "Santa Fe"),
      c("Argentina", ["country", "political"], "AR"),
      c("S2000", ["postal_code"]),
    ],
    postalAddress: { postalCode: "S2000", administrativeArea: "Santa Fe", locality: "Rosario" },
  },
];

const limpiar = (t: string) =>
  t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Cada palabra escrita tiene que ser el comienzo de alguna palabra de la dirección. */
function coincide(lugar: Lugar, input: string) {
  const palabras = limpiar(`${lugar.principal} ${lugar.secundario}`).split(" ");
  return limpiar(input)
    .split(" ")
    .every((p) => palabras.some((palabra) => palabra.startsWith(p)));
}

/** Cuántas llamadas atendió, por tipo. Para asegurar qué se consultó y qué no. */
export const contadorPlaces = new Map<"autocomplete" | "detalle", number>();

export function reiniciarPlaces() {
  contadorPlaces.clear();
}

function contar(que: "autocomplete" | "detalle") {
  contadorPlaces.set(que, (contadorPlaces.get(que) ?? 0) + 1);
}

/** Un `fetch` que contesta como Places API (New), sobre las direcciones de prueba. */
export const fetchPlacesFalso: typeof fetch = (async (entrada: string | URL | Request, init?: RequestInit) => {
  const url = new URL(entrada instanceof Request ? entrada.url : String(entrada));
  const json = (status: number, cuerpo: unknown) =>
    new Response(JSON.stringify(cuerpo), { status, headers: { "Content-Type": "application/json" } });

  if (url.pathname === "/v1/places:autocomplete") {
    contar("autocomplete");
    const cuerpo = JSON.parse(String(init?.body ?? "{}")) as { input?: string };
    const input = cuerpo.input ?? "";

    // Una palabra mágica para probar que un fallo de Google no frena la compra.
    if (/^falla/i.test(input)) return json(503, { error: { message: "simulado", status: "UNAVAILABLE" } });

    const suggestions = LUGARES.filter((l) => coincide(l, input)).map((l) => ({
      placePrediction: {
        place: `places/${l.id}`,
        placeId: l.id,
        text: { text: `${l.principal}, ${l.secundario}` },
        structuredFormat: { mainText: { text: l.principal }, secondaryText: { text: l.secundario } },
        types: [l.tipo, "geocode"],
      },
    }));
    return json(200, suggestions.length > 0 ? { suggestions } : {});
  }

  const detalle = /^\/v1\/places\/(.+)$/.exec(url.pathname);
  if (detalle) {
    contar("detalle");
    const lugar = LUGARES.find((l) => l.id === decodeURIComponent(detalle[1]));
    if (!lugar) return json(404, { error: { message: "Not found", status: "NOT_FOUND" } });
    return json(200, {
      id: lugar.id,
      formattedAddress: lugar.texto,
      addressComponents: lugar.componentes,
      ...(lugar.postalAddress ? { postalAddress: lugar.postalAddress } : {}),
    });
  }

  return json(404, { error: { message: `ruta de prueba desconocida: ${url.pathname}`, status: "NOT_FOUND" } });
}) as typeof fetch;
