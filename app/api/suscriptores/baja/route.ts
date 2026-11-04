import { NextResponse } from "next/server";
import { claveDeIp, consumirCuota } from "@/lib/cuota";
import { darDeBaja, suscriptorDeLaPeticion } from "@/lib/suscriptores-cuenta";
import {
  claveDeSesionSuscriptor,
  COOKIE_SUSCRIPTOR,
  leerCookie,
  leerSesionSuscriptor,
  leerTokenDeBaja,
  opcionesDeCookie,
} from "@/lib/suscriptores-sesion";

export const dynamic = "force-dynamic";

const HORA = 60 * 60_000;
const sinCache = { "Cache-Control": "private, no-store" };

/**
 * La baja de Suscriptores Harper (Ale, 03/11/2026): deja de recibir mails y
 * pierde los beneficios. Sin entrar: con el enlace firmado de cualquier mail
 * (lib/suscriptores-sesion.ts, `enlaceDeBaja`), o con la sesión abierta
 * desde «mi cuenta».
 *
 *   POST /api/suscriptores/baja  { token }   → 200 { ok: true }
 *   POST /api/suscriptores/baja  (con la cookie de sesión) → 200 { ok: true }
 *     → 400 { error } si el enlace no es válido y no hay sesión
 *
 * Idempotente: dos clics son una baja, y una fila que ya no existe también
 * contesta ok. Nunca dice de quién es el enlace. El enlace del mail lleva a
 * una página que confirma con un botón (la arma la interfaz): un GET no da de
 * baja, porque los antivirus de los mails abren los enlaces solos.
 */
export async function POST(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return NextResponse.json({ error: "Origen no permitido" }, { status: 403, headers: sinCache });
  }

  const ip = claveDeIp(request.headers.get("x-forwarded-for")?.split(",")[0] ?? "");
  const cuota = await consumirCuota([{ clave: `suscriptor-baja-ip:${ip}`, ventanaMs: HORA, limite: 20 }]);
  if (cuota.excedida) {
    return NextResponse.json({ error: "Demasiados intentos. Probá en un rato." }, { status: 429, headers: { ...sinCache, "Retry-After": "600" } });
  }

  const cuerpo = (await request.json().catch(() => null)) as { token?: unknown } | null;
  const token = cuerpo?.token ?? new URL(request.url).searchParams.get("t");

  try {
    const delEnlace = token ? leerTokenDeBaja(token) : null;
    const deLaSesion = delEnlace ? null : await suscriptorDeLaPeticion(request);
    if (!delEnlace && !deLaSesion) {
      return NextResponse.json({ error: "El enlace no es válido. Escribinos y te damos de baja." }, { status: 400, headers: sinCache });
    }

    const resultado = delEnlace
      ? await darDeBaja({ suscriptorId: delEnlace.suscriptorId, esDelMail: delEnlace.esDelMail })
      : await darDeBaja({ suscriptorId: deLaSesion!.id });
    if (resultado === "baja") console.info("[suscriptores] una baja");

    const respuesta = NextResponse.json({ ok: true }, { headers: sinCache });
    // Si ese suscriptor estaba reconocido en este navegador, deja de estarlo.
    const clave = claveDeSesionSuscriptor();
    const sesion = clave ? leerSesionSuscriptor(clave, leerCookie(request.headers.get("cookie"), COOKIE_SUSCRIPTOR)) : null;
    if (deLaSesion || (sesion && delEnlace && sesion.suscriptorId === delEnlace.suscriptorId)) {
      respuesta.cookies.set(COOKIE_SUSCRIPTOR, "", opcionesDeCookie(0, 0));
    }
    return respuesta;
  } catch (error) {
    console.error("[suscriptores] no se pudo dar de baja:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "No pudimos darte de baja. Probá en un rato." }, { status: 503, headers: sinCache });
  }
}
