import { NextResponse } from "next/server";
import { getRecord, TABLAS, updateRecord } from "@/lib/airtable";
import { getProductos } from "@/lib/catalogo";
import { getConfig } from "@/lib/config";
import { importarEnvio } from "@/lib/correo";
import { tokenValido } from "@/lib/media";
import { armarPaquete, type ItemAEmpacar } from "@/lib/paquete";
import { codigoDeProvincia } from "@/lib/provincias-codigo";
import type { ItemResuelto, ModoEnvio } from "@/lib/tipos";

export const dynamic = "force-dynamic";

/** Estados desde los que tiene sentido despachar. */
const DESPACHABLES = new Set(["pagado", "preparando"]);

type FilaPedido = {
  Numero?: string;
  Estado?: string;
  Cliente?: string[];
  Items?: string;
  Subtotal?: number;
  Direccion?: string;
  Ciudad?: string;
  Provincia?: string;
  CP?: string;
  Envio_modo?: string;
  Envio_sucursal?: string;
  Correo_envio_id?: string;
  Tracking?: string;
};

type FilaCliente = { Email?: string; Nombre?: string; Telefono?: string };

/**
 * Importa el envío de un pedido en MiCorreo: la "etiqueta automática".
 *
 * Es un GET a propósito: así el campo Etiqueta de Airtable puede ser un link
 * clickeable. Ale hace click en la fila del pedido y el envío queda cargado
 * en el panel de MiCorreo con todos los datos, listo para imprimir.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);

  if (!tokenValido(url.searchParams.get("token"))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const pedidoId = url.searchParams.get("pedido")?.trim();

  if (!pedidoId) {
    return NextResponse.json({ error: "Falta el parámetro pedido" }, { status: 400 });
  }

  try {
    const pedido = await getRecord<FilaPedido>(TABLAS.pedidos, pedidoId);
    const numero = pedido.fields.Numero ?? pedidoId;
    const estado = pedido.fields.Estado ?? "pendiente";

    // Un pedido sin pagar o cancelado no se despacha.
    if (!DESPACHABLES.has(estado)) {
      return NextResponse.json(
        { error: `El pedido ${numero} está "${estado}": no se despacha` },
        { status: 400 }
      );
    }

    // Idempotencia: dos clicks no pueden cargar dos envíos.
    if (pedido.fields.Correo_envio_id?.trim()) {
      return NextResponse.json({
        ok: true,
        yaImportado: true,
        numero,
        correoEnvioId: pedido.fields.Correo_envio_id,
      });
    }

    // ---- Destinatario ----
    const clienteId = pedido.fields.Cliente?.[0];
    const cliente = clienteId
      ? await getRecord<FilaCliente>(TABLAS.clientes, clienteId)
      : null;

    if (!cliente?.fields.Nombre || !cliente.fields.Email) {
      return NextResponse.json(
        { error: `El pedido ${numero} no tiene un cliente con nombre y mail` },
        { status: 400 }
      );
    }

    const provinciaCodigo = codigoDeProvincia(pedido.fields.Provincia ?? "");

    if (!provinciaCodigo) {
      return NextResponse.json(
        { error: `No reconozco la provincia "${pedido.fields.Provincia}"` },
        { status: 400 }
      );
    }

    // La dirección viene en un solo campo. Se separa el último número —el de
    // la calle— del resto; si no hay número, va todo como nombre de calle.
    const direccion = (pedido.fields.Direccion ?? "").trim();
    const partes = /^(.*?)\s*(\d+)\s*(.*)$/.exec(direccion);
    const calle = partes ? `${partes[1]} ${partes[3]}`.trim() : direccion;
    const numeroCalle = partes?.[2] ?? "S/N";

    // ---- El paquete, con el mismo cálculo que cotizó el envío ----
    let items: ItemResuelto[] = [];
    try {
      const parseado: unknown = JSON.parse(pedido.fields.Items ?? "[]");
      if (Array.isArray(parseado)) items = parseado as ItemResuelto[];
    } catch {
      // Sin items legibles no hay peso: se corta abajo.
    }

    const [config, productos] = await Promise.all([getConfig(), getProductos()]);

    const aEmpacar: ItemAEmpacar[] = [];
    for (const item of items) {
      const producto = productos.find((p) => p.id === item.productoId);
      aEmpacar.push({ envase: producto?.envase ?? null, cantidad: item.cantidad });
    }

    const paquete =
      aEmpacar.length > 0
        ? armarPaquete(aEmpacar, {
            margenCm: config.embalajeMargenCm,
            pesoG: config.embalajePesoG,
          })
        : null;

    if (!paquete) {
      return NextResponse.json(
        {
          error: `No pude armar el paquete de ${numero}: falta peso o medidas de algún producto en Airtable`,
        },
        { status: 400 }
      );
    }

    // ---- A MiCorreo ----
    const modo: ModoEnvio = pedido.fields.Envio_modo === "Sucursal" ? "S" : "D";

    const resultado = await importarEnvio({
      extOrderId: pedidoId,
      orderNumber: numero,
      destinatario: {
        nombre: cliente.fields.Nombre,
        email: cliente.fields.Email,
        telefono: cliente.fields.Telefono ?? "",
      },
      modo,
      sucursal: pedido.fields.Envio_sucursal?.trim() || undefined,
      direccion: {
        calle,
        numero: numeroCalle,
        ciudad: pedido.fields.Ciudad ?? "",
        provinciaCodigo,
        cp: (pedido.fields.CP ?? "").replace(/\D/g, ""),
      },
      remitente: {
        nombre: config.razonSocial,
        email: config.emailPedidos,
        cpOrigen: config.cpOrigen,
      },
      paquete,
      valorDeclarado: pedido.fields.Subtotal ?? 0,
    });

    if (!resultado.ok) {
      return NextResponse.json({ error: resultado.error }, { status: 503 });
    }

    await updateRecord<FilaPedido>(TABLAS.pedidos, pedidoId, {
      Correo_envio_id: resultado.id ?? "importado",
      ...(resultado.tracking && !pedido.fields.Tracking?.trim()
        ? { Tracking: resultado.tracking }
        : {}),
      ...(estado === "pagado" ? { Estado: "preparando" } : {}),
    });

    return NextResponse.json({
      ok: true,
      numero,
      correoEnvioId: resultado.id,
      tracking: resultado.tracking,
      siguiente: "Imprimí la etiqueta desde el panel de MiCorreo",
    });
  } catch (error) {
    console.error("[importar-envio] falló:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
