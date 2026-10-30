import { NextResponse } from "next/server";
import { tokenValido } from "@/lib/media";
import { mlConfigurado } from "@/lib/ml-auth";
import { actualizarMetricasML } from "@/lib/ml-metricas-servidor";

export const dynamic = "force-dynamic";
// Dos pedidos de visitas por publicación, de a cinco: lleva su tiempo.
export const maxDuration = 300;

/**
 * Actualiza la tabla "Metricas ML" con las visitas, ventas y Product Ads de
 * cada publicación (últimos 30 días y los 30 anteriores).
 *
 * Se dispara con el cron diario (ver vercel.json) o a mano:
 *   GET /api/ml/metricas?token=<SYNC_TOKEN>
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  // El cron de Vercel se autentica con el header Authorization.
  const desdeCron = request.headers.get("authorization")?.replace(/^Bearer /, "");

  if (!tokenValido(desdeCron ?? url.searchParams.get("token"))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  if (!mlConfigurado()) {
    return NextResponse.json({ error: "Faltan ML_APP_ID y ML_APP_SECRET" }, { status: 503 });
  }

  try {
    return NextResponse.json({ ok: true, ...(await actualizarMetricasML()) });
  } catch (error) {
    console.error("[ml/metricas] falló:", error);
    return NextResponse.json({ error: (error as Error).message }, { status: 502 });
  }
}
