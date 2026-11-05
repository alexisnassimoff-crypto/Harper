import { soltarSinFallar, type Cerrojo } from "./cerrojo";
import {
  claveDelCredito,
  creditoAlAcreditarse,
  creditoTrasDevolucion,
  esFechaValida,
  estadoDelCredito,
  type CalculoCredito,
  type CreditoYaAnotado,
  type MotivoSinAnotar,
  type PedidoParaCredito,
  type RenglonCobrado,
} from "./credito-harper";
import { saldoDe, type MovimientoSaldo } from "./suscriptores";

/**
 * Crédito Harper: la persistencia (Tarea 09), lista para conectar pero SIN
 * conectar. No la usa el webhook ni ninguna página, no escribe en Airtable y
 * no toca la tabla Saldos. Todo pasa por un almacén y un cerrojo que se le
 * pasan (en las pruebas, en memoria).
 *
 * Dónde se guardaría: una tabla nueva «Créditos», una fila por pedido (los
 * campos están propuestos en docs/plan-programa-harper.md §17, para aprobar).
 * No en Saldos: el código de hoy lee cualquier tipo desconocido como
 * «Ajuste» y cuenta como disponible todo lo que no tiene Disponible_desde,
 * así que un crédito pendiente se vería como saldo para gastar, y en
 * cualquier producto (el crédito nuevo es solo para anteojos, §10.3).
 *
 * Dos capas contra los duplicados, como el webhook de hoy (lib/cerrojo.ts):
 *  1. el cerrojo por pedido (Redis): dos notificaciones del mismo pedido nunca
 *     trabajan a la vez. Si Redis falla, falla cerrado: no se escribe nada y
 *     quien llama reintenta;
 *  2. una sola fila vigente por pedido (clave credito-harper:<pedido>): antes
 *     de crear se busca, aunque esté anulada; y cada operación, al leer, deja
 *     la más vieja y anula las demás si quedaron dos (sin Redis, o una caída
 *     en el medio). Airtable no tiene índices únicos: esto los reemplaza.
 *
 * Cada cambio de estado (entrega, liberación, devolución, cancelación,
 * contracargo) toma el mismo cerrojo del pedido.
 */

/** Cómo queda guardado. «A revisar»: no se puede usar hasta que Harper decida. */
export type EstadoGuardado = "Pendiente" | "Disponible" | "Anulado" | "A revisar";

/** Una fila de la tabla propuesta «Créditos». */
export type FilaCredito = {
  id: string;
  /** credito-harper:<pedido>: una sola vigente por pedido. */
  clave: string;
  pedido: string;
  /** La cuenta a la que va: el mail de la compra. */
  email: string;
  monto: number;
  porcentaje: 5 | 10;
  base: number;
  anteojos: number;
  estado: EstadoGuardado;
  /** ISO: cuándo se anotó (al acreditarse el pago). */
  generadoEl: string;
  /** "AAAA-MM-DD": la entrega confirmada; null mientras no haya una confiable. */
  fechaEntrega: string | null;
  /** "AAAA-MM-DD": 30 días después de la entrega. */
  disponibleDesde: string | null;
  /** Una devolución, un reclamo o un contracargo abierto. */
  incidenciaAbierta: boolean;
  /** La versión de las reglas con que se calculó. */
  reglas: string;
  /** El historial, una línea por cambio. */
  notas: string;
};

export const REGLAS_CREDITO = "credito-harper-v1";

/** Lo que la persistencia necesita del almacén (la tabla «Créditos» o una en memoria). */
export interface AlmacenCreditos {
  /** Todas las filas de ese pedido, anuladas incluidas. */
  delPedido(pedido: string): Promise<FilaCredito[]>;
  crear(fila: Omit<FilaCredito, "id">): Promise<FilaCredito>;
  actualizar(id: string, cambios: Partial<Omit<FilaCredito, "id" | "clave" | "pedido">>): Promise<FilaCredito>;
  /** Las filas en estado Pendiente. */
  pendientes(): Promise<FilaCredito[]>;
}

