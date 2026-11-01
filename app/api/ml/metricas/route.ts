import { NextResponse } from "next/server";
import { tokenValido } from "@/lib/media";
import { mlConfigurado } from "@/lib/ml-auth";
import { textoDeCorrida, type Corrida } from "@/lib/ml-avisos";
import { CLAVE_CRON_RECHAZADO, CLAVE_ULTIMA_CORRIDA, correrAvisosDiarios, escribirClave } from "@/lib/ml-avisos-servidor";
import { ActualizacionEnCurso, actualizarMetricasML } from "@/lib/ml-metricas-servidor";
import { fotoDePromociones, guardarPromociones } from "@/lib/ml-promociones-servidor";

export const dynamic = "force-dynamic";
// Dos pedidos de visitas por publicación, de a cinco: lleva su tiempo.
export const maxDuration = 300;

/**
 * Actualiza la tabla "Metricas ML" con las visitas, ventas y Product Ads de
 * cada publicación (últimos 30 días y los 30 anteriores). Después manda los
 * avisos por mail: la alerta de stock si hace falta y, los lunes, el resumen
 * de la semana (lib/ml-avisos-servidor.ts).
 *
 * Se dispara con el cron diario (ver vercel.json) o a mano:
 *   GET /api/ml/metricas?token=<SYNC_TOKEN>
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  // El cron de Vercel se autentica con el header Authorization, y solo lo
  // manda si el proyecto tiene la variable CRON_SECRET.
  const desdeCron = request.headers.get("authorization")?.replace(/^Bearer /, "");
  const esCron = (request.headers.get("user-agent") ?? "").includes("vercel-cron");

  if (!tokenValido(desdeCron ?? url.searchParams.get("token"))) {
    if (esCron) {
      // Sin esto, un cron rechazado no deja rastro fuera de los logs de Vercel.
      await escribirClave(
        CLAVE_CRON_RECHAZADO,
        `${new Date().toISOString()} · Vercel llamó al cron ${desdeCron ? "con un CRON_SECRET que no coincide" : "sin CRON_SECRET (falta la variable en Vercel)"}`
      ).catch(() => {});
    }
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  if (!mlConfigurado()) {
    return NextResponse.json({ error: "Faltan ML_APP_ID y ML_APP_SECRET" }, { status: 503 });
  }

  const corrida: Corrida = { cuando: Date.now(), origen: esCron ? "cron" : "a mano", ok: false };
  const registrar = (c: Corrida) => escribirClave(CLAVE_ULTIMA_CORRIDA, textoDeCorrida(c)).catch(() => {});

  try {
    const metricas = await actualizarMetricasML();
    const avisosMail = await correrAvisosDiarios();
    // Las promociones son un agregado: si fallan, la corrida igual anduvo.
    const promociones = await fotoDePromociones()
      .then((foto) => guardarPromociones(foto))
      .catch((error: Error) => ({ error: error.message }));
    await registrar({ ...corrida, ok: true, publicaciones: metricas.publicaciones });
    return NextResponse.json({ ok: true, ...metricas, avisosMail, promociones });
  } catch (error) {
    if (error instanceof ActualizacionEnCurso) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("[ml/metricas] falló:", error);
    await registrar({ ...corrida, error: (error as Error).message });
    return NextResponse.json({ error: (error as Error).message }, { status: 502 });
  }
}
