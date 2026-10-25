/**
 * La elección de cookies de la persona, del lado del navegador.
 *
 * Dos categorías:
 *  - Necesarias: siempre activas. Carrito, checkout, seguridad y recordar
 *    esta misma elección. No requieren consentimiento.
 *  - Medición y publicidad: Meta Pixel (con sus cookies _fbp y _fbc), la
 *    atribución de campañas (UTM, fbclid) y el aviso de la compra a Meta por
 *    la Conversions API. Solo con un "sí" explícito.
 *
 * Mientras no elija, se comporta como un "no". Rechazar no impide comprar.
 * La elección vive en el navegador (localStorage) y se puede cambiar desde
 * "Preferencias de cookies" en el pie.
 */

export const CLAVE_CONSENTIMIENTO = "harper.consentimiento.v1";

/** Cambia cuando cambien las categorías: obliga a volver a preguntar. */
export const VERSION_CONSENTIMIENTO = 1;

/** Se emite en `window` cuando la persona elige o cambia su elección. */
export const EVENTO_CONSENTIMIENTO = "harper:consentimiento";

/** Se emite en `window` para abrir el panel de preferencias (desde el pie). */
export const EVENTO_ABRIR_PREFERENCIAS = "harper:abrir-preferencias-cookies";

export type Consentimiento = {
  version: number;
  publicidad: boolean;
  /** ISO 8601: cuándo eligió. */
  fecha: string;
};

/** Lo guardado, si es de esta versión; si no hay o es viejo, null (= no eligió). */
export function leerConsentimiento(): Consentimiento | null {
  if (typeof window === "undefined") return null;
  try {
    const crudo = window.localStorage.getItem(CLAVE_CONSENTIMIENTO);
    if (!crudo) return null;
    const dato = JSON.parse(crudo) as Partial<Consentimiento>;
    if (dato.version !== VERSION_CONSENTIMIENTO || typeof dato.publicidad !== "boolean") return null;
    return { version: dato.version, publicidad: dato.publicidad, fecha: String(dato.fecha ?? "") };
  } catch {
    return null;
  }
}

/** Verdadero solo con un "sí" guardado a medición y publicidad. */
export function aceptaPublicidad(): boolean {
  return leerConsentimiento()?.publicidad === true;
}

export function guardarConsentimiento(publicidad: boolean, ahora = new Date()): Consentimiento {
  const dato: Consentimiento = { version: VERSION_CONSENTIMIENTO, publicidad, fecha: ahora.toISOString() };
  try {
    window.localStorage.setItem(CLAVE_CONSENTIMIENTO, JSON.stringify(dato));
  } catch {
    // Sin almacenamiento la elección vale para esta visita.
  }
  window.dispatchEvent(new CustomEvent(EVENTO_CONSENTIMIENTO, { detail: dato }));
  return dato;
}

/**
 * Lo que se borra al rechazar la publicidad: las cookies de Meta y la
 * atribución guardada. Las cookies de Meta pueden estar en el dominio raíz,
 * por eso se borran en las dos variantes.
 */
export function borrarRastrosPublicitarios(claveOrigen: string) {
  try {
    window.localStorage.removeItem(claveOrigen);
  } catch {
    // Nada que borrar.
  }
  const dominio = window.location.hostname.replace(/^www\./, "");
  for (const nombre of ["_fbp", "_fbc"]) {
    for (const dom of ["", `; domain=${dominio}`, `; domain=.${dominio}`]) {
      document.cookie = `${nombre}=; Max-Age=0; path=/${dom}`;
    }
  }
}
