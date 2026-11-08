import { NextResponse } from "next/server";
import { tokenValido } from "@/lib/media";
import { mlConfigurado } from "@/lib/ml-auth";
import { esQueSacar, paginaDeCambios, PUBLICACIONES, QUE_SE_PUEDE_SACAR } from "@/lib/ml-descripciones";
import { corregirDescripciones } from "@/lib/ml-descripciones-servidor";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Sacar de las descripciones una afirmación que no es cierta.
 *
 *   GET /api/ml/descripciones?token=<SYNC_TOKEN>&sacar=antirreflex           → muestra qué se saca (no cambia nada)
 *   GET /api/ml/descripciones?token=<SYNC_TOKEN>&sacar=antirreflex&aplicar=1 → lo saca en Mercado Libre
 *
 * `sacar` es una de las opciones de QUE_SE_PUEDE_SACAR (antirreflex, uv400). Cada una
 * se aplica solo a las publicaciones de PUBLICACIONES (hoy, anteojos Harper),
 * y antes de cambiar una descripción se guarda la original en Descripciones ML.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  if (!tokenValido(url.searchParams.get("token"))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (!mlConfigurado()) {
    return NextResponse.json({ error: "Faltan ML_APP_ID y ML_APP_SECRET" }, { status: 503 });
  }
  const sacar = url.searchParams.get("sacar");
  if (!esQueSacar(sacar)) {
    return NextResponse.json({ error: `Falta sacar=${Object.keys(QUE_SE_PUEDE_SACAR).join(" o sacar=")}` }, { status: 400 });
  }
  const aplicar = url.searchParams.get("aplicar") === "1";

  try {
    const cambios = await corregirDescripciones(sacar, aplicar);
    const linkAplicar = new URL(url);
    linkAplicar.searchParams.set("aplicar", "1");
    return new Response(
      `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Descripciones</title></head><body style="margin:0;padding:24px 16px;background:#faf9f6">${paginaDeCambios(
        {
          que: QUE_SE_PUEDE_SACAR[sacar].nombre,
          soloEn: PUBLICACIONES[QUE_SE_PUEDE_SACAR[sacar].publicaciones].nombre,
          cambios,
          aplicar,
          linkAplicar: aplicar ? null : linkAplicar.toString(),
        }
      )}</body></html>`,
      { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("[ml/descripciones] falló:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 502 });
  }
}
