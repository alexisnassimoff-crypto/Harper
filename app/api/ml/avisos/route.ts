import { NextResponse } from "next/server";
import { tokenValido } from "@/lib/media";
import { mlConfigurado } from "@/lib/ml-auth";
import { avisoDeEnvio, resumenSemanal } from "@/lib/ml-avisos-servidor";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Los avisos por mail de Mercado Libre, a mano. Solos corren después de la
 * actualización diaria de /api/ml/metricas.
 *
 *   GET /api/ml/avisos?token=<SYNC_TOKEN>&tipo=envio      → el plan de envío a Full
 *   GET /api/ml/avisos?token=<SYNC_TOKEN>&tipo=semanal    → el resumen de la semana
 *   &ver=1     muestra el mail como se va a ver
 *   &enviar=1  lo manda (sin repetir uno igual)
 *   &forzar=1  lo manda aunque ya se haya mandado
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  if (!tokenValido(url.searchParams.get("token"))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (!mlConfigurado()) {
    return NextResponse.json({ error: "Faltan ML_APP_ID y ML_APP_SECRET" }, { status: 503 });
  }

  const tipo = url.searchParams.get("tipo");
  // «stock» era el nombre de la primera versión.
  if (tipo !== "envio" && tipo !== "stock" && tipo !== "semanal") {
    return NextResponse.json({ error: "Falta tipo=envio o tipo=semanal" }, { status: 400 });
  }

  const opciones = { enviar: url.searchParams.get("enviar") === "1", forzar: url.searchParams.get("forzar") === "1" };

  try {
    const resultado = tipo === "semanal" ? await resumenSemanal(opciones) : await avisoDeEnvio(opciones);

    if (url.searchParams.get("ver") === "1") {
      const cuerpo = resultado.mail
        ? `<p style="font-family:Helvetica,Arial,sans-serif;color:#78756c;font-size:13px">Asunto: ${resultado.mail.asunto.replace(/</g, "&lt;")}</p>${resultado.mail.html}`
        : `<p style="font-family:Helvetica,Arial,sans-serif">${resultado.motivo.replace(/</g, "&lt;")}</p>`;
      return new Response(
        `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Aviso de Mercado Libre</title></head><body style="margin:0;padding:24px 16px;background:#faf9f6">${cuerpo}</body></html>`,
        { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }
      );
    }

    const { mail, ...resto } = resultado;
    return NextResponse.json({ ok: true, ...resto, asunto: mail?.asunto ?? null });
  } catch (error) {
    console.error(`[ml/avisos] ${tipo} falló:`, error);
    return NextResponse.json({ error: (error as Error).message }, { status: 502 });
  }
}
