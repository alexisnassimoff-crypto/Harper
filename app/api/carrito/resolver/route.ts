import { NextResponse } from "next/server";
import { limpiarItems, resolverCarrito } from "@/lib/pedidos";
import { sugerirParaCarrito } from "@/lib/sugerencias";
import { buscarCupon } from "@/lib/cupones";
import { verificarCuotas } from "@/lib/cuotas-servidor";

export const dynamic = "force-dynamic";

/**
 * Cuánto se espera a Mercado Pago por las cuotas. Son un dato para mostrar:
 * si tarda, el checkout carga igual, sin anunciarlas (la consulta sigue y
 * queda en cache para la próxima vez).
 */
const ESPERA_CUOTAS_MS = 3_000;

function conLimite<T>(promesa: Promise<T>, ms: number, siTarda: T): Promise<T> {
  return Promise.race([promesa, new Promise<T>((listo) => setTimeout(() => listo(siTarda), ms))]);
}

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

  const { items, cupon, cuotas } = (cuerpo ?? {}) as { items?: unknown; cupon?: unknown; cuotas?: unknown };

  if (!Array.isArray(items)) {
    return NextResponse.json({ error: "Falta items" }, { status: 400 });
  }

  // El cupón se resuelve acá, en el servidor; si es de primera compra, eso lo
  // comprueba el checkout, que es donde se sabe quién compra.
  const resuelto = await resolverCarrito(limpiarItems(items), { cupon });

  // Las sugerencias no pueden romper el carrito: si fallan, se muestra igual.
  const cuponAplicado = resuelto.cupon?.estado === "aplicado" ? (buscarCupon(resuelto.cupon.codigo)?.porcentaje ?? 0) : 0;
  // El checkout pide además las cuotas sin interés para el total con tarjeta
  // (con el envío): se anuncian solo si Mercado Pago las confirma para ese
  // monto, igual que en las fichas. Sin respuesta de Mercado Pago, no hay.
  // También para el total sin el envío, que es lo que muestra el checkout
  // mientras no sabe la dirección (el envío depende de la zona).
  const pideCuotas = cuotas === true && resuelto.items.length > 0;
  const [sugerencias, cuotasVerificadas, cuotasSinEnvio] = await Promise.all([
    sugerirParaCarrito(resuelto.items, cuponAplicado).catch((error) => {
      console.error("[carrito] no se pudieron armar las sugerencias:", error);
      return [];
    }),
    pideCuotas ? conLimite(verificarCuotas(resuelto.total), ESPERA_CUOTAS_MS, null) : Promise.resolve(null),
    pideCuotas && resuelto.envio > 0
      ? conLimite(verificarCuotas(resuelto.subtotal), ESPERA_CUOTAS_MS, null)
      : Promise.resolve(null),
  ]);

  return NextResponse.json({
    items: resuelto.items,
    descartados: resuelto.descartados,
    subtotal: resuelto.subtotal,
    envio: resuelto.envio,
    total: resuelto.total,
    envioGratisDesde: resuelto.config.envioGratisDesde,
    envioGratisAmbaDesde: resuelto.config.envioGratisAmbaDesde,
    // Si el envío es el precio plano de respaldo, el carrito lo dice.
    envioCotizado: resuelto.envioCotizado,
    ahorro: resuelto.ahorro,
    tramos: resuelto.tramos,
    cupon: resuelto.cupon,
    subtotalSinCupon: resuelto.subtotalSinCupon,
    // Lo mismo con dinero en Mercado Pago, para cambiar de medio de pago al instante.
    dineroMP: resuelto.dineroMP
      ? {
          porcentaje: resuelto.dineroMP.porcentaje,
          subtotal: resuelto.dineroMP.subtotal,
          ahorro: resuelto.dineroMP.ahorro,
        }
      : null,
    sugerencias,
    cuotas: cuotasVerificadas ? { ...cuotasVerificadas, monto: resuelto.total } : null,
    cuotasSinEnvio: cuotasSinEnvio ? { ...cuotasSinEnvio, monto: resuelto.subtotal } : null,
  });
}
