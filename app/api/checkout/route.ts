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
import { enviarMailConDetalle, mailAvisoInterno, mailDatosTransferencia, type DatosMail } from "@/lib/mails";
import { crearPreferencia, mercadoPagoConfigurado } from "@/lib/mercadopago";
import { limpiarItems, numeroDePedido, resolverCarrito, resumirItems } from "@/lib/pedidos";
import { leerEleccionEnvio, nombreModo, nombreServicio } from "@/lib/envio-elegido";
import { registroAceptacion } from "@/lib/legales";
import { normalizarOrigen } from "@/lib/origen";
import { urlDelSitio } from "@/lib/sitio";
import {
  fechaDeVencimiento,
  leerMedioPago,
  NOMBRE_MEDIO,
  NOTA_TRANSFERENCIA,
  venceLaTransferencia,
} from "@/lib/transferencia";
import { enlaceDeConfirmacion } from "@/lib/transferencia-servidor";
import { normalizarCliente, validarCliente } from "@/lib/validacion";

export const dynamic = "force-dynamic";

type FilaPedido = Record<string, unknown>;

export async function POST(request: Request) {
  let cuerpo: {
    cliente?: unknown;
    items?: unknown;
    envio?: unknown;
    totalVisto?: unknown;
    origen?: unknown;
    facturacion?: unknown;
    cupon?: unknown;
    medioPago?: unknown;
  };

  try {
    cuerpo = await request.json();
  } catch {
    return NextResponse.json({ error: "Pedido inválido" }, { status: 400 });
  }

  // Sin medio de pago (o con cualquier otra cosa) es Mercado Pago, como siempre.
  const medioPago = leerMedioPago(cuerpo.medioPago);

  if (medioPago === "mercadopago" && !mercadoPagoConfigurado()) {
    return NextResponse.json(
      { error: "Los pagos todavía no están habilitados." },
      { status: 503 }
    );
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

    // Por transferencia se cobra el 10% adicional sobre los productos, que
    // el servidor calculó junto con el resto (lib/transferencia.ts). Si no hay
    // cuenta cargada en Config no se ofrece: no se registra un pedido que no
    // se puede pagar.
    const transferencia = medioPago === "transferencia" ? carrito.transferencia : null;

    if (medioPago === "transferencia" && !transferencia) {
      return NextResponse.json(
        { error: "El pago por transferencia no está disponible en este momento. Elegí otro medio de pago.", sinTransferencia: true },
        { status: 409 }
      );
    }

    const cobro = transferencia
      ? { items: transferencia.items, subtotal: transferencia.subtotal, total: transferencia.subtotal + carrito.envio }
      : { items: carrito.items, subtotal: carrito.subtotal, total: carrito.total };

    // El comprador tiene que pagar exactamente lo que vio. Si el servidor
    // calcula otro total —cambió un precio, un tramo de descuento o la
    // cotización del envío mientras completaba los datos— no se lo manda a
    // pagar: se le muestra el total nuevo y decide.
    const totalVisto = typeof cuerpo.totalVisto === "number" ? cuerpo.totalVisto : null;

    if (totalVisto !== null && Math.abs(cobro.total - totalVisto) > 1) {
      return NextResponse.json(
        {
          error: "El total cambió mientras completabas los datos. Revisalo antes de pagar.",
          totalNuevo: cobro.total,
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

    // El pedido nace en "pendiente". Solo el webhook (o Harper, al confirmar
    // una transferencia) lo pasa a "pagado".
    const campos: FilaPedido = {
      Numero: numero,
      Estado: "pendiente",
      Cliente: [clienteId],
      Items: JSON.stringify(cobro.items, null, 2),
      Resumen: resumirItems(cobro.items),
      Subtotal: cobro.subtotal,
      Envio: carrito.envio,
      Total: cobro.total,
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
    const sitio = urlDelSitio(request);

    // Por transferencia, el pedido lleva en Notas cómo se paga, hasta cuándo
    // y el enlace con el que Harper confirma el pago recibido: así se puede
    // confirmar desde Airtable aunque el aviso interno no llegue.
    // El enlace va al mismo sitio que tomó el pedido (en una versión de
    // prueba, esa versión): la página de confirmación vive ahí.
    const vence = fechaDeVencimiento(venceLaTransferencia(ahora));
    const confirmar = transferencia ? enlaceDeConfirmacion(new URL(request.url).origin, numero) : null;
    const notaTransferencia = transferencia
      ? [NOTA_TRANSFERENCIA, `Vence: ${vence}`, `Confirmar el pago recibido: ${confirmar ?? "no se pudo armar el enlace (falta AIRTABLE_TOKEN)"}`].join("\n")
      : null;

    const pedido = await crearPedido(campos, factura, cupon, { medio: NOMBRE_MEDIO[medioPago], nota: notaTransferencia });

    pedidoId = pedido.id;

    if (transferencia) {
      // No hay nada que cobrar en línea: el comprador ve los datos de la
      // cuenta en pantalla y los recibe por mail. Un mail que no sale no
      // frena el pedido (los datos están en pantalla y el pedido en Airtable),
      // pero queda el error en los logs.
      const datos: DatosMail = {
        numero,
        items: cobro.items,
        subtotal: cobro.subtotal,
        envio: carrito.envio,
        total: cobro.total,
        cliente,
        config: carrito.config,
        sitio,
        facturacion: factura,
        cupon,
        porTransferencia: true,
      };
      const pedidoUrl = `https://airtable.com/${process.env.AIRTABLE_BASE_ID}/${TABLAS.pedidos}/${pedido.id}`;
      const [alComprador, aHarper] = await Promise.all([
        enviarMailConDetalle(mailDatosTransferencia({ ...datos, cuenta: carrito.config.transferencia!, vence })),
        enviarMailConDetalle(mailAvisoInterno({ ...datos, pedidoUrl, espera: { confirmar, vence } })),
      ]);
      if (!alComprador.ok) console.error(`[checkout] no salió el mail con los datos para transferir del pedido ${numero}:`, alComprador.error);
      if (!aHarper.ok) console.error(`[checkout] no salió el aviso interno de la transferencia pendiente ${numero}:`, aHarper.error);

      return NextResponse.json({ numero, siguiente: `/gracias?pedido=${encodeURIComponent(numero)}` });
    }

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

    // Si el pedido llegó a crearse pero el pago no, queda marcado. Sin esto
    // cada intento fallido dejaba un "pendiente" eterno ensuciando Airtable.
    if (pedidoId) await anularPedido(pedidoId);

    // Airtable caído no es "tu carrito está vacío": es un problema nuestro.
    const codigo = esErrorPermanente(error) ? 400 : 503;

    return NextResponse.json(
      {
        error:
          medioPago === "transferencia"
            ? "No pudimos registrar el pedido. Probá de nuevo en un momento."
            : "No pudimos iniciar el pago. Probá de nuevo en un momento.",
      },
      { status: codigo }
    );
  }
}

/**
 * Crea el pedido con sus datos de facturación, el cupón y el medio de pago.
 * Si Airtable rechaza esos campos (porque faltan o alguien los cambió), la
 * venta no se frena y se pierde lo menos posible, en este orden:
 *  1. Todo junto.
 *  2. Sin los campos Cupon y Medio_pago: la facturación se guarda igual y el
 *     cupón va a Notas (el medio de pago, si es transferencia, ya está ahí).
 *  3. Como antes de estos cambios, sin Factura_, Cupon ni Medio_pago: si la
 *     factura va a un CUIT, sus datos van a Notas (el aviso interno los lee
 *     de ahí), y el cupón y la transferencia aparte.
 * Si el rechazo era por otra cosa, el último intento falla igual que antes.
 */
async function crearPedido(
  campos: FilaPedido,
  factura: FacturacionPedido,
  cupon: string | null,
  pago: { medio: string; nota: string | null }
) {
  const facturacion = camposDeFacturacion(factura);
  const notas = (...bloques: (string | null)[]) => {
    const presentes = bloques.filter(Boolean);
    return presentes.length ? { Notas: presentes.join("\n\n") } : {};
  };
  const intentos: FilaPedido[] = [
    { ...campos, ...facturacion, ...(cupon ? { Cupon: cupon } : {}), Medio_pago: pago.medio, ...notas(pago.nota) },
    { ...campos, ...facturacion, ...notas(cupon ? `Cupón: ${cupon}` : null, pago.nota) },
  ];

  for (const fila of intentos) {
    try {
      return await createRecord<FilaPedido>(TABLAS.pedidos, fila);
    } catch (error) {
      if (!(error instanceof ErrorAirtable && error.status === 422)) throw error;
      console.error("[checkout] Pedidos rechazó campos de facturación, cupón o medio de pago; se reintenta sin ellos:", error.message);
    }
  }

  return createRecord<FilaPedido>(TABLAS.pedidos, {
    ...campos,
    ...notas(
      factura.cuit ? `${ENCABEZADO_NOTAS}\n${lineasDeFacturacion(factura).join("\n")}` : null,
      cupon ? `Cupón: ${cupon}` : null,
      pago.nota
    ),
  });
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
