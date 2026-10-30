import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { claveDeIp, consumirCuota } from "@/lib/cuota";
import { claveDeCodigos, codigoCorrecto, normalizarEmail } from "@/lib/reconocer-cliente";
import { socioPorEmail } from "@/lib/socios-cuenta";
import { claveDeSesionSocio, COOKIE_SOCIO, crearSesionSocio, DURACION_SESION_MS, opcionesDeCookie } from "@/lib/socios-sesion";

export const dynamic = "force-dynamic";

const MINUTO = 60_000;
const sinCache = { "Cache-Control": "private, no-store" };
const INCORRECTO = "El código no es correcto o ya venció. Revisalo o pedí otro.";

/**
 * Con el código que le llegó por mail, abre la sesión del socio en este
 * navegador (cookie firmada, lib/socios-sesion.ts).
 *
 *   POST /api/socios/ingresar  { email, codigo, desafio }  → 200 { numero }
 *
 * Pocos intentos por mail y por IP: seis números no se adivinan así.
 */
export async function POST(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return NextResponse.json({ error: "Origen no permitido" }, { status: 403, headers: sinCache });
  }
  const clave = claveDeCodigos();
  const claveSesion = claveDeSesionSocio();
  if (!clave || !claveSesion) return NextResponse.json({ error: "No disponible" }, { status: 503, headers: sinCache });

  const cuerpo = (await request.json().catch(() => null)) as { email?: unknown; codigo?: unknown; desafio?: unknown } | null;
  const email = normalizarEmail(cuerpo?.email);
  if (!email) return NextResponse.json({ error: "Revisá el mail" }, { status: 400, headers: sinCache });

  const ip = claveDeIp(request.headers.get("x-forwarded-for")?.split(",")[0] ?? "");
  const delMail = createHash("sha256").update(email).digest("base64url").slice(0, 16);
  const cuota = await consumirCuota([
    { clave: `socio-ingreso-ip:${ip}`, ventanaMs: 60 * MINUTO, limite: 20 },
    { clave: `socio-ingreso-mail:${delMail}`, ventanaMs: 15 * MINUTO, limite: 6 },
  ]);
  if (cuota.excedida) {
    return NextResponse.json(
      { error: "Demasiados intentos. Esperá unos minutos y pedí un código nuevo." },
      { status: 429, headers: { ...sinCache, "Retry-After": "300" } }
    );
  }

  if (!codigoCorrecto(clave, cuerpo?.desafio, email, cuerpo?.codigo)) {
    return NextResponse.json({ error: INCORRECTO }, { status: 400, headers: sinCache });
  }

  try {
    const socio = await socioPorEmail(email);
    if (!socio) return NextResponse.json({ error: INCORRECTO }, { status: 400, headers: sinCache });

    const ahora = Date.now();
    // La sesión no dura más que la membresía: vence a la medianoche del último día, en Buenos Aires.
    const finMembresia = Date.parse(`${socio.vence}T23:59:59-03:00`);
    const valor = crearSesionSocio(claveSesion, { socioId: socio.id, email: socio.email }, ahora, finMembresia);
    const hasta = Math.min(ahora + DURACION_SESION_MS, finMembresia);

    const respuesta = NextResponse.json({ numero: socio.numero }, { headers: sinCache });
    respuesta.cookies.set(COOKIE_SOCIO, valor, opcionesDeCookie(hasta, ahora));
    return respuesta;
  } catch (error) {
    console.error("[socios] no se pudo abrir la sesión:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "No pudimos entrar. Probá en un rato." }, { status: 503, headers: sinCache });
  }
}
