import { NextResponse } from "next/server";
import { limpiarItems, resolverCarrito } from "@/lib/pedidos";
import { sugerirParaCarrito } from "@/lib/sugerencias";
import { buscarCupon } from "@/lib/cupones";

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

  const { items, cupon } = (cuerpo ?? {}) as { items?: unknown; cupon?: unknown };

  if (!Array.isArray(items)) {
    return NextResponse.json({ error: "Falta items" }, { status: 400 });
  }

  // El cupón se resuelve acá, en el servidor; si es de primera compra, eso lo
  // comprueba el checkout, que es donde se sabe quién compra.
  const resuelto = await resolverCarrito(limpiarItems(items), { cupon });

  // Las sugerencias no pueden romper el carrito: si fallan, se muestra igual.
  const cuponAplicado = resuelto.cupon?.estado === "aplicado" ? (buscarCupon(resuelto.cupon.codigo)?.porcentaje ?? 0) : 0;
  const sugerencias = await sugerirParaCarrito(resuelto.items, cuponAplicado).catch((error) => {
    console.error("[carrito] no se pudieron armar las sugerencias:", error);
    return [];
  });

  return NextResponse.json({
    items: resuelto.items,
    descartados: resuelto.descartados,
    subtotal: resuelto.subtotal,
    envio: resuelto.envio,
    total: resuelto.total,
    envioGratisDesde: resuelto.config.envioGratisDesde,
    // Si el envío es el precio plano de respaldo, el carrito lo dice.
    envioCotizado: resuelto.envioCotizado,
    ahorro: resuelto.ahorro,
    tramos: resuelto.tramos,
    cupon: resuelto.cupon,
    subtotalSinCupon: resuelto.subtotalSinCupon,
    sugerencias,
  });
}
