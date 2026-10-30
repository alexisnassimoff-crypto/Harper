// Relativo (no "@/…") para que las pruebas, que compilan a CommonJS, lo resuelvan.
import { PROVINCIAS } from "../components/checkout/provincias";
import { provinciaDesdeCodigo } from "./provincias-codigo";

/**
 * Direcciones con Google Places API (New), desde el servidor.
 *
 * El checkout tiene un solo casillero de dirección: el comprador escribe,
 * Google sugiere, elige una de la lista y de ahí salen calle, número,
 * localidad, provincia y código postal, que son los datos de la etiqueta.
 *
 * La clave de Google vive solo en el servidor (GOOGLE_PLACES_API_KEY, en
 * lib/direcciones-servidor.ts): el navegador habla con /api/direcciones, nunca
 * con Google. Así la clave no viaja al cliente y no hace falta cargar el
 * JavaScript de Google Maps en el checkout. Este módulo es puro: lo importan
 * tanto la ruta como el formulario.
 *
 * Lo que Google NO garantiza en Argentina: el código postal no viene siempre,
 * y una calle sin número viene sin `street_number`. Por eso `faltantes()`
 * dice qué quedó sin completar y el formulario pide solo eso.
 *
 * Sin la clave, el checkout pide la dirección con los campos de siempre. Nada
 * deja de vender.
 */

/** Una sugerencia tal como se muestra en la lista. */
export type Sugerencia = {
  /** El `placeId` de Google: con él se pide el detalle. */
  id: string;
  /** "Av. Cabildo 1234" */
  principal: string;
  /** "Núñez, Buenos Aires, Argentina" */
  secundario: string;
};

/** La dirección ya desarmada en los datos que necesita la etiqueta. */
export type Direccion = {
  /** "Av. Cabildo" */
  calle: string;
  /** "1234", o "" si eligió una calle sin número. */
  numero: string;
  /** "Buenos Aires", "Vicente López". */
  localidad: string;
  /** "Núñez". Solo para mostrar. */
  barrio: string;
  /** Uno de PROVINCIAS, o "" si no se reconoció. */
  provincia: string;
  /** Cuatro dígitos, o "" si Google no lo trajo. */
  cp: string;
  /**
   * El partido ("San Isidro" para Martínez), si Google lo trajo: dice la zona
   * del reparto de AMBA (lib/rueddo.ts). No se muestra.
   */
  partido?: string;
  /** La dirección completa, como la escribe Google. */
  texto: string;
};

export type Faltante = "numero" | "cp" | "localidad" | "provincia";

/** Qué no vino en la respuesta y hay que pedirle al comprador. */
export function faltantes(d: Direccion): Faltante[] {
  const lista: Faltante[] = [];
  if (!d.numero) lista.push("numero");
  if (!d.cp) lista.push("cp");
  if (!d.localidad) lista.push("localidad");
  if (!d.provincia) lista.push("provincia");
  return lista;
}

// ---------- Normalización de lo que contesta Google ----------

/** Un `addressComponents[]` de Place Details (New). */
export type ComponenteGoogle = {
  longText?: string;
  shortText?: string;
  types?: string[];
};

/** El `postalAddress` de Place Details (New), si se pidió. */
export type PostalAddressGoogle = {
  postalCode?: string;
  administrativeArea?: string;
  locality?: string;
  sublocality?: string;
  addressLines?: string[];
};

const sinAcentos = (texto: string) =>
  texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Los cuatro dígitos del código postal argentino, venga como venga: "1426",
 * "C1426", "C1426AAG" o "C1426 AAG". Vacío si no hay cuatro dígitos seguidos.
 */
export function cpDesdeGoogle(valor: string | undefined): string {
  const digitos = /\d{4}/.exec(valor ?? "");
  return digitos ? digitos[0] : "";
}

