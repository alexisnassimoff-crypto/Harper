import { NextResponse } from "next/server";
import { registrarLead } from "@/lib/clientes";
import { emailValido } from "@/lib/validacion";

export const dynamic = "force-dynamic";

/**
 * Captura temprana del mail en el checkout.
 *
 * Es best-effort: si falla, no puede afectar la compra. Por eso siempre
 * devuelve 200 salvo que el pedido esté mal formado.
 */
export async function POST(request: Request) {
  let cuerpo: { email?: string; nombre?: string };

  try {
    cuerpo = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const email = (cuerpo.email ?? "").trim().toLowerCase();

  if (!emailValido(email)) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  try {
    // Sin consentimiento de promociones: eso se decide y se guarda al comprar.
    await registrarLead({
      email,
      nombre: typeof cuerpo.nombre === "string" ? cuerpo.nombre.slice(0, 120) : undefined,
    });
  } catch (error) {
    console.error("[lead] no se pudo registrar:", error);
  }

  return NextResponse.json({ ok: true });
}
