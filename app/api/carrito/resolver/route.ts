import { NextResponse } from "next/server";
import { limpiarItems, resolverCarrito } from "@/lib/pedidos";
import { sugerirParaCarrito } from "@/lib/sugerencias";
import { buscarCupon } from "@/lib/cupones";
import { cuotasParaComprador } from "@/lib/cuotas-servidor";
import { tieneCuotasDeSuscriptor } from "@/lib/suscriptores";
import { suscriptorDelCarritoDeLaPeticion } from "@/lib/suscriptores-cuenta";
import { creditoParaElCarrito, visitaDeLaPeticion } from "@/lib/credito-cuenta";

export const dynamic = "force-dynamic";

/**
 * Si la petición trae una cuenta Harper abierta (Ale, 18/11/2026), para que
 * el checkout invite a entrar a quien no lo hizo, sin decir si tiene crédito.
 * Con la sesión de suscriptor ya leída, sí sin preguntar más; si no, la misma
 * puerta que usa el crédito (lib/credito-cuenta.ts, visitaDeLaPeticion: sin
 * la cookie del suscriptor no lee Airtable, solo la firma de la cuenta). Si
 * falla, se dice que no hay cuenta: lo peor es una invitación de más.
 */
async function hayCuentaAbierta(request: Request, conSuscriptor: boolean): Promise<boolean> {
  if (conSuscriptor) return true;
  try {
    return (await visitaDeLaPeticion(request)) !== null;
  } catch (error) {
    console.error("[carrito] no se pudo leer la cuenta para el Crédito Harper:", error instanceof Error ? error.message : error);
    return false;
  }
}

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

  const { items, cupon, cuotas, usarSaldo, usarCupon, usarCredito } = (cuerpo ?? {}) as {
    items?: unknown;
    cupon?: unknown;
    cuotas?: unknown;
    usarSaldo?: unknown;
    usarCupon?: unknown;
    /** Crédito Harper (paso 4, solo con HARPER_CREDITO_ACTIVO=1). */
    usarCredito?: unknown;
  };

  if (!Array.isArray(items)) {
    return NextResponse.json({ error: "Falta items" }, { status: 400 });
  }

  // El cupón se resuelve acá, en el servidor; si es de primera compra, eso lo
  // comprueba el checkout, que es donde se sabe quién compra.
  // El suscriptor que entró con su mail (su cookie): su cupón de bienvenida,
  // envío gratis y, si lo pide, su saldo. Los montos los pone el servidor.
  const [suscriptor, creditoHarper] = await Promise.all([suscriptorDelCarritoDeLaPeticion(request), creditoParaElCarrito(request, usarCredito)]);
  const resuelto = await resolverCarrito(limpiarItems(items), {
    cupon,
    suscriptor,
    usarSaldo: usarSaldo === true,
    usarCupon: usarCupon !== false,
    creditoHarper,
  });
  // Hasta 3 cuotas sin interés para todos, con cuenta o sin cuenta (Ale,
  // 18/11/2026): esto contesta siempre que no (lib/suscriptores.ts).
  const esSuscriptor = tieneCuotasDeSuscriptor(suscriptor);

  // Las sugerencias no pueden romper el carrito: si fallan, se muestra igual.
  const cuponAplicado = resuelto.cupon?.estado === "aplicado" ? (buscarCupon(resuelto.cupon.codigo)?.porcentaje ?? 0) : 0;
  // El carrito y el checkout piden además las cuotas sin interés para el
  // total con tarjeta (con el envío, después de descuentos, cupón y saldo):
  // se anuncian solo si Mercado Pago las confirma para ese monto exacto,
  // igual que en las fichas. Sin respuesta de Mercado Pago, no hay. También
  // para el total sin el envío, que es lo que muestran el carrito y el
  // checkout mientras no saben la dirección (el envío depende de la zona). A
  // quien no es suscriptor, también las que tendría siéndolo, para invitarlo.
  const pideCuotas = cuotas === true && resuelto.items.length > 0 && resuelto.total > 0;
  const sinCuotas = { suyas: null, deSuscriptor: null };
  const [sugerencias, conEnvio, sinEnvio, conCuenta] = await Promise.all([
    sugerirParaCarrito(resuelto.items, cuponAplicado, resuelto.duo ?? null).catch((error) => {
      console.error("[carrito] no se pudieron armar las sugerencias:", error);
      return [];
    }),
    pideCuotas ? conLimite(cuotasParaComprador(resuelto.total, esSuscriptor), ESPERA_CUOTAS_MS, sinCuotas) : Promise.resolve(sinCuotas),
    pideCuotas && resuelto.envio > 0
      ? conLimite(cuotasParaComprador(resuelto.subtotal, esSuscriptor), ESPERA_CUOTAS_MS, sinCuotas)
      : Promise.resolve(sinCuotas),
    // Solo con el Crédito Harper prendido (creditoPrevisto existe solo así): apagado, no se pregunta nada.
    resuelto.creditoPrevisto ? hayCuentaAbierta(request, resuelto.suscriptor !== null) : Promise.resolve(false),
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
    suscriptor: resuelto.suscriptor,
    // Solo con el Dúo prendido (Tarea 07); apagado, la respuesta es la de siempre.
    ...(resuelto.duo ? { duo: resuelto.duo } : {}),
    // Solo con el Crédito Harper prendido y una cuenta con crédito para usar (paso 4).
    ...(resuelto.creditoHarper ? { creditoHarper: resuelto.creditoHarper } : {}),
    // Solo con el Crédito Harper prendido (Ale, 18/11/2026): lo que suma esta
    // compra con cada medio de pago (lo calculó resolverCarrito con los
    // renglones que se cobran) y si hay una cuenta abierta. Apagado, la
    // respuesta es la de siempre.
    ...(resuelto.creditoPrevisto ? { creditoPrevisto: { ...resuelto.creditoPrevisto, conCuenta } } : {}),
    cuotas: conEnvio.suyas ? { ...conEnvio.suyas, monto: resuelto.total } : null,
    cuotasSinEnvio: sinEnvio.suyas ? { ...sinEnvio.suyas, monto: resuelto.subtotal } : null,
    // Las de suscriptor para los mismos montos, solo a quien todavía no las tiene.
    cuotasSuscriptor: [
      ...(conEnvio.deSuscriptor ? [{ ...conEnvio.deSuscriptor, monto: resuelto.total }] : []),
      ...(sinEnvio.deSuscriptor ? [{ ...sinEnvio.deSuscriptor, monto: resuelto.subtotal }] : []),
    ],
  });
}
