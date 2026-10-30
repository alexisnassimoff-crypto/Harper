import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * La sesión del socio (Ale, 30/10/2026): entra con su mail y el código de 6
 * números que le llega (el mismo mecanismo de lib/reconocer-cliente.ts) y
 * queda reconocido en ese navegador. Con la sesión, la web le da el envío
 * gratis y le deja canjear su segundo par.
 *
 * La sesión es una cookie httpOnly firmada (HMAC): qué fila de Socios es, con
 * qué mail entró y hasta cuándo vale. No guarda nada en el servidor y sin la
 * clave no se puede fabricar. Igual, cada vez que se usa se vuelve a mirar la
 * fila en Airtable (lib/socios-cuenta.ts): si la membresía venció o el mail
 * cambió, la sesión no sirve.
 */

export const COOKIE_SOCIO = "harper_socio";

/** Cuánto dura la sesión en un navegador: 30 días, o hasta que venza la membresía. */
export const DURACION_SESION_MS = 30 * 24 * 60 * 60_000;

export type SesionSocio = { socioId: string; email: string; hasta: number };

/** La clave de las sesiones: sale del secreto del webhook de Mercado Pago, como la de los códigos. */
export function claveDeSesionSocio(): Buffer | null {
  const secreto = process.env.MP_WEBHOOK_SECRET?.trim();
  return secreto ? createHmac("sha256", secreto).update("harper:sesion-socio:v1").digest() : null;
}

function firma(clave: Buffer, cuerpo: string) {
  return createHmac("sha256", clave).update(cuerpo).digest("base64url");
}

/** El valor de la cookie: los datos en base64url, un punto y la firma. */
export function crearSesionSocio(clave: Buffer, datos: { socioId: string; email: string }, ahora = Date.now(), venceMembresia?: number): string {
  const hasta = Math.min(ahora + DURACION_SESION_MS, venceMembresia ?? Infinity);
  const cuerpo = Buffer.from(JSON.stringify({ s: datos.socioId, e: datos.email, h: hasta })).toString("base64url");
  return `${cuerpo}.${firma(clave, cuerpo)}`;
}

/** La sesión, si la firma es nuestra y no venció. Null si no. */
export function leerSesionSocio(clave: Buffer, valor: unknown, ahora = Date.now()): SesionSocio | null {
  if (typeof valor !== "string" || valor.length > 600) return null;
  const [cuerpo, firmado, sobra] = valor.split(".");
  if (!cuerpo || !firmado || sobra !== undefined) return null;

  const esperada = Buffer.from(firma(clave, cuerpo));
  const recibida = Buffer.from(firmado);
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) return null;

  try {
    const datos = JSON.parse(Buffer.from(cuerpo, "base64url").toString("utf8")) as { s?: unknown; e?: unknown; h?: unknown };
    if (typeof datos.s !== "string" || !/^rec[A-Za-z0-9]{14}$/.test(datos.s)) return null;
    if (typeof datos.e !== "string" || typeof datos.h !== "number" || datos.h <= ahora) return null;
    return { socioId: datos.s, email: datos.e, hasta: datos.h };
  } catch {
    return null;
  }
}

/** El valor de una cookie en el encabezado `Cookie` de una petición. */
export function leerCookie(encabezado: string | null | undefined, nombre: string): string | null {
  if (!encabezado) return null;
  for (const parte of encabezado.split(";")) {
    const [clave, ...resto] = parte.trim().split("=");
    if (clave === nombre) return decodeURIComponent(resto.join("="));
  }
  return null;
}

/** Los atributos de la cookie: solo el servidor la lee, solo por HTTPS en producción. */
export function opcionesDeCookie(hasta: number, ahora = Date.now()) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: Math.max(0, Math.floor((hasta - ahora) / 1000)),
  };
}
