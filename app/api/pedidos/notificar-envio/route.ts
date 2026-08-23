import { NextResponse } from "next/server";
import { getRecord, TABLAS, updateRecord } from "@/lib/airtable";
import { getConfig } from "@/lib/config";
import { enviarMail, mailEnviado, type DatosMail } from "@/lib/mails";
import { tokenValido } from "@/lib/media";
import type { DatosCliente, ItemResuelto } from "@/lib/tipos";

export const dynamic = "force-dynamic";

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
  Tracking?: string;
};

type FilaCliente = { Email?: string; Nombre?: string; Telefono?: string; DNI?: string };

/**
 * Avisa al cliente que su pedido salió, con el número de seguimiento.
 *
 * Se dispara desde una automation de Airtable cuando se completa el campo
 * Tracking de un pedido. Recibe { pedidoId } y el token de autorización.
 */
export async function POST(request: Request) {
  const token =
    request.headers.get("x-sync-token") ??
    new URL(request.url).searchParams.get("token");

  if (!tokenValido(token)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  let cuerpo: { pedidoId?: string };

  try {
    cuerpo = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const pedidoId = cuerpo.pedidoId?.trim();

  if (!pedidoId) {
    return NextResponse.json({ error: "Falta pedidoId" }, { status: 400 });
  }

  try {
    const pedido = await getRecord<FilaPedido>(TABLAS.pedidos, pedidoId);
    const tracking = pedido.fields.Tracking?.trim();

    if (!tracking) {
      return NextResponse.json(
        { error: "El pedido todavía no tiene número de seguimiento" },
        { status: 400 }
      );
    }

    const clienteId = pedido.fields.Cliente?.[0];
    const clienteRegistro = clienteId
      ? await getRecord<FilaCliente>(TABLAS.clientes, clienteId)
      : null;

    const email = clienteRegistro?.fields.Email;

    if (!email) {
      return NextResponse.json(
        { error: "El pedido no tiene un cliente con mail" },
        { status: 400 }
      );
    }

    const config = await getConfig();

    const cliente: DatosCliente = {
      email,
      nombre: clienteRegistro?.fields.Nombre ?? "",
      telefono: clienteRegistro?.fields.Telefono ?? "",
      dni: clienteRegistro?.fields.DNI ?? "",
      direccion: pedido.fields.Direccion ?? "",
      ciudad: pedido.fields.Ciudad ?? "",
      provincia: pedido.fields.Provincia ?? "",
      cp: pedido.fields.CP ?? "",
      aceptaPromos: false,
    };

    const datos: DatosMail & { tracking: string } = {
      numero: pedido.fields.Numero ?? pedidoId,
      items: JSON.parse(pedido.fields.Items ?? "[]") as ItemResuelto[],
      subtotal: pedido.fields.Subtotal ?? 0,
      envio: pedido.fields.Envio ?? 0,
      total: pedido.fields.Total ?? 0,
      cliente,
      config,
      sitio: process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin,
      tracking,
    };

    const enviado = await enviarMail(mailEnviado(datos));

    if (enviado && pedido.fields.Estado !== "entregado") {
      await updateRecord<FilaPedido>(TABLAS.pedidos, pedidoId, {
        Estado: "enviado",
      });
    }

    return NextResponse.json({ ok: enviado });
  } catch (error) {
    console.error("[notificar-envio] falló:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