export type DependenciasCredito = {
  almacen: AlmacenCreditos;
  /** El cerrojo de Redis; null si no está configurado (queda solo la segunda capa). */
  cerrojo: Cerrojo | null;
  /** Si el pedido ya tiene el cashback de hoy en Saldos (anulado o no). Solo lectura. */
  cashbackAnterior(pedido: string): Promise<{ anulado: boolean } | null>;
  ahora(): Date;
  /** Para el cerrojo. */
  nonce(): string;
};

/** Cuánto vive la llave si la instancia muere sin soltarla: como la del pedido en el webhook. */
export const TTL_CREDITO_MS = 120_000;
/** Distinta de la del webhook (harper:pedido:…): el webhook la puede pedir teniendo la suya. */
export const claveCerrojoCredito = (pedido: string) => `harper:credito:${pedido.trim()}`;

/** Otra instancia está trabajando sobre el crédito de ese pedido: se reintenta después. */
export type Ocupado = { estado: "ocupado" };

/**
 * Corre `hacer` con el cerrojo del pedido. Sin cerrojo configurado, corre igual
 * (la segunda capa sigue protegiendo). Si Redis falla al tomarlo, el error sube
 * y no se escribe nada.
 */
async function conCerrojo<T>(pedido: string, deps: DependenciasCredito, hacer: () => Promise<T>): Promise<T | Ocupado> {
  if (!deps.cerrojo) return hacer();
  const clave = claveCerrojoCredito(pedido);
  const nonce = deps.nonce();
  if (!(await deps.cerrojo.tomar(clave, nonce, TTL_CREDITO_MS))) return { estado: "ocupado" };
  try {
    return await hacer();
  } finally {
    await soltarSinFallar(deps.cerrojo, clave, nonce);
  }
}

const linea = (deps: DependenciasCredito, texto: string) => `${deps.ahora().toISOString()} · ${texto}`;
const conNota = (fila: FilaCredito, deps: DependenciasCredito, texto: string) => [fila.notas.trim(), linea(deps, texto)].filter(Boolean).join("\n");

const masViejaPrimero = (a: FilaCredito, b: FilaCredito) => a.generadoEl.localeCompare(b.generadoEl) || a.id.localeCompare(b.id);

/** La fila que vale de un pedido: la más vieja que no está anulada. */
function vigente(filas: readonly FilaCredito[]): FilaCredito | null {
  return filas.filter((f) => f.estado !== "Anulado").sort(masViejaPrimero)[0] ?? null;
}

/** La vigente o, si todas están anuladas, la última anulada. */
function laDelPedido(filas: readonly FilaCredito[]): FilaCredito | null {
  return vigente(filas) ?? [...filas].sort(masViejaPrimero).at(-1) ?? null;
}

/**
 * Lee las filas del pedido y, si quedaron dos vigentes, deja la más vieja y
 * anula las demás. Siempre adentro del cerrojo.
 */
async function leerDepurado(numero: string, deps: DependenciasCredito): Promise<{ filas: FilaCredito[]; anulados: number }> {
  const filas = await deps.almacen.delPedido(numero);
  const queda = vigente(filas);
  const sobran = filas.filter((f) => f.estado !== "Anulado" && f.id !== queda?.id);
  if (sobran.length === 0) return { filas, anulados: 0 };
  const anuladas = new Map<string, FilaCredito>();
  for (const f of sobran) {
    anuladas.set(f.id, await deps.almacen.actualizar(f.id, { estado: "Anulado", notas: conNota(f, deps, `Anulado: duplicado de ${queda?.id}.`) }));
  }
  return { filas: filas.map((f) => anuladas.get(f.id) ?? f), anulados: sobran.length };
}

// ---------- 1. Al acreditarse el pago: un solo crédito por pedido ----------

export type ResultadoRegistro =
  | { estado: "creado"; fila: FilaCredito; duplicadosAnulados: number }
  | { estado: "ya"; fila: FilaCredito | null; motivo: "ya-registrado" }
  | { estado: "nada"; motivo: Exclude<MotivoSinAnotar, "ya-registrado">; calculo: CalculoCredito | null }
  | Ocupado;

/**
 * Anota el crédito pendiente de un pedido pagado, una sola vez. Respeta el
 * cashback de hoy (si el pedido lo tiene, aunque esté anulado, no se anota
 * crédito) y las reglas del motor (lib/credito-harper.ts). Un reintento, una
 * notificación repetida o una que llega a la vez devuelven "ya" u "ocupado".
 */
