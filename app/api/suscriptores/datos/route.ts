import { NextResponse } from "next/server";
import { claveDeIp, consumirCuota } from "@/lib/cuota";
import { leerDatosPersonales } from "@/lib/mis-datos";
import { guardarDatosPersonales, misDatos } from "@/lib/mis-datos-servidor";
import { suscriptorDeLaPeticion } from "@/lib/suscriptores-cuenta";
import { TEXTOS } from "@/lib/textos";

export const dynamic = "force-dynamic";

const sinCache = { "Cache-Control": "private, no-store" };
const T = TEXTOS.suscriptores.cuenta.misDatos;

/**
 * «Mis datos» de la cuenta abierta en este navegador (Ale, 05/11/2026).
 *
 *   GET  /api/suscriptores/datos
 *     → 200 { datos: { nombre, email, telefono, dni }, direcciones: [...] }
 *       (lo usa el checkout para completar los datos y ofrecer las direcciones)
 *   POST /api/suscriptores/datos  { nombre, telefono, dni }
 *     → 200 { datos }   · 400 { errores } si algo no está bien escrito
 *   → 401 sin sesión, en los dos
 *
 * Solo la cuenta de la cookie firmada (releída de Airtable): nunca los datos
 * de un mail que se escribe. Escribe solo en la fila de esa cuenta en
 * Suscriptores (lib/mis-datos-servidor.ts); los pedidos no se tocan.
 */

function origenAjeno(request: Request) {
  return request.headers.get("sec-fetch-site") === "cross-site";
}

async function excedida(request: Request) {
  const ip = claveDeIp(request.headers.get("x-forwarded-for")?.split(",")[0] ?? "");
  const cuota = await consumirCuota([{ clave: `mis-datos-ip:${ip}`, ventanaMs: 10 * 60_000, limite: 60 }], { soloMemoria: true });
  return cuota.excedida;
}

export async function GET(request: Request) {
  if (origenAjeno(request)) return NextResponse.json({ error: "Origen no permitido" }, { status: 403, headers: sinCache });
  if (await excedida(request)) return NextResponse.json({ error: T.error }, { status: 429, headers: { ...sinCache, "Retry-After": "300" } });
  const cuenta = await suscriptorDeLaPeticion(request);
  if (!cuenta) return NextResponse.json({ error: "Sin sesión" }, { status: 401, headers: sinCache });
  const vista = await misDatos(cuenta);
  return NextResponse.json({ datos: vista.datos, direcciones: vista.direcciones }, { headers: sinCache });
}

export async function POST(request: Request) {
  if (origenAjeno(request)) return NextResponse.json({ error: "Origen no permitido" }, { status: 403, headers: sinCache });
  if (await excedida(request)) return NextResponse.json({ error: T.error }, { status: 429, headers: { ...sinCache, "Retry-After": "300" } });

  const leido = leerDatosPersonales(await request.json().catch(() => null));
  if ("errores" in leido) return NextResponse.json({ errores: leido.errores }, { status: 400, headers: sinCache });

  const cuenta = await suscriptorDeLaPeticion(request);
  if (!cuenta) return NextResponse.json({ error: "Sin sesión" }, { status: 401, headers: sinCache });

  try {
    return NextResponse.json({ datos: await guardarDatosPersonales(cuenta, leido.datos) }, { headers: sinCache });
  } catch (error) {
    // Un 422 UNKNOWN_FIELD_NAME es que faltan los campos «Telefono» o «DNI» en Suscriptores.
    console.error("[mis-datos] no se pudieron guardar:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: T.error }, { status: 503, headers: sinCache });
  }
}
