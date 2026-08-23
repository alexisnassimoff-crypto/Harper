import { NextResponse } from "next/server";
import { createRecord, TABLAS, updateRecord } from "@/lib/airtable";
import { guardarCliente } from "@/lib/clientes";
import { crearPreferencia, mercadoPagoConfigurado } from "@/lib/mercadopago";
import { numeroDePedido, resolverCarrito, resumirItems } from "@/lib/pedidos";
import type { ItemCarrito } from "@/lib/tipos";
import { normalizarCliente, validarCliente } from "@/lib/validacion";

export const dynamic = "force-dynamic";

type FilaPedido = Record<string, unknown>;

export async function POST(request: Request) {
  if (!mercadoPagoConfigurado()) {
    return NextResponse.json(
      { error: "Los pagos todavía no están habilitados." },
      { status: 503 }
    );
  }

  let cuerpo: { cliente?: unknown; items?: unknown };

  try {
    cuerpo = await request.json();
  } catch {
    return NextResponse.json({ error: "Pedido inválido" }, { status: 400 });
  }

  // ---- Validación del cliente ----
  const errores = validarCliente(cuerpo.cliente as Record<string, unknown>);

  if (Object.keys(errores).length > 0) {
    return NextResponse.json(
      { error: "Revisá los datos del formulario", errores },
      { status: 400 }
    );
  }

  const cliente = normalizarCliente(cuerpo.cliente as Record<string, unknown>);

  // ---- Resolución del carrito contra Airtable ----
  const items = Array.isArray(cuerpo.items) ? (cuerpo.items as ItemCarrito[]) : [];
  const carrito = await resolverCarrito(items.slice(0, 50));

  if (carrito.items.length === 0) {
    return NextResponse.json(
      { error: "No hay productos disponibles en tu carrito." },
      { status: 400 }
    );
  }

  const ahora = new Date();
  const numero = numeroDePedido(ahora);

  try {
    const clienteId = await guardarCliente(cliente);

    // El pedido nace en "pendiente". Solo el webhook lo pasa a "pagado".
    const pedido = await createRecord<FilaPedido>(TABLAS.pedidos, {
      Numero: numero,
      Estado: "pendiente",
      Cliente: [clienteId],
      Items: JSON.stringify(carrito.items, null, 2),
      Resumen: resumirItems(carrito.items),
      Subtotal: carrito.subtotal,
      Envio: carrito.envio,
      Total: carrito.total,
      Direccion: cliente.direccion,
      Ciudad: cliente.ciudad,
      Provincia: cliente.provincia,
      CP: cliente.cp,
      Fecha: ahora.toISOString(),
    });

    const sitio =
      process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin;

    const preferencia = await crearPreferencia({
      numeroPedido: numero,
      pedidoId: pedido.id,
      items: carrito.items,
      envio: carrito.envio,
      cliente,
      sitio,
    });

    await updateRecord<FilaPedido>(TABLAS.pedidos, pedido.id, {
      MP_preference_id: preferencia.id,
    });

    return NextResponse.json({
      numero,
      initPoint: preferencia.init_point,
    });
  } catch (error) {
    console.error("[checkout] falló al crear el pedido:", error);

    return NextResponse.json(
      { error: "No pudimos iniciar el pago. Probá de nuevo en un momento." },
      { status: 500 }
    );
  }
}
