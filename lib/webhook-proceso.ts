import { getRecord, TABLAS, updateRecord, type AirtableRecord } from "./airtable";
import { marcarCompra } from "./clientes";
import { getConfig } from "./config";
import {
  enviarMail as enviarMailReal,
  mailAvisoInterno,
  mailConfirmacion,
  mailPagoRechazado,
  type DatosMail,
} from "./mails";
import { obtenerPago as obtenerPagoReal, type PagoMP } from "./mercadopago";
import { descontarStock } from "./stock";
import type { DatosCliente, ItemResuelto } from "./tipos";
import {
  decidirNotificacion,
  ESTADOS_CONFIRMADOS,
  leerReclamo,
  MARCA_REVISAR,
  type Accion,
  type Reclamo,
} from "./webhook-decision";
import {
  anotarPaso,
  ESPERA_RECLAMO_MS,
  reclamarPedido,
  RELOJ_REAL,
  verificarReclamo,
  type Reloj,
} from "./webhook-lock";

/**
 * El procesamiento de una notificación de pago, separado de la ruta HTTP.
 *
 * Todo lo que tiene efecto afuera (Mercado Pago, mails, el reloj) entra por
 * `Dependencias`, así las pruebas lo corren contra el Airtable en memoria con
 * dos o diez "instancias" a la vez, con caídas a mitad de camino y con
 * llegadas escalonadas, sin red y sin esperar de verdad.
 *
 * El orden de los pasos con efecto es deliberado y cada uno se puede repetir
 * sin daño (ver lib/webhook-lock.ts):
 *
 *   stock (idempotente por marca en la variante)
 *   → Estado "pagado" (escribirlo dos veces es lo mismo)
 *   → mails (se anotan como paso cumplido en la marca)
 *   → cierre (MP_status pasa de la marca al estado real del pago)
 *
 * Una caída entre dos pasos deja la marca puesta; cuando vence, el reintento
 * de Mercado Pago retoma desde el primer paso y cada uno se salta solo lo que
 * ya estaba hecho. El stock va primero porque es lo único que no se puede
 * reconstruir mirando el pedido: si el Estado dijera "pagado" sin stock
 * descontado, nadie se enteraría.
 */

/** Diferencia máxima tolerada entre lo cobrado y el total del pedido. */
export const TOLERANCIA_MONTO = 1;

/**
 * Cuánto se espera, en total, a que otra instancia termine con el pedido
 * antes de contestarle a Mercado Pago que reintente. La mayoría de los
 * duplicados (`payment.created` y `payment.updated`) se resuelven acá mismo.
 */
export const ESPERA_OCUPADO_MS = 8_000;

const PASO_ESPERA_MS = 1_000;

