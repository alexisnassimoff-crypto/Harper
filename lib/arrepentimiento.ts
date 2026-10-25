import { emailValido } from "./validacion";

/**
 * Botón de arrepentimiento (Res. SCI 424/2020 y Disp. SSDCyLC 954/2025).
 *
 * La solicitud se hace con un formulario, sin cuenta ni registro. Al
 * recibirla, el servidor le da al comprador un código de recepción en el
 * momento, en pantalla y por email, también los fines de semana y feriados:
 * la norma pide informarlo dentro de las 24 horas corridas. Harper atiende de
 * lunes a viernes, así que la gestión humana y la logística son el siguiente
 * día hábil, con el aviso que llega al mail de pedidos.
 *
 * Este archivo lo usan el formulario y la API: sin nada de servidor.
 */

export type SolicitudArrepentimiento = {
  nombre: string;
  email: string;
  /** Número de pedido, si lo tiene. */
  pedido: string;
  /** Qué productos devuelve, si no es el pedido completo. */
  producto: string;
  motivo: string;
};

export type ErroresArrepentimiento = Partial<Record<keyof SolicitudArrepentimiento, string>>;

const LARGO_MAXIMO: Record<keyof SolicitudArrepentimiento, number> = {
  nombre: 100,
  email: 200,
  pedido: 40,
  producto: 300,
  motivo: 1000,
};

/** Lo que llega del formulario, como texto recortado. Lo que no es texto, vacío. */
export function normalizarSolicitud(datos: unknown): SolicitudArrepentimiento {
  const d = (datos && typeof datos === "object" ? datos : {}) as Record<string, unknown>;
  const t = (clave: keyof SolicitudArrepentimiento) => (typeof d[clave] === "string" ? (d[clave] as string).trim() : "");
  // Nombre, email y pedido van en asuntos de mail: en una sola línea.
  const linea = (clave: keyof SolicitudArrepentimiento) => t(clave).replace(/\s+/g, " ");
  return {
    nombre: linea("nombre"),
    email: linea("email").toLowerCase(),
    pedido: linea("pedido").toUpperCase(),
    producto: t("producto"),
    motivo: t("motivo"),
  };
}

/** Lo mínimo para identificar la compra y mandar el código. */
export function validarSolicitud(s: SolicitudArrepentimiento): ErroresArrepentimiento {
  const errores: ErroresArrepentimiento = {};
  if (s.nombre.length < 2) errores.nombre = "Escribí tu nombre y apellido";
  if (!emailValido(s.email)) errores.email = "Revisá el mail";
  for (const clave of Object.keys(LARGO_MAXIMO) as (keyof SolicitudArrepentimiento)[]) {
    if (!errores[clave] && s[clave].length > LARGO_MAXIMO[clave]) {
      errores[clave] = `Usá menos de ${LARGO_MAXIMO[clave]} caracteres`;
    }
  }
  return errores;
}

/**
 * El número de pedido, solo si tiene forma de número de pedido. Es lo único
 * escrito por quien completa el formulario que va en el mail al comprador:
 * así nadie puede usar el formulario para mandar texto propio a un tercero.
 */
export function pedidoParaMostrar(pedido: string): string | null {
  return /^[A-Z0-9][A-Z0-9-]{2,39}$/.test(pedido) ? pedido : null;
}

const ZONA = "America/Argentina/Buenos_Aires";
/** Sin 0/O ni 1/I/L, para que se pueda dictar y copiar sin errores. */
const ALFABETO = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/**
 * "ARR-20261025-7KQ2X": la fecha de recepción en Argentina y cinco
 * caracteres al azar. `azar` son bytes aleatorios (al menos 5).
 */
export function generarCodigo(ahora: Date, azar: Uint8Array): string {
  const partes = new Intl.DateTimeFormat("en-CA", { timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(ahora)
    .reduce<Record<string, string>>((acc, p) => ({ ...acc, [p.type]: p.value }), {});
  const sufijo = Array.from(azar.slice(0, 5), (b) => ALFABETO[b % ALFABETO.length]).join("");
  return `ARR-${partes.year}${partes.month}${partes.day}-${sufijo}`;
}

/** "25 de octubre de 2026, 14:32 (hora de Argentina)". */
export function fechaDeRecepcion(ahora: Date): string {
  const fecha = new Intl.DateTimeFormat("es-AR", { timeZone: ZONA, day: "numeric", month: "long", year: "numeric" }).format(ahora);
  const hora = new Intl.DateTimeFormat("es-AR", { timeZone: ZONA, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(ahora);
  return `${fecha}, ${hora} (hora de Argentina)`;
}

export const TEXTO_PROXIMO_PASO =
  "Atendemos de lunes a viernes. El siguiente día hábil te contactamos para coordinar el retiro sin cargo y el reintegro del importe abonado.";
