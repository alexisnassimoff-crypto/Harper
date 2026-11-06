import { NextResponse } from "next/server";
import { controlDiarioActivo, correrDiario, cronAutorizado, dependenciasCorridaReales } from "@/lib/credito-diario";

/**
 * Crédito Harper, paso 2: el control diario que libera el crédito 30 días
 * después de la entrega confirmada (lib/credito-diario.ts,
 * docs/plan-programa-harper.md §17.9 y §18.2).
 *
 * NO tiene cron todavía: no está en vercel.json. Activarlo es parte del corte
 * y requiere autorización. Además:
 *  - solo entra el cron de Vercel (`Authorization: Bearer <CRON_SECRET>`);
 *  - con HARPER_CREDITO_ACTIVO apagado contesta sin leer ni escribir nada.
 *
 *   GET /api/credito/diario
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!cronAutorizado(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (!controlDiarioActivo()) {
    return NextResponse.json({ ok: true, apagado: true, detalle: "HARPER_CREDITO_ACTIVO apagado: no se leyó ni se escribió nada" });
  }
  const r = await correrDiario(dependenciasCorridaReales());
  return NextResponse.json(r.cuerpo, { status: r.status });
}
