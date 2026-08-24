import { NextResponse } from "next/server";
import { sucursales } from "@/lib/correo";

export const dynamic = "force-dynamic";

/**
 * Sucursales de Correo Argentino donde se puede retirar, por provincia.
 *
 * Devuelve una lista vacía —nunca un error— si Correo Argentino no responde:
 * el checkout entonces oculta la opción de retiro y sigue vendiendo con
 * entrega a domicilio.
 */
export async function GET(request: Request) {
  const provincia = new URL(request.url).searchParams.get("provincia")?.trim() ?? "";

  if (!provincia) {
    return NextResponse.json({ error: "Falta la provincia" }, { status: 400 });
  }

  const lista = await sucursales(provincia);

  return NextResponse.json({
    sucursales: lista ?? [],
    disponible: lista !== null,
  });
}
