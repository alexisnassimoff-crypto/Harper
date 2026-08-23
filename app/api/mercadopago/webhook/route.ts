import { NextResponse } from "next/server";
import { getRecord, TABLAS, updateRecord } from "@/lib/airtable";
import { marcarCompra } from "@/lib/clientes";
import { getConfig } from "@/lib/config";
import {
  enviarMail,
  mailAvisoInterno,
  mailConfirmacion,
  mailPagoRechazado,
  type DatosMail,
} from "@/lib/mails";
import { firmaValida, obtenerPago } from "@/lib/mercadopago";
import { descontarStock } from "@/lib/stock";
import type { DatosCliente, ItemResuelto } from "@/lib/tipos";

export const dynamic = "force-dynamic";

/** Estados en los que el pedido ya fue procesado y no hay que volver a tocarlo. */
const YA_PROCESADO = new Set([
  "pagado",
  "preparando",
  "enviado",
  "entregado",
  "rechazado",
]);

type FilaPedido = {
  Numero?: string;
  Estado?: string;
  Cliente?: string[];
  Items?: string;
  Subtotal?: number;
  Envio?: number;
  Total?: number;
  Direccion?: string;
  Ciudad?: string;
  Provincia?: string;
  CP?: string;
  MP_payment_id?: string;
  MP_status?: string;
};

type FilaCliente = {
  Email?: string;
  Nombre?: string;
  Telefono?: string;
  DNI?: string;
};

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
  const dataId = String(
    cuerpo.data?.id ?? url.searchParams.get("data.id") ?? url.searchParams.get("id") ?? ""
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

  try {
    // El estado real se pregunta a Mercado Pago; nunca se toma del cuerpo.
    const pago = await obtenerPago(dataId);
    const pedidoId = pago.external_reference;

    if (!pedidoId) {
      console.error("[webhook] el pago", dataId, "no trae external_reference");
      return NextResponse.json({ ok: true, ignorado: true });
    }

    const pedido = await getRecord<FilaPedido>(TABLAS.pedidos, pedidoId);
    const estadoActual = pedido.fields.Estado ?? "pendiente";

    // ---- Idempotencia ----
    // Mercado Pago reintenta las notificaciones: sin esto se descontaría
    // el stock dos veces y se mandaría el mail duplicado.
    if (
      YA_PROCESADO.has(estadoActual) &&
      pedido.fields.MP_payment_id === String(pago.id)
    ) {
      return NextResponse.json({ ok: true, duplicado: true });
    }

    const config = await getConfig();

    // Un JSON corrupto no puede impedir que se confirme una venta ya cobrada:
    // sin esto el webhook devolvería 500 y Mercado Pago reintentaría para siempre.
    let items: ItemResuelto[] = [];

    try {
      const parseado: unknown = JSON.parse(pedido.fields.Items ?? "[]");
      if (Array.isArray(parseado)) items = parseado as ItemResuelto[];
    } catch (error) {
      console.error("[webhook] Items ilegible en el pedido", pedidoId, error);
    }

    const clienteId = pedido.fields.Cliente?.[0];
    const clienteRegistro = clienteId
      ? await getRecord<FilaCliente>(TABLAS.clientes, clienteId)
      : null;

    const cliente: DatosCliente = {
      email: clienteRegistro?.fields.Email ?? pago.payer?.email ?? "",
      nombre: clienteRegistro?.fields.Nombre ?? "",
      telefono: clienteRegistro?.fields.Telefono ?? "",
      dni: clienteRegistro?.fields.DNI ?? "",
      direccion: pedido.fields.Direccion ?? "",
      ciudad: pedido.fields.Ciudad ?? "",
      provincia: pedido.fields.Provincia ?? "",
      cp: pedido.fields.CP ?? "",
      aceptaPromos: false,
    };

    const sitio = process.env.NEXT_PUBLIC_SITE_URL ?? url.origin;

    const datosMail: DatosMail = {
      numero: pedido.fields.Numero ?? pedidoId,
      items,
      subtotal: pedido.fields.Subtotal ?? 0,
      envio: pedido.fields.Envio ?? 0,
      total: pedido.fields.Total ?? 0,
      cliente,
      config,
      sitio,
    };

    if (pago.status === "approved") {
      // El pedido se marca ANTES de mandar mails: si el mail falla,
      // la venta ya quedó registrada igual.
      await updateRecord<FilaPedido>(TABLAS.pedidos, pedidoId, {
        Estado: "pagado",
        MP_payment_id: String(pago.id),
        MP_status: pago.status,
      });

      await descontarStock(items);

      if (clienteId) {
        await marcarCompra(clienteId, new Date().toISOString());
      }

      if (cliente.email) {
        await enviarMail(mailConfirmacion(datosMail));
      }

      await enviarMail(
        mailAvisoInterno({
          ...datosMail,
          pedidoUrl: `https://airtable.com/${process.env.AIRTABLE_BASE_ID}/${TABLAS.pedidos}/${pedidoId}`,
        })
      );

      return NextResponse.json({ ok: true, estado: "pagado" });
    }

    if (pago.status === "rejected" || pago.status === "cancelled") {
      await updateRecord<FilaPedido>(TABLAS.pedidos, pedidoId, {
        Estado: "rechazado",
        MP_payment_id: String(pago.id),
        MP_status: `${pago.status}${pago.status_detail ? ` (${pago.status_detail})` : ""}`,
      });

      if (cliente.email) {
        await enviarMail(mailPagoRechazado(datosMail));
      }

      return NextResponse.json({ ok: true, estado: "rechazado" });
    }

    // Pagos en revisión (in_process, pending): se registra y se espera
    // la próxima notificación, sin tocar stock ni mandar mails.
    await updateRecord<FilaPedido>(TABLAS.pedidos, pedidoId, {
      MP_payment_id: String(pago.id),
      MP_status: pago.status,
    });

    return NextResponse.json({ ok: true, estado: pago.status });
  } catch (error) {
    console.error("[webhook] error procesando el pago", dataId, error);

    // Se devuelve 500 a propósito: Mercado Pago reintenta la notificación
    // y así no se pierde una venta por una caída pasajera de Airtable.
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
