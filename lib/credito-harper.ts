import { esCategoriaDeAnteojos, type Categoria } from "./categorias";
import { fechaArgentina, sumarDias } from "./suscriptores";

/**
 * Crédito Harper (Tarea 08, docs/plan-programa-harper.md §A.1 y §10): el
 * motor del cálculo, sin nada de servidor. Todavía NO lo usa ninguna parte de
 * la tienda: no acredita, no escribe en Airtable y no cambia ningún cobro.
 *
 * Las reglas aprobadas (Ale, 05/11/2026):
 *  - 5 % con un anteojo; 10 % con dos o más. Cuentan los anteojos completos
 *    (Anteojos, de sol, Clip-On y de receta), en unidades, en todo el pedido.
 *  - Sobre lo efectivamente pagado en anteojos: después de los descuentos (el
 *    Dúo, los tramos, el cupón, el 10 % por dinero en Mercado Pago) y sin el
 *    crédito usado. Nunca sobre estuches, paños ni envío.
 *  - Sin tope. En pesos enteros, redondeado como el modelo financiero
 *    (lib/contribucion.ts): $ 157.325 → $ 15.733.
 *  - Nace pendiente al acreditarse el pago. Pasa a disponible 30 días después
 *    de una entrega con fecha confiable, sin devoluciones ni incidencias
 *    abiertas. Sin fecha de entrega, sigue pendiente.
 *  - Se respeta lo anterior: un pedido con las reglas de hoy (cashback del
 *    10 % de suscriptores) no genera crédito nuevo, y un pedido que ya tiene
 *    un cashback o un Crédito Harper anotado (aunque esté anulado) no genera
 *    otro. Ese chequeo es sobre lo que se le pasa: la exclusión entre
 *    webhooks simultáneos la tiene que dar la persistencia (Tarea 09).
 *
 * Todo es puro: recibe los datos y devuelve qué correspondería. Si un dato no
 * tiene sentido (un monto negativo, una cantidad no entera), tira RangeError:
 * con plata, mejor frenar que adivinar.
 */

/** El crédito con un solo anteojo, en %. */
export const PORCENTAJE_CREDITO_UN_ANTEOJO = 5;
/** El crédito con dos o más anteojos, en %. */
export const PORCENTAJE_CREDITO_VARIOS = 10;
/** Días desde la entrega confirmada hasta que el crédito se puede usar. */
export const DIAS_PARA_LIBERAR_CREDITO = 30;

/**
 * El interruptor, APAGADO por defecto: solo «1» lo prende. Hoy no lo lee
 * ninguna parte de la tienda; queda listo para cuando se integre.
 */
export const VARIABLE_CREDITO = "HARPER_CREDITO_ACTIVO";

export function creditoActivo(entorno: Record<string, string | undefined> = process.env): boolean {
  return entorno[VARIABLE_CREDITO]?.trim() === "1";
}

/** 0 sin anteojos, 5 con uno, 10 con dos o más. */
export function porcentajeDeCredito(anteojos: number): 0 | 5 | 10 {
  if (!Number.isInteger(anteojos) || anteojos < 0) throw new RangeError("La cantidad de anteojos tiene que ser un entero de 0 o más");
  if (anteojos === 0) return 0;
  return anteojos === 1 ? PORCENTAJE_CREDITO_UN_ANTEOJO : PORCENTAJE_CREDITO_VARIOS;
}

/**
 * Un renglón tal como se cobró (el campo Items del pedido, ItemResuelto).
 * `subtotal` es lo que se paga en dinero por el renglón: ya tiene restados
 * los descuentos, el cupón, el 10 % por dinero en Mercado Pago y el saldo
 * usado (`saldo`, que no se vuelve a restar).
 */
export type RenglonCobrado = {
  categoria: Categoria;
  cantidad: number;
  subtotal: number;
  /** Pesos del renglón pagados con saldo o crédito. Solo informativo: ya no están en `subtotal`. */
  saldo?: number;
};

export type MotivoSinCredito =
  /** El pedido no tiene anteojos (solo estuches o paños). */
  | "sin-anteojos"
  /** Los anteojos se pagaron enteros con saldo o crédito: no hay nada pagado en dinero. */
  | "pagado-con-credito";

export type CalculoCredito = {
  /** Anteojos del pedido, en unidades. */
  anteojos: number;
  porcentaje: 0 | 5 | 10;
  /** Lo pagado en dinero en anteojos: la base del crédito. */
  base: number;
  /** El crédito, en pesos enteros. */
  monto: number;
  /** Por qué no hay crédito, si no hay. */
  motivo?: MotivoSinCredito;
};

function exigir(condicion: boolean, mensaje: string): asserts condicion {
  if (!condicion) throw new RangeError(mensaje);
}

/**
 * El crédito de los renglones cobrados de un pedido. No modifica lo que recibe.
 * Tira RangeError si un renglón no tiene sentido.
 */
