import { ErrorAirtable, getRecord, TABLAS, type AirtableRecord } from "./airtable";
import type { RenglonCobrado } from "./credito-harper";
import { ESTADOS_CONFIRMADOS } from "./webhook-decision";
import {
  anularPorPedido,
  marcarIncidencia,
  registrarCredito,
  type DependenciasCredito,
  type PedidoAcreditable,
  type ResultadoCambio,
  type ResultadoRegistro,
} from "./credito-persistencia";

/**
 * Crédito Harper y los pagos (Tarea 11): leer el estado VERDADERO del pago en
 * Mercado Pago y del pedido en Harper, y decidir qué le pasa al crédito.
 *
 * SIN CONECTAR: el webhook de Mercado Pago no lo llama. Solo lee: a Mercado
 * Pago le hace GET (nunca crea, cambia ni reembolsa nada) y en Airtable lee
 * Pedidos y Clientes. Las escrituras son las de lib/credito-persistencia.ts,
 * en la tabla «Créditos», que con HARPER_CREDITO_ACTIVO apagado no escribe
 * fuera de las pruebas (lib/credito-airtable.ts).
 *
 * Reglas (docs/plan-programa-harper.md §17.9):
 *  - del aviso solo se usa el ID del pago. El pago se vuelve a pedir a
 *    Mercado Pago, y también TODOS los pagos del pedido, cada uno por su ID
 *    (la búsqueda de Mercado Pago puede venir atrasada);
 *  - el pedido manda: el número, lo cobrado en cada renglón (Items), el total,
 *    el mail del cliente y el régimen (reglas de hoy o Crédito Harper);
 *  - cada escritura vuelve a leer todo eso ADENTRO del cerrojo del pedido: si
 *    cambió entre que llegó el aviso y que se tomó la llave, vale lo nuevo;
 *  - un pedido se considera cobrado por lo que suman sus pagos vigentes, no
 *    por un pago: reembolsar un pago repetido no anula el crédito.
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
  /** Un reclamo o un contracargo en curso: el crédito no se libera. */
  incidenciaAbierta: boolean;
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
    return { estado: "indeterminado", desconocidos, neto: 0, repetidos: 0, incidenciaAbierta: false, contracargoPerdido: false, vigentes: [] };
  }
  const leidos = pagos.map((p) => ({ p, v: vigenteDe(p) as Vigencia }));
  const conPlata = leidos.filter((x) => x.v.neto > 0);
  const neto = conPlata.reduce((t, x) => t + x.v.neto, 0);
  const incidenciaAbierta = leidos.some((x) => x.v.incidencia);
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
    contracargoPerdido,
    vigentes: conPlata.map((x) => x.p.id),
  };
}

// ---------- El pedido en Harper ----------

/** Lo que el checkout anota en Notas cuando el pedido va con el Crédito Harper (propuesta, §17.9). */
export const MARCA_REGIMEN_NUEVO = "Crédito Harper: reglas nuevas (credito-harper-v1)";
/** La línea del cashback de hoy (lib/suscriptores.ts, notasDeBeneficios). */
const LINEA_CASHBACK = "Cashback a acreditar:";

export type Regimen = {
  regimen: "nuevo" | "anterior";
  /** Por qué: el cashback de hoy, la marca del checkout, ninguna (pedido de antes), o las dos (conflicto: gana lo de hoy). */
  motivo: "cashback-anterior" | "marca-nueva" | "sin-marca" | "conflicto";
};

/**
 * El régimen del pedido, de sus Notas:
 *  - con «Cashback a acreditar»: las reglas de hoy (aunque tenga la marca);
 *  - con la marca del Crédito Harper y sin cashback: el crédito nuevo;
 *  - sin nada: las reglas de hoy (un pedido de antes del cambio, §11).
 */
export function regimenDelPedido(notas: unknown): Regimen {
  const lineas = typeof notas === "string" ? notas.split("\n").map((l) => l.trim()) : [];
  const cashback = lineas.some((l) => l.startsWith(LINEA_CASHBACK));
  const marca = lineas.includes(MARCA_REGIMEN_NUEVO);
  if (cashback && marca) return { regimen: "anterior", motivo: "conflicto" };
  if (cashback) return { regimen: "anterior", motivo: "cashback-anterior" };
  if (marca) return { regimen: "nuevo", motivo: "marca-nueva" };
  return { regimen: "anterior", motivo: "sin-marca" };
}

