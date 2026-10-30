import { NextResponse } from "next/server";
import { COOKIE_SOCIO, opcionesDeCookie } from "@/lib/socios-sesion";

export const dynamic = "force-dynamic";

/** Cierra la sesión del socio en este navegador. */
export async function POST(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  }
  const respuesta = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  respuesta.cookies.set(COOKIE_SOCIO, "", opcionesDeCookie(0, 0));
  return respuesta;
}