export function calcularCredito(renglones: readonly RenglonCobrado[]): CalculoCredito {
  renglones.forEach((r, n) => {
    exigir(Number.isInteger(r.cantidad) && r.cantidad >= 0, `Renglón ${n + 1}: la cantidad tiene que ser un entero de 0 o más`);
    exigir(Number.isFinite(r.subtotal) && r.subtotal >= 0, `Renglón ${n + 1}: lo pagado tiene que ser un número de 0 o más`);
    exigir(r.saldo === undefined || (Number.isFinite(r.saldo) && r.saldo >= 0), `Renglón ${n + 1}: el saldo usado no puede ser negativo`);
  });

  const deAnteojos = renglones.filter((r) => esCategoriaDeAnteojos(r.categoria) && r.cantidad > 0);
  const anteojos = deAnteojos.reduce((total, r) => total + r.cantidad, 0);
  const porcentaje = porcentajeDeCredito(anteojos);
  const base = deAnteojos.reduce((total, r) => total + r.subtotal, 0);

  if (anteojos === 0) return { anteojos, porcentaje, base: 0, monto: 0, motivo: "sin-anteojos" };
  if (!(base > 0)) return { anteojos, porcentaje, base: 0, monto: 0, motivo: "pagado-con-credito" };
  return { anteojos, porcentaje, base, monto: Math.round((base * porcentaje) / 100) };
}

// ---------- El pedido: cuándo correspondería anotarlo, sin duplicar ----------

export type PedidoParaCredito = {
  /** "HARPER-…": el crédito de un pedido es uno solo. */
  numero: string;
  /** Los renglones como se cobraron (campo Items). */
  renglones: readonly RenglonCobrado[];
  /** Si el pago ya se acreditó. Sin pago acreditado no hay crédito. */
  pagado: boolean;
  /**
   * "anterior": el pedido sigue con las reglas de hoy (suscriptor dentro del
   * aviso, o pagado antes del cambio): tiene su cashback y no genera crédito
   * nuevo. "nuevo": rigen las reglas del Crédito Harper.
   */
  regimen: "nuevo" | "anterior";
};

export type MotivoSinAnotar =
  | MotivoSinCredito
  /** El pago no se acreditó. */
  | "no-pagado"
  /** Rigen las reglas de hoy para este pedido: queda su cashback, sin crédito nuevo. */
  | "regimen-anterior"
  /** El pedido ya tiene un crédito o un cashback anotado (aunque esté anulado): no se anota otro. */
  | "ya-registrado";

export type CreditoAAnotar =
  | {
      accion: "anotar";
      /** La clave única del crédito de este pedido, para no anotarlo dos veces. */
      clave: string;
      numero: string;
      estado: "pendiente";
      calculo: CalculoCredito;
    }
  | { accion: "nada"; numero: string; motivo: MotivoSinAnotar; calculo: CalculoCredito | null };

/**
 * Lo que ya está anotado para un pedido y cuenta como su crédito. Son dos
 * clases (revisión del PR #66):
 *  - "cashback-anterior": el cashback de hoy (tabla Saldos, tipo «Cashback»);
 *  - "credito-harper": el Crédito Harper nuevo (su tipo en Saldos se define
 *    en la Tarea 09, con autorización).
 * Anulado o no, bloquea igual.
 */
export type CreditoYaAnotado = {
  clase: "cashback-anterior" | "credito-harper";
  /** El número del pedido del movimiento. */
  pedido: string;
  /** La clave del crédito (credito-harper:<pedido>), si el movimiento la guarda. */
  clave?: string | null;
  anulado?: boolean;
};

/** La clave única del crédito de un pedido. */
export function claveDelCredito(numero: string): string {
  exigir(typeof numero === "string" && numero.trim().length > 0, "El pedido necesita un número");
  return `credito-harper:${numero.trim()}`;
}

/**
 * Qué correspondería anotar cuando se acredita el pago de un pedido. No
 * anota nada: devuelve el plan.
 *
 * `anotados` es lo que ya está anotado (CreditoYaAnotado): si hay un
 * cashback anterior o un Crédito Harper de este mismo pedido (por número o
 * por clave), aunque esté anulado, no se anota otro. Es un chequeo sobre esa
 * lista: no reemplaza la exclusión entre webhooks simultáneos, que tiene que
 * dar la persistencia (Tarea 09).
 */
