import { NextResponse } from "next/server";
import { urlDelSitio } from "@/lib/sitio";
import { confirmarTransferencia, firmaValida } from "@/lib/transferencia-servidor";

export const dynamic = "force-dynamic";

// El mismo camino que un pago aprobado del webhook: puede llevar varias
// llamadas a Airtable en serie (ver app/api/mercadopago/webhook/route.ts).
export const maxDuration = 60;

/**
 * El botón de la página /transferencia/confirmar: Harper recibió la plata.
 * Vuelve a la misma página con el resultado.
 */
export async function POST(request: Request) {
  let numero = "";
  let firma = "";

  try {
    const datos = await request.formData();
    numero = String(datos.get("pedido") ?? "");
    firma = String(datos.get("firma") ?? "");
  } catch {
    return NextResponse.json({ error: "Pedido inválido" }, { status: 400 });
  }

  if (!firmaValida(numero, firma)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const resultado = await confirmarTransferencia(numero, urlDelSitio(request));

  const vuelta = new URL("/transferencia/confirmar", request.url);
  vuelta.searchParams.set("pedido", numero);
  vuelta.searchParams.set("firma", firma);
  vuelta.searchParams.set("resultado", resultado.estado);
  if ("detalle" in resultado) vuelta.searchParams.set("detalle", resultado.detalle);

  // 303: el navegador vuelve con un GET, y recargar no reenvía la confirmación.
  return NextResponse.redirect(vuelta, 303);
}
