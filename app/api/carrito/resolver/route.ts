import { NextResponse } from "next/server";
import { limpiarItems, resolverCarrito } from "@/lib/pedidos";

export const dynamic = "force-dynamic";

/**
 * Devuelve el carrito con los precios y el stock reales.
 *
 * El navegador guarda solo IDs y cantidades; esta ruta es la que pone los
 * precios. Así un precio manipulado del lado del cliente no tiene ningún efecto.
 */
export async function POST(request: Request) {
  let cuerpo: unknown;

  try {
    cuerpo = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const items = (cuerpo as { items?: unknown })?.items;

  if (!Array.isArray(items)) {
    return NextResponse.json({ error: "Falta items" }, { status: 400 });
  }

  const resuelto = await resolverCarrito(limpiarItems(items));

  return NextResponse.json({
    items: resuelto.items,
    descartados: resuelto.descartados,
    subtotal: resuelto.subtotal,
    envio: resuelto.envio,
    total: resuelto.total,
    envioGratisDesde: resuelto.config.envioGratisDesde,
    plazoEntrega: resuelto.config.plazoEntrega,
    ahorro: resuelto.ahorro,
    tramos: resuelto.tramos,
  });
}
