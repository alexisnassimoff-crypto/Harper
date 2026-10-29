import { NextResponse } from "next/server";
import { claveDeIp, consumirCuota } from "@/lib/cuota";
import { verificarCuotas } from "@/lib/cuotas-servidor";
import { limpiarItems, resolverCarrito } from "@/lib/pedidos";
import type { DestinoEnvio } from "@/lib/tipos";

export const dynamic = "force-dynamic";

const MINUTO = 60_000;
/**
 * Una persona que cambia la dirección unas cuantas veces entra holgada. El
 * tope de toda la tienda está en lib/envia.ts y cuenta solo las consultas
 * que de verdad llegan a Envia: pasado ese, tarifa plana, nunca un 429.
 */
const LIMITE_POR_IP_MINUTO = 30;

/** Las cuotas son un dato para mostrar: si Mercado Pago tarda, la cotización sale igual. */
const ESPERA_CUOTAS_MS = 3_000;

const sinCache = { "Cache-Control": "no-store" };

function conLimite<T>(promesa: Promise<T>, ms: number, siTarda: T): Promise<T> {
  return Promise.race([promesa, new Promise<T>((listo) => setTimeout(() => listo(siTarda), ms))]);
}

/**
 * Cotiza el envío a domicilio del carrito con Envia, para la dirección que
 * está cargando el comprador.
 *
 * Devuelve las opciones (transportista, precio y plazo), cada una con su
 * comprobante firmado: el checkout cobra con ese comprobante, sin volver a
 * cotizar. Si no se puede cotizar, devuelve la tarifa plana con
 * `cotizado: false`; nunca un error por eso.
 *
 * Solo atiende al propio sitio y con un límite por IP: cada llamada pueden
 * ser varias consultas a Envia.
 */
export async function POST(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return NextResponse.json({ error: "Origen no permitido" }, { status: 403, headers: sinCache });
  }

  let cuerpo: { items?: unknown; destino?: unknown; cupon?: unknown };

  try {
    cuerpo = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400, headers: sinCache });
  }

  const items = limpiarItems(cuerpo.items);
  if (items.length === 0) {
    return NextResponse.json({ error: "Carrito vacío" }, { status: 400, headers: sinCache });
  }

  const crudo = (typeof cuerpo.destino === "object" && cuerpo.destino !== null ? cuerpo.destino : {}) as Record<string, unknown>;
  const texto = (v: unknown) => (typeof v === "string" ? v : "");
  const destino: Partial<DestinoEnvio> = {
    cp: texto(crudo.cp),
    provincia: texto(crudo.provincia),
    ciudad: texto(crudo.ciudad),
    calle: texto(crudo.calle),
    numero: texto(crudo.numero),
  };

  const ip = claveDeIp(request.headers.get("x-forwarded-for")?.split(",")[0] ?? "");
  const cuota = await consumirCuota([{ clave: `envio-ip:${ip}`, ventanaMs: MINUTO, limite: LIMITE_POR_IP_MINUTO }]);
  if (cuota.excedida) {
    return NextResponse.json(
      { error: "Demasiadas consultas seguidas. Esperá un momento." },
      { status: 429, headers: { ...sinCache, "Retry-After": "60" } }
    );
  }

  try {
    const carrito = await resolverCarrito(items, { destino, cupon: cuerpo.cupon });

    // Las cuotas sin interés se anuncian solo para el total exacto: con cada
    // envío el total es otro, así que se verifican por opción.
    const cuotas = Object.fromEntries(
      await Promise.all(
        (carrito.envioBonificado ? [] : carrito.opcionesEnvio).map(async (o) => {
          const monto = carrito.subtotal + o.precio;
          const verificadas = await conLimite(verificarCuotas(monto), ESPERA_CUOTAS_MS, null);
          return [o.id, verificadas ? { ...verificadas, monto } : null] as const;
        })
      )
    );

    return NextResponse.json(
      {
        opciones: carrito.opcionesEnvio,
        cotizado: carrito.envioCotizado,
        // El envío sin elegir nada: la más barata, o la tarifa plana.
        envio: carrito.envio,
        bonificado: carrito.envioBonificado,
        cuotas,
      },
      { headers: sinCache }
    );
  } catch (error) {
    console.error("[envio] no se pudo cotizar:", error);
    return NextResponse.json({ error: "No se pudo cotizar el envío" }, { status: 503, headers: sinCache });
  }
}
