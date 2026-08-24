import { NextResponse } from "next/server";
import { limpiarItems, resolverCarrito } from "@/lib/pedidos";

export const dynamic = "force-dynamic";

/**
 * Cotiza el envío del carrito a un código postal.
 *
 * La llama el checkout apenas el comprador escribe su CP, para mostrarle los
 * precios reales antes de pagar. No decide nada: el precio que termina en la
 * preferencia de Mercado Pago lo vuelve a calcular `/api/checkout`.
 *
 * Si Correo Argentino no puede cotizar, devuelve el precio plano con
 * `cotizado: false` y el checkout muestra ese número. Nunca un error.
 */
export async function POST(request: Request) {
  let cuerpo: { cp?: unknown; items?: unknown };

  try {
    cuerpo = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const cp = typeof cuerpo.cp === "string" ? cuerpo.cp.replace(/\D/g, "").slice(0, 8) : "";
  const items = limpiarItems(cuerpo.items);

  if (items.length === 0) {
    return NextResponse.json({ error: "Carrito vacío" }, { status: 400 });
  }

  try {
    const carrito = await resolverCarrito(items, { cpDestino: cp });

    return NextResponse.json({
      opciones: carrito.opcionesEnvio,
      cotizado: carrito.envioCotizado,
      envio: carrito.envio,
      subtotal: carrito.subtotal,
      total: carrito.total,
      // Verdadero cuando el pedido llega al mínimo y el envío lo paga Harper.
      bonificado:
        carrito.config.envioGratisDesde > 0 &&
        carrito.subtotal >= carrito.config.envioGratisDesde,
    });
  } catch (error) {
    console.error("[envio] no se pudo cotizar:", error);
    return NextResponse.json({ error: "No se pudo cotizar el envío" }, { status: 503 });
  }
}