export function creditoAlAcreditarse(pedido: PedidoParaCredito, anotados: readonly CreditoYaAnotado[]): CreditoAAnotar {
  const clave = claveDelCredito(pedido.numero);
  const numero = pedido.numero.trim();
  const esDeEstePedido = (m: CreditoYaAnotado) =>
    (m.clase === "cashback-anterior" || m.clase === "credito-harper") &&
    ((typeof m.pedido === "string" && m.pedido.trim() === numero) || (typeof m.clave === "string" && m.clave.trim() === clave));
  if (anotados.some(esDeEstePedido)) {
    return { accion: "nada", numero, motivo: "ya-registrado", calculo: null };
  }
  if (!pedido.pagado) return { accion: "nada", numero, motivo: "no-pagado", calculo: null };
  if (pedido.regimen === "anterior") return { accion: "nada", numero, motivo: "regimen-anterior", calculo: null };

  const calculo = calcularCredito(pedido.renglones);
  if (calculo.motivo) return { accion: "nada", numero, motivo: calculo.motivo, calculo };
  return { accion: "anotar", clave, numero, estado: "pendiente", calculo };
}

// ---------- Pendiente o disponible ----------

export type EstadoDelCredito = {
  estado: "pendiente" | "disponible" | "anulado";
  /** Desde qué día (en Buenos Aires) se puede usar; null sin fecha de entrega. */
  disponibleDesde: string | null;
};

/**
 * Si el crédito ya se puede usar: hay una fecha de entrega confiable
 * ("2026-11-10"), pasaron 30 días desde esa fecha y no hay ninguna
 * devolución ni incidencia abierta (cambio, reclamo, contracargo).
 */
/**
 * Si «AAAA-MM-DD» es una fecha que existe: rechaza el 31 de febrero, el
 * 29 de febrero de un año no bisiesto, el mes 13 o el día 0 (revisión del
 * PR #66: `sumarDias` las corría a otro día sin avisar).
 */
export function esFechaValida(fecha: unknown): fecha is string {
  if (typeof fecha !== "string") return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha);
  if (!m) return false;
  const [anio, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const real = new Date(Date.UTC(anio, mes - 1, dia));
  return real.getUTCFullYear() === anio && real.getUTCMonth() === mes - 1 && real.getUTCDate() === dia;
}

export function estadoDelCredito(datos: {
  anulado: boolean;
  /** La fecha de entrega confirmada, "AAAA-MM-DD"; null si no hay una confiable. */
  fechaEntrega: string | null;
  incidenciaAbierta: boolean;
  hoy: Date | string;
}): EstadoDelCredito {
  if (datos.fechaEntrega !== null) exigir(esFechaValida(datos.fechaEntrega), "La fecha de entrega tiene que ser una fecha que exista, como AAAA-MM-DD");
  if (typeof datos.hoy === "string") exigir(esFechaValida(datos.hoy), "La fecha de hoy tiene que ser una fecha que exista, como AAAA-MM-DD");
  else exigir(Number.isFinite(datos.hoy.getTime()), "La fecha de hoy no es válida");
  const disponibleDesde = datos.fechaEntrega ? sumarDias(datos.fechaEntrega, DIAS_PARA_LIBERAR_CREDITO) : null;
  if (datos.anulado) return { estado: "anulado", disponibleDesde };
  const dia = typeof datos.hoy === "string" ? datos.hoy : fechaArgentina(datos.hoy);
  const liberado = disponibleDesde !== null && dia >= disponibleDesde && !datos.incidenciaAbierta;
  return { estado: liberado ? "disponible" : "pendiente", disponibleDesde };
}

// ---------- Devoluciones ----------

export type CreditoTrasDevolucion =
  /** Se devolvió todo (o no queda nada pagado en anteojos): el crédito se anula. */
  | { accion: "anular"; monto: 0 }
  /** Queda parte: el crédito se recalcula con lo que quedó pagado (nunca sube). */
  | { accion: "recalcular"; monto: number; calculo: CalculoCredito }
  | { accion: "sin-cambio"; monto: number }
  /**
   * El crédito ya está disponible (o anulado): no se toca solo. Lo decide
   * Harper (§14, L5: qué pasa si ya se usó).
   */
  | { accion: "revisar"; monto: number };

/**
 * El crédito de un pedido después de una devolución, mientras está pendiente
 * (§10.2): con todo devuelto se anula; si queda un anteojo, el 5 % de lo que
 * quedó pagado; si quedan dos o más, el 10 %. `quedan` son los renglones que
 * se quedó el comprador, con lo que quedó pagado en cada uno: eso depende de
 * la regla de reintegro, que todavía no está definida (§13.2, §14 L1).
 */
export function creditoTrasDevolucion(
  original: { monto: number; estado: EstadoDelCredito["estado"] },
  quedan: readonly RenglonCobrado[]
): CreditoTrasDevolucion {
  exigir(Number.isInteger(original.monto) && original.monto >= 0, "El crédito original tiene que ser un entero de 0 o más");
  if (original.estado !== "pendiente") return { accion: "revisar", monto: original.monto };
  const calculo = calcularCredito(quedan);
  if (calculo.monto === 0) return { accion: "anular", monto: 0 };
  // Una devolución nunca hace subir el crédito.
  const monto = Math.min(calculo.monto, original.monto);
  if (monto === original.monto) return { accion: "sin-cambio", monto };
  return { accion: "recalcular", monto, calculo: { ...calculo, monto } };
}