/** Los campos de Pedidos que se leen (todos existen hoy). */
export type FilaPedidoCredito = {
  Numero?: string;
  Estado?: string;
  Cliente?: string[];
  Items?: string;
  Total?: number;
  Notas?: string;
  /** El pago que el webhook de hoy registró para el pedido. */
  MP_payment_id?: string;
};

export type PedidoHarper = {
  id: string;
  numero: string;
  /** El Estado de Pedidos: el crédito nace solo con un pedido confirmado (pagado, preparando, enviado, entregado). */
  estado: string;
  total: number;
  renglones: RenglonCobrado[];
  email: string | null;
  regimen: Regimen;
  /** MP_payment_id: siempre se suma a la comprobación de los pagos (revisión del PR #69). */
  pagoRegistrado: string | null;
};

/** Si el Estado del pedido es uno confirmado por el flujo de pagos de hoy (lib/webhook-decision.ts). */
export function pedidoConfirmado(pedido: Pick<PedidoHarper, "estado">): boolean {
  return ESTADOS_CONFIRMADOS.has(pedido.estado);
}

/** Los renglones cobrados, del JSON de Items (lib/pedidos.ts, itemsDelPedido). */
export function renglonesDeItems(items: unknown): RenglonCobrado[] {
  let lista: unknown;
  try {
    lista = JSON.parse(typeof items === "string" ? items : "");
  } catch {
    throw new RangeError("El pedido tiene los Items ilegibles: no se puede calcular el crédito");
  }
  if (!Array.isArray(lista)) throw new RangeError("Los Items del pedido no son una lista");
  return lista.map((i, n) => {
    const r = (i ?? {}) as Record<string, unknown>;
    if (typeof r.categoria !== "string" || typeof r.cantidad !== "number" || typeof r.subtotal !== "number") {
      throw new RangeError(`El renglón ${n + 1} de los Items no tiene categoría, cantidad o subtotal`);
    }
    return {
      categoria: r.categoria as RenglonCobrado["categoria"],
      cantidad: r.cantidad,
      subtotal: r.subtotal,
      ...(typeof r.saldo === "number" ? { saldo: r.saldo } : {}),
    };
  });
}

/** El pedido, de su fila de Airtable y el mail del cliente. */
export function pedidoDesdeFila(r: AirtableRecord<FilaPedidoCredito>, email: string | null): PedidoHarper {
  const numeroPedido = (r.fields.Numero ?? "").trim();
  if (!numeroPedido) throw new RangeError(`El pedido ${r.id} no tiene número`);
  const total = r.fields.Total;
  if (typeof total !== "number" || !Number.isFinite(total) || total < 0) throw new RangeError(`El pedido ${numeroPedido} no tiene un total válido`);
  return {
    id: r.id,
    numero: numeroPedido,
    estado: (r.fields.Estado ?? "").trim(),
    total,
    renglones: renglonesDeItems(r.fields.Items),
    email: email?.trim().toLowerCase() || null,
    regimen: regimenDelPedido(r.fields.Notas),
    pagoRegistrado: r.fields.MP_payment_id?.trim() || null,
  };
}

export interface LectorPedidos {
  /** El pedido por su ID de Airtable; null si no existe. */
  leer(pedidoId: string): Promise<PedidoHarper | null>;
}

/** Lee Pedidos y Clientes en Airtable, sin cache. No escribe nada. */
export const lectorPedidosAirtable: LectorPedidos = {
  async leer(pedidoId) {
    let fila: AirtableRecord<FilaPedidoCredito>;
    try {
      fila = await getRecord<FilaPedidoCredito>(TABLAS.pedidos, pedidoId);
    } catch (error) {
      if (error instanceof ErrorAirtable && error.status === 404) return null;
      throw error;
    }
    const clienteId = fila.fields.Cliente?.[0];
    const cliente = clienteId ? await getRecord<{ Email?: string }>(TABLAS.clientes, clienteId) : null;
    return pedidoDesdeFila(fila, cliente?.fields.Email ?? null);
  },
};

// ---------- El aviso de un pago: qué le pasa al crédito ----------

