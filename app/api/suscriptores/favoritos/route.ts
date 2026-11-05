import { NextResponse } from "next/server";
import { ErrorAirtable } from "@/lib/airtable";
import { claveDeIp, consumirCuota } from "@/lib/cuota";
import { aplicarFavorito, leerPedidoDeFavorito } from "@/lib/favoritos-servidor";
import { suscriptorDeLaPeticion } from "@/lib/suscriptores-cuenta";
import { TEXTOS } from "@/lib/textos";

export const dynamic = "force-dynamic";

const sinCache = { "Cache-Control": "private, no-store" };
const T = TEXTOS.favoritos;

/**
 * El corazón de los anteojos (Ale, 05/11/2026): suma o saca un modelo en un
 * color de los favoritos de la cuenta abierta en este navegador.
 *
 *   POST /api/suscriptores/favoritos  { sku: "CITRINO-CAREY", favorito: true }
 *     → 200 { favoritos: ["CITRINO-CAREY", …] }   la lista como quedó
 *     → 401 sin sesión: el navegador invita a entrar a la cuenta
 *     → 400 si el pedido no se entiende, o el SKU no es de un anteojo del catálogo (para sumarlo)
 *
 * Solo escribe en la fila de la sesión (la cookie firmada, releída de
 * Airtable): nunca en la de otro mail. La lógica está en lib/favoritos-servidor.ts.
 */
export async function POST(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return NextResponse.json({ error: "Origen no permitido" }, { status: 403, headers: sinCache });
  }

  // Un tope por instancia, sin gastar Redis: alcanza de sobra para tocar corazones.
  const ip = claveDeIp(request.headers.get("x-forwarded-for")?.split(",")[0] ?? "");
  const cuota = await consumirCuota([{ clave: `favoritos-ip:${ip}`, ventanaMs: 10 * 60_000, limite: 120 }], { soloMemoria: true });
  if (cuota.excedida) {
    return NextResponse.json({ error: T.error }, { status: 429, headers: { ...sinCache, "Retry-After": "300" } });
  }

  const pedido = leerPedidoDeFavorito(await request.json().catch(() => null));
  if (!pedido) return NextResponse.json({ error: T.error }, { status: 400, headers: sinCache });

  const cuenta = await suscriptorDeLaPeticion(request);
  if (!cuenta) return NextResponse.json({ error: T.entrarTitulo }, { status: 401, headers: sinCache });

  try {
    const resultado = await aplicarFavorito(cuenta, pedido);
    if (resultado.estado === "ok") return NextResponse.json({ favoritos: resultado.favoritos }, { headers: sinCache });
    return NextResponse.json({ error: T.error }, { status: resultado.estado === "sin-catalogo" ? 503 : 400, headers: sinCache });
  } catch (error) {
    // Un 422 UNKNOWN_FIELD_NAME es que falta el campo «Favoritos» en Suscriptores.
    const detalle = error instanceof ErrorAirtable ? error.message : error instanceof Error ? error.message : String(error);
    console.error("[favoritos] no se pudo guardar:", detalle);
    return NextResponse.json({ error: T.error }, { status: 503, headers: sinCache });
  }
}