export async function registrarCredito(
  pedido: PedidoParaCredito & { email: string },
  deps: DependenciasCredito
): Promise<ResultadoRegistro> {
  const numero = pedido.numero.trim();
  const email = pedido.email.trim().toLowerCase();
  if (!numero) throw new RangeError("El pedido no tiene número");
  if (!email.includes("@")) throw new RangeError(`El pedido ${numero} no tiene un mail para el crédito`);

  return conCerrojo(numero, deps, async (): Promise<ResultadoRegistro> => {
    const { filas } = await leerDepurado(numero, deps);
    const cashback = await deps.cashbackAnterior(numero);
    const anotados: CreditoYaAnotado[] = [
      ...filas.map((f) => ({ clase: "credito-harper" as const, pedido: f.pedido, clave: f.clave, anulado: f.estado === "Anulado" })),
      ...(cashback ? [{ clase: "cashback-anterior" as const, pedido: numero, anulado: cashback.anulado }] : []),
    ];
    const plan = creditoAlAcreditarse({ ...pedido, numero }, anotados);
    if (plan.accion === "nada") {
      if (plan.motivo === "ya-registrado") return { estado: "ya", fila: laDelPedido(filas), motivo: "ya-registrado" };
      return { estado: "nada", motivo: plan.motivo, calculo: plan.calculo };
    }

    await deps.almacen.crear({
      clave: claveDelCredito(numero),
      pedido: numero,
      email,
      monto: plan.calculo.monto,
      porcentaje: plan.calculo.porcentaje as 5 | 10,
      base: plan.calculo.base,
      anteojos: plan.calculo.anteojos,
      estado: "Pendiente",
      generadoEl: deps.ahora().toISOString(),
      fechaEntrega: null,
      disponibleDesde: null,
      incidenciaAbierta: false,
      reglas: REGLAS_CREDITO,
      notas: linea(deps, `Pendiente: ${plan.calculo.porcentaje} % de $ ${plan.calculo.base} pagados en ${plan.calculo.anteojos} anteojo(s).`),
    });

    // Segunda capa: se vuelve a leer; si quedaron dos (sin Redis), vale la más vieja.
    const despues = await leerDepurado(numero, deps);
    const queda = vigente(despues.filas);
    if (!queda) throw new Error(`El crédito de ${numero} no quedó anotado`);
    return { estado: "creado", fila: queda, duplicadosAnulados: despues.anulados };
  });
}

// ---------- 2. La entrega confirmada ----------

export type ResultadoEntrega =
  | { estado: "anotada" | "ya"; fila: FilaCredito }
  | { estado: "distinta"; fila: FilaCredito; fechaGuardada: string }
  | { estado: "sin-credito" }
  | Ocupado;

/**
 * Anota la fecha de entrega confirmada ("AAAA-MM-DD") y desde cuándo se podrá
 * usar (30 días después). La primera fecha confirmada no se pisa: si llega
 * otra, se devuelve "distinta" para que Harper lo vea.
 */
export async function confirmarEntrega(numero: string, fechaEntrega: string, deps: DependenciasCredito): Promise<ResultadoEntrega> {
  if (!esFechaValida(fechaEntrega)) throw new RangeError("La fecha de entrega tiene que ser una fecha que exista, como AAAA-MM-DD");
  const n = numero.trim();
  return conCerrojo(n, deps, async (): Promise<ResultadoEntrega> => {
    const fila = vigente((await leerDepurado(n, deps)).filas);
    if (!fila) return { estado: "sin-credito" };
    if (fila.fechaEntrega === fechaEntrega) return { estado: "ya", fila };
    if (fila.fechaEntrega) return { estado: "distinta", fila, fechaGuardada: fila.fechaEntrega };
    const { disponibleDesde } = estadoDelCredito({ anulado: false, fechaEntrega, incidenciaAbierta: fila.incidenciaAbierta, hoy: deps.ahora() });
    const nueva = await deps.almacen.actualizar(fila.id, {
      fechaEntrega,
      disponibleDesde,
      notas: conNota(fila, deps, `Entrega confirmada el ${fechaEntrega}: disponible desde el ${disponibleDesde}.`),
    });
    return { estado: "anotada", fila: nueva };
  });
}