/** La letra del CPA ("C1426AAG" → "C"), o "" si no viene con letra. */
function letraDelCpa(valor: string | undefined): string {
  const letra = /^\s*([A-Za-z])\d{4}/.exec(valor ?? "");
  return letra ? letra[1].toUpperCase() : "";
}

/**
 * El nombre oficial de la provincia a partir de lo que dice Google.
 *
 * Google nombra a la Ciudad de Buenos Aires de varias formas ("Cdad. Autónoma
 * de Buenos Aires", "CABA", "Buenos Aires") y a la provincia de otras
 * ("Provincia de Buenos Aires", "Buenos Aires"). Cuando el nombre no alcanza
 * para distinguirlas, desempata la letra del código postal (C es la ciudad,
 * B la provincia) y, si tampoco está, la localidad "Buenos Aires" es la ciudad.
 */
export function provinciaDesdeGoogle(opciones: {
  nombres: string[];
  codigoPostal?: string;
  localidad?: string;
}): string {
  const letra = letraDelCpa(opciones.codigoPostal);
  const candidatos = opciones.nombres.map(sinAcentos).filter(Boolean);

  for (const nombre of candidatos) {
    if (nombre.includes("autonoma") || nombre === "caba" || nombre.includes("capital federal")) {
      return "Ciudad Autónoma de Buenos Aires";
    }
  }

  for (const nombre of candidatos) {
    if (nombre.includes("buenos aires")) {
      if (letra === "C") return "Ciudad Autónoma de Buenos Aires";
      if (letra === "B") return "Buenos Aires";
      if (nombre.includes("provincia")) return "Buenos Aires";
      return sinAcentos(opciones.localidad ?? "") === "buenos aires"
        ? "Ciudad Autónoma de Buenos Aires"
        : "Buenos Aires";
    }
  }

  for (const nombre of candidatos) {
    for (const provincia of PROVINCIAS) {
      const oficial = sinAcentos(provincia);
      if (nombre === oficial || nombre.includes(oficial)) return provincia;
    }
  }

  // Último recurso: la letra del CPA identifica la provincia sin ambigüedad.
  return letra ? (provinciaDesdeCodigo(letra) ?? "") : "";
}

function componente(componentes: ComponenteGoogle[], tipo: string, corto = false): string {
  const encontrado = componentes.find((c) => c.types?.includes(tipo));
  return ((corto ? encontrado?.shortText : undefined) ?? encontrado?.longText ?? "").trim();
}

/**
 * Desarma la respuesta de Place Details en los datos de la etiqueta.
 *
 * `postalAddress` es opcional: cuando viene, su código postal tapa el agujero
 * de un `postal_code` ausente en los componentes.
 */
export function normalizarDireccion(
  componentes: ComponenteGoogle[],
  texto: string,
  postal?: PostalAddressGoogle
): Direccion {
  const codigoPostalCrudo = componente(componentes, "postal_code") || postal?.postalCode || "";

  const calle = componente(componentes, "route");
  const numero = componente(componentes, "street_number").replace(/\s+/g, "");

  const localidad =
    componente(componentes, "locality") ||
    postal?.locality ||
    componente(componentes, "administrative_area_level_2") ||
    componente(componentes, "sublocality_level_1") ||
    componente(componentes, "sublocality");

  const barrio =
    componente(componentes, "sublocality_level_1") ||
    componente(componentes, "sublocality") ||
    componente(componentes, "neighborhood");

  const provincia = provinciaDesdeGoogle({
    nombres: [
      componente(componentes, "administrative_area_level_1"),
      componente(componentes, "administrative_area_level_1", true),
      postal?.administrativeArea ?? "",
    ],
    codigoPostal: codigoPostalCrudo,
    localidad,
  });

  return {
    calle: calle || calleDesdeElTexto(texto, numero),
    numero,
    localidad,
    barrio: barrio === localidad ? "" : barrio,
    provincia,
    cp: cpDesdeGoogle(codigoPostalCrudo),
    ...(componente(componentes, "administrative_area_level_2")
      ? { partido: componente(componentes, "administrative_area_level_2").slice(0, 80) }
      : {}),
    texto: texto.trim(),
  };
}

