import { NextResponse } from "next/server";
import { createRecord, esErrorPermanente, TABLAS, updateRecord } from "@/lib/airtable";
import { guardarCliente } from "@/lib/clientes";
import { crearPreferencia, mercadoPagoConfigurado } from "@/lib/mercadopago";
import { limpiarItems, numeroDePedido, resolverCarrito, resumirItems } from "@/lib/pedidos";
import { leerEleccionEnvio, nombreModo, nombreServicio } from "@/lib/envio-elegido";
import { urlDelSitio } from "@/lib/sitio";
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

  let cuerpo: { cliente?: unknown; items?: unknown; envio?: unknown };

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
  const items = limpiarItems(cuerpo.items);

  if (items.length === 0) {
    return NextResponse.json({ error: "Tu carrito está vacío." }, { status: 400 });
  }

  // A partir de acá todo va dentro del try: antes la resolución del carrito
  // quedaba afuera y un ítem con forma rara terminaba en un 500 con HTML,
  // que el formulario le mostraba al cliente como "Unexpected token '<'".
  let pedidoId: string | null = null;

  // Del navegador viene QUÉ eligió, nunca CUÁNTO sale. El precio del envío lo
  // vuelve a cotizar el servidor unas líneas más abajo.
  const eleccion = leerEleccionEnvio(cuerpo.envio);

  try {
    // Para cobrar se lee el catálogo sin cache y sin red de contención.
    const carrito = await resolverCarrito(items, {
      paraCobrar: true,
      cpDestino: cliente.cp,
      eleccion,
    });

    if (carrito.items.length === 0) {
      return NextResponse.json(
        { error: "No hay productos disponibles en tu carrito." },
        { status: 400 }
      );
    }

    // Si algo se agotó o desapareció entre que armó el carrito y apretó
    // comprar, no lo mandamos a pagar un total distinto del que vio.
    if (carrito.descartados.length > 0) {
      return NextResponse.json(
        {
          error: "Tu carrito cambió: revisalo antes de pagar.",
          descartados: carrito.descartados,
        },
        { status: 409 }
      );
    }

    const ahora = new Date();
    const numero = numeroDePedido(ahora);
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
      // Cómo pidió recibirlo, para saber qué despachar sin tener que preguntar.
      Envio_modo: nombreModo(eleccion),
      Envio_servicio: nombreServicio(eleccion),
      Envio_sucursal: eleccion?.sucursal ?? "",
      Fecha: ahora.toISOString(),
    });

    pedidoId = pedido.id;

    const preferencia = await crearPreferencia({
      numeroPedido: numero,
      pedidoId: pedido.id,
      items: carrito.items,
      envio: carrito.envio,
      cliente,
      sitio: urlDelSitio(request),
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

    // Si el pedido llegó a crearse pero el pago no, queda marcado. Sin esto
    // cada intento fallido dejaba un "pendiente" eterno ensuciando Airtable.
    if (pedidoId) await anularPedido(pedidoId);

    // Airtable caído no es "tu carrito está vacío": es un problema nuestro.
    const codigo = esErrorPermanente(error) ? 400 : 503;

    return NextResponse.json(
      { error: "No pudimos iniciar el pago. Probá de nuevo en un momento." },
      { status: codigo }
    );
  }
}

/** Marca un pedido que nunca llegó a tener preferencia de pago. */
async function anularPedido(pedidoId: string) {
  try {
    await updateRecord<FilaPedido>(TABLAS.pedidos, pedidoId, {
      Estado: "cancelado",
      MP_status: "sin preferencia de pago",
    });
  } catch (error) {
    // Nunca puede tapar el error original.
    console.error("[checkout] no se pudo anular el pedido", pedidoId, error);
  }
}
