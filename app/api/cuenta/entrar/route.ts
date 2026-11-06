import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { entrarALaCuenta } from "@/lib/credito-cuenta";
import { claveDeIp, consumirCuota } from "@/lib/cuota";
import { claveDeCodigos, normalizarEmail } from "@/lib/reconocer-cliente";
import { DURACION_SESION_MS, opcionesDeCookie } from "@/lib/suscriptores-sesion";

export const dynamic = "force-dynamic";

const MINUTO = 60_000;
const sinCache = { "Cache-Control": "private, no-store" };

/**
 * Entrar a Mi Cuenta con el mail y el código, SIN suscribirse (Crédito
 * Harper, paso 3; lib/credito-cuenta.ts). Solo con HARPER_CREDITO_ACTIVO=1:
 * apagado contesta 404 y Mi Cuenta sigue con /api/suscriptores/confirmar.
 *
 *   POST /api/cuenta/entrar  { email, codigo, desafio }
 *     → 200 { estado: "cuenta" | "ya" | "baja" }
 *
 * No escribe en Airtable ni manda mails: no da de alta, no reactiva una baja
 * y no crea cupones ni cashback. El código lo pide /api/suscriptores/codigo.
 * Los intentos cuentan junto con los de /api/suscriptores/confirmar.
 */
export async function POST(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return NextResponse.json({ error: "Origen no permitido" }, { status: 403, headers: sinCache });
  }
  const cuerpo = (await request.json().catch(() => null)) as { email?: unknown; codigo?: unknown; desafio?: unknown } | null;
  const email = normalizarEmail(cuerpo?.email);
  if (email) {
    const ip = claveDeIp(request.headers.get("x-forwarded-for")?.split(",")[0] ?? "");
    const delMail = createHash("sha256").update(email).digest("base64url").slice(0, 16);
    const cuota = await consumirCuota([
      { clave: `suscriptor-confirmar-ip:${ip}`, ventanaMs: 60 * MINUTO, limite: 20 },
      { clave: `suscriptor-confirmar-mail:${delMail}`, ventanaMs: 15 * MINUTO, limite: 6 },
    ]);
    if (cuota.excedida) {
      return NextResponse.json(
        { error: "Demasiados intentos. Esperá unos minutos y pedí un código nuevo." },
        { status: 429, headers: { ...sinCache, "Retry-After": "300" } }
      );
    }
  }

  try {
    const ahora = Date.now();
    const r = await entrarALaCuenta({ email: cuerpo?.email, codigo: cuerpo?.codigo, desafio: cuerpo?.desafio }, { claveCodigos: claveDeCodigos(), ahora });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status, headers: sinCache });
    const respuesta = NextResponse.json({ estado: r.estado }, { headers: sinCache });
    respuesta.cookies.set(r.abrir.nombre, r.abrir.valor, opcionesDeCookie(ahora + DURACION_SESION_MS, ahora));
    respuesta.cookies.set(r.cerrar, "", opcionesDeCookie(0, 0));
    return respuesta;
  } catch (error) {
    console.error("[cuenta] no se pudo entrar:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "No pudimos confirmar tu mail. Probá en un rato." }, { status: 503, headers: sinCache });
  }
}