export type DependenciasPagoCredito = {
  credito: DependenciasCredito;
  mp: LectorMercadoPago;
  pedidos: LectorPedidos;
};

export type ResultadoPagoCredito =
  | {
      accion: "nada";
      motivo: "pago-sin-pedido" | "pedido-inexistente" | "regimen-anterior" | "pedido-no-confirmado" | "sin-pago" | "pendiente" | "parcial-sin-credito";
      numero?: string;
      regimen?: Regimen;
      /** Con «pedido-no-confirmado»: el Estado del pedido en Harper. */
      estadoPedido?: string;
    }
  | { accion: "registrar"; numero: string; cobro: CobroDelPedido; resultado: ResultadoRegistro; incidencia: ResultadoCambio | null }
  | { accion: "anular"; numero: string; cobro: CobroDelPedido; resultado: ResultadoCambio }
  | { accion: "incidencia"; numero: string; cobro: CobroDelPedido; resultado: ResultadoCambio };

/**
 * El estado del pedido y su cobro, leído de las dos fuentes (revisión del
 * PR #69):
 *  - los pagos son los de la búsqueda MÁS el del aviso y el que el webhook
 *    registró en Pedidos (MP_payment_id), cada uno leído por su ID aunque la
 *    búsqueda todavía no lo traiga;
 *  - un estado de pago que no se conoce no se decide: `CobroIncierto`;
 *  - «sin cobro» solo con una búsqueda al día: si no trae el pago del aviso
 *    o el registrado, puede faltar otro pago vigente, y tampoco se decide.
 * `CobroIncierto` no escribe nada: se reintenta.
 */
async function leerTodo(pedidoId: string, pagoId: string, deps: DependenciasPagoCredito): Promise<{ pedido: PedidoHarper; cobro: CobroDelPedido } | null> {
  const pedido = await deps.pedidos.leer(pedidoId);
  if (!pedido) return null;
  const pagos = await deps.mp.pagosDelPedido(pedidoId);
  const buscados = new Set(pagos.map((p) => p.id));
  const conocidos = [...new Set([pagoId, pedido.pagoRegistrado].filter((id): id is string => Boolean(id)))];
  for (const id of conocidos) {
    if (buscados.has(id)) continue;
    const pago = await deps.mp.pago(id);
    if (pago.pedidoId === pedidoId) pagos.push(pago);
  }
  const cobro = cobroDelPedido(pagos, pedido.total);
  if (cobro.estado === "indeterminado") throw new CobroIncierto(`estado de Mercado Pago que no se conoce (${cobro.desconocidos.join(", ")})`);
  if (cobro.estado === "sin-cobro" && conocidos.some((id) => !buscados.has(id))) {
    throw new CobroIncierto(`la búsqueda de Mercado Pago todavía no trae todos los pagos del pedido ${pedido.numero}`);
  }
  return { pedido, cobro };
}

/** Lo mismo, adentro del cerrojo: si el pedido desapareció o cambió de número, no se escribe. */
async function releer(pedidoId: string, pagoId: string, numeroPedido: string, deps: DependenciasPagoCredito) {
  const todo = await leerTodo(pedidoId, pagoId, deps);
  if (!todo) throw new RangeError(`El pedido ${pedidoId} ya no está: no se escribe nada`);
  if (todo.pedido.numero !== numeroPedido) throw new RangeError(`El pedido ${pedidoId} cambió de número: no se escribe nada`);
  return todo;
}

/**
 * Lo que le pasa al crédito con el aviso de un pago (cualquier estado: aprobado,
 * reembolsado, contracargo…). Del aviso solo se usa el ID; todo lo demás se
 * lee de Mercado Pago y de Harper, y se vuelve a leer adentro del cerrojo
 * antes de escribir.
 *
 * Errores de lectura (Mercado Pago, Airtable) o del cerrojo suben: quien llama
 * reintenta. Un resultado con `{ estado: "ocupado" }` también se reintenta
 * (`hayQueReintentar`).
 */
