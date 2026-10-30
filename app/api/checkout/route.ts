import { NextResponse } from "next/server";
import { createRecord, ErrorAirtable, esErrorPermanente, TABLAS, updateRecord } from "@/lib/airtable";
import { guardarCliente, yaCompro } from "@/lib/clientes";
import { getConfig } from "@/lib/config";
import { claveDeIp, consumirCuota } from "@/lib/cuota";
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
import { leerEleccionEnvio } from "@/lib/envio-elegido";
import { cotizacionParaComprador, type CotizacionEnvio } from "@/lib/envio-gratis";
import { CAMPOS_ENVIO_NUEVOS, camposDeEnvio, DESCRIPCION_ENVIO, notaDeEnvio } from "@/lib/envio-pedido";
import { registroAceptacion } from "@/lib/legales";
import { normalizarOrigen } from "@/lib/origen";
import { urlDelSitio } from "@/lib/sitio";
import { leerMedioPago, MEDIO_DINERO_MP, NOTA_DINERO_MP } from "@/lib/dinero-mp";
import { normalizarCliente, validarCliente } from "@/lib/validacion";

export const dynamic = "force-dynamic";

type FilaPedido = Record<string, unknown>;

/**
 * Cada intento de pago puede cotizar el envío con Envia (si no trae un
 * comprobante válido): un tope por IP, como el de /api/envio/cotizar. Una
 * persona nunca paga veinte veces en un minuto. El tope de toda la tienda
 * está en lib/envia.ts: pasado ese, tarifa plana, y la venta sigue.
 */
const LIMITE_POR_IP_MINUTO = 20;
/** Pedidos por minuto en una instancia, pasados los cuales los topes por IP se cuentan solo en memoria. */
const LIMITE_INSTANCIA_MINUTO = 1_000;

