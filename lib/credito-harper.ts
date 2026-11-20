import { esCategoriaDeAnteojos, type Categoria } from "./categorias";
import { fechaArgentina, sumarDias } from "./suscriptores";
import type { ItemResuelto } from "./tipos";

/**
 * Crédito Harper (Tarea 08, docs/plan-programa-harper.md §A.1 y §10): el
 * motor del cálculo, sin nada de servidor. Acá no se acredita, no se escribe
 * en Airtable ni se cambia ningún cobro: lo usan la persistencia, el webhook,
 * el checkout y la cuenta, todos detrás de HARPER_CREDITO_ACTIVO.
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
 * El vencimiento (Ale, 18/11/2026): el crédito vence a los 6 meses de quedar
 * disponible. Son meses de calendario desde Disponible_desde (el día, en
 * Buenos Aires, en que de verdad quedó disponible: si se liberó tarde, ese
 * día); se puede usar hasta el día del vencimiento inclusive y, si ese día no
 * existe en el mes, vence el último día del mes (31/10 → 30/04). Al usarlo se
 * descuenta primero el que vence antes (lib/credito-uso.ts). Una fila
 * «Disponible» sin Disponible_desde (solo por una edición a mano) no vence, y
 * el control diario la avisa.
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
/** Meses de calendario desde que el crédito queda disponible hasta que vence (Ale, 18/11/2026). */
export const MESES_PARA_VENCER_CREDITO = 6;
/**
 * Cuántos días antes del vencimiento se le avisa al comprador por mail: con
 * 15 días o menos y algo sin usar (Ale, 18/11/2026). Vive acá, con los otros
 * números publicados, para que las pantallas y las condiciones digan el mismo
 * que usa el control diario (lib/credito-diario.ts).
 */
export const DIAS_AVISO_VENCIMIENTO = 15;

/** El interruptor, APAGADO por defecto: solo «1» lo prende. */
export const VARIABLE_CREDITO = "HARPER_CREDITO_ACTIVO";

/**
 * Si el Crédito Harper está prendido: solo con HARPER_CREDITO_ACTIVO="1". Sin
 * la variable, vacía o con cualquier otro valor ("0", "true"), está apagado y
 * nada que vea el comprador lo nombra.
 *
 * Sin `entorno` se lee `process.env.HARPER_CREDITO_ACTIVO`, escrito así,
 * entero, a propósito (como el Dúo, lib/duo.ts; Ale, 18/11/2026):
 * next.config.ts le pasa a Next el valor que tiene al armar el sitio (`env`)
 * y Next lo deja fijo en el código. Así el webhook, el checkout, el carrito,
 * la cuenta y la ruta diaria ven siempre el mismo valor, aunque la función de
 * Vercel no lea .env.production. Para cambiarlo hay que volver a desplegar.
 */