// ---------- 3. Liberar los que ya cumplieron los 30 días ----------

/**
 * Pasa a Disponible cada crédito Pendiente con entrega confirmada, 30 días
 * cumplidos y sin incidencias abiertas (para una tarea diaria). Cada uno con
 * su cerrojo; uno ocupado queda para la próxima vuelta.
 */
export async function liberarDisponibles(deps: DependenciasCredito): Promise<{ liberados: string[]; ocupados: string[] }> {
  const liberados: string[] = [];
  const ocupados: string[] = [];
  for (const candidata of await deps.almacen.pendientes()) {
    const r = await conCerrojo(candidata.pedido, deps, async () => {
      // Se vuelve a leer adentro del cerrojo: pudo cambiar (una devolución) o ser un duplicado.
      const fila = vigente((await leerDepurado(candidata.pedido, deps)).filas);
      if (!fila || fila.id !== candidata.id || fila.estado !== "Pendiente") return false;
      const { estado } = estadoDelCredito({ anulado: false, fechaEntrega: fila.fechaEntrega, incidenciaAbierta: fila.incidenciaAbierta, hoy: deps.ahora() });
      if (estado !== "disponible") return false;
      await deps.almacen.actualizar(fila.id, { estado: "Disponible", notas: conNota(fila, deps, "Disponible.") });
      return true;
    });
    if (r === true) liberados.push(candidata.pedido);
    else if (r !== false) ocupados.push(candidata.pedido);
  }
  return { liberados, ocupados };
}

// ---------- 4. Devoluciones, cancelaciones y contracargos ----------

export type ResultadoCambio =
  | { estado: "anulado" | "recalculado" | "sin-cambio" | "a-revisar" | "incidencia-abierta" | "incidencia-cerrada"; fila: FilaCredito }
  | { estado: "ya-anulado"; fila: FilaCredito }
  | { estado: "sin-credito" }
  | Ocupado;

/** El crédito ya disponible no se toca solo: queda «A revisar» y no se puede usar hasta que Harper decida. */
async function aRevisar(fila: FilaCredito, deps: DependenciasCredito, por: string): Promise<ResultadoCambio> {
  if (fila.estado === "A revisar") return { estado: "a-revisar", fila };
  const nueva = await deps.almacen.actualizar(fila.id, { estado: "A revisar", notas: conNota(fila, deps, `A revisar: ${por} con el crédito ya disponible.`) });
  return { estado: "a-revisar", fila: nueva };
}

/**
 * Una devolución: con el crédito pendiente, se anula (todo devuelto) o se
 * recalcula con lo que quedó pagado, sin subir nunca (lib/credito-harper.ts).
 * Con el crédito disponible, «A revisar».
 */
export async function aplicarDevolucion(numero: string, quedan: readonly RenglonCobrado[], deps: DependenciasCredito): Promise<ResultadoCambio> {
  const n = numero.trim();
  return conCerrojo(n, deps, async (): Promise<ResultadoCambio> => {
    const fila = laDelPedido((await leerDepurado(n, deps)).filas);
    if (!fila) return { estado: "sin-credito" };
    if (fila.estado === "Anulado") return { estado: "ya-anulado", fila };
    if (fila.estado !== "Pendiente") return aRevisar(fila, deps, "devolución");
    const r = creditoTrasDevolucion({ monto: fila.monto, estado: "pendiente" }, quedan);
    if (r.accion === "anular") {
      return { estado: "anulado", fila: await deps.almacen.actualizar(fila.id, { estado: "Anulado", notas: conNota(fila, deps, "Anulado: devolución total.") }) };
    }
    if (r.accion === "recalcular") {
      const nueva = await deps.almacen.actualizar(fila.id, {
        monto: r.monto,
        porcentaje: r.calculo.porcentaje as 5 | 10,
        base: r.calculo.base,
        anteojos: r.calculo.anteojos,
        notas: conNota(fila, deps, `Recalculado por devolución parcial: $ ${fila.monto} → $ ${r.monto}.`),
      });
      return { estado: "recalculado", fila: nueva };
    }
    return { estado: "sin-cambio", fila };
  });
}

/**
 * El pedido se cancela, se reembolsa el pago o se pierde un contracargo: con
 * el crédito pendiente, se anula; disponible, «A revisar».
 */
