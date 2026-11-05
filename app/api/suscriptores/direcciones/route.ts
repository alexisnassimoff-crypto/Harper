import { NextResponse } from "next/server";
import { claveDeIp, consumirCuota } from "@/lib/cuota";
import { ErrorCerrojo, ErrorCerrojoOcupado } from "@/lib/cerrojo";
import { leerCambioDeDireccion, MAXIMO_DIRECCIONES } from "@/lib/mis-datos";
import { guardarCambioDeDireccion } from "@/lib/mis-datos-servidor";
import { suscriptorDeLaPeticion } from "@/lib/suscriptores-cuenta";
import { TEXTOS } from "@/lib/textos";

export const dynamic = "force-dynamic";

const sinCache = { "Cache-Control": "private, no-store" };
const T = TEXTOS.suscriptores.cuenta.misDatos.direcciones;

/**
 * «Mis direcciones» de la cuenta abierta en este navegador (Ale, 05/11/2026).
 *
 *   POST /api/suscriptores/direcciones
 *     { accion: "agregar", direccion, principal? }
 *     { accion: "editar", id, direccion, principal? }
 *     { accion: "eliminar", id }
 *     { accion: "principal", id }
 *     → 200 { direcciones }   la lista como quedó, la principal primero
 *     → 400 { errores } si la dirección está incompleta · 401 sin sesión
 *     → 404 si esa dirección ya no está · 409 tope o repetida
 *     → 503 si otro cambio de la misma cuenta está en curso o Redis no contesta (no se guardó nada)
 *
 * Solo escribe el campo «Direcciones» de la fila de la sesión (la cookie
 * firmada, releída de Airtable). La lógica, en lib/mis-datos.ts.
 */
export async function POST(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return NextResponse.json({ error: "Origen no permitido" }, { status: 403, headers: sinCache });
  }

  const ip = claveDeIp(request.headers.get("x-forwarded-for")?.split(",")[0] ?? "");
  const cuota = await consumirCuota([{ clave: `direcciones-ip:${ip}`, ventanaMs: 10 * 60_000, limite: 60 }], { soloMemoria: true });
  if (cuota.excedida) return NextResponse.json({ error: T.error }, { status: 429, headers: { ...sinCache, "Retry-After": "300" } });

  const cambio = leerCambioDeDireccion(await request.json().catch(() => null));
  if (!cambio) return NextResponse.json({ error: T.error }, { status: 400, headers: sinCache });
  if ("errores" in cambio) return NextResponse.json({ errores: cambio.errores }, { status: 400, headers: sinCache });

  const cuenta = await suscriptorDeLaPeticion(request);
  if (!cuenta) return NextResponse.json({ error: "Sin sesión" }, { status: 401, headers: sinCache });

  try {
    const resultado = await guardarCambioDeDireccion(cuenta, cambio);
    switch (resultado.estado) {
      case "ok":
        return NextResponse.json({ direcciones: resultado.direcciones }, { headers: sinCache });
      case "no-existe":
        return NextResponse.json({ error: T.error, direcciones: resultado.actuales }, { status: 404, headers: sinCache });
      case "tope":
        return NextResponse.json({ error: T.tope(MAXIMO_DIRECCIONES) }, { status: 409, headers: sinCache });
      case "repetida":
        return NextResponse.json({ error: T.repetida }, { status: 409, headers: sinCache });
    }
  } catch (error) {
    // Otro cambio de la misma cuenta en curso, o Redis sin contestar: no se guardó nada, se reintenta.
    if (error instanceof ErrorCerrojoOcupado || error instanceof ErrorCerrojo) {
      console.error("[direcciones] sin la llave de la cuenta:", error.message);
      return NextResponse.json({ error: T.ocupado }, { status: 503, headers: { ...sinCache, "Retry-After": "2" } });
    }
    // Un 422 UNKNOWN_FIELD_NAME es que falta el campo «Direcciones» en Suscriptores.
    console.error("[direcciones] no se pudo guardar:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: T.error }, { status: 503, headers: sinCache });
  }
}
