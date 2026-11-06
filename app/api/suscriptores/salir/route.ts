import { NextResponse } from "next/server";
import { COOKIE_CUENTA, COOKIE_SUSCRIPTOR, opcionesDeCookie } from "@/lib/suscriptores-sesion";

export const dynamic = "force-dynamic";

/**
 * Cierra la sesión del suscriptor en este navegador. Sigue suscripto: solo deja de estar reconocido acá.
 * También la de la cuenta sin suscripción (Crédito Harper, paso 3).
 */
export async function POST(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  }
  const respuesta = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  respuesta.cookies.set(COOKIE_SUSCRIPTOR, "", opcionesDeCookie(0, 0));
  respuesta.cookies.set(COOKIE_CUENTA, "", opcionesDeCookie(0, 0));
  return respuesta;
}
