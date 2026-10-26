import { NextResponse } from "next/server";
import { createRecord, ErrorAirtable, esErrorPermanente, TABLAS, updateRecord } from "@/lib/airtable";
import { guardarCliente, yaCompro } from "@/lib/clientes";
import { getConfig } from "@/lib/config";
import { buscarCupon, constanciaDelCupon, mensajeDelCupon } from "@/lib/cupones";
import {
  camposDeFacturacion,
  ENCABEZADO_NOTAS,
  facturacionDelPedido,
  type FacturacionPedido,
  leerCondicionEmisor,
  lineasDeFacturacion,
  normalizarFacturacion,
  validarFacturacion,
} from "@/lib/facturacion";
import { precio as formatearPrecio } from "@/lib/formato";
import { crearPreferencia, mercadoPagoConfigurado } from "@/lib/mercadopago";
import { limpiarItems, numeroDePedido, resolverCarrito, resumirItems } from "@/lib/pedidos";
import { leerEleccionEnvio, nombreModo, nombreServicio } from "@/lib/envio-elegido";
import { registroAceptacion } from "@/lib/legales";
import { normalizarOrigen } from "@/lib/origen";
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

  let cuerpo: {
    cliente?: unknown;
    items?: unknown;
    envio?: unknown;
    totalVisto?: unknown;
    origen?: unknown;
    facturacion?: unknown;
    cupon?: unknown;
  };

  try {
    cuerpo = await request.json();
  } catch {
    return NextResponse.json({ error: "Pedido inválido" }, { status: 400 });
  }

  // ---- Validación del cliente y de los datos de facturación ----
  // Sin datos de facturación (o con cualquier otra cosa) es consumidor final.
  const facturacion = normalizarFacturacion(cuerpo.facturacion);
  const errores = {
    ...validarCliente(cuerpo.cliente as Record<string, unknown>),
    ...validarFacturacion(facturacion),
  };

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
      cupon: cuerpo.cupon,
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

    // El cupón de bienvenida es para la primera compra: se mira si este email o
    // este DNI ya tienen una compra confirmada. Si la tienen, no se cobra nada
    // distinto de lo que vio: se le avisa y decide (el carrito se recalcula
    // sin el cupón).
    if (
      carrito.cupon?.estado === "aplicado" &&
      buscarCupon(carrito.cupon.codigo)?.soloPrimeraCompra &&
      (await yaCompro(cliente.email, cliente.dni))
    ) {
      return NextResponse.json(
        {
          error: mensajeDelCupon({ ...carrito.cupon, estado: "no-primera-compra" }),
          cuponRechazado: carrito.cupon.codigo,
        },
        { status: 409 }
      );
    }

    // El comprador tiene que pagar exactamente lo que vio. Si el servidor
    // calcula otro total —cambió un precio, un tramo de descuento o la
    // cotización del envío mientras completaba los datos— no se lo manda a
    // pagar: se le muestra el total nuevo y decide.
    const totalVisto = typeof cuerpo.totalVisto === "number" ? cuerpo.totalVisto : null;

    if (totalVisto !== null && Math.abs(carrito.total - totalVisto) > 1) {
      return NextResponse.json(
        {
          error: "El total cambió mientras completabas los datos. Revisalo antes de pagar.",
          totalNuevo: carrito.total,
        },
        { status: 409 }
      );
    }

    const ahora = new Date();
    const numero = numeroDePedido(ahora);
    const clienteId = await guardarCliente(cliente);

    // De qué anuncio vino: solo las claves conocidas, recortadas.
    const origen = normalizarOrigen(cuerpo.origen);

    // La clase de la factura, con la condición de Harper frente al IVA que
    // está en Config. Si Config no responde, queda "A confirmar": nunca frena
    // la venta.
    const factura = facturacionDelPedido(facturacion, leerCondicionEmisor((await getConfig()).condicionIva));

    // El pedido nace en "pendiente". Solo el webhook lo pasa a "pagado".
    const campos: FilaPedido = {
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
      // validarCliente ya exigió la casilla: queda qué versión aceptó y cuándo.
      Terminos_aceptados: registroAceptacion(ahora),
      ...(origen ? { Origen: JSON.stringify(origen) } : {}),
    };
    const cupon = carrito.cupon?.estado === "aplicado" ? constanciaDelCupon(carrito.cupon, formatearPrecio) : null;
    const pedido = await crearPedido(campos, factura, cupon);

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

/**
 * Crea el pedido con sus datos de facturación y el cupón. Si Airtable rechaza
 * el pedido con esos campos (porque faltan o alguien los cambió), la venta no
 * se frena: se crea como antes, sin ellos. Si la factura va a un CUIT o hubo
 * cupón, eso queda en Notas y el aviso interno lo lee de ahí. Si el rechazo
 * era por otra cosa, el segundo intento falla igual que antes de este cambio.
 */
async function crearPedido(campos: FilaPedido, factura: FacturacionPedido, cupon: string | null) {
  try {
    return await createRecord<FilaPedido>(TABLAS.pedidos, {
      ...campos,
      ...camposDeFacturacion(factura),
      ...(cupon ? { Cupon: cupon } : {}),
    });
  } catch (error) {
    if (!(error instanceof ErrorAirtable && error.status === 422)) throw error;
    console.error("[checkout] Pedidos rechazó los campos de facturación o de cupón; el pedido se crea sin ellos:", error.message);
    // Lo que se pierda de esos campos queda en Notas: la facturación primero
    // (el aviso interno la lee de ahí) y el cupón aparte.
    const notas = [
      factura.cuit ? `${ENCABEZADO_NOTAS}\n${lineasDeFacturacion(factura).join("\n")}` : null,
      cupon ? `Cupón: ${cupon}` : null,
    ].filter(Boolean);
    return createRecord<FilaPedido>(TABLAS.pedidos, { ...campos, ...(notas.length ? { Notas: notas.join("\n\n") } : {}) });
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
