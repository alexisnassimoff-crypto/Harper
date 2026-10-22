import { NextResponse } from "next/server";
import { esErrorPermanente, getRecord, TABLAS, updateRecord } from "@/lib/airtable";
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
import { armarEventoCompra, enviarEventosAMeta, metaCapiConfigurada } from "@/lib/meta";
import { normalizarOrigen } from "@/lib/origen";
import { urlDelSitio } from "@/lib/sitio";
import { descontarStock } from "@/lib/stock";
import { decidirNotificacion, MARCA_REVISAR } from "@/lib/webhook-decision";
import { reclamarPedido } from "@/lib/webhook-lock";
import type { DatosCliente, ItemResuelto } from "@/lib/tipos";

export const dynamic = "force-dynamic";

// La rama de pago aprobado hace más de diez llamadas en serie —Mercado Pago,
// el pedido, la config, el cliente, el stock y dos mails—. Con el tope de 10
// segundos de Vercel, un pedido de varios ítems con Airtable lento se cortaba
// a la mitad y dejaba la venta marcada como pagada pero sin descontar stock ni
// avisarle a nadie.
export const maxDuration = 60;

/**
 * Pagos que se están procesando en este mismo instante, en esta instancia.
 *
 * Es el atajo barato para los duplicados que caen en la misma instancia. Los
 * que caen en instancias distintas los frena el reclamo del pedido en
 * Airtable (lib/webhook-lock.ts), que es el que garantiza que cada pago se
 * procese una sola vez.
 */
const enVuelo = new Set<string>();

/** Diferencia máxima tolerada entre lo cobrado y el total del pedido. */
const TOLERANCIA_MONTO = 1;

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
  /** JSON con UTM, fbclid y cookies del píxel, escrito por el checkout. */
  Origen?: string;
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
    return await procesar(dataId, request);
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

async function avisarCompraAMeta(datos: {
  numero: string;
  items: ItemResuelto[];
  subtotal: number;
  cliente: DatosCliente;
  clienteId?: string;
  origenCrudo?: string;
  sitio: string;
}) {
  if (!metaCapiConfigurada()) return;

  try {
    let origen = null;
    try {
      origen = datos.origenCrudo ? normalizarOrigen(JSON.parse(datos.origenCrudo)) : null;
    } catch {
      // Un Origen ilegible no impide mandar la compra.
    }

    const evento = armarEventoCompra({
      numero: datos.numero,
      items: datos.items,
      subtotal: datos.subtotal,
      cliente: datos.cliente,
      clienteId: datos.clienteId,
      origen,
      sitio: datos.sitio,
      ahora: Date.now(),
    });

    const respuesta = await enviarEventosAMeta([evento]);

    if (!respuesta.ok) {
      console.error(`[meta] no se pudo mandar la compra ${datos.numero}: ${respuesta.status} ${respuesta.cuerpo}`);
    }
  } catch (error) {
    console.error("[meta] error armando el evento de compra", datos.numero, error);
  }
}

/** Qué decide el webhook a partir del pedido tal como está en Airtable. */
function decidir(pedido: { fields: FilaPedido }, pagoId: string, statusPago: string) {
  return decidirNotificacion({
    estadoActual: pedido.fields.Estado ?? "pendiente",
    pagoRegistrado: pedido.fields.MP_payment_id,
    mpStatusActual: pedido.fields.MP_status,
    pagoId,
    statusPago,
  });
}

