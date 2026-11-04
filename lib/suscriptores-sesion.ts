import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * La sesión del suscriptor (Ale, 03/11/2026, como la que tenían los socios):
 * entra con su mail y el código de 6 números que le llega (el mismo mecanismo
 * de lib/reconocer-cliente.ts) y queda reconocido en ese navegador. Con la
 * sesión, la web le aplica sus beneficios: el cupón de bienvenida, el saldo,
 * el envío gratis y las 6 cuotas.
 *
 * La sesión es una cookie httpOnly firmada (HMAC): qué fila de Suscriptores
 * es, con qué mail entró y hasta cuándo vale. No guarda nada en el servidor y
 * sin la clave no se puede fabricar. Igual, cada vez que se usa se vuelve a
 * mirar la fila en Airtable (lib/suscriptores-cuenta.ts): si se dio de baja o
 * el mail cambió, la sesión no sirve.
 */

export const COOKIE_SUSCRIPTOR = "harper_suscriptor";

/** Cuánto dura la sesión en un navegador: 90 días. */
export const DURACION_SESION_MS = 90 * 24 * 60 * 60_000;

export type SesionSuscriptor = { suscriptorId: string; email: string; hasta: number };

/** La clave de las sesiones: sale del secreto del webhook de Mercado Pago, como la de los códigos. */
export function claveDeSesionSuscriptor(): Buffer | null {
  const secreto = process.env.MP_WEBHOOK_SECRET?.trim();
  return secreto ? createHmac("sha256", secreto).update("harper:sesion-suscriptor:v1").digest() : null;
}

function firma(clave: Buffer, cuerpo: string) {
  return createHmac("sha256", clave).update(cuerpo).digest("base64url");
}

/** El valor de la cookie: los datos en base64url, un punto y la firma. */
export function crearSesionSuscriptor(clave: Buffer, datos: { suscriptorId: string; email: string }, ahora = Date.now()): string {
  const cuerpo = Buffer.from(JSON.stringify({ s: datos.suscriptorId, e: datos.email, h: ahora + DURACION_SESION_MS })).toString("base64url");
  return `${cuerpo}.${firma(clave, cuerpo)}`;
}

/** La sesión, si la firma es nuestra y no venció. Null si no. */
export function leerSesionSuscriptor(clave: Buffer, valor: unknown, ahora = Date.now()): SesionSuscriptor | null {
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
    return { suscriptorId: datos.s, email: datos.e, hasta: datos.h };
  } catch {
    return null;
  }
}

/** El valor de una cookie en el encabezado `Cookie` de una petición. */
export function leerCookie(encabezado: string | null | undefined, nombre: string): string | null {
  if (!encabezado) return null;
  for (const parte of encabezado.split(";")) {
    const [clave, ...resto] = parte.trim().split("=");
    if (clave === nombre) {
      try {
        return decodeURIComponent(resto.join("="));
      } catch {
        return null;
      }
    }
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

/**
 * El enlace para darse de baja desde un mail (Ale, 03/11/2026: sin tener que
 * entrar). Firmado con otra etiqueta que la sesión y sin vencimiento: el
 * enlace de un mail viejo tiene que seguir sirviendo. Solo da de baja; no
 * abre ninguna sesión ni muestra datos. No lleva el mail: va en la dirección
 * de la página, que queda en los registros y que el Pixel de Meta podría
 * leer. Lleva una huella firmada del mail, que solo sirve para comprobar que
 * la fila sigue teniendo ese mail (el enlace de un mail viejo no da de baja a
 * otro).
 */
function claveDeBaja(): Buffer | null {
  const secreto = process.env.MP_WEBHOOK_SECRET?.trim();
  return secreto ? createHmac("sha256", secreto).update("harper:baja-suscriptor:v2").digest() : null;
}

function huellaDelMail(clave: Buffer, email: string): string {
  return firma(clave, `mail|${email.trim().toLowerCase()}`).slice(0, 22);
}

export function crearTokenDeBaja(datos: { suscriptorId: string; email: string }, clave: Buffer | null = claveDeBaja()): string | null {
  if (!clave) return null;
  const cuerpo = Buffer.from(JSON.stringify({ s: datos.suscriptorId, h: huellaDelMail(clave, datos.email) })).toString("base64url");
  return `${cuerpo}.${firma(clave, cuerpo)}`;
}

export type TokenDeBaja = {
  suscriptorId: string;
  /** Si ese mail es el del enlace (se compara la huella, el mail no viaja). */
  esDelMail: (email: string) => boolean;
};

export function leerTokenDeBaja(valor: unknown, clave: Buffer | null = claveDeBaja()): TokenDeBaja | null {
  if (!clave || typeof valor !== "string" || valor.length > 600) return null;
  const [cuerpo, firmado, sobra] = valor.split(".");
  if (!cuerpo || !firmado || sobra !== undefined) return null;
  const esperada = Buffer.from(firma(clave, cuerpo));
  const recibida = Buffer.from(firmado);
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) return null;
  try {
    const datos = JSON.parse(Buffer.from(cuerpo, "base64url").toString("utf8")) as { s?: unknown; h?: unknown };
    if (typeof datos.s !== "string" || !/^rec[A-Za-z0-9]{14}$/.test(datos.s) || typeof datos.h !== "string") return null;
    const huella = datos.h;
    return {
      suscriptorId: datos.s,
      esDelMail: (email) => {
        const a = Buffer.from(huellaDelMail(clave, email));
        const b = Buffer.from(huella);
        return a.length === b.length && timingSafeEqual(a, b);
      },
    };
  } catch {
    return null;
  }
}

/** La página de baja (la arma la interfaz: confirma con un botón que llama a /api/suscriptores/baja). */
export function enlaceDeBaja(sitio: string, datos: { suscriptorId: string; email: string }): string | null {
  const token = crearTokenDeBaja(datos);
  return token ? `${sitio}/suscriptores/baja?t=${encodeURIComponent(token)}` : null;
}
