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

/**
 * La elección de esta visita, para cuando el navegador no deja guardar
 * (modo privado, almacenamiento lleno): sin esto, aceptar no tendría efecto.
 */
let enMemoria: Consentimiento | null = null;

/** Lo guardado, si es de esta versión; si no hay o es viejo, null (= no eligió). */
export function leerConsentimiento(): Consentimiento | null {
  if (typeof window === "undefined") return null;
  try {
    const crudo = window.localStorage.getItem(CLAVE_CONSENTIMIENTO);
    if (!crudo) return enMemoria;
    const dato = JSON.parse(crudo) as Partial<Consentimiento>;
    if (dato.version !== VERSION_CONSENTIMIENTO || typeof dato.publicidad !== "boolean") return null;
    return { version: dato.version, publicidad: dato.publicidad, fecha: String(dato.fecha ?? "") };
  } catch {
    return enMemoria;
  }
}

/** Verdadero solo con un "sí" guardado a medición y publicidad. */
export function aceptaPublicidad(): boolean {
  return leerConsentimiento()?.publicidad === true;
}

export function guardarConsentimiento(publicidad: boolean, ahora = new Date()): Consentimiento {
  const dato: Consentimiento = { version: VERSION_CONSENTIMIENTO, publicidad, fecha: ahora.toISOString() };
  enMemoria = dato;
  try {
    window.localStorage.setItem(CLAVE_CONSENTIMIENTO, JSON.stringify(dato));
  } catch {
    // Sin almacenamiento la elección vale para esta visita. Si no se pudo
    // escribir pero había una elección vieja guardada (por ejemplo un "sí"),
    // se borra: borrar no necesita lugar, y así no le gana a la nueva.
    try {
      window.localStorage.removeItem(CLAVE_CONSENTIMIENTO);
    } catch {
      // Tampoco se puede leer: manda la de memoria.
    }
  }
  window.dispatchEvent(new CustomEvent(EVENTO_CONSENTIMIENTO, { detail: dato }));
  return dato;
}

/**
 * Avisa cada cambio de la elección: los de esta pestaña y los de otras
 * pestañas del mismo sitio (evento `storage`). Si en otra pestaña rechaza,
 * esta tiene que dejar de medir igual. Devuelve cómo dejar de escuchar.
 */
export function alCambiarConsentimiento(alCambiar: (dato: Consentimiento | null) => void): () => void {
  function enEstaPestana(evento: Event) {
    alCambiar((evento as CustomEvent<Consentimiento>).detail ?? null);
  }
  function enOtraPestana(evento: StorageEvent) {
    // key null: se borró todo el almacenamiento del sitio.
    if (evento.key !== CLAVE_CONSENTIMIENTO && evento.key !== null) return;
    enMemoria = null;
    alCambiar(leerConsentimiento());
  }
  window.addEventListener(EVENTO_CONSENTIMIENTO, enEstaPestana);
  window.addEventListener("storage", enOtraPestana);
  return () => {
    window.removeEventListener(EVENTO_CONSENTIMIENTO, enEstaPestana);
    window.removeEventListener("storage", enOtraPestana);
  };
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
