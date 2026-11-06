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

import {
  cobroCertificado,
  CobroIncierto,
  lectorMercadoPagoDesdeEntorno,
  type CobroDelPedido,
  type LectorMercadoPago,
} from "./mp-cobro";

// La lectura de Mercado Pago vive en lib/mp-cobro.ts (también la usa el webhook de hoy).
export {
  cobroCertificado,
  cobroDelPedido,
  CobroIncierto,
  ErrorLecturaMP,
  lectorMercadoPago,
  lectorMercadoPagoDesdeEntorno,
  MAXIMO_PAGOS_POR_PEDIDO,
  pagoDe,
  TOLERANCIA_COBRO,
  type CobroDelPedido,
  type EstadoDeCobro,
  type LectorMercadoPago,
  type PagoLeido,
} from "./mp-cobro";

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
  const cobro = await cobroCertificado(deps.mp, pedidoId, [pagoId, pedido.pagoRegistrado], pedido.total, pedido.numero);
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
