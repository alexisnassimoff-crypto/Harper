import { NextResponse } from "next/server";
import { tokenValido } from "@/lib/media";
import { mlConfigurado } from "@/lib/ml-auth";
import { paginaDeCompetencia } from "@/lib/ml-competencia";
import { fotoDeLaCompetencia } from "@/lib/ml-competencia-servidor";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * La foto de la competencia: precios y condiciones de los competidores de la
 * tabla Competencia, y dónde aparece cada uno en las búsquedas clave. También
 * muestra qué deja leer Mercado Libre de otros vendedores.
 *
 *   GET /api/ml/competencia?token=<SYNC_TOKEN>         → JSON
 *   GET /api/ml/competencia?token=<SYNC_TOKEN>&ver=1   → página para el celular
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  if (!tokenValido(url.searchParams.get("token"))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (!mlConfigurado()) {
    return NextResponse.json({ error: "Faltan ML_APP_ID y ML_APP_SECRET" }, { status: 503 });
  }

  try {
    const foto = await fotoDeLaCompetencia();
    if (url.searchParams.get("ver") === "1") {
      return new Response(
        `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Competencia</title></head><body style="margin:0;padding:24px 16px;background:#faf9f6">${paginaDeCompetencia(foto)}</body></html>`,
        { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }
      );
    }
    return NextResponse.json({ ok: true, ...foto });
  } catch (error) {
    console.error("[ml/competencia] falló:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 502 });
  }
}
