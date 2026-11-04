import { track } from "@vercel/analytics";

/**
 * La medición propia de la tienda, para el panel (Ale, 04/11/2026: «suma
 * analytics y todo eso»).
 *
 * Dos cosas, ninguna con cookies ni datos de la persona:
 *  - Vercel Web Analytics y Speed Insights (components/Medicion.tsx): visitas,
 *    de dónde llegan, qué páginas y qué tan rápido cargan. Se miran en Vercel.
 *  - Unos contadores del día en Redis (/api/medir) para el embudo del panel:
 *    cuántas visitas, cuántas abrieron una ficha, agregaron al carrito y
 *    empezaron el checkout. Cada uno cuenta una vez por pestaña, así el
 *    embudo compara visitas con visitas. Lo que se guarda es solo el número.
 *
 * No se mide el panel, las rutas de la API ni la página de baja (lleva en la
 * dirección el enlace firmado del mail). Tampoco a quien entró al panel en
 * ese navegador: las visitas de Ale no inflan las cifras.
 */

/** Lo que cuentan los contadores del panel. */
export const EVENTOS_MEDIDOS = ["visita", "producto", "carrito", "checkout"] as const;
export type EventoMedido = (typeof EVENTOS_MEDIDOS)[number];

/** Lo que además se le cuenta a Vercel; la compra la cuenta el panel desde Airtable. */
export type EventoDeMedicion = EventoMedido | "compra";

export function esEventoMedido(valor: unknown): valor is EventoMedido {
  return typeof valor === "string" && (EVENTOS_MEDIDOS as readonly string[]).includes(valor);
}

/** El nombre del evento en Vercel. La visita ya la cuenta Vercel sola. */
const NOMBRE_EN_VERCEL: Record<EventoDeMedicion, string | null> = {
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

/**
 * Cuenta un paso del embudo, una sola vez por pestaña (y, con `clave`, una
 * vez por esa clave: la compra, una por pedido). Nunca falla ni demora nada.
 */
export function medir(evento: EventoDeMedicion, opciones: { clave?: string } = {}) {
  if (typeof window === "undefined") return;
  try {
    if (rutaSinMedir(window.location.pathname) || esNavegadorDelPanel()) return;

    const marca = `harper.medido.${evento}${opciones.clave ? `.${opciones.clave}` : ""}`;
    try {
      if (window.sessionStorage.getItem(marca)) return;
      window.sessionStorage.setItem(marca, "1");
    } catch {
      // Sin almacenamiento puede contar de más en esta pestaña; no es grave.
    }

    if (esEventoMedido(evento)) {
      const enviado = typeof navigator.sendBeacon === "function" && navigator.sendBeacon("/api/medir", evento);
      if (!enviado) {
        void fetch("/api/medir", { method: "POST", body: evento, keepalive: true }).catch(() => {});
      }
    }

    const nombre = NOMBRE_EN_VERCEL[evento];
    if (nombre) track(nombre);
  } catch {
    // La medición nunca rompe la página.
  }
}
