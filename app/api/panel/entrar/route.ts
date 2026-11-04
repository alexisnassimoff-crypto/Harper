import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { claveDeIp, consumirCuota } from "@/lib/cuota";
import {
  claveDelPanel,
  COOKIE_PANEL,
  crearSesionPanel,
  DURACION_SESION_PANEL_MS,
  esMailDelPanel,
  opcionesDeCookiePanel,
} from "@/lib/panel-sesion";
import { claveDeCodigos, codigoCorrecto, normalizarEmail } from "@/lib/reconocer-cliente";

export const dynamic = "force-dynamic";

const MINUTO = 60_000;
const sinCache = { "Cache-Control": "private, no-store" };
const INCORRECTO = "El código no es correcto o ya venció. Revisalo o pedí otro.";

/**
 * Con el código que llegó por mail, abre la sesión del panel en este
 * navegador (cookie firmada, lib/panel-sesion.ts).
 *
 *   POST /api/panel/entrar  { email, codigo, desafio }  → 200 { ok: true }
 *
 * Además del código, el mail tiene que seguir autorizado. Con un mail que no
 * lo está, la respuesta es la misma que con un código equivocado.
 */
export async function POST(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return NextResponse.json({ error: "Origen no permitido" }, { status: 403, headers: sinCache });
  }
  const clave = claveDeCodigos();
  const claveSesion = claveDelPanel();
  if (!clave || !claveSesion) return NextResponse.json({ error: "No disponible" }, { status: 503, headers: sinCache });

  const cuerpo = (await request.json().catch(() => null)) as { email?: unknown; codigo?: unknown; desafio?: unknown } | null;
  const email = normalizarEmail(cuerpo?.email);
  if (!email) return NextResponse.json({ error: "Revisá el mail" }, { status: 400, headers: sinCache });

  const ip = claveDeIp(request.headers.get("x-forwarded-for")?.split(",")[0] ?? "");
  const delMail = createHash("sha256").update(email).digest("base64url").slice(0, 16);
  const cuota = await consumirCuota([
    { clave: `panel-entrar-ip:${ip}`, ventanaMs: 60 * MINUTO, limite: 10 },
    { clave: `panel-entrar-mail:${delMail}`, ventanaMs: 15 * MINUTO, limite: 5 },
  ]);
  if (cuota.excedida) {
    return NextResponse.json(
      { error: "Demasiados intentos. Esperá unos minutos y pedí un código nuevo." },
      { status: 429, headers: { ...sinCache, "Retry-After": "300" } }
    );
  }

  if (!codigoCorrecto(clave, cuerpo?.desafio, email, cuerpo?.codigo, Date.now(), "panel")) {
    return NextResponse.json({ error: INCORRECTO }, { status: 400, headers: sinCache });
  }
  if (!(await esMailDelPanel(email))) {
    return NextResponse.json({ error: INCORRECTO }, { status: 400, headers: sinCache });
  }

  const ahora = Date.now();
  const respuesta = NextResponse.json({ ok: true }, { headers: sinCache });
  respuesta.cookies.set(COOKIE_PANEL, crearSesionPanel(claveSesion, email, ahora), opcionesDeCookiePanel(ahora + DURACION_SESION_PANEL_MS, ahora));
  return respuesta;
}
