import { ErrorAirtable, escaparFormula, getRecord, listRecords, TABLAS, updateRecord } from "./airtable";
import { claveDeSesionSocio, COOKIE_SOCIO, leerCookie, leerSesionSocio } from "./socios-sesion";
import { fechaArgentina, type FilaSocio } from "./socios-alta";
import type { SocioDelCarrito } from "./socios";

/**
 * La cuenta del socio en la tabla Socios: quién es, si la membresía sigue
 * vigente y si todavía tiene el segundo par para canjear. Es lo que usan el
 * área de socios (/socios/mi-cuenta), el carrito, el envío y el checkout.
 */

export type CuentaSocio = {
  id: string;
  numero: number;
  plan: "Socio" | "Socio con aumento";
  nombre: string;
  email: string;
  alta: string;
  /** "2027-10-30": vale hasta ese día inclusive. */
  vence: string;
  /** "Pendiente" mientras no lo canjeó; "Pedido" o "Entregado" después. */
  segundoPar: string;
  /** El pedido en el que lo canjeó, si lo canjeó por la web. */
  segundoParPedido: string;
  reposicion: string;
};

function cuentaDe(registro: { id: string; fields: FilaSocio }): CuentaSocio {
  const f = registro.fields;
  return {
    id: registro.id,
    numero: f.Numero ?? 0,
    plan: f.Plan === "Socio con aumento" ? "Socio con aumento" : "Socio",
    nombre: (f.Nombre ?? "").trim(),
    email: (f.Email ?? "").trim().toLowerCase(),
    alta: f.Alta ?? "",
    vence: f.Vence ?? "",
    segundoPar: f.Segundo_par || "Pendiente",
    segundoParPedido: (f.Segundo_par_pedido ?? "").trim(),
    reposicion: f.Reposicion || "Disponible",
  };
}

/** Vigente hasta el día de `vence` inclusive, en Buenos Aires. */
export function estaVigente(cuenta: Pick<CuentaSocio, "vence">, ahora = new Date()): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(cuenta.vence) && cuenta.vence >= fechaArgentina(ahora);
}

export function canjePendiente(cuenta: Pick<CuentaSocio, "segundoPar" | "segundoParPedido">): boolean {
  return cuenta.segundoPar === "Pendiente" && !cuenta.segundoParPedido;
}

/** Lo que el carrito necesita saber del socio. */
export function socioParaElCarrito(cuenta: CuentaSocio): SocioDelCarrito {
  return { id: cuenta.id, numero: cuenta.numero, plan: cuenta.plan, canjePendiente: canjePendiente(cuenta) };
}

/** El socio vigente con ese mail (el de vencimiento más lejano, si se hizo socio más de una vez). */
export async function socioPorEmail(email: string, ahora = new Date()): Promise<CuentaSocio | null> {
  const filas = await listRecords<FilaSocio>(TABLAS.socios, {
    filterByFormula: `LOWER({Email}) = '${escaparFormula(email.trim().toLowerCase())}'`,
    revalidate: 0,
  });
  const vigentes = filas.map(cuentaDe).filter((c) => estaVigente(c, ahora));
  return vigentes.sort((a, b) => b.vence.localeCompare(a.vence))[0] ?? null;
}

/** La fila por su id, fresca. Null si ya no existe. */
export async function socioPorId(id: string): Promise<CuentaSocio | null> {
  try {
    return cuentaDe(await getRecord<FilaSocio>(TABLAS.socios, id));
  } catch (error) {
    if (error instanceof ErrorAirtable && (error.status === 404 || error.status === 403)) return null;
    throw error;
  }
}

/**
 * El socio de la sesión (el valor de la cookie): la firma tiene que ser
 * nuestra, la fila tiene que existir con el mismo mail y la membresía tiene
 * que estar vigente. Si no, null: compra como cualquiera.
 */
export async function socioDeLaSesion(valor: string | null | undefined, ahora = new Date()): Promise<CuentaSocio | null> {
  const clave = claveDeSesionSocio();
  if (!clave || !valor) return null;
  const sesion = leerSesionSocio(clave, valor, ahora.getTime());
  if (!sesion) return null;
  const cuenta = await socioPorId(sesion.socioId);
  if (!cuenta || cuenta.email !== sesion.email.toLowerCase() || !estaVigente(cuenta, ahora)) return null;
  return cuenta;
}

/**
 * El socio de una petición a la API, por su cookie. Si Airtable falla, null:
 * el carrito sigue andando, sin los beneficios (el checkout lo vuelve a mirar).
 */
export async function socioDeLaPeticion(request: Request): Promise<CuentaSocio | null> {
  const valor = leerCookie(request.headers.get("cookie"), COOKIE_SOCIO);
  if (!valor) return null;
  try {
    return await socioDeLaSesion(valor);
  } catch (error) {
    console.error("[socios] no se pudo leer el socio de la sesión:", error instanceof Error ? error.message : error);
    return null;
  }
}

export type ResultadoCanje =
  | { estado: "registrado" | "ya"; cuenta: CuentaSocio }
  | { estado: "conflicto"; cuenta: CuentaSocio }
  | { estado: "sin-socio" };

/**
 * Anota que el socio canjeó su segundo par en este pedido. Idempotente: si ya
 * está anotado en el mismo pedido, no hace nada. Si ya lo había canjeado en
 * OTRO pedido, no lo pisa: devuelve "conflicto" para que Harper lo revise.
 */
export async function registrarCanje(datos: { socioId: string; numeroPedido: string }): Promise<ResultadoCanje> {
  const cuenta = await socioPorId(datos.socioId);
  if (!cuenta) return { estado: "sin-socio" };
  if (cuenta.segundoParPedido === datos.numeroPedido) return { estado: "ya", cuenta };
  if (!canjePendiente(cuenta)) return { estado: "conflicto", cuenta };

  const fila = await updateRecord<FilaSocio>(TABLAS.socios, cuenta.id, {
    Segundo_par: "Pedido",
    Segundo_par_pedido: datos.numeroPedido,
  });
  return { estado: "registrado", cuenta: cuentaDe(fila) };
}