export function creditoActivo(entorno?: Record<string, string | undefined>): boolean {
  const valor = entorno ? entorno[VARIABLE_CREDITO] : process.env.HARPER_CREDITO_ACTIVO;
  return valor?.trim() === "1";
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

/**
 * El crédito que sumaría un pedido con estos ítems, en pesos (Ale,
 * 18/11/2026: el comprador lo ve ANTES de pagar). Es el mismo cálculo que
 * hace el webhook al anotarlo: `calcularCredito` sobre los renglones tal como
 * se van a cobrar, que son los que se guardan en Items (lib/pedidos.ts,
 * itemsDelPedido, y lib/credito-pagos.ts, renglonesDeItems). Así el monto que
 * se muestra es el que después se anota.
 *
 * Hay que pasarle los ítems finales, los que se cobran: con el Dúo, el cupón,
 * el crédito usado y, si se paga con dinero en Mercado Pago, con ese 10 %
 * (lib/dinero-mp.ts): con dinero en Mercado Pago suma menos. No mira el
 * interruptor: quien lo muestra pregunta antes `creditoActivo()`. Si un
 * renglón no tiene sentido devuelve 0: no se promete nada que no se va a anotar.
 */
export function creditoQueSuma(items: readonly Pick<ItemResuelto, "categoria" | "cantidad" | "subtotal" | "saldo">[]): number {
  const renglones: RenglonCobrado[] = items.map((i) => ({
    categoria: i.categoria,
    cantidad: i.cantidad,
    subtotal: i.subtotal,
    ...(typeof i.saldo === "number" ? { saldo: i.saldo } : {}),
  }));
  try {
    return calcularCredito(renglones).monto;
  } catch (error) {
    if (error instanceof RangeError) return 0;
    throw error;
  }
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
 *  - "credito-harper": el Crédito Harper nuevo, en su propia tabla «Créditos»
 *    (docs/plan-programa-harper.md §17, lib/credito-airtable.ts).
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

/** El día de `hoy` en Buenos Aires ("AAAA-MM-DD"). Tira RangeError con una fecha imposible o un Date inválido. */
function diaEnBuenosAires(hoy: Date | string): string {
  if (typeof hoy === "string") {
    exigir(esFechaValida(hoy), "La fecha de hoy tiene que ser una fecha que exista, como AAAA-MM-DD");
    return hoy;
  }
  exigir(Number.isFinite(hoy.getTime()), "La fecha de hoy no es válida");
  return fechaArgentina(hoy);
}

export function estadoDelCredito(datos: {
  anulado: boolean;
  /** La fecha de entrega confirmada, "AAAA-MM-DD"; null si no hay una confiable. */
  fechaEntrega: string | null;
  incidenciaAbierta: boolean;
  hoy: Date | string;
}): EstadoDelCredito {
  if (datos.fechaEntrega !== null) exigir(esFechaValida(datos.fechaEntrega), "La fecha de entrega tiene que ser una fecha que exista, como AAAA-MM-DD");
  const dia = diaEnBuenosAires(datos.hoy);
  const disponibleDesde = datos.fechaEntrega ? sumarDias(datos.fechaEntrega, DIAS_PARA_LIBERAR_CREDITO) : null;
  if (datos.anulado) return { estado: "anulado", disponibleDesde };
  const liberado = disponibleDesde !== null && dia >= disponibleDesde && !datos.incidenciaAbierta;
  return { estado: liberado ? "disponible" : "pendiente", disponibleDesde };
}

// ---------- El vencimiento (Ale, 18/11/2026) ----------

/**
 * "AAAA-MM-DD" más `meses` meses de calendario. Si el día no existe en el mes
 * de llegada, el último día de ese mes: 2026-10-31 + 6 → 2027-04-30;
 * 2026-08-31 + 6 → 2027-02-28; 2027-08-31 + 6 → 2028-02-29.
 */
export function sumarMeses(fecha: string, meses: number): string {
  exigir(esFechaValida(fecha), "La fecha tiene que ser una fecha que exista, como AAAA-MM-DD");
  exigir(Number.isInteger(meses), "Los meses tienen que ser un número entero");
  const [anio, mes, dia] = fecha.split("-").map(Number);
  const total = mes - 1 + meses;
  const anioFinal = anio + Math.floor(total / 12);
  const mesFinal = ((total % 12) + 12) % 12;
  // El día 0 del mes siguiente es el último de este.
  const ultimo = new Date(Date.UTC(anioFinal, mesFinal + 1, 0)).getUTCDate();
  const dos = (n: number) => String(n).padStart(2, "0");
  return `${String(anioFinal).padStart(4, "0")}-${dos(mesFinal + 1)}-${dos(Math.min(dia, ultimo))}`;
}

/**
 * El último día en que se puede usar un crédito ("AAAA-MM-DD", inclusive): 6
 * meses de calendario después del día en que quedó disponible.
 */
export function venceEl(disponibleDesde: string): string {
  return sumarMeses(disponibleDesde, MESES_PARA_VENCER_CREDITO);
}

/**
 * Si el crédito ya venció `hoy` (el día en Buenos Aires, como
 * `estadoDelCredito`): se puede usar hasta el día de `venceEl` inclusive y
 * vence al día siguiente. Sin Disponible_desde (null: una fila editada a
 * mano) no vence.
 */
export function estaVencido(disponibleDesde: string | null, hoy: Date | string): boolean {
  const dia = diaEnBuenosAires(hoy);
  if (disponibleDesde === null) return false;
  return dia > venceEl(disponibleDesde);
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
