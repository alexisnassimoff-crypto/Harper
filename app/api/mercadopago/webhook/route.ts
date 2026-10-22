import { NextResponse } from "next/server";
import { esErrorPermanente } from "@/lib/airtable";
import { firmaValida } from "@/lib/mercadopago";
import { armarEventoCompra, enviarEventosAMeta, metaCapiConfigurada } from "@/lib/meta";
import { normalizarOrigen } from "@/lib/origen";
import { urlDelSitio } from "@/lib/sitio";
import { dependenciasReales, procesarNotificacion, type VentaConfirmada } from "@/lib/webhook-proceso";

export const dynamic = "force-dynamic";

// La rama de pago aprobado hace más de diez llamadas en serie —Mercado Pago,
// el pedido, la config, el cliente, el stock y dos mails— más la espera del
// reclamo y las relecturas de verificación. Con el tope de 10 segundos de
// Vercel, un pedido de varios ítems con Airtable lento se cortaba a la mitad.
// OJO: la vigencia de la marca de reclamo (lib/webhook-decision.ts) tiene que
// ser mayor que esto.
export const maxDuration = 60;

/**
 * Pagos que se están procesando en este mismo instante, en esta instancia.
 *
 * Es el atajo barato para los duplicados que caen en la misma instancia. Los
 * que caen en instancias distintas los maneja lib/webhook-proceso.ts con el
 * reclamo del pedido y, sobre todo, con pasos que se pueden repetir sin daño.
 */
const enVuelo = new Set<string>();

/**
 * Webhook de Mercado Pago.
 *
 * Es la ÚNICA vía por la que un pedido pasa a "pagado". El redirect del
 * navegador es cosmético: si el cliente cierra la pestaña después de pagar,
 * la venta igual queda confirmada acá.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);

  let cuerpo: { type?: string; action?: string; data?: { id?: string | number } } = {};

  try {
    cuerpo = await request.json();
  } catch {
    // Mercado Pago a veces notifica solo por query string.
  }

  const tipo = cuerpo.type ?? url.searchParams.get("type") ?? url.searchParams.get("topic");

  // El query string va primero: es el `data.id` sobre el que Mercado Pago
  // calcula la firma. El cuerpo queda de respaldo.
  const dataId = String(
    url.searchParams.get("data.id") ?? url.searchParams.get("id") ?? cuerpo.data?.id ?? ""
  );

  // Solo interesan las notificaciones de pago.
  if (tipo !== "payment" || !dataId) {
    return NextResponse.json({ ok: true, ignorado: true });
  }

  // ---- Autenticidad ----
  if (
    !firmaValida({
      signature: request.headers.get("x-signature"),
      requestId: request.headers.get("x-request-id"),
      dataId,
    })
  ) {
    console.error("[webhook] firma inválida para el pago", dataId);
    return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
  }

  if (enVuelo.has(dataId)) {
    console.warn("[webhook] llegó una notificación duplicada en paralelo:", dataId);
    return NextResponse.json({ ok: true, duplicado: true });
  }

  enVuelo.add(dataId);

  try {
    const resultado = await procesarNotificacion(
      dataId,
      dependenciasReales(urlDelSitio(request), { alConfirmar: avisarCompraAMeta })
    );
    return NextResponse.json(resultado.cuerpo, { status: resultado.status });
  } catch (error) {
    console.error("[webhook] error procesando el pago", dataId, error);

    // Un pedido borrado a mano nunca va a existir: devolver 500 haría que
    // Mercado Pago reintente para siempre algo que no tiene arreglo. El 500 se
    // reserva para lo transitorio, que es para lo que sirve el reintento.
    if (esErrorPermanente(error)) {
      return NextResponse.json({ ok: true, ignorado: true });
    }

    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  } finally {
    enVuelo.delete(dataId);
  }
}

/**
 * La compra confirmada, a Meta por la Conversions API. Mismo event_id que el
 * píxel de /gracias: Meta se queda con uno. Si el webhook retoma un pedido
 * tras una caída y lo manda de nuevo, Meta también lo deduplica. Best-effort:
 * un fallo acá se loguea y no toca la venta.
 */
async function avisarCompraAMeta(venta: VentaConfirmada) {
  if (!metaCapiConfigurada()) return;

  let origen = null;
  try {
    origen = venta.origenCrudo ? normalizarOrigen(JSON.parse(venta.origenCrudo)) : null;
  } catch {
    // Un Origen ilegible no impide mandar la compra.
  }

  const evento = armarEventoCompra({
    numero: venta.numero,
    items: venta.items,
    subtotal: venta.subtotal,
    cliente: venta.cliente,
    clienteId: venta.clienteId,
    origen,
    sitio: venta.sitio,
    ahora: Date.now(),
  });

  const respuesta = await enviarEventosAMeta([evento]);

  if (!respuesta.ok) {
    console.error(`[meta] no se pudo mandar la compra ${venta.numero}: ${respuesta.status} ${respuesta.cuerpo}`);
  }
}
