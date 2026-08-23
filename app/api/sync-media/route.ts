import { NextResponse } from "next/server";
import { blobConfigurado, sincronizarMedia, tokenValido } from "@/lib/media";

export const dynamic = "force-dynamic";
// Espejar varios archivos grandes lleva su tiempo.
export const maxDuration = 300;

/**
 * Copia las fotos y videos de Airtable a Vercel Blob.
 *
 * Se dispara de tres formas:
 *   - automation de Airtable al crear o editar un registro
 *   - cron diario de respaldo (ver vercel.json)
 *   - a mano: GET /api/sync-media?token=...
 */
async function ejecutar(token: string | null) {
  if (!tokenValido(token)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  if (!blobConfigurado()) {
    return NextResponse.json(
      { error: "Falta BLOB_READ_WRITE_TOKEN" },
      { status: 503 }
    );
  }

  try {
    const resultado = await sincronizarMedia();
    return NextResponse.json({ ok: true, ...resultado });
  } catch (error) {
    console.error("[sync-media] falló:", error);
    return NextResponse.json({ error: "Error al sincronizar" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);

  // El cron de Vercel se autentica con el header Authorization.
  const desdeCron = request.headers
    .get("authorization")
    ?.replace(/^Bearer /, "");

  return ejecutar(desdeCron ?? url.searchParams.get("token"));
}

export async function POST(request: Request) {
  const url = new URL(request.url);

  return ejecutar(
    request.headers.get("x-sync-token") ?? url.searchParams.get("token")
  );
}