export async function procesarPagoParaCredito(pagoId: string, deps: DependenciasPagoCredito): Promise<ResultadoPagoCredito> {
  const pago = await deps.mp.pago(pagoId);
  if (!pago.pedidoId) return { accion: "nada", motivo: "pago-sin-pedido" };
  const pedidoId = pago.pedidoId;

  const primero = await leerTodo(pedidoId, pago.id, deps);
  if (!primero) return { accion: "nada", motivo: "pedido-inexistente" };
  const { pedido, cobro } = primero;
  const n = pedido.numero;
  if (pedido.regimen.regimen === "anterior") return { accion: "nada", motivo: "regimen-anterior", numero: n, regimen: pedido.regimen };

  if (cobro.estado === "cobrado") {
    // El pago solo no alcanza: el pedido tiene que estar confirmado por el
    // flujo de hoy. Uno cancelado, rechazado o sin confirmar no genera crédito.
    if (!pedidoConfirmado(pedido)) return { accion: "nada", motivo: "pedido-no-confirmado", numero: n, estadoPedido: pedido.estado };
    const resultado = await registrarCredito(
      {
        numero: n,
        leer: async (): Promise<PedidoAcreditable> => {
          const ahora = await releer(pedidoId, pago.id, n, deps);
          return {
            numero: ahora.pedido.numero,
            renglones: ahora.pedido.renglones,
            // Releído adentro del cerrojo: si lo cancelaron en el medio, no hay crédito.
            pagado: ahora.cobro.estado === "cobrado" && pedidoConfirmado(ahora.pedido),
            regimen: ahora.pedido.regimen.regimen,
            email: ahora.pedido.email ?? "",
            incidenciaAbierta: ahora.cobro.incidenciaAbierta,
            fechaEntrega: null,
          };
        },
      },
      deps.credito
    );
    // Ya estaba: se pone al día la incidencia (contracargo abierto o ganado), leyendo el estado de hoy.
    let incidencia: ResultadoCambio | null = null;
    if (resultado.estado === "ya" && resultado.fila && resultado.fila.estado !== "Anulado" && resultado.fila.incidenciaAbierta !== cobro.incidenciaAbierta) {
      incidencia = await marcarIncidencia(
        n,
        async () => (await releer(pedidoId, pago.id, n, deps)).cobro.incidenciaAbierta,
        cobro.incidenciaAbierta ? "reclamo o contracargo en Mercado Pago" : "reclamo o contracargo resuelto a favor de Harper",
        deps.credito
      );
    }
    return { accion: "registrar", numero: n, cobro, resultado, incidencia };
  }

  if (cobro.estado === "sin-cobro") {
    const resultado = await anularPorPedido(n, cobro.contracargoPerdido ? "contracargo-perdido" : "reembolso", deps.credito, {
      quedoSinCobro: async () => (await releer(pedidoId, pago.id, n, deps)).cobro.estado === "sin-cobro",
    });
    return { accion: "anular", numero: n, cobro, resultado };
  }

  if (cobro.estado === "parcial") {
    // Un reembolso parcial: alguien devolvió algo. El crédito no se libera
    // hasta que Harper registre la devolución (lib/credito-persistencia.ts).
    const resultado = await marcarIncidencia(
      n,
      async () => {
        const ahora = (await releer(pedidoId, pago.id, n, deps)).cobro;
        return ahora.estado === "parcial" || ahora.incidenciaAbierta;
      },
      "reembolso parcial en Mercado Pago: registrar la devolución",
      deps.credito
    );
    if (resultado.estado === "sin-credito") return { accion: "nada", motivo: "parcial-sin-credito", numero: n };
    return { accion: "incidencia", numero: n, cobro, resultado };
  }

  // leerTodo ya tiró con «indeterminado»; esto queda por si alguien lo cambia.
  if (cobro.estado === "indeterminado") throw new CobroIncierto("estado de Mercado Pago que no se conoce");
  return { accion: "nada", motivo: cobro.estado, numero: n };
}

/** Si quien llama tiene que reintentar el aviso (otra instancia tenía el cerrojo). */
export function hayQueReintentar(r: ResultadoPagoCredito): boolean {
  if (r.accion === "nada") return false;
  return r.resultado.estado === "ocupado" || (r.accion === "registrar" && r.incidencia?.estado === "ocupado");
}

/** Las dependencias de verdad, para cuando se conecte (todavía no se usa). */
export function dependenciasPagoCredito(credito: DependenciasCredito): DependenciasPagoCredito | null {
  const mp = lectorMercadoPagoDesdeEntorno();
  return mp ? { credito, mp, pedidos: lectorPedidosAirtable } : null;
}
