/**
 * Mercado Pago: el cobro de un pedido, SOLO LECTURA (Tarea 11, separado en
 * la Tarea 12). Lo usan el Crédito Harper (lib/credito-pagos.ts, sin
 * conectar) y el webhook de hoy para no anular el cashback de un pedido que
 * sigue cobrado por otro pago (lib/webhook-proceso.ts).
 *
 * A Mercado Pago solo le hace GET: nunca crea, cambia ni reembolsa nada.
 * Un pedido se considera cobrado por lo que suman TODOS sus pagos vigentes,
 * cada uno leído por su ID; si no se puede certificar (búsqueda incompleta o
 * atrasada, un estado que no se conoce), tira `CobroIncierto` y quien llama
 * no decide nada: reintenta.
 */

// ---------- Mercado Pago, solo lectura ----------

/** Un pago de Mercado Pago, con lo que hace falta para el crédito. */
export type PagoLeido = {
  id: string;
  /** approved, pending, in_process, authorized, in_mediation, rejected, cancelled, refunded, charged_back. */
  status: string;
  statusDetail: string;
  /** external_reference: el ID del pedido en Airtable (rec…). */
  pedidoId: string | null;
  monto: number;
  /** Lo reembolsado de este pago (total o parcial). */
  reembolsado: number;
};

export interface LectorMercadoPago {
  /** El pago, por su ID (GET /v1/payments/{id}). */
  pago(id: string): Promise<PagoLeido>;
  /** Todos los pagos del pedido, cada uno leído por su ID. */
  pagosDelPedido(pedidoId: string): Promise<PagoLeido[]>;
}

/** Mercado Pago no contestó bien. Es transitorio salvo un 404: se reintenta. */
export class ErrorLecturaMP extends Error {
  constructor(
    readonly status: number,
    que: string
  ) {
    super(`Mercado Pago ${status} al leer ${que}`);
    this.name = "ErrorLecturaMP";
  }
}

/**
 * No se puede certificar el cobro del pedido (revisión del PR #69): la
 * búsqueda vino incompleta o atrasada, o un pago tiene un estado que no se
 * conoce. No se escribe nada y se reintenta; nunca se interpreta como «sin
 * cobro».
 */
export class CobroIncierto extends Error {
  constructor(motivo: string) {
    super(`No se puede certificar el cobro: ${motivo}. No se escribe nada; se reintenta`);
    this.name = "CobroIncierto";
  }
}

/** Más pagos que esto para un pedido es un error de datos: no se trunca, se para. */
export const MAXIMO_PAGOS_POR_PEDIDO = 200;

const numero = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** De la respuesta de Mercado Pago a `PagoLeido`. */
export function pagoDe(crudo: unknown): PagoLeido {
  const p = (crudo ?? {}) as Record<string, unknown>;
  if (p.id === undefined || p.id === null || typeof p.status !== "string") throw new ErrorLecturaMP(502, "un pago sin id o sin estado");
  const referencia = typeof p.external_reference === "string" ? p.external_reference.trim() : "";
  return {
    id: String(p.id),
    status: p.status,
    statusDetail: typeof p.status_detail === "string" ? p.status_detail : "",
    pedidoId: referencia || null,
    monto: numero(p.transaction_amount),
    reembolsado: numero(p.transaction_amount_refunded),
  };
}

/**
 * El lector sobre la API de Mercado Pago. `fetch` se pasa para las pruebas.
 * Solo hace GET.
 */
export function lectorMercadoPago(config: { token: string; api?: string; fetch?: typeof fetch }): LectorMercadoPago {
  const api = (config.api ?? "https://api.mercadopago.com").replace(/\/$/, "");
  const traer = config.fetch ?? fetch;
  async function leer(ruta: string, que: string): Promise<unknown> {
    let respuesta: Response;
    try {
      respuesta = await traer(`${api}${ruta}`, { headers: { Authorization: `Bearer ${config.token}` }, cache: "no-store" });
    } catch {
      throw new ErrorLecturaMP(0, que);
    }
    if (!respuesta.ok) throw new ErrorLecturaMP(respuesta.status, que);
    return respuesta.json();
  }
  const lector: LectorMercadoPago = {
    async pago(id) {
      return pagoDe(await leer(`/v1/payments/${encodeURIComponent(id)}`, `el pago ${id}`));
    },
    async pagosDelPedido(pedidoId) {
      // Todas las páginas, sin cortar en silencio: si la búsqueda dice que hay
      // más de los que trajo, o más de los razonables, no se certifica nada.
      const ids: string[] = [];
      for (let desde = 0; ; desde += 50) {
        const query = new URLSearchParams({ external_reference: pedidoId, sort: "date_created", criteria: "asc", limit: "50", offset: String(desde) });
        const r = (await leer(`/v1/payments/search?${query}`, `los pagos del pedido ${pedidoId}`)) as { results?: { id?: unknown }[]; paging?: { total?: unknown } };
        const total = r.paging?.total;
        if (typeof total !== "number" || !Number.isInteger(total) || total < 0) throw new CobroIncierto(`la búsqueda de los pagos de ${pedidoId} no dice cuántos hay`);
        if (total > MAXIMO_PAGOS_POR_PEDIDO) throw new CobroIncierto(`el pedido ${pedidoId} tiene ${total} pagos en Mercado Pago`);
        const pagina = (r.results ?? []).map((p) => String(p.id ?? "")).filter(Boolean);
        ids.push(...pagina);
        if (ids.length >= total) break;
        if (pagina.length === 0) throw new CobroIncierto(`la búsqueda trajo ${ids.length} de ${total} pagos de ${pedidoId}`);
      }
      // Cada uno por su ID: la búsqueda puede traer un estado viejo.
      const pagos = await Promise.all([...new Set(ids)].map((id) => lector.pago(id)));
      return pagos.filter((p) => p.pedidoId === pedidoId);
    },
  };
  return lector;
}