export async function anularPorPedido(
  numero: string,
  motivo: "cancelacion" | "reembolso" | "contracargo-perdido",
  deps: DependenciasCredito
): Promise<ResultadoCambio> {
  const texto = { cancelacion: "cancelación del pedido", reembolso: "reembolso del pago", "contracargo-perdido": "contracargo perdido" }[motivo];
  const n = numero.trim();
  return conCerrojo(n, deps, async (): Promise<ResultadoCambio> => {
    const fila = laDelPedido((await leerDepurado(n, deps)).filas);
    if (!fila) return { estado: "sin-credito" };
    if (fila.estado === "Anulado") return { estado: "ya-anulado", fila };
    if (fila.estado !== "Pendiente") return aRevisar(fila, deps, texto);
    return { estado: "anulado", fila: await deps.almacen.actualizar(fila.id, { estado: "Anulado", notas: conNota(fila, deps, `Anulado: ${texto}.`) }) };
  });
}

/**
 * Una incidencia que se abre (devolución pedida, reclamo, contracargo) o se
 * cierra a favor de Harper (contracargo ganado, reclamo resuelto). Abierta, el
 * crédito pendiente no se libera; si ya estaba disponible, «A revisar».
 */
export async function marcarIncidencia(numero: string, abierta: boolean, que: string, deps: DependenciasCredito): Promise<ResultadoCambio> {
  const n = numero.trim();
  return conCerrojo(n, deps, async (): Promise<ResultadoCambio> => {
    const fila = laDelPedido((await leerDepurado(n, deps)).filas);
    if (!fila) return { estado: "sin-credito" };
    if (fila.estado === "Anulado") return { estado: "ya-anulado", fila };
    if (abierta && fila.estado === "Disponible") {
      const conMarca = await deps.almacen.actualizar(fila.id, { incidenciaAbierta: true, notas: conNota(fila, deps, `Incidencia abierta: ${que}.`) });
      return aRevisar(conMarca, deps, que);
    }
    if (fila.incidenciaAbierta === abierta) return { estado: abierta ? "incidencia-abierta" : "incidencia-cerrada", fila };
    const nueva = await deps.almacen.actualizar(fila.id, {
      incidenciaAbierta: abierta,
      notas: conNota(fila, deps, abierta ? `Incidencia abierta: ${que}.` : `Incidencia cerrada: ${que}.`),
    });
    return { estado: abierta ? "incidencia-abierta" : "incidencia-cerrada", fila: nueva };
  });
}

// ---------- 5. Junto con el saldo de hoy, sin mezclarlos ----------

/**
 * Lo que tiene una cuenta, en dos bolsillos separados (§10.3):
 *  - `anterior`: el saldo de hoy (Saldos: cashback, uso, ajustes), con sus
 *    reglas de siempre. Exactamente lo que da `saldoDe`: sirve en cualquier
 *    producto y no cambia por los créditos nuevos;
 *  - `credito`: el Crédito Harper, solo para anteojos. Suma lo Disponible;
 *    lo Pendiente va aparte y no se puede usar; lo «A revisar» tampoco.
 * Si un pedido tuviera dos filas vigentes, cuenta una sola (la más vieja).
 */
export function saldosDeLaCuenta(
  movimientos: MovimientoSaldo[],
  creditos: readonly FilaCredito[],
  hoy: Date | string
): { anterior: { disponible: number; enCamino: number }; credito: { disponible: number; pendiente: number; aRevisar: number } } {
  const porPedido = new Map<string, FilaCredito[]>();
  for (const c of creditos) porPedido.set(c.clave, [...(porPedido.get(c.clave) ?? []), c]);
  const vigentes = [...porPedido.values()].map(vigente).filter((c): c is FilaCredito => c !== null);
  const suma = (estado: EstadoGuardado) =>
    vigentes.filter((c) => c.estado === estado).reduce((t, c) => t + (Number.isFinite(c.monto) ? Math.max(0, c.monto) : 0), 0);
  return {
    anterior: saldoDe(movimientos, hoy),
    credito: { disponible: suma("Disponible"), pendiente: suma("Pendiente"), aRevisar: suma("A revisar") },
  };
}