export type FilaPedido = {
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

/** Lo que se le pasa al gancho de venta confirmada (p. ej. la Conversions API). */
export type VentaConfirmada = {
  numero: string;
  pedidoId: string;
  items: ItemResuelto[];
  subtotal: number;
  total: number;
  cliente: DatosCliente;
  clienteId?: string;
  origenCrudo?: string;
  sitio: string;
};

export type Dependencias = {
  obtenerPago: (pagoId: string) => Promise<PagoMP>;
  enviarMail: typeof enviarMailReal;
  reloj: Reloj;
  /** Espera entre escribir la marca y releer. */
  esperaReclamoMs: number;
  /** Cuánto se espera a otra instancia antes de pedir reintento. */
  esperaOcupadoMs: number;
  /** URL pública del sitio, para los mails. */
  sitio: string;
  /** Gancho opcional al confirmar una venta. Best-effort: un fallo se loguea. */
  alConfirmar?: (venta: VentaConfirmada) => Promise<void>;
  /** Para las pruebas: se llama antes de verificar la marca en cada paso con efecto. */
  antesDelPaso?: (paso: string) => Promise<void> | void;
};

export type Resultado = {
  /** 200 si la notificación quedó resuelta; 503 si hay que reintentarla. */
  status: number;
  cuerpo: Record<string, unknown>;
};

export function dependenciasReales(sitio: string, extra: Partial<Dependencias> = {}): Dependencias {
  return {
    obtenerPago: obtenerPagoReal,
    enviarMail: enviarMailReal,
    reloj: RELOJ_REAL,
    esperaReclamoMs: ESPERA_RECLAMO_MS,
    esperaOcupadoMs: ESPERA_OCUPADO_MS,
    sitio,
    ...extra,
  };
}

/** Otra instancia nos pisó la marca entre dos pasos: nos retiramos. */
class Cedido extends Error {
  constructor(readonly paso: string) {
    super(`la marca ya no es nuestra antes del paso "${paso}"`);
    this.name = "Cedido";
  }
}

function ok(cuerpo: Record<string, unknown>): Resultado {
  return { status: 200, cuerpo: { ok: true, ...cuerpo } };
}

/**
 * Otra instancia está procesando el pedido y no terminó dentro de la espera.
 * Un 503 hace que Mercado Pago reintente más tarde: si la otra terminó, el
 * reintento es un duplicado inofensivo; si se cayó, el reintento retoma.
 * Contestar 200 acá sería peor: si la otra muere, nadie vuelve.
 */
const OCUPADO: Resultado = {
  status: 503,
  cuerpo: { ok: false, ocupado: true, detalle: "otra instancia está procesando este pedido; reintentar" },
};

function decidir(pedido: AirtableRecord<FilaPedido>, pago: PagoMP, ahora: number): Accion {
  return decidirNotificacion({
    estadoActual: pedido.fields.Estado ?? "pendiente",
    pagoRegistrado: pedido.fields.MP_payment_id,
    mpStatusActual: pedido.fields.MP_status,
    pagoId: String(pago.id),
    statusPago: pago.status,
    ahora,
  });
}

/**
 * Mientras otra instancia tenga el pedido reclamado y vigente, se espera de a
 * un segundo y se vuelve a decidir, hasta `esperaOcupadoMs`.
 */
async function esperarLibre(
  pedidoId: string,
  pago: PagoMP,
  deps: Dependencias,
  inicial: AirtableRecord<FilaPedido>
): Promise<{ accion: Accion; pedido: AirtableRecord<FilaPedido> }> {
  let pedido = inicial;
  let accion = decidir(pedido, pago, deps.reloj.ahora());
  let esperado = 0;

  while (accion === "en_curso" && esperado < deps.esperaOcupadoMs) {
    const paso = Math.min(PASO_ESPERA_MS, deps.esperaOcupadoMs - esperado);
    await deps.reloj.dormir(paso);
    esperado += paso;

    pedido = await getRecord<FilaPedido>(TABLAS.pedidos, pedidoId);
    accion = decidir(pedido, pago, deps.reloj.ahora());
  }

  return { accion, pedido };
}

export async function procesarNotificacion(dataId: string, deps: Dependencias): Promise<Resultado> {
  // El estado real se pregunta a Mercado Pago; nunca se toma del cuerpo.
  const pago = await deps.obtenerPago(dataId);
  const pedidoId = pago.external_reference;

  if (!pedidoId) {
    console.error("[webhook] el pago", dataId, "no trae external_reference");
    return ok({ ignorado: true });
  }

  const pagoId = String(pago.id);

  // ---- Decisión sobre el pedido como está ----
  // Si otra instancia lo tiene reclamado, se le da tiempo a que termine.
  const primera = await getRecord<FilaPedido>(TABLAS.pedidos, pedidoId);
  const esperado = await esperarLibre(pedidoId, pago, deps, primera);
  let pedido = esperado.pedido;
  let accion = esperado.accion;

  if (accion === "en_curso") {
    console.warn(`[webhook] el pedido ${pedidoId} sigue reclamado por otra instancia: se pide reintento`);
    return OCUPADO;
  }

  if (accion === "duplicado") {
    return ok({ duplicado: true });
  }

  if (accion === "ignorar") {
    console.warn(
      `[webhook] el pago ${pagoId} (${pago.status}) llegó sobre el pedido ${pedidoId} ya ${pedido.fields.Estado}: no se toca`
    );
    return ok({ ignorado: true });
  }

  if (accion === "esperar") {
    // Pagos en revisión (in_process, pending): se registra y se espera la
    // próxima notificación, sin tocar stock ni mandar mails.
    await updateRecord<FilaPedido>(TABLAS.pedidos, pedidoId, {
      MP_payment_id: pagoId,
      MP_status: pago.status,
    });

    return ok({ estado: pago.status });
  }

  // ---- Reclamo ----
  // Si había una marca vencida de este mismo pago, estamos retomando: se
  // heredan los pasos que aquel intento alcanzó a anotar.
  const vencido = leerReclamo(pedido.fields.MP_status);
  let retoma = vencido !== null && vencido.pagoId === pagoId;

  const reclamado = await reclamarPedido<FilaPedido>(pedidoId, pagoId, {
    esperaMs: deps.esperaReclamoMs,
    reloj: deps.reloj,
    pasos: retoma && vencido ? vencido.pasos : [],
  });

  if (!reclamado.gano) {
    // Otra instancia escribió su marca después de la nuestra: sigue ella. Se
    // le da tiempo a terminar para contestar con el pedido ya resuelto.
    console.warn(`[webhook] el pago ${pagoId} lo reclamó otra instancia: me retiro`);
    const final = await esperarLibre(pedidoId, pago, deps, reclamado.pedido);
    return final.accion === "duplicado" || final.accion === "ignorar" ? ok({ duplicado: true }) : OCUPADO;
  }

  let reclamo: Reclamo = reclamado.reclamo;
  pedido = reclamado.pedido;

  if (!retoma) {
    // Entre la primera lectura y el reclamo otra instancia pudo haber
    // terminado. Se vuelve a decidir con el Estado fresco; sin el MP_status,
    // que ahora es nuestra marca (pisó el que hubiera).
    const fresca = decidirNotificacion({
      estadoActual: pedido.fields.Estado ?? "pendiente",
      pagoRegistrado: pedido.fields.MP_payment_id,
      mpStatusActual: "",
      pagoId,
      statusPago: pago.status,
      ahora: deps.reloj.ahora(),
    });

    if (fresca === "duplicado" && pago.status === "approved" && ESTADOS_CONFIRMADOS.has(pedido.fields.Estado ?? "")) {
      // Otra instancia llegó a marcar "pagado" entre nuestra lectura y nuestro
      // reclamo, y nuestra marca la va a hacer retirarse en su próxima
      // verificación. No sabemos hasta dónde llegó, así que se completa el
      // camino: el stock y el Estado se saltan solos; lo único que puede
      // repetirse es un mail, y es preferible a que no salga ninguno.
      console.warn(`[webhook] el pedido ${pedidoId} ya figura pagado por otra instancia: completo lo que falte`);
      retoma = true;
      accion = "aprobar";
    } else if (fresca === "duplicado" || fresca === "ignorar" || fresca === "esperar") {
      // Se restaura el estado final que pisamos, sin tocar nada más.
      await updateRecord<FilaPedido>(TABLAS.pedidos, pedidoId, { MP_status: pago.status });
      return ok({ duplicado: true });
    } else {
      accion = fresca;
    }
  }

  // ---- Contexto: config, cliente, ítems ----
  const estadoActual = pedido.fields.Estado ?? "pendiente";
  const clienteId = pedido.fields.Cliente?.[0];

  const [config, clienteRegistro] = await Promise.all([
    getConfig(),
    clienteId ? getRecord<FilaCliente>(TABLAS.clientes, clienteId) : Promise.resolve(null),
  ]);

  // Un JSON corrupto no puede impedir que se confirme una venta ya cobrada.
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

  const numero = pedido.fields.Numero ?? pedidoId;
  const total = pedido.fields.Total ?? 0;

  const datosMail: DatosMail = {
    numero,
    items,
    subtotal: pedido.fields.Subtotal ?? 0,
    envio: pedido.fields.Envio ?? 0,
    total,
    cliente,
    config,
    sitio: deps.sitio,
  };

  const pedidoUrl = `https://airtable.com/${process.env.AIRTABLE_BASE_ID}/${TABLAS.pedidos}/${pedidoId}`;

  /** Antes de cada paso con efecto: ¿la marca sigue siendo nuestra? */
  const verificar = async (paso: string) => {
    await deps.antesDelPaso?.(paso);
    const v = await verificarReclamo<FilaPedido>(pedidoId, reclamo);
    if (!v.vigente) throw new Cedido(paso);
    reclamo = v.reclamo;
    pedido = v.pedido;
  };

  try {
    if (accion === "revisar_segundo_pago") {
      // Un pedido ya cobrado (o cancelado) recibió OTRO pago aprobado. No se
      // toca el estado ni el stock: se deja constancia y se avisa, porque lo
      // más probable es que haya que devolverle la plata al cliente.
      const anterior = pedido.fields.MP_payment_id ?? "sin pago registrado";

      console.error(
        `[webhook] segundo pago aprobado ${pagoId} sobre el pedido ${pedidoId} (${estadoActual}, pago anterior ${anterior})`
      );

      await verificar("revisar");
      await updateRecord<FilaPedido>(TABLAS.pedidos, pedidoId, {
        MP_status: `${MARCA_REVISAR} segundo pago aprobado ${pagoId} sobre un pedido ${estadoActual} (pago anterior ${anterior}); posible doble cobro`,
      });

      const aviso = mailAvisoInterno({ ...datosMail, pedidoUrl });
      await deps.enviarMail({
        ...aviso,
        asunto: `REVISAR ${numero} — segundo pago aprobado (${pagoId}), posible doble cobro`,
      });

      return ok({ estado: "revisar" });
    }

    if (accion === "rechazar") {
      // Una sola escritura deja el estado final y cierra la marca.
      await verificar("rechazo");
      await updateRecord<FilaPedido>(TABLAS.pedidos, pedidoId, {
        Estado: "rechazado",
        MP_payment_id: pagoId,
        MP_status: `${pago.status}${pago.status_detail ? ` (${pago.status_detail})` : ""}`,
      });

      if (cliente.email) {
        await deps.enviarMail(mailPagoRechazado(datosMail));
      }

      return ok({ estado: "rechazado" });
    }

    // ---- aprobar (nuevo o retomado) ----

    // Lo cobrado tiene que ser lo que dice el pedido. Si no coincide, la venta
    // NO se da por buena: se registra, se avisa, y lo mira una persona.
    const cobrado = pago.transaction_amount;

    if (typeof cobrado === "number" && Math.abs(cobrado - total) > TOLERANCIA_MONTO) {
      console.error(`[webhook] el pago ${pagoId} cobró ${cobrado} y el pedido ${pedidoId} dice ${total}`);

      await verificar("monto");
      await updateRecord<FilaPedido>(TABLAS.pedidos, pedidoId, {
        MP_payment_id: pagoId,
        MP_status: `${MARCA_REVISAR} se cobró ${cobrado} y el pedido dice ${total}`,
      });

      const aviso = mailAvisoInterno({ ...datosMail, pedidoUrl });
      await deps.enviarMail({
        ...aviso,
        asunto: `REVISAR ${numero} — el monto cobrado no coincide`,
      });

      return ok({ estado: "revisar" });
    }

    // 1. Stock. Idempotente por la marca en cada variante.
    await verificar("stock");
    const stock = await descontarStock(items, numero);

    // 2. Estado pagado, con la marca todavía puesta (el cierre va al final).
    // Si al retomar el pedido ya avanzó a mano ("preparando", "enviado"), no
    // se lo vuelve atrás: solo se completa lo que falte.
    await verificar("pagado");
    const yaConfirmado = ESTADOS_CONFIRMADOS.has(pedido.fields.Estado ?? "");
    reclamo = await anotarPaso<FilaPedido>(pedidoId, reclamo, "pagado", {
      ...(yaConfirmado ? {} : { Estado: "pagado" }),
      MP_payment_id: pagoId,
    });

    if (clienteId) {
      // Idempotente: la primera compra se escribe una sola vez; la última, el día.
      await marcarCompra(clienteId, new Date(deps.reloj.ahora()).toISOString());
    }

    // 3. Mails, una sola vez por pedido: quedan anotados en la marca.
    if (!reclamo.pasos.includes("mails")) {
      await verificar("mails");

      if (cliente.email) {
        await deps.enviarMail(mailConfirmacion(datosMail));
      }

      await deps.enviarMail(mailAvisoInterno({ ...datosMail, pedidoUrl }));
      reclamo = await anotarPaso<FilaPedido>(pedidoId, reclamo, "mails");
    }

    // 4. Gancho de venta confirmada. Best-effort: no toca la venta.
    if (deps.alConfirmar) {
      try {
        await deps.alConfirmar({
          numero,
          pedidoId,
          items,
          subtotal: datosMail.subtotal,
          total,
          cliente,
          clienteId,
          origenCrudo: pedido.fields.Origen,
          sitio: deps.sitio,
        });
      } catch (error) {
        console.error("[webhook] falló el gancho de venta confirmada", numero, error);
      }
    }

    // 5. Cierre: la marca da lugar al estado real del pago.
    await verificar("cierre");
    await updateRecord<FilaPedido>(TABLAS.pedidos, pedidoId, { MP_status: pago.status });

    return ok({
      estado: "pagado",
      retomado: retoma,
      stockDescontado: stock.descontadas.length,
      stockOmitido: stock.omitidas.length,
      ...(stock.sinMarca ? { stockSinMarca: true } : {}),
    });
  } catch (error) {
    if (error instanceof Cedido) {
      console.warn(`[webhook] el pedido ${pedidoId} pasó a otra instancia antes de "${error.paso}": me retiro`);
      return ok({ cedido: true });
    }

    throw error;
  }
}
