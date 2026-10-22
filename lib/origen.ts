/**
 * De dónde vino el visitante: UTM, fbclid y página de llegada.
 *
 * Se captura en el navegador al entrar, viaja con el checkout y se guarda en
 * el pedido (campo `Origen`). Así cada venta dice qué anuncio la generó, y la
 * Conversions API de Meta recibe los mismos identificadores que el píxel.
 *
 * Este módulo no toca el DOM ni Airtable: es puro, para poder probarlo. Lo
 * usan el navegador (lib/pixel.ts, CapturaOrigen) y el servidor (checkout).
 */

export const CLAVE_ORIGEN = "harper.origen.v1";

/** Cuánto vale una atribución guardada: 30 días, como la ventana de Meta. */
export const VIGENCIA_ORIGEN_MS = 30 * 24 * 60 * 60 * 1000;

const CLAVES_UTM = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;
const CLAVES_CLICK = ["fbclid", "gclid", "ttclid"] as const;

/** Largo máximo de cada valor: nada de guardar una novela en Airtable. */
const MAX_LARGO = 200;

export type Origen = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  fbclid?: string;
  gclid?: string;
  ttclid?: string;
  /** Primera página que abrió, sin dominio. */
  landing?: string;
  /** De dónde venía (sin query string). */
  referrer?: string;
  /** Cookies del píxel de Meta, para la Conversions API. */
  fbp?: string;
  fbc?: string;
  /** Cuándo se capturó, en milisegundos desde 1970. */
  ts?: number;
};

function recortar(valor: string | null | undefined): string | undefined {
  const limpio = (valor ?? "").trim().slice(0, MAX_LARGO);
  return limpio ? limpio : undefined;
}

/**
 * Lee la atribución de una URL de llegada.
 *
 * Devuelve `null` si la URL no trae nada de campaña: en ese caso no vale la
 * pena pisar una atribución anterior.
 */
export function leerOrigenDeUrl(datos: {
  search: string;
  pathname: string;
  referrer?: string;
  ahora: number;
}): Origen | null {
  const params = new URLSearchParams(datos.search);
  const origen: Origen = {};

  for (const clave of CLAVES_UTM) {
    const valor = recortar(params.get(clave));
    if (valor) origen[clave] = valor;
  }
  for (const clave of CLAVES_CLICK) {
    const valor = recortar(params.get(clave));
    if (valor) origen[clave] = valor;
  }

  if (Object.keys(origen).length === 0) return null;

  origen.landing = recortar(datos.pathname) ?? "/";
  const referrer = recortar(datos.referrer?.split("?")[0]);
  if (referrer) origen.referrer = referrer;
  origen.ts = datos.ahora;

  return origen;
}

/**
 * Si un fbclid llegó en la URL, Meta espera la cookie `_fbc` con esta forma.
 * El píxel la crea solo cuando carga; si el visitante compró antes de que el
 * script cargara (o lo bloqueó), se arma acá a partir del click id.
 */
export function fbcDesdeClickId(fbclid: string | undefined, ts: number): string | undefined {
  if (!fbclid) return undefined;
  return `fb.1.${ts}.${fbclid}`;
}

/**
 * Limpia lo que mandó el navegador antes de guardarlo en el pedido.
 *
 * Solo pasan las claves conocidas, recortadas. Cualquier otra cosa se tira.
 * Devuelve `null` si no queda nada útil.
 */
export function normalizarOrigen(crudo: unknown): Origen | null {
  if (typeof crudo !== "object" || crudo === null) return null;

  const datos = crudo as Record<string, unknown>;
  const origen: Origen = {};

  const texto = (clave: keyof Origen) => {
    const valor = datos[clave];
    return typeof valor === "string" ? recortar(valor) : undefined;
  };

  for (const clave of [...CLAVES_UTM, ...CLAVES_CLICK, "landing", "referrer", "fbp", "fbc"] as const) {
    const valor = texto(clave);
    if (valor) origen[clave] = valor;
  }

  const ts = datos.ts;
  if (typeof ts === "number" && Number.isFinite(ts) && ts > 0) origen.ts = Math.floor(ts);

  return Object.keys(origen).length > 0 ? origen : null;
}

/** Verdadero si la atribución guardada todavía vale. */
export function origenVigente(origen: Origen | null, ahora: number): origen is Origen {
  if (!origen) return false;
  if (!origen.ts) return true;
  return ahora - origen.ts <= VIGENCIA_ORIGEN_MS;
}

/** Resumen de una línea para leer en Airtable de un vistazo. */
export function resumirOrigen(origen: Origen | null): string {
  if (!origen) return "";
  const partes = [origen.utm_source, origen.utm_medium, origen.utm_campaign].filter(Boolean);
  if (partes.length === 0 && origen.fbclid) return "meta (fbclid)";
  return partes.join(" / ");
}
