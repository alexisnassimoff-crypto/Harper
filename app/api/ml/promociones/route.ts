import { NextResponse } from "next/server";
import { tokenValido } from "@/lib/media";
import { mlConfigurado } from "@/lib/ml-auth";
import { paginaDePromociones } from "@/lib/ml-promociones";
import { fotoDePromociones, guardarPromociones } from "@/lib/ml-promociones-servidor";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Las promociones activas, programadas y las invitaciones de Mercado Libre de
 * cada publicación activa, con el % de descuento, las fechas y el aporte de ML.
 * Cada lectura se guarda en la tabla Promociones ML.
 *
 *   GET /api/ml/promociones?token=<SYNC_TOKEN>         → JSON
 *   GET /api/ml/promociones?token=<SYNC_TOKEN>&ver=1   → página para el celular
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
    const foto = await fotoDePromociones();
    // Queda en Promociones ML para poder leerla sin capturas.
    const guardado = await guardarPromociones(foto).catch((error: Error) => ({ error: error.message }));
    if (url.searchParams.get("ver") === "1") {
      return new Response(
        `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Promociones</title></head><body style="margin:0;padding:24px 16px;background:#faf9f6">${paginaDePromociones(
          foto,
          "error" in guardado ? `No se pudo guardar en Airtable: ${guardado.error}` : `Guardado en Airtable (Promociones ML): ${guardado.promociones} promociones.`
        )}</body></html>`,
        { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }
      );
    }
    return NextResponse.json({ ok: true, guardado, ...foto });
  } catch (error) {
    console.error("[ml/promociones] falló:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 502 });
  }
}
