import { ErrorAirtable, esErrorPermanente, getRecord, TABLAS, updateRecord, type AirtableRecord } from "./airtable";
import { marcarCompra } from "./clientes";
import { getConfig } from "./config";
import {
  enviarMail as enviarMailReal,
  mailAvisoInterno,
  mailConfirmacion,
  mailPagoRechazado,
  mailsConfigurados as mailsConfiguradosReal,
  type DatosMail,
} from "./mails";
import { obtenerPago as obtenerPagoReal, type PagoMP } from "./mercadopago";
import { descontarStock } from "./stock";
import type { DatosCliente, ItemResuelto } from "./tipos";
import {
  decidirNotificacion,
  ESTADOS_CONFIRMADOS,
  ESTADOS_MP_ABIERTOS,
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
 * La regla que sostiene todo: una notificación solo recibe 200 cuando SU pago
 * quedó resuelto en Airtable. Si esta instancia se retira (perdió el reclamo,
 * otra le pisó la marca) vuelve a mirar el pedido: si otra lo resolvió para
 * este mismo pago, 200; si no, 503, y Mercado Pago reintenta. Si falla algo
 * con la marca puesta, 500, y Mercado Pago reintenta. Nunca un 200 a ciegas.
 *
 * El orden de los pasos con efecto es deliberado y cada uno se puede repetir
 * sin daño (ver lib/webhook-lock.ts):
 *
 *   stock (idempotente por marca en la variante)
 *   → Estado "pagado" (escribirlo dos veces es lo mismo)
 *   → mail al cliente → mail interno (cada uno anotado como paso cumplido)
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
  /** Devuelve `false` si el mail no salió (lib/mails.ts no lanza). */
  enviarMail: typeof enviarMailReal;
  /** Si los mails están apagados a propósito, un `false` no es un fallo. */
  mailsConfigurados: () => boolean;
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
    mailsConfigurados: mailsConfiguradosReal,
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

/** Un mail que tenía que salir no salió (Resend caído). Es transitorio: se reintenta. */
export class ErrorMail extends Error {
  constructor(asunto: string) {
    super(`no salió el mail "${asunto}"`);
    this.name = "ErrorMail";
  }
}

/**
 * Falló algo con la marca de reclamo ya escrita.
 *
 * Para la ruta nunca es "permanente": contesta 500, Mercado Pago reintenta y,
 * cuando la marca venza, el reintento retoma lo que falte. El único error que
 * merece un 200 es el 404 del pedido en la primera lectura, antes de escribir
 * nada (un pedido borrado a mano no va a aparecer por reintentar).
 */
export class ErrorTrasReclamo extends Error {
  constructor(
    readonly paso: string,
    readonly causa: unknown
  ) {
    super(`falló "${paso}" con la marca de reclamo puesta: ${describir(causa)}`);
    this.name = "ErrorTrasReclamo";
  }
}

function describir(error: unknown) {
  const texto = error instanceof Error ? error.message : String(error);
  return texto.replace(/\s+/g, " ").slice(0, 300);
}

function ok(cuerpo: Record<string, unknown>): Resultado {
  return { status: 200, cuerpo: { ok: true, ...cuerpo } };
}

/**
 * Otra instancia está procesando el pedido y no terminó dentro de la espera,
 * o nuestro pago quedó sin resolver. Un 503 hace que Mercado Pago reintente
 * más tarde: si la otra terminó, el reintento es un duplicado inofensivo; si
 * se cayó, el reintento retoma. Contestar 200 acá sería peor: si la otra
 * muere, o estaba haciendo OTRA cosa con el pedido, nadie vuelve.
 */
const OCUPADO: Resultado = {
  status: 503,
  cuerpo: { ok: false, ocupado: true, detalle: "el pedido está en manos de otra instancia; reintentar" },
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

/**
 * Esta instancia se retira (perdió el reclamo, o le pisaron la marca). Antes
 * de contestar, espera a que la otra termine y mira si NUESTRO pago quedó
 * resuelto: solo entonces 200. Si la otra estaba en otra cosa (un pago
 * pendiente, un rechazo tardío, otro pago aprobado) o se cayó, 503 para que
 * Mercado Pago reintente esta notificación y el reintento la complete.
 */
async function retirarse(
  pedidoId: string,
  pago: PagoMP,
  deps: Dependencias,
  actual: AirtableRecord<FilaPedido>,
  motivo: string
): Promise<Resultado> {
  const final = await esperarLibre(pedidoId, pago, deps, actual);

  if (final.accion === "duplicado" || final.accion === "ignorar") {
    return ok({ duplicado: true, cedido: true });
  }

  console.warn(
    `[webhook] ${motivo}: el pago ${pago.id} sobre el pedido ${pedidoId} sigue sin resolverse (${final.accion}); se pide reintento`
  );
  return OCUPADO;
}

/**
 * El MP_status que corresponde dejar cuando nuestra marca pisó lo que había y
 * no tenemos nada que hacer con el pedido.
 *
 * Lo que había no se puede recuperar (lo pisamos) y NO sabemos si la instancia
 * que dejó el Estado terminó o seguía a mitad de camino (nuestra marca la va a
 * hacer retirarse). Así que nunca se escribe un cierre que no hicimos
 * nosotros: se deja abierto (vacío, o el estado intermedio que vimos) para que
 * el reintento de aquel pago complete lo que falte. Lo único que se cierra es
 * un rechazo coherente con el nuestro, que se escribe de una sola vez.
 */
function mpStatusTrasPisar(estado: string, pago: PagoMP, mismoPago: boolean) {
  if (mismoPago && estado === "rechazado" && (pago.status === "rejected" || pago.status === "cancelled")) {
    return pago.status;
  }
  if (mismoPago && ESTADOS_MP_ABIERTOS.has(pago.status)) return pago.status;
  return "";
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
  // Si otra instancia lo tiene reclamado, se le da tiempo a que termine. Un
  // 404 acá (pedido borrado a mano) sube como está: la ruta contesta 200.
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

  // ---- Reclamo ----
  // También para "esperar" (registrar un pago pendiente): es una escritura
  // más sobre MP_status, y hecha sin reclamo podía pisar la marca de la
  // instancia que estaba aprobando. Si había una marca vencida de este mismo
  // pago, estamos retomando: se heredan los pasos que aquel intento anotó.
  const vencido = leerReclamo(pedido.fields.MP_status);
  let retoma = vencido !== null && vencido.pagoId === pagoId;

  const reclamado = await reclamarPedido<FilaPedido>(pedidoId, pagoId, {
    esperaMs: deps.esperaReclamoMs,
    reloj: deps.reloj,
    pasos: retoma && vencido ? vencido.pasos : [],
  });

  if (!reclamado.gano) {
    return retirarse(pedidoId, pago, deps, reclamado.pedido, "perdí el reclamo");
  }

  let reclamo: Reclamo = reclamado.reclamo;
  pedido = reclamado.pedido;

  if (!retoma) {
    // Entre la primera lectura y el reclamo otra instancia pudo haber
    // terminado. Se vuelve a decidir con el Estado fresco; sin el MP_status,
    // que ahora es nuestra marca (pisó el que hubiera).
    const estadoFresco = pedido.fields.Estado ?? "pendiente";
    const fresca = decidirNotificacion({
      estadoActual: estadoFresco,
      pagoRegistrado: pedido.fields.MP_payment_id,
      mpStatusActual: "",
      pagoId,
      statusPago: pago.status,
      ahora: deps.reloj.ahora(),
    });

    if (fresca === "duplicado" || fresca === "ignorar") {
      // Nada que hacer con nuestro pago. Se suelta la marca sin cerrar nada
      // que no hayamos hecho nosotros: si quien dejó ese Estado seguía
      // trabajando, su reintento lo completa.
      await updateRecord<FilaPedido>(TABLAS.pedidos, pedidoId, {
        MP_status: mpStatusTrasPisar(estadoFresco, pago, pedido.fields.MP_payment_id === pagoId),
      });
      return ok({ duplicado: true });
    }

    if (fresca === "aprobar" && ESTADOS_CONFIRMADOS.has(estadoFresco)) {
      // Otra instancia llegó a marcar "pagado" entre nuestra lectura y nuestro
      // reclamo, y nuestra marca la va a hacer retirarse en su próxima
      // verificación. No sabemos hasta dónde llegó, así que se completa el
      // camino: el stock y el Estado se saltan solos; lo único que puede
      // repetirse es un mail, y es preferible a que no salga ninguno.
      console.warn(`[webhook] el pedido ${pedidoId} ya figura pagado por otra instancia: completo lo que falte`);
      retoma = true;
    }

    accion = fresca;
  }

  // ---- Con la marca puesta: todo lo que sigue, o se completa, o se reintenta ----
  let paso = "contexto";
  let datosMail: DatosMail | null = null;
  const numero = pedido.fields.Numero ?? pedidoId;
  const pedidoUrl = `https://airtable.com/${process.env.AIRTABLE_BASE_ID}/${TABLAS.pedidos}/${pedidoId}`;

  try {
    const estadoActual = pedido.fields.Estado ?? "pendiente";
    const clienteId = pedido.fields.Cliente?.[0];

    const [config, clienteRegistro] = await Promise.all([
      getConfig(),
      clienteId ? leerCliente(clienteId) : Promise.resolve(null),
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

    const total = pedido.fields.Total ?? 0;

    datosMail = {
      numero,
      items,
      subtotal: pedido.fields.Subtotal ?? 0,
      envio: pedido.fields.Envio ?? 0,
      total,
      cliente,
      config,
      sitio: deps.sitio,
    };

    const datos = datosMail;

    /** Antes de cada paso con efecto: ¿la marca sigue siendo nuestra? */
    const verificar = async (nombre: string) => {
      paso = nombre;
      await deps.antesDelPaso?.(nombre);
      const v = await verificarReclamo<FilaPedido>(pedidoId, reclamo);
      if (!v.vigente) throw new Cedido(nombre);
      reclamo = v.reclamo;
      pedido = v.pedido;
    };

    /** Manda un mail y, si no salió (y los mails están prendidos), corta para reintentar. */
    const mandar = async (envio: ReturnType<typeof mailConfirmacion>) => {
      const salio = await deps.enviarMail(envio);
      if (!salio && deps.mailsConfigurados()) throw new ErrorMail(envio.asunto);
    };

    if (accion === "esperar") {
      // Pago en revisión (in_process, pending): se registra y se espera la
      // próxima notificación, sin tocar stock ni mandar mails.
      await verificar("registro");
      await updateRecord<FilaPedido>(TABLAS.pedidos, pedidoId, {
        MP_payment_id: pagoId,
        MP_status: pago.status,
      });

      return ok({ estado: pago.status });
    }

    if (accion === "revisar_segundo_pago") {
      // Un pedido ya cobrado (o cancelado) recibió OTRO pago aprobado. No se
      // toca el estado ni el stock: se avisa y se deja constancia, porque lo
      // más probable es que haya que devolverle la plata al cliente. El mail
      // va ANTES de la constancia: si el mail no sale, el reintento vuelve a
      // intentarlo; si saliera dos veces, es una alerta repetida, no perdida.
      const anterior = pedido.fields.MP_payment_id ?? "sin pago registrado";

      console.error(
        `[webhook] segundo pago aprobado ${pagoId} sobre el pedido ${pedidoId} (${estadoActual}, pago anterior ${anterior})`
      );

      await verificar("revisar");
      await mandar({
        ...mailAvisoInterno({ ...datos, pedidoUrl }),
        asunto: `REVISAR ${numero} — segundo pago aprobado (${pagoId}), posible doble cobro`,
      });
      await updateRecord<FilaPedido>(TABLAS.pedidos, pedidoId, {
        MP_status: `${MARCA_REVISAR} segundo pago aprobado ${pagoId} sobre un pedido ${estadoActual} (pago anterior ${anterior}); posible doble cobro`,
      });

      return ok({ estado: "revisar" });
    }

    if (accion === "rechazar") {
      // Mail primero, estado final después (una sola escritura, que cierra la
      // marca). Si el mail no sale, el reintento lo vuelve a intentar.
      await verificar("rechazo");

      if (cliente.email) {
        await mandar(mailPagoRechazado(datos));
      }

      await updateRecord<FilaPedido>(TABLAS.pedidos, pedidoId, {
        Estado: "rechazado",
        MP_payment_id: pagoId,
        MP_status: `${pago.status}${pago.status_detail ? ` (${pago.status_detail})` : ""}`,
      });

      return ok({ estado: "rechazado" });
    }

    // ---- aprobar (nuevo o retomado) ----

    // Lo cobrado tiene que ser lo que dice el pedido. Si no coincide, la venta
    // NO se da por buena: se avisa, se registra, y lo mira una persona.
    const cobrado = pago.transaction_amount;

    if (typeof cobrado === "number" && Math.abs(cobrado - total) > TOLERANCIA_MONTO) {
      console.error(`[webhook] el pago ${pagoId} cobró ${cobrado} y el pedido ${pedidoId} dice ${total}`);

      await verificar("monto");
      await mandar({
        ...mailAvisoInterno({ ...datos, pedidoUrl }),
        asunto: `REVISAR ${numero} — el monto cobrado no coincide`,
      });
      await updateRecord<FilaPedido>(TABLAS.pedidos, pedidoId, {
        MP_payment_id: pagoId,
        MP_status: `${MARCA_REVISAR} se cobró ${cobrado} y el pedido dice ${total}`,
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
      // Idempotente: la primera compra se escribe una sola vez; la última, el
      // día. Un cliente borrado a mano no frena la venta.
      try {
        await marcarCompra(clienteId, new Date(deps.reloj.ahora()).toISOString());
      } catch (error) {
        if (!(error instanceof ErrorAirtable && error.status === 404)) throw error;
        console.error(`[webhook] el cliente ${clienteId} no existe: no se marca la compra`);
      }
    }

    // 3. Mails, cada uno una sola vez por pedido: quedan anotados en la marca.
    // ("mails" es el nombre que usaba una versión anterior para los dos.)
    const hecho = (nombre: string) => reclamo.pasos.includes(nombre) || reclamo.pasos.includes("mails");

    if (cliente.email && !hecho("mail_cliente")) {
      await verificar("mail_cliente");
      await mandar(mailConfirmacion(datos));
      reclamo = await anotarPaso<FilaPedido>(pedidoId, reclamo, "mail_cliente");
    }

    if (!hecho("mail_interno")) {
      await verificar("mail_interno");
      await mandar(mailAvisoInterno({ ...datos, pedidoUrl }));
      reclamo = await anotarPaso<FilaPedido>(pedidoId, reclamo, "mail_interno");
    }

    // 4. Gancho de venta confirmada. Best-effort: no toca la venta.
    if (deps.alConfirmar) {
      paso = "gancho";
      try {
        await deps.alConfirmar({
          numero,
          pedidoId,
          items,
          subtotal: datos.subtotal,
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
      ...(stock.noEncontradas.length > 0 ? { stockNoEncontrado: stock.noEncontradas.length } : {}),
      ...(stock.sinMarca ? { stockSinMarca: true } : {}),
    });
  } catch (error) {
    if (error instanceof Cedido) {
      console.warn(`[webhook] el pedido ${pedidoId} pasó a otra instancia antes de "${error.paso}"`);
      return retirarse(pedidoId, pago, deps, pedido, `cedí en "${error.paso}"`);
    }

    if (esErrorPermanente(error)) {
      // Reintentar no lo va a arreglar (un campo creado con otro tipo, un
      // registro borrado, un token sin permiso). Se deja constancia para una
      // persona y se corta el bucle: los próximos reintentos ven "revisar:"
      // con este pago y contestan duplicado. Si ni eso se puede escribir,
      // 500 y que Mercado Pago insista.
      console.error(`[webhook] fallo permanente en "${paso}" del pago ${pagoId} sobre ${pedidoId}:`, error);

      const nota = `${MARCA_REVISAR} falló el paso "${paso}" del pago ${pagoId}: ${describir(error)}`;

      try {
        await updateRecord<FilaPedido>(TABLAS.pedidos, pedidoId, { MP_status: nota });
      } catch (otro) {
        console.error("[webhook] tampoco se pudo dejar la constancia", otro);
        throw new ErrorTrasReclamo(paso, error);
      }

      if (datosMail) {
        try {
          await deps.enviarMail({
            ...mailAvisoInterno({ ...datosMail, pedidoUrl }),
            asunto: `REVISAR ${numero} — falló "${paso}" al procesar el pago ${pagoId}`,
          });
        } catch (otro) {
          console.error("[webhook] no salió el aviso del fallo", otro);
        }
      }

      return ok({ estado: "revisar", fallo: paso });
    }

    // Transitorio (Airtable 5xx o 429, red, Resend): la marca queda puesta,
    // la ruta contesta 500 y el reintento retoma lo que falte.
    throw new ErrorTrasReclamo(paso, error);
  }
}

/** El cliente del pedido. Si lo borraron a mano (404), la venta sigue con lo que dice el pago. */
async function leerCliente(clienteId: string) {
  try {
    return await getRecord<FilaCliente>(TABLAS.clientes, clienteId);
  } catch (error) {
    if (error instanceof ErrorAirtable && error.status === 404) {
      console.error(`[webhook] el cliente ${clienteId} no existe: se sigue con los datos del pago`);
      return null;
    }
    throw error;
  }
}
