import { NextResponse } from "next/server";
import { atenderEntrada } from "@/lib/credito-cuenta";
import { claveDeIp, consumirCuota } from "@/lib/cuota";
import { claveDeCodigos } from "@/lib/reconocer-cliente";
import { DURACION_SESION_MS, opcionesDeCookie } from "@/lib/suscriptores-sesion";

export const dynamic = "force-dynamic";

const sinCache = { "Cache-Control": "private, no-store" };

/**
 * Entrar a Mi Cuenta con el mail y el código, SIN suscribirse (Crédito
 * Harper, paso 3; lib/credito-cuenta.ts, `atenderEntrada`). Solo con
 * HARPER_CREDITO_ACTIVO=1: apagado contesta 404 sin gastar intentos, y Mi
 * Cuenta sigue con /api/suscriptores/confirmar.
 *
 *   POST /api/cuenta/entrar  { email, codigo, desafio }
 *     → 200 { estado: "cuenta" | "ya" | "baja" }
 *
 * No escribe en Airtable ni manda mails: no da de alta, no reactiva una baja
 * y no crea cupones ni cashback. El código lo pide /api/suscriptores/codigo.
 * Los intentos cuentan junto con los de /api/suscriptores/confirmar.
 */
export async function POST(request: Request) {
  try {
    const r = await atenderEntrada(
      {
        cuerpo: await request.json().catch(() => null),
        ip: claveDeIp(request.headers.get("x-forwarded-for")?.split(",")[0] ?? ""),
        desdeOtroSitio: request.headers.get("sec-fetch-site") === "cross-site",
      },
      { consumirCuota: (ventanas) => consumirCuota(ventanas), claveCodigos: claveDeCodigos() }
    );
    const headers = r.reintentarEnSegundos ? { ...sinCache, "Retry-After": String(r.reintentarEnSegundos) } : sinCache;
    const respuesta = NextResponse.json(r.cuerpo, { status: r.status, headers });
    if (r.sesion) {
      respuesta.cookies.set(r.sesion.abrir.nombre, r.sesion.abrir.valor, opcionesDeCookie(r.sesion.ahora + DURACION_SESION_MS, r.sesion.ahora));
      respuesta.cookies.set(r.sesion.cerrar, "", opcionesDeCookie(0, 0));
    }
    return respuesta;
  } catch (error) {
    console.error("[cuenta] no se pudo entrar:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "No pudimos confirmar tu mail. Probá en un rato." }, { status: 503, headers: sinCache });
  }
}