/**
 * Sin `route` (pasa con algunos "premise": edificios con nombre), la calle se
 * saca de la dirección completa: el tramo que termina en el número de la
 * calle ("Edificio Kavanagh, Florida 1065, …" → "Florida"), o el primero.
 */
function calleDesdeElTexto(texto: string, numero: string): string {
  const tramos = texto.split(",").map((t) => t.trim()).filter(Boolean);
  if (tramos.length === 0) return "";

  const conNumero = numero ? tramos.find((t) => new RegExp(`\\s${numero}$`).test(t)) : undefined;
  if (conNumero) return conNumero.replace(/\s+\S+$/, "").trim();

  return tramos[0].replace(/\s+\d+\s*$/, "").trim();
}

/** "Av. Cabildo 1234" (+ ", 5° B" si cargó piso o depto): el campo Direccion del pedido. */
export function componerDireccion(d: Pick<Direccion, "calle" | "numero">, piso = ""): string {
  const base = `${d.calle} ${d.numero}`.trim();
  const extra = piso.trim();
  return extra ? `${base}, ${extra}` : base;
}

// ---------- La API de Google ----------

export type ConfiguracionDirecciones = {
  clave: string;
  /** Base de la API. Solo cambia en una prueba local, nunca en Vercel. */
  base: string;
};

export const BASE_PLACES = "https://places.googleapis.com";

/**
 * Un token de sesión como lo pide Google: base64 apto para URL, de hasta 36
 * caracteres (un UUID v4 entra justo). Lo genera el navegador por búsqueda y
 * lo cierra el detalle: así Google cobra la búsqueda entera como una sesión.
 */
export function sesionValida(valor: unknown): valor is string {
  return typeof valor === "string" && /^[A-Za-z0-9_-]{8,36}$/.test(valor);
}

/** Un placeId de Google: letras, números, guiones y guiones bajos. */
export function placeIdValido(valor: unknown): valor is string {
  return typeof valor === "string" && /^[A-Za-z0-9_-]{5,300}$/.test(valor);
}

/** Menos de esto no se consulta: ahorra plata y ruido. */
export const MINIMO_CARACTERES = 4;

export class ErrorDirecciones extends Error {
  constructor(
    mensaje: string,
    /** El HTTP con el que contestó Google (0 si no contestó). */
    readonly status: number
  ) {
    super(mensaje);
    this.name = "ErrorDirecciones";
  }

  /**
   * Verdadero si reintentar no va a servir: la clave está mal, la API no está
   * habilitada o se pasó la cuota. El checkout cae a los campos manuales.
   */
  get permanente() {
    return this.status === 400 || this.status === 401 || this.status === 403 || this.status === 429;
  }
}

/**
 * Solo direcciones: ni ciudades, ni barrios, ni comercios. Google filtra por
 * el tipo PRIMARIO del lugar, y a una dirección argentina con altura le puede
 * asignar `street_address`, `premise` o el genérico `geocode`: van los cinco
 * que permite (una ciudad tiene primario `locality`, así que queda afuera).
 */
const TIPOS_DE_DIRECCION = ["street_address", "subpremise", "premise", "route", "geocode"];

const CABECERAS = (clave: string) => ({
  "Content-Type": "application/json",
  "X-Goog-Api-Key": clave,
});

async function leerRespuesta<T>(respuesta: Response, que: string): Promise<T> {
  const cuerpo = (await respuesta.json().catch(() => null)) as
    | (T & { error?: { message?: string; status?: string } })
    | null;

  if (!respuesta.ok || !cuerpo) {
    const detalle = cuerpo?.error?.message ?? cuerpo?.error?.status ?? "respuesta ilegible";
    throw new ErrorDirecciones(`Google ${respuesta.status} al ${que}: ${detalle}`, respuesta.status);
  }

  return cuerpo;
}

