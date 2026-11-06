import { NextResponse } from "next/server";
import { ErrorAirtable } from "@/lib/airtable";
import { avisarDespacho, type MotivoSinAviso } from "@/lib/aviso-despacho";
import { ErrorCerrojo } from "@/lib/cerrojo";
import { tokenAvisoDespachoValido } from "@/lib/media";

export const dynamic = "force-dynamic";

/** Lo que queda en el historial de la automatización de Airtable, en castellano. */
const DETALLE: Record<MotivoSinAviso, string> = {
  "no-enviado": "El pedido no está «enviado»: no se avisa.",
  "sin-tracking": "El pedido está «enviado» pero no tiene Tracking: se avisa cuando se cargue.",
  "ya-avisado": "El aviso de este pedido ya salió (está en Notas): no se manda de nuevo.",
  "en-otra-corrida": "Otra corrida ya mandó o está mandando el aviso de este pedido: no se manda de nuevo.",
};

/**
 * Le avisa al cliente que su pedido salió, con el número de seguimiento: el
 * mail «Tu pedido está en camino». La lógica está en lib/aviso-despacho.ts.
 *
 *   POST /api/pedidos/notificar-envio   { pedidoId: "rec…" }
 *   con el token en el encabezado x-sync-token (o en ?token=): AVISO_DESPACHO_TOKEN,
 *   el secreto propio de esta ruta, o los de siempre (SYNC_TOKEN, CRON_SECRET)
 *     → 200 { enviado: true }              salió el mail (una sola vez por pedido)
 *     → 200 { enviado: false, motivo }     no corresponde: no está «enviado»,
 *                                          falta el Tracking o ya se avisó
 *     → 422 sin mail del cliente · 502 el mail no salió · 503 Redis no está o no contestó
 *       (en esos tres no salió nada y se puede volver a intentar)
 *
 * La dispara la automatización de Airtable «Aviso de despacho» cuando un
 * pedido queda con Estado «enviado» y el Tracking cargado. No cambia el
 * Estado del pedido.
 */
export async function POST(request: Request) {
  const token = request.headers.get("x-sync-token") ?? new URL(request.url).searchParams.get("token");

  if (!tokenAvisoDespachoValido(token)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const cuerpo = (await request.json().catch(() => null)) as { pedidoId?: unknown } | null;
  const pedidoId = typeof cuerpo?.pedidoId === "string" ? cuerpo.pedidoId.trim() : "";

  if (!/^rec[A-Za-z0-9]{14}$/.test(pedidoId)) {
    return NextResponse.json({ error: "Falta pedidoId (el id de la fila del pedido, rec…)" }, { status: 400 });
  }

  try {
    const resultado = await avisarDespacho(pedidoId, {
      sitio: process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin,
    });

    switch (resultado.estado) {
      case "enviado":
        return NextResponse.json({
          ok: true,
          enviado: true,
          numero: resultado.numero,
          anotado: resultado.anotado,
          detalle: resultado.anotado
            ? "Salió el aviso de despacho y quedó anotado en Notas."
            : "Salió el aviso de despacho, pero no se pudo anotar en Notas (Redis evita que se repita).",
        });
      case "omitido":
        return NextResponse.json({ ok: true, enviado: false, motivo: resultado.motivo, detalle: DETALLE[resultado.motivo] });
      case "sin-mail":
        return NextResponse.json({ error: "El pedido no tiene un cliente con mail" }, { status: 422 });
      case "fallo-mail":
        console.error(`[notificar-envio] no salió el mail de ${pedidoId}:`, resultado.error);
        return NextResponse.json({ error: "No se pudo mandar el mail: se puede volver a intentar" }, { status: 502 });
    }
  } catch (error) {
    if (error instanceof ErrorAirtable && error.status === 404) {
      return NextResponse.json({ error: "No existe ese pedido" }, { status: 404 });
    }
    if (error instanceof ErrorCerrojo) {
      console.error("[notificar-envio] sin Redis, no se manda:", error.message);
      return NextResponse.json({ error: "No se pudo confirmar que el aviso no salió antes: se reintenta después" }, { status: 503 });
    }
    console.error("[notificar-envio] falló:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
