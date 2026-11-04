import { createHmac, timingSafeEqual } from "node:crypto";
import { escaparFormula, listRecords, TABLAS } from "./airtable";

/**
 * El panel privado de Ale (/panel, 04/11/2026: «una página solo para mí, toda
 * la info ahí, totalmente privada, y que pueda entrar solo con mi mail»).
 *
 * Se entra con el mail y el código de 6 números que llega a ese mail (el mismo
 * mecanismo de lib/reconocer-cliente.ts, con su propio propósito «panel»).
 * Solo los mails autorizados reciben el código:
 *  - la variable de entorno PANEL_EMAILS (separados por coma), o
 *  - la fila `panel_emails` de la tabla Config.
 * Sin ninguno de los dos, el panel no deja entrar a nadie.
 *
 * La sesión es una cookie httpOnly firmada (HMAC, otra etiqueta que la de los
 * suscriptores), solo para /panel y /api/panel, que dura 7 días. Cada vez que
 * se usa se vuelve a mirar que el mail siga autorizado: sacarlo de la lista
 * cierra la sesión al instante.
 */

export const COOKIE_PANEL = "harper_panel";

/** Cuánto dura la sesión del panel: 7 días. */
export const DURACION_SESION_PANEL_MS = 7 * 24 * 60 * 60_000;

/** La clave de las sesiones del panel: sale del secreto del webhook de Mercado Pago, como las otras. */
export function claveDelPanel(): Buffer | null {
  const secreto = process.env.MP_WEBHOOK_SECRET?.trim();
  return secreto ? createHmac("sha256", secreto).update("harper:sesion-panel:v1").digest() : null;
}

function firma(clave: Buffer, cuerpo: string) {
  return createHmac("sha256", clave).update(cuerpo).digest("base64url");
}

/** "ale@x.com, Otra@Y.com" → ["ale@x.com", "otra@y.com"]. */
export function leerListaDeMails(crudo: string | null | undefined): string[] {
  return (crudo ?? "")
    .split(/[,;\s]+/)
    .map((m) => m.trim().toLowerCase())
    .filter((m) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(m));
}

/** Los mails que pueden entrar al panel: PANEL_EMAILS y la fila `panel_emails` de Config. */
export async function mailsDelPanel(): Promise<Set<string>> {
  const deEntorno = leerListaDeMails(process.env.PANEL_EMAILS);
  let deConfig: string[] = [];
  try {
    const filas = await listRecords<{ Clave?: string; Valor?: string }>(TABLAS.config, {
      filterByFormula: `{Clave} = '${escaparFormula("panel_emails")}'`,
      revalidate: 0,
    });
    deConfig = leerListaDeMails(filas[0]?.fields.Valor);
  } catch (error) {
    console.error("[panel] no se pudo leer panel_emails de Config:", error instanceof Error ? error.message : error);
  }
  return new Set([...deEntorno, ...deConfig]);
}

export async function esMailDelPanel(email: string): Promise<boolean> {
  return (await mailsDelPanel()).has(email.trim().toLowerCase());
}

/** El valor de la cookie: el mail y el vencimiento en base64url, un punto y la firma. */
export function crearSesionPanel(clave: Buffer, email: string, ahora = Date.now()): string {
  const cuerpo = Buffer.from(JSON.stringify({ e: email.trim().toLowerCase(), h: ahora + DURACION_SESION_PANEL_MS })).toString("base64url");
  return `${cuerpo}.${firma(clave, cuerpo)}`;
}

/** El mail de la sesión, si la firma es nuestra y no venció. Null si no. */
export function leerSesionPanel(clave: Buffer, valor: unknown, ahora = Date.now()): { email: string; hasta: number } | null {
  if (typeof valor !== "string" || valor.length > 500) return null;
  const [cuerpo, firmado, sobra] = valor.split(".");
  if (!cuerpo || !firmado || sobra !== undefined) return null;
  const esperada = Buffer.from(firma(clave, cuerpo));
  const recibida = Buffer.from(firmado);
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) return null;
  try {
    const datos = JSON.parse(Buffer.from(cuerpo, "base64url").toString("utf8")) as { e?: unknown; h?: unknown };
    if (typeof datos.e !== "string" || typeof datos.h !== "number" || datos.h <= ahora) return null;
    return { email: datos.e, hasta: datos.h };
  } catch {
    return null;
  }
}

/**
 * Quién está en el panel con esta cookie: el mail, si la sesión es válida y
 * el mail sigue autorizado. Null si no.
 */
export async function mailDeLaSesionPanel(valor: string | null | undefined, ahora = Date.now()): Promise<string | null> {
  const clave = claveDelPanel();
  if (!clave || !valor) return null;
  const sesion = leerSesionPanel(clave, valor, ahora);
  if (!sesion) return null;
  return (await esMailDelPanel(sesion.email)) ? sesion.email : null;
}

/** Los atributos de la cookie: solo el servidor la lee, solo por HTTPS en producción, solo en /. */
export function opcionesDeCookiePanel(hasta: number, ahora = Date.now()) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
    maxAge: Math.max(0, Math.floor((hasta - ahora) / 1000)),
  };
}