async function procesar(dataId: string, request: Request) {
  // El estado real se pregunta a Mercado Pago; nunca se toma del cuerpo.
  const pago = await obtenerPago(dataId);
  const pedidoId = pago.external_reference;

  if (!pedidoId) {
    console.error("[webhook] el pago", dataId, "no trae external_reference");
    return NextResponse.json({ ok: true, ignorado: true });
  }

  let pedido = await getRecord<FilaPedido>(TABLAS.pedidos, pedidoId);
  const pagoId = String(pago.id);

  // ---- Idempotencia y protección del pedido ----
  // Mercado Pago reintenta las notificaciones, y un mismo pedido puede recibir
  // más de un pago (un intento rechazado y otro aprobado, o dos aprobados).
  // La decisión está en lib/webhook-decision.ts, con sus pruebas.
  let accion = decidir(pedido, pagoId, pago.status);

  if (accion === "duplicado") {
    return NextResponse.json({ ok: true, duplicado: true });
  }

  if (accion === "ignorar") {
    console.warn(
      `[webhook] el pago ${pagoId} (${pago.status}) llegó sobre el pedido ${pedidoId} ya ${pedido.fields.Estado}: no se toca`
    );
    return NextResponse.json({ ok: true, ignorado: true });
  }

  // ---- Reclamo entre instancias ----
  // Las acciones que cambian el pedido (confirmar, rechazar, marcar para
  // revisar) las ejecuta una sola instancia. Si otra escribió su marca después
  // de la nuestra, es ella la que sigue; nosotros contestamos 200 y listo.
  // "esperar" solo anota el estado y no necesita reclamo.
  if (accion !== "esperar") {
    const reclamo = await reclamarPedido<FilaPedido>(pedidoId, pagoId);

    if (!reclamo.gano) {
      console.warn(`[webhook] el pago ${pagoId} lo está procesando otra instancia: me retiro`);
      return NextResponse.json({ ok: true, duplicado: true });
    }

    // Entre la primera lectura y el reclamo, otra instancia pudo haber
    // terminado: se vuelve a decidir con el pedido fresco.
    pedido = reclamo.pedido;
    accion = decidir(pedido, pagoId, pago.status);

    if (accion === "duplicado" || accion === "ignorar" || accion === "esperar") {
      // Nuestra marca pisó el MP_status final que dejó la otra instancia:
      // se restaura, sin tocar nada más.
      await updateRecord<FilaPedido>(TABLAS.pedidos, pedidoId, { MP_status: pago.status });
      return NextResponse.json({ ok: true, duplicado: true });
    }
  }

  const estadoActual = pedido.fields.Estado ?? "pendiente";

  const clienteId = pedido.fields.Cliente?.[0];

  // La config y el cliente no dependen entre sí: van juntos para no sumar
  // otro viaje de ida y vuelta al presupuesto de tiempo de la función.
  const [config, clienteRegistro] = await Promise.all([
    getConfig(),
    clienteId ? getRecord<FilaCliente>(TABLAS.clientes, clienteId) : Promise.resolve(null),
  ]);

  // Un JSON corrupto no puede impedir que se confirme una venta ya cobrada:
  // sin esto el webhook devolvería 500 y Mercado Pago reintentaría para siempre.
  let items: ItemResuelto[] = [];

  try {
    const parseado: unknown = JSON.parse(pedido.fields.Items ?? "[]");
    if (Array.isArray(parseado)) items = parseado as ItemResuelto[];
  } catch (error) {
    console.error("[webhook] Items ilegible en el pedido", pedidoId, error);
  }

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

  const sitio = urlDelSitio(request);
  const total = pedido.fields.Total ?? 0;

  const datosMail: DatosMail = {
    numero: pedido.fields.Numero ?? pedidoId,
    items,
    subtotal: pedido.fields.Subtotal ?? 0,
    envio: pedido.fields.Envio ?? 0,
    total,
    cliente,
    config,
    sitio,
  };

  const pedidoUrl = `https://airtable.com/${process.env.AIRTABLE_BASE_ID}/${TABLAS.pedidos}/${pedidoId}`;

  if (accion === "revisar_segundo_pago") {
    // Un pedido ya cobrado (o cancelado) recibió OTRO pago aprobado. No se toca
    // el estado ni el stock: se deja constancia y se avisa, porque lo más
    // probable es que haya que devolverle la plata al cliente.
    const anterior = pedido.fields.MP_payment_id ?? "sin pago registrado";

    console.error(
      `[webhook] segundo pago aprobado ${pagoId} sobre el pedido ${pedidoId} (${estadoActual}, pago anterior ${anterior})`
    );

    await updateRecord<FilaPedido>(TABLAS.pedidos, pedidoId, {
      MP_status: `${MARCA_REVISAR} segundo pago aprobado ${pagoId} sobre un pedido ${estadoActual} (pago anterior ${anterior}); posible doble cobro`,
    });

    const aviso = mailAvisoInterno({ ...datosMail, pedidoUrl });
    await enviarMail({
      ...aviso,
      asunto: `REVISAR ${datosMail.numero} — segundo pago aprobado (${pagoId}), posible doble cobro`,
    });

    return NextResponse.json({ ok: true, estado: "revisar" });
  }

  if (accion === "aprobar") {
    // Lo cobrado tiene que ser lo que dice el pedido. Si no coincide, la venta
    // NO se da por buena: se registra, se avisa, y lo mira una persona.
    const cobrado = pago.transaction_amount;

    if (typeof cobrado === "number" && Math.abs(cobrado - total) > TOLERANCIA_MONTO) {
      console.error(
        `[webhook] el pago ${pago.id} cobró ${cobrado} y el pedido ${pedidoId} dice ${total}`
      );

      await updateRecord<FilaPedido>(TABLAS.pedidos, pedidoId, {
        MP_payment_id: pagoId,
        MP_status: `${MARCA_REVISAR} se cobró ${cobrado} y el pedido dice ${total}`,
      });

      const aviso = mailAvisoInterno({ ...datosMail, pedidoUrl });
      await enviarMail({
        ...aviso,
        asunto: `REVISAR ${datosMail.numero} — el monto cobrado no coincide`,
      });

      return NextResponse.json({ ok: true, estado: "revisar" });
    }

    // El pedido se marca ANTES de mandar mails: si el mail falla,
    // la venta ya quedó registrada igual.
    await updateRecord<FilaPedido>(TABLAS.pedidos, pedidoId, {
      Estado: "pagado",
      MP_payment_id: pagoId,
      MP_status: pago.status,
    });

    await descontarStock(items);

    if (clienteId) {
      await marcarCompra(clienteId, new Date().toISOString());
    }

    if (cliente.email) {
      await enviarMail(mailConfirmacion(datosMail));
    }

    await enviarMail(mailAvisoInterno({ ...datosMail, pedidoUrl }));

    // La compra confirmada, a Meta por la Conversions API. Mismo event_id
    // que el píxel de /gracias: Meta se queda con uno. Best-effort: un fallo
    // acá se loguea y no toca la venta.
    await avisarCompraAMeta({
      numero: datosMail.numero,
      items,
      subtotal: datosMail.subtotal,
      cliente,
      clienteId,
      origenCrudo: pedido.fields.Origen,
      sitio,
    });

    return NextResponse.json({ ok: true, estado: "pagado" });
  }

  if (accion === "rechazar") {
    await updateRecord<FilaPedido>(TABLAS.pedidos, pedidoId, {
      Estado: "rechazado",
      MP_payment_id: pagoId,
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
    MP_payment_id: pagoId,
    MP_status: pago.status,
  });

  return NextResponse.json({ ok: true, estado: pago.status });
}