type RespuestaAutocomplete = {
  suggestions?: {
    placePrediction?: {
      placeId?: string;
      text?: { text?: string };
      structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } };
      types?: string[];
    };
  }[];
};

/**
 * Las sugerencias para lo que escribió el comprador, limitadas a Argentina y
 * a direcciones. `sesion` agrupa todas las teclas de una misma búsqueda y el
 * detalle final en una sesión de facturación de Google.
 */
export async function sugerirDirecciones(
  input: string,
  sesion: string,
  config: ConfiguracionDirecciones,
  fetchImpl: typeof fetch = fetch
): Promise<Sugerencia[]> {
  const texto = input.trim().slice(0, 120);
  if (texto.length < MINIMO_CARACTERES) return [];

  let respuesta: Response;
  try {
    respuesta = await fetchImpl(`${config.base}/v1/places:autocomplete`, {
      method: "POST",
      headers: {
        ...CABECERAS(config.clave),
        "X-Goog-FieldMask":
          "suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat,suggestions.placePrediction.types",
      },
      body: JSON.stringify({
        input: texto,
        sessionToken: sesion,
        includedRegionCodes: ["ar"],
        regionCode: "ar",
        languageCode: "es-419",
        includedPrimaryTypes: TIPOS_DE_DIRECCION,
      }),
      signal: AbortSignal.timeout(6_000),
      cache: "no-store",
    });
  } catch (error) {
    throw new ErrorDirecciones(`Google no contestó al sugerir: ${error instanceof Error ? error.message : error}`, 0);
  }

  const cuerpo = await leerRespuesta<RespuestaAutocomplete>(respuesta, "sugerir");

  const sugerencias: Sugerencia[] = [];
  for (const s of cuerpo.suggestions ?? []) {
    const p = s.placePrediction;
    if (!p?.placeId) continue;

    const completo = p.text?.text?.trim() ?? "";
    const principal = p.structuredFormat?.mainText?.text?.trim() || completo.split(",")[0];
    const secundario =
      p.structuredFormat?.secondaryText?.text?.trim() ||
      completo.slice(principal.length).replace(/^,\s*/, "");

    sugerencias.push({ id: p.placeId, principal, secundario });
  }

  return sugerencias.slice(0, 5);
}

type RespuestaDetalle = {
  formattedAddress?: string;
  addressComponents?: ComponenteGoogle[];
  postalAddress?: PostalAddressGoogle;
};

/** El detalle de la sugerencia elegida, ya desarmado. Cierra la sesión. */
export async function detallarDireccion(
  placeId: string,
  sesion: string,
  config: ConfiguracionDirecciones,
  fetchImpl: typeof fetch = fetch
): Promise<Direccion> {
  const url = new URL(`${config.base}/v1/places/${encodeURIComponent(placeId)}`);
  url.searchParams.set("sessionToken", sesion);
  url.searchParams.set("languageCode", "es-419");
  url.searchParams.set("regionCode", "ar");

  let respuesta: Response;
  try {
    respuesta = await fetchImpl(url, {
      method: "GET",
      headers: {
        ...CABECERAS(config.clave),
        "X-Goog-FieldMask": "formattedAddress,addressComponents,postalAddress",
      },
      signal: AbortSignal.timeout(6_000),
      cache: "no-store",
    });
  } catch (error) {
    throw new ErrorDirecciones(`Google no contestó al detallar: ${error instanceof Error ? error.message : error}`, 0);
  }

  const cuerpo = await leerRespuesta<RespuestaDetalle>(respuesta, "detallar");

  return normalizarDireccion(cuerpo.addressComponents ?? [], cuerpo.formattedAddress ?? "", cuerpo.postalAddress);
}
