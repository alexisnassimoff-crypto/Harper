import { track } from "@vercel/analytics";
import { canalDeLaVisita, esCanal, type Canal } from "./canales";

/**
 * La medición propia de la tienda, para el panel (Ale, 04/11/2026: «suma
 * analytics y todo eso»).
 *
 * Dos cosas, ninguna con cookies ni datos de la persona:
 *  - Vercel Web Analytics y Speed Insights (components/Medicion.tsx): visitas,
 *    de dónde llegan, qué páginas y qué tan rápido cargan. Se miran en Vercel.
 *  - Unos contadores del día en Redis (/api/medir) para el panel: cuántas
 *    visitas, cuántas abrieron una ficha, agregaron al carrito, empezaron el
 *    checkout y compraron, y por qué canal llegaron (lib/canales.ts). Cada
 *    paso cuenta una vez por pestaña, así se comparan visitas con visitas. Lo
 *    que se guarda es solo el número.
 *
 * En el navegador queda, mientras dura la pestaña (sessionStorage, no una
 * cookie), el canal con el que llegó y qué pasos ya se contaron: nada más.
 *
 * No se mide el panel, las rutas de la API ni la página de baja (lleva en la
 * dirección el enlace firmado del mail). Tampoco a quien entró al panel en
 * ese navegador: las visitas de Ale no inflan las cifras.
 */

/** Lo que cuentan los contadores del panel. */
export const EVENTOS_MEDIDOS = ["visita", "producto", "carrito", "checkout", "compra"] as const;
export type EventoMedido = (typeof EVENTOS_MEDIDOS)[number];

export function esEventoMedido(valor: unknown): valor is EventoMedido {
  return typeof valor === "string" && (EVENTOS_MEDIDOS as readonly string[]).includes(valor);
}

/** El nombre del evento en Vercel. La visita ya la cuenta Vercel sola. */
const NOMBRE_EN_VERCEL: Record<EventoMedido, string | null> = {
  visita: null,
  producto: "Abrió una ficha",
  carrito: "Agregó al carrito",
  checkout: "Empezó el checkout",
  compra: "Compró",
};

/** La marca que deja el panel en el navegador de Ale: desde ahí no se mide. */
export const CLAVE_NAVEGADOR_DEL_PANEL = "harper.panel.este-navegador";

/** Rutas que no se miden. */
export function rutaSinMedir(ruta: string): boolean {
  return (
    ruta === "/panel" ||
    ruta.startsWith("/panel/") ||
    ruta.startsWith("/api/") ||
    ruta.startsWith("/suscriptores/baja")
  );
}

/** Los parámetros de la dirección que sí viajan a Vercel: los de campaña. */
const PARAMETROS_DE_CAMPANA = /^utm_(source|medium|campaign|content|term)$/;

/**
 * La dirección como la ve Vercel: sin la parte de búsqueda salvo los utm_
 * (el número de pedido de /gracias, un enlace firmado o el mail de alguien
 * nunca salen). Null si esa ruta no se mide.
 */
export function direccionParaMedir(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (rutaSinMedir(u.pathname)) return null;
  const campana = new URLSearchParams();
  u.searchParams.forEach((valor, clave) => {
    if (PARAMETROS_DE_CAMPANA.test(clave)) campana.append(clave, valor.slice(0, 100));
  });
  const busqueda = campana.toString();
  return `${u.origin}${u.pathname}${busqueda ? `?${busqueda}` : ""}`;
}

/** Si este navegador es el de quien entra al panel. */
export function esNavegadorDelPanel(): boolean {
  try {
    return window.localStorage.getItem(CLAVE_NAVEGADOR_DEL_PANEL) === "1";
  } catch {
    return false;
  }
}

/** El `beforeSend` de Vercel Analytics y Speed Insights. */
export function filtrarParaVercel<T extends { url: string }>(evento: T): T | null {
  if (typeof window !== "undefined" && esNavegadorDelPanel()) return null;
  const url = direccionParaMedir(evento.url);
  return url ? { ...evento, url } : null;
}

/** El cuerpo que viaja a /api/medir: «evento:canal». */
export function cuerpoDeMedicion(evento: EventoMedido, canal: Canal) {
  return `${evento}:${canal}`;
}

/** Lo contrario, en el servidor. Null si no es un evento conocido; sin canal, «sin_dato». */
export function leerCuerpoDeMedicion(crudo: string): { evento: EventoMedido; canal: Canal } | null {
  const [evento, canal, sobra] = crudo.trim().slice(0, 40).split(":");
  if (!esEventoMedido(evento) || sobra !== undefined) return null;
  if (canal === undefined) return { evento, canal: "sin_dato" };
  return esCanal(canal) ? { evento, canal } : null;
}

const CLAVE_CANAL = "harper.medido.canal";
/** Por si el navegador no deja guardar: vale para esta página. */
let canalEnMemoria: Canal | null = null;

/** Manda un paso a /api/medir y, si tiene nombre, a Vercel. */
function enviar(evento: EventoMedido, canal: Canal) {
  const cuerpo = cuerpoDeMedicion(evento, canal);
  const enviado = typeof navigator.sendBeacon === "function" && navigator.sendBeacon("/api/medir", cuerpo);
  if (!enviado) {
    void fetch("/api/medir", { method: "POST", body: cuerpo, keepalive: true }).catch(() => {});
  }
  const nombre = NOMBRE_EN_VERCEL[evento];
  if (nombre) track(nombre, { canal });
}

/**
 * El canal de esta pestaña: el guardado o, en la primera página que se mide,
 * el que se detecta. Esa primera vez también cuenta la visita (si es una
 * visita nueva), sea cual sea el paso que llegó primero.
 */
function canalDeEstaPestana(): Canal {
  let guardado: string | null = canalEnMemoria;
  try {
    guardado = window.sessionStorage.getItem(CLAVE_CANAL) ?? guardado;
  } catch {
    // Sin almacenamiento, vale el de memoria.
  }
  if (esCanal(guardado)) return guardado;

  const { canal, cuentaComoVisita } = canalDeLaVisita({
    search: window.location.search,
    referencia: document.referrer,
    hostPropio: window.location.hostname,
    ruta: window.location.pathname,
  });
  canalEnMemoria = canal;
  try {
    window.sessionStorage.setItem(CLAVE_CANAL, canal);
  } catch {
    // Igual que arriba.
  }
  if (cuentaComoVisita) enviar("visita", canal);
  return canal;
}

/**
 * Cuenta un paso, una sola vez por pestaña (y, con `clave`, una vez por esa
 * clave: la compra, una por pedido). La visita cuenta sola, en la primera
 * página de la pestaña: `medir("visita")` solo se asegura de que eso pase.
 * Nunca falla ni demora nada.
 */
export function medir(evento: EventoMedido, opciones: { clave?: string } = {}) {
  if (typeof window === "undefined") return;
  try {
    if (rutaSinMedir(window.location.pathname) || esNavegadorDelPanel()) return;

    const canal = canalDeEstaPestana();
    if (evento === "visita") return;

    const marca = `harper.medido.${evento}${opciones.clave ? `.${opciones.clave}` : ""}`;
    try {
      if (window.sessionStorage.getItem(marca)) return;
      window.sessionStorage.setItem(marca, "1");
    } catch {
      // Sin almacenamiento puede contar de más en esta pestaña; no es grave.
    }
    enviar(evento, canal);
  } catch {
    // La medición nunca rompe la página.
  }
}