/** El lector de producción (misma API que lib/mercadopago.ts), o null sin MP_ACCESS_TOKEN. */
export function lectorMercadoPagoDesdeEntorno(): LectorMercadoPago | null {
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) return null;
  const api = (!process.env.VERCEL && process.env.MP_API_URL?.replace(/\/$/, "")) || "https://api.mercadopago.com";
  return lectorMercadoPago({ token, api });
}

// ---------- El cobro del pedido, con todos sus pagos ----------

/** Diferencia máxima tolerada entre lo cobrado y el total (como el webhook, lib/webhook-proceso.ts). */
export const TOLERANCIA_COBRO = 1;

export type EstadoDeCobro =
  /** Lo vigente cubre el total del pedido. */
  | "cobrado"
  /** Hubo cobro y ya no queda nada vigente: reembolsado, contracargo perdido. */
  | "sin-cobro"
  /** Queda vigente menos que el total: un reembolso parcial. */
  | "parcial"
  /** Todavía no hay nada aprobado, pero hay un pago en curso. */
  | "pendiente"
  /** Nunca se cobró: solo pagos rechazados o cancelados, o ninguno. */
  | "sin-pago"
  /** Un pago tiene un estado que no se conoce: no se decide nada (revisión del PR #69). */
  | "indeterminado";

export type CobroDelPedido = {
  estado: EstadoDeCobro;
  /** Los estados de Mercado Pago que no se conocen (con «indeterminado»). */
  desconocidos: string[];
  /** Lo vigente: lo aprobado menos lo reembolsado. */
  neto: number;
  /** Pagos vigentes de más (el cliente pagó dos veces): hay que devolver uno. */
  repetidos: number;
  /** Un reclamo (in_mediation) o un contracargo en curso: el crédito no se libera. */
  incidenciaAbierta: boolean;
  /**
   * Si el pedido queda cubierto aun sin los pagos en disputa (Tarea 12): con
   * otro pago válido que alcanza, perder la disputa no lo deja sin cobro.
   */
  cubiertoSinDisputa: boolean;
  /** Se perdió un contracargo. */
  contracargoPerdido: boolean;
  /** Los pagos con plata vigente. */
  vigentes: string[];
};

type Vigencia = { neto: number; incidencia: boolean; huboCobro: boolean; pendiente: boolean; perdido: boolean };

/**
 * Cuánto sigue vigente de un pago, y si tiene una incidencia abierta. Solo
 * los estados de la API de pagos de Mercado Pago; cualquier otro devuelve
 * null («indeterminado»): nunca se lo toma como un pago sin plata.
 */
function vigenteDe(p: PagoLeido): Vigencia | null {
  const neto = Math.max(0, p.monto - p.reembolsado);
  switch (p.status) {
    case "approved":
      return { neto, incidencia: false, huboCobro: true, pendiente: false, perdido: false };
    // Un reclamo abierto: la plata está retenida, puede volver o no.
    case "in_mediation":
      return { neto, incidencia: true, huboCobro: true, pendiente: false, perdido: false };
    case "charged_back":
      // reimbursed: Harper ganó el contracargo. settled: lo perdió. in_process
      // o cualquier otro detalle: en curso, con la plata contada como vigente
      // (nunca se anula por un detalle que no se conoce).
      if (p.statusDetail === "reimbursed") return { neto, incidencia: false, huboCobro: true, pendiente: false, perdido: false };
      if (p.statusDetail === "settled") return { neto: 0, incidencia: false, huboCobro: true, pendiente: false, perdido: true };
      return { neto, incidencia: true, huboCobro: true, pendiente: false, perdido: false };
    case "refunded":
      return { neto: 0, incidencia: false, huboCobro: true, pendiente: false, perdido: false };
    case "pending":
    case "in_process":
    case "authorized":
      return { neto: 0, incidencia: false, huboCobro: false, pendiente: true, perdido: false };
    case "rejected":
    case "cancelled":
      return { neto: 0, incidencia: false, huboCobro: false, pendiente: false, perdido: false };
    default:
      return null;
  }
}