export async function POST(request: Request) {
  // Solo desde el propio sitio: otra página no puede disparar pedidos (ni
  // consultas a Envia) desde el navegador de sus visitantes.
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return NextResponse.json({ error: "Origen no permitido" }, { status: 403 });
  }

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
    medioPago?: unknown;
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
  // Sin medio de pago (o con cualquier otra cosa) es Mercado Pago, como siempre.
  const conDineroMP = leerMedioPago(cuerpo.medioPago) === "dineroMP";

  if (items.length === 0) {
    return NextResponse.json({ error: "Tu carrito está vacío." }, { status: 400 });
  }

  const ip = claveDeIp(request.headers.get("x-forwarded-for")?.split(",")[0] ?? "");
  // Como en /api/envio/cotizar: con una inundación, los topes por IP se
  // cuentan solo en memoria para no gastar comandos de Redis.
  const instancia = await consumirCuota([{ clave: "checkout-instancia", ventanaMs: 60_000, limite: LIMITE_INSTANCIA_MINUTO }], { soloMemoria: true });
  const cuota = await consumirCuota(
    [{ clave: `checkout-ip:${ip}`, ventanaMs: 60_000, limite: LIMITE_POR_IP_MINUTO }],
    { soloMemoria: Boolean(instancia.excedida) }
  );
  if (cuota.excedida) {
    return NextResponse.json(
      { error: "Demasiados intentos seguidos. Esperá un minuto y probá de nuevo." },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  // A partir de acá todo va dentro del try: antes la resolución del carrito
  // quedaba afuera y un ítem con forma rara terminaba en un 500 con HTML,
  // que el formulario le mostraba al cliente como "Unexpected token '<'".
  let pedidoId: string | null = null;

  // Del navegador viene QUÉ eligió (y el comprobante firmado de esa
  // cotización), nunca CUÁNTO sale: el precio lo decide el servidor.
  const eleccion = leerEleccionEnvio(cuerpo.envio);

  try {
    // Para cobrar se lee el catálogo sin cache y sin red de contención.
    const carrito = await resolverCarrito(items, {
      paraCobrar: true,
      destino: {
        cp: cliente.cp,
        provincia: cliente.provincia,
        ciudad: cliente.ciudad,
        // Con el buscador viajan separados; con los campos manuales, la
        // calle y el número van juntos en `direccion` (validada).
        calle: (cliente.calle?.length ?? 0) >= 2 ? (cliente.calle as string) : cliente.direccion,
        numero: cliente.numero ?? "",
        partido: cliente.partido,
      },
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

    // Con dinero en Mercado Pago se cobra el 10% adicional sobre los productos, que el
    // servidor calculó junto con el resto (lib/dinero-mp.ts).
    const dineroMP = conDineroMP ? carrito.dineroMP : null;
    const cobro = dineroMP
      ? { items: dineroMP.items, subtotal: dineroMP.subtotal, total: dineroMP.subtotal + carrito.envio }
      : { items: carrito.items, subtotal: carrito.subtotal, total: carrito.total };

    // El comprador tiene que pagar exactamente lo que vio. Si el servidor
    // calcula otro total —cambió un precio, un tramo de descuento o la
    // cotización del envío mientras completaba los datos— no se lo manda a
    // pagar: se le muestra el total nuevo y decide.
    const totalVisto = typeof cuerpo.totalVisto === "number" ? cuerpo.totalVisto : null;

    // Todos los montos son pesos enteros calculados en el servidor (el
    // navegador muestra los mismos números): tiene que coincidir exacto.
    if (totalVisto !== null && Math.abs(cobro.total - totalVisto) > 0.005) {
      return NextResponse.json(
        {
          error: "El total cambió mientras completabas los datos. Revisalo antes de pagar.",
          totalNuevo: cobro.total,
          // El envío del servidor, para que el checkout lo muestre tal cual
          // sin volver a preguntar: el cotizado ahora (con su comprobante), o
          // el que se cobra sin cotizar (la tarifa plana, o gratis en la
          // Ciudad). No va si se cobró con el comprobante del navegador: ese
          // el checkout ya lo tiene.
          ...(carrito.opcionesEnvio.length > 0 || !carrito.envioCotizado
            ? {
                envio: {
                  ...cotizacionParaComprador(carrito, {
                    amba: carrito.config.envioGratisAmbaDesde,
                    nacional: carrito.config.envioGratisDesde,
                  }),
                  cuotas: null,
                } satisfies CotizacionEnvio,
              }
            : {}),
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
      Items: JSON.stringify(cobro.items, null, 2),
      Resumen: resumirItems(cobro.items),
      Subtotal: cobro.subtotal,
      Envio: carrito.envio,
      Total: cobro.total,
      Direccion: cliente.direccion,
      Ciudad: cliente.ciudad,
      Provincia: cliente.provincia,
      CP: cliente.cp,
      // Siempre a domicilio: es lo único que se ofrece (ver los Términos).
      // El transportista, el costo real y la cotización van en los campos
      // Envio_* nuevos (lib/envio-pedido.ts).
      Envio_modo: "Domicilio",
      Fecha: ahora.toISOString(),
      // validarCliente ya exigió la casilla: queda qué versión aceptó y cuándo.
      Terminos_aceptados: registroAceptacion(ahora),
      ...(origen ? { Origen: JSON.stringify(origen) } : {}),
    };
    const cupon = carrito.cupon?.estado === "aplicado" ? constanciaDelCupon(carrito.cupon, formatearPrecio) : null;
    const envio = { campos: camposDeEnvio(carrito.envioDelPedido, cliente), nota: notaDeEnvio(carrito.envioDelPedido) };
    const pedido = await crearPedido(campos, envio, factura, cupon, Boolean(dineroMP));

    pedidoId = pedido.id;

    const preferencia = await crearPreferencia({
      numeroPedido: numero,
      pedidoId: pedido.id,
      items: cobro.items,
      envio: carrito.envio,
      envioDescripcion: DESCRIPCION_ENVIO,
      // Lo que se mostró y se guardó: la preferencia se arma solo si suma eso.
      total: cobro.total,
      cliente,
      sitio: urlDelSitio(request),
      // Con "Dinero en Mercado Pago", Mercado Pago ofrece solo el saldo de la cuenta.
      soloDineroEnCuenta: Boolean(dineroMP),
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
 * Crea el pedido con el envío, sus datos de facturación, el cupón y, si se
 * pidió con el descuento por dinero en Mercado Pago, el medio de pago. Si
 * Airtable rechaza campos (porque faltan o alguien los cambió), la venta no
 * se frena y se pierde lo menos posible, en este orden:
 *  1. Todo junto.
 *  2. Con dinero en Mercado Pago y cupón, sin el campo Medio_pago: va a Notas.
 *  3. Sin los campos Cupon ni Medio_pago: la facturación se guarda igual y el
 *     cupón y el medio de pago van a Notas.
 *  4. Como antes de estos cambios, sin Factura_, Cupon ni Medio_pago: si la
 *     factura va a un CUIT, sus datos van a Notas (el aviso interno los lee
 *     de ahí), y el cupón y el medio de pago aparte.
 * Los campos del envío (Envio_*, Direccion_*) van en todos los intentos; si
 * el rechazo nombra uno, se saca solo ese y se reintenta. Si faltó alguno,
 * el envío también va al final de Notas, después de la facturación, que el
 * aviso interno lee del principio.
 * Si el rechazo era por otra cosa, el último intento falla igual que antes.
 */
async function crearPedido(
  campos: FilaPedido,
  envio: { campos: FilaPedido; nota: string },
  factura: FacturacionPedido,
  cupon: string | null,
  conDineroMP: boolean
) {
  const facturacion = camposDeFacturacion(factura);
  const conCupon = cupon ? { Cupon: cupon } : {};
  const notaCupon = cupon ? `Cupón: ${cupon}` : null;
  const notaMedio = conDineroMP ? NOTA_DINERO_MP : null;
  const notaFactura = factura.cuit ? `${ENCABEZADO_NOTAS}\n${lineasDeFacturacion(factura).join("\n")}` : null;
  const medio = conDineroMP ? { Medio_pago: MEDIO_DINERO_MP } : {};

  type Intento = { fila: FilaPedido; notas: (string | null)[] };
  const intentos: Intento[] = [
    { fila: { ...campos, ...facturacion, ...conCupon, ...medio }, notas: [] },
    ...(conDineroMP && cupon ? [{ fila: { ...campos, ...facturacion, ...conCupon }, notas: [NOTA_DINERO_MP] }] : []),
    ...(cupon || conDineroMP ? [{ fila: { ...campos, ...facturacion }, notas: [notaCupon, notaMedio] }] : []),
    { fila: campos, notas: [notaFactura, notaCupon, notaMedio] },
  ];

  // Los campos que Pedidos ya rechazó en esta instancia no se vuelven a
  // mandar: cada intento fallido es un pedido más a Airtable (5 por segundo).
  const camposEnvio: FilaPedido = { ...envio.campos };
  let envioIncompleto = false;
  for (const campo of camposEnvioRechazados) {
    if (campo in camposEnvio) {
      delete camposEnvio[campo];
      envioIncompleto = true;
    }
  }
  let rechazosEnvio = 0;
  const armar = ({ fila, notas }: Intento): FilaPedido => {
    const texto = [...notas, envioIncompleto ? envio.nota : null].filter(Boolean).join("\n\n");
    return { ...fila, ...camposEnvio, ...(texto ? { Notas: texto } : {}) };
  };
  // El campo del envío que nombra el rechazo de Airtable ("Unknown field
  // name: \"Direccion_piso\"", o "Field \"Envio_plazo\" cannot accept…").
  const campoRechazado = (mensaje: string) =>
    CAMPOS_ENVIO_NUEVOS.find((c) => c in camposEnvio && (mensaje.includes(`"${c}"`) || mensaje.includes(`\\"${c}\\"`)));

  for (const [i, intento] of intentos.entries()) {
    const ultimo = i === intentos.length - 1;
    for (;;) {
      try {
        return await createRecord<FilaPedido>(TABLAS.pedidos, armar(intento));
      } catch (error) {
        if (!(error instanceof ErrorAirtable && error.status === 422)) throw error;
        // Si nombra un campo del envío, se saca ese y se reintenta lo mismo.
        const campo = campoRechazado(error.message);
        if (campo) {
          console.error(`[checkout] Pedidos rechazó ${campo}; se reintenta sin ese campo y el envío va también a Notas:`, error.message);
          camposEnvioRechazados.add(campo);
          delete camposEnvio[campo];
          envioIncompleto = true;
          // Si ya van dos, faltan varios: se sacan todos los del envío de una vez.
          if (++rechazosEnvio >= 2) for (const c of CAMPOS_ENVIO_NUEVOS) delete camposEnvio[c];
          continue;
        }
        if (ultimo) throw error;
        console.error("[checkout] Pedidos rechazó campos de facturación, cupón o medio de pago; se reintenta sin ellos:", error.message);
        break;
      }
    }
  }

  // No se llega: el último intento devuelve el pedido o tira.
  throw new Error("No se pudo crear el pedido");
}

/** Campos del envío que Pedidos rechazó (por instancia): no se vuelven a mandar. */
const camposEnvioRechazados = new Set<string>();

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