/**
 * El estado de cobro del pedido con todos sus pagos. Con dos pagos aprobados
 * (pago repetido), reembolsar uno lo deja cobrado; reembolsar los dos, sin
 * cobro. Un pedido de $ 0 (pagado entero con saldo) cuenta como cobrado.
 */
export function cobroDelPedido(pagos: readonly PagoLeido[], total: number): CobroDelPedido {
  if (!Number.isFinite(total) || total < 0) throw new RangeError("El total del pedido tiene que ser un número de 0 o más");
  const desconocidos = pagos.filter((p) => vigenteDe(p) === null).map((p) => `${p.id}: ${p.status}`);
  if (desconocidos.length > 0) {
    return { estado: "indeterminado", desconocidos, neto: 0, repetidos: 0, incidenciaAbierta: false, cubiertoSinDisputa: false, contracargoPerdido: false, vigentes: [] };
  }
  const leidos = pagos.map((p) => ({ p, v: vigenteDe(p) as Vigencia }));
  const conPlata = leidos.filter((x) => x.v.neto > 0);
  const neto = conPlata.reduce((t, x) => t + x.v.neto, 0);
  const incidenciaAbierta = leidos.some((x) => x.v.incidencia);
  const netoSinDisputa = conPlata.filter((x) => !x.v.incidencia).reduce((t, x) => t + x.v.neto, 0);
  const cubiertoSinDisputa = netoSinDisputa >= total - TOLERANCIA_COBRO && (total === 0 || netoSinDisputa > 0);
  const contracargoPerdido = leidos.some((x) => x.v.perdido);
  const huboCobro = leidos.some((x) => x.v.huboCobro);
  // Repetidos: cuántos pagos vigentes sobran para cubrir el total.
  let cubierto = 0;
  let necesarios = 0;
  for (const x of [...conPlata].sort((a, b) => b.v.neto - a.v.neto)) {
    if (cubierto >= total - TOLERANCIA_COBRO) break;
    cubierto += x.v.neto;
    necesarios++;
  }
  const estado: EstadoDeCobro =
    neto >= total - TOLERANCIA_COBRO && (total === 0 || neto > 0)
      ? "cobrado"
      : neto > 0
        ? "parcial"
        : huboCobro
          ? "sin-cobro"
          : leidos.some((x) => x.v.pendiente)
            ? "pendiente"
            : "sin-pago";
  return {
    estado,
    desconocidos: [],
    neto,
    repetidos: estado === "cobrado" ? Math.max(0, conPlata.length - Math.max(1, necesarios)) : 0,
    incidenciaAbierta,
    cubiertoSinDisputa,
    contracargoPerdido,
    vigentes: conPlata.map((x) => x.p.id),
  };
}

/**
 * El cobro del pedido, certificado (revisión del PR #69):
 *  - los pagos son los de la búsqueda MÁS los `conocidos` (el del aviso, el
 *    registrado en Pedidos, los marcados para revisar), cada uno leído por
 *    su ID aunque la búsqueda todavía no lo traiga;
 *  - un estado de pago que no se conoce no se decide: `CobroIncierto`;
 *  - «sin cobro» solo con una búsqueda al día: si no trae alguno de los
 *    conocidos, puede faltar otro pago vigente, y tampoco se decide.
 */
export async function cobroCertificado(
  lector: LectorMercadoPago,
  pedidoId: string,
  conocidos: readonly (string | null | undefined)[],
  total: number,
  nombre = pedidoId
): Promise<CobroDelPedido> {
  const pagos = await lector.pagosDelPedido(pedidoId);
  const buscados = new Set(pagos.map((p) => p.id));
  const ids = [...new Set(conocidos.map((id) => id?.trim()).filter((id): id is string => Boolean(id)))];
  for (const id of ids) {
    if (buscados.has(id)) continue;
    const pago = await lector.pago(id);
    if (pago.pedidoId === pedidoId) pagos.push(pago);
  }
  const cobro = cobroDelPedido(pagos, total);
  if (cobro.estado === "indeterminado") throw new CobroIncierto(`estado de Mercado Pago que no se conoce (${cobro.desconocidos.join(", ")})`);
  if (cobro.estado === "sin-cobro" && ids.some((id) => !buscados.has(id))) {
    throw new CobroIncierto(`la búsqueda de Mercado Pago todavía no trae todos los pagos del pedido ${nombre}`);
  }
  return cobro;
}
