import { ErrorCerrojo, soltarSinFallar, type Cerrojo } from "./cerrojo";
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
 * Crédito Harper: la persistencia (Tareas 09 y 10), lista para conectar pero
 * SIN conectar. No la usa el webhook ni ninguna página. Trabaja sobre un
 * almacén y un cerrojo que se le pasan: la tabla «Créditos»
 * (lib/credito-airtable.ts) o, en las pruebas, uno en memoria. No toca la
 * tabla Saldos: solo lee si el pedido tiene el cashback de hoy.
 *
 * Por qué una tabla aparte y no Saldos: el código de hoy lee cualquier tipo
 * desconocido como «Ajuste» y cuenta como disponible todo lo que no tiene
 * Disponible_desde, así que un crédito pendiente se vería como saldo para
 * gastar, y en cualquier producto (el crédito nuevo es solo para anteojos,
 * docs/plan-programa-harper.md §10.3 y §17).
 *
 * Contra los duplicados:
 *  1. el cerrojo por pedido en Redis es OBLIGATORIO (revisión del PR #67): sin
 *     Redis, o si Redis falla, no se escribe nada y la operación tira
 *     `ErrorCerrojo` para que quien llama la reintente. Si el trabajo tarda
 *     tanto que la llave pudo vencer, tampoco se escribe;
 *  2. antes de crear se busca la fila del pedido (aunque esté anulada) y,
 *     al leer, si quedaron dos vigentes se deja la más vieja y se anulan las
 *     demás. Es una defensa de respaldo: no garantiza la unicidad por sí
 *     sola (Airtable no tiene índices únicos ni impide filas repetidas).
 *
 * Contra los eventos fuera de orden (§17.8): el estado del pedido y del pago
 * se puede leer adentro del cerrojo, de la fuente que manda (Mercado Pago y
 * Pedidos), en lugar de confiar en el aviso que llegó; y una cancelación,
 * un reembolso o una devolución que llegan antes que el pago dejan una fila
 * que impide anotar el crédito después.
 */

/** Cómo queda guardado. «A revisar»: no se puede usar hasta que Harper decida. */
export type EstadoGuardado = "Pendiente" | "Disponible" | "Anulado" | "A revisar";

/** Una fila de la tabla «Créditos». */
export type FilaCredito = {
  id: string;
  /** credito-harper:<pedido>. Airtable no la hace única: la unicidad la da el cerrojo. */
  clave: string;
  pedido: string;
  /** La cuenta a la que va: el mail de la compra ("" en una fila que bloquea, sin crédito). */
  email: string;
  monto: number;
  /** 0 solo en una fila que bloquea (anotada antes que el pago, sin crédito). */
  porcentaje: 0 | 5 | 10;
  base: number;
  anteojos: number;
  estado: EstadoGuardado;
  /** ISO: cuándo se anotó. */
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
  /** El cerrojo de Redis. Null (Redis sin configurar): no se escribe nada, se reintenta. */
  cerrojo: Cerrojo | null;
  /** Si el pedido ya tiene el cashback de hoy en Saldos (anulado o no). Solo lectura. */
  cashbackAnterior(pedido: string): Promise<{ anulado: boolean } | null>;
  ahora(): Date;
  /** Para el cerrojo. */
  nonce(): string;
};

/** Cuánto vive la llave si la instancia muere sin soltarla: como la del pedido en el webhook. */
export const TTL_CREDITO_MS = 120_000;
/** Si el trabajo ya lleva más que TTL − margen, la llave pudo vencer: no se escribe. */
export const MARGEN_CERROJO_MS = 20_000;
/** Distinta de la del webhook (harper:pedido:…): el webhook la puede pedir teniendo la suya. */
export const claveCerrojoCredito = (pedido: string) => `harper:credito:${pedido.trim()}`;

/** Otra instancia está trabajando sobre el crédito de ese pedido: se reintenta después. */
export type Ocupado = { estado: "ocupado" };

/**
 * El almacén, pero cada escritura controla primero que la llave siga siendo
 * nuestra: si el trabajo tardó tanto que pudo vencer, tira y no escribe.
 */
function vigilado(deps: DependenciasCredito, inicio: number): DependenciasCredito {
  const controlar = () => {
    if (deps.ahora().getTime() - inicio > TTL_CREDITO_MS - MARGEN_CERROJO_MS) {
      throw new ErrorCerrojo("El cerrojo del crédito pudo vencer: no se escribe y se reintenta");
    }
  };
  const almacen = deps.almacen;
  return {
    ...deps,
    almacen: {
      delPedido: (pedido) => almacen.delPedido(pedido),
      pendientes: () => almacen.pendientes(),
      crear: async (fila) => {
        controlar();
        return almacen.crear(fila);
      },
      actualizar: async (id, cambios) => {
        controlar();
        return almacen.actualizar(id, cambios);
      },
    },
  };
}

function exigirCerrojo(deps: DependenciasCredito): Cerrojo {
  if (!deps.cerrojo) throw new ErrorCerrojo("Redis no está configurado: sin cerrojo no se escriben créditos (se reintenta)");
  return deps.cerrojo;
}

/**
 * Corre `hacer` con el cerrojo del pedido. Sin Redis, o si Redis falla al
 * tomarlo, tira `ErrorCerrojo` sin leer ni escribir nada. Ocupado: no hace
 * nada y devuelve "ocupado".
 */
async function conCerrojo<T>(pedido: string, deps: DependenciasCredito, hacer: (d: DependenciasCredito) => Promise<T>): Promise<T | Ocupado> {
  const cerrojo = exigirCerrojo(deps);
  const clave = claveCerrojoCredito(pedido);
  const nonce = deps.nonce();
  if (!(await cerrojo.tomar(clave, nonce, TTL_CREDITO_MS))) return { estado: "ocupado" };
  try {
    return await hacer(vigilado(deps, deps.ahora().getTime()));
  } finally {
    await soltarSinFallar(cerrojo, clave, nonce);
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
export function laDelPedido(filas: readonly FilaCredito[]): FilaCredito | null {
  return vigente(filas) ?? [...filas].sort(masViejaPrimero).at(-1) ?? null;
}

/**
 * Lee las filas del pedido y, si quedaron dos vigentes, deja la más vieja y
 * anula las demás (respaldo del cerrojo). Siempre adentro del cerrojo.
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

/**
 * Cuando una cancelación, un reembolso o una devolución llegan antes que el
 * crédito: una fila sin monto que impide anotarlo después. «Anulado» si no
 * corresponde crédito; «A revisar» si corresponde uno menor que no se puede
 * calcular solo (devolución parcial): lo decide Harper.
 */
async function bloquearAntes(numero: string, estado: "Anulado" | "A revisar", por: string, deps: DependenciasCredito): Promise<FilaCredito> {
  await deps.almacen.crear({
    clave: claveDelCredito(numero),
    pedido: numero,
    email: "",
    monto: 0,
    porcentaje: 0,
    base: 0,
    anteojos: 0,
    estado,
    generadoEl: deps.ahora().toISOString(),
    fechaEntrega: null,
    disponibleDesde: null,
    incidenciaAbierta: false,
    reglas: REGLAS_CREDITO,
    notas: linea(deps, `${estado} antes de anotarse el crédito: ${por}.`),
  });
  const fila = laDelPedido((await leerDepurado(numero, deps)).filas);
  if (!fila) throw new Error(`La fila del pedido ${numero} no quedó anotada`);
  return fila;
}

// ---------- 1. Al acreditarse el pago: un solo crédito por pedido ----------

/** El pedido como se lee de la fuente que manda, al acreditarse el pago. */
export type PedidoAcreditable = PedidoParaCredito & {
  email: string;
  /** La entrega confirmada que ya tenga el pedido ("AAAA-MM-DD"), si el aviso del pago llega tarde. */
  fechaEntrega?: string | null;
  /** Si el pago ya tiene un reclamo o un contracargo abierto. */
  incidenciaAbierta?: boolean;
};

/**
 * El pedido, o cómo leerlo: con `leer`, se lee adentro del cerrojo (de
 * Mercado Pago y Pedidos), así un reembolso que ya pasó se ve aunque el aviso
 * del pago llegue después.
 */
export type EntradaRegistro = PedidoAcreditable | { numero: string; leer: () => Promise<PedidoAcreditable> };

export type ResultadoRegistro =
  | { estado: "creado"; fila: FilaCredito; duplicadosAnulados: number }
  | { estado: "ya"; fila: FilaCredito | null; motivo: "ya-registrado" }
  | { estado: "nada"; motivo: Exclude<MotivoSinAnotar, "ya-registrado">; calculo: CalculoCredito | null }
  | Ocupado;

function validarPedido(pedido: PedidoAcreditable, numero: string): { email: string; fechaEntrega: string | null } {
  if (pedido.numero.trim() !== numero) throw new RangeError(`Se leyó el pedido ${pedido.numero.trim()} en lugar de ${numero}`);
  const email = pedido.email.trim().toLowerCase();
  if (!email.includes("@")) throw new RangeError(`El pedido ${numero} no tiene un mail para el crédito`);
  const fechaEntrega = pedido.fechaEntrega ?? null;
  if (fechaEntrega !== null && !esFechaValida(fechaEntrega)) throw new RangeError("La fecha de entrega tiene que ser una fecha que exista, como AAAA-MM-DD");
  return { email, fechaEntrega };
}

/**
 * Anota el crédito pendiente de un pedido pagado, una sola vez. Respeta el
 * cashback de hoy (si el pedido lo tiene, aunque esté anulado, no se anota
 * crédito) y las reglas del motor (lib/credito-harper.ts). Un reintento, un
 * segundo pago del mismo pedido o un aviso que llega a la vez devuelven "ya"
 * u "ocupado".
 */
export async function registrarCredito(entrada: EntradaRegistro, deps: DependenciasCredito): Promise<ResultadoRegistro> {
  const numero = entrada.numero.trim();
  if (!numero) throw new RangeError("El pedido no tiene número");

  return conCerrojo(numero, deps, async (d): Promise<ResultadoRegistro> => {
    const pedido = "leer" in entrada ? await entrada.leer() : entrada;
    const { email, fechaEntrega } = validarPedido(pedido, numero);
    const { filas } = await leerDepurado(numero, d);
    const cashback = await d.cashbackAnterior(numero);
    const anotados: CreditoYaAnotado[] = [
      ...filas.map((f) => ({ clase: "credito-harper" as const, pedido: f.pedido, clave: f.clave, anulado: f.estado === "Anulado" })),
      ...(cashback ? [{ clase: "cashback-anterior" as const, pedido: numero, anulado: cashback.anulado }] : []),
    ];
    const plan = creditoAlAcreditarse({ ...pedido, numero }, anotados);
    if (plan.accion === "nada") {
      if (plan.motivo === "ya-registrado") return { estado: "ya", fila: laDelPedido(filas), motivo: "ya-registrado" };
      return { estado: "nada", motivo: plan.motivo, calculo: plan.calculo };
    }

    const incidenciaAbierta = pedido.incidenciaAbierta === true;
    const { disponibleDesde } = estadoDelCredito({ anulado: false, fechaEntrega, incidenciaAbierta, hoy: d.ahora() });
    const notas = [
      `Pendiente: ${plan.calculo.porcentaje} % de $ ${plan.calculo.base} pagados en ${plan.calculo.anteojos} anteojo(s).`,
      fechaEntrega ? `Entrega ya confirmada el ${fechaEntrega}: disponible desde el ${disponibleDesde}.` : null,
      incidenciaAbierta ? "Con una incidencia abierta al anotarse." : null,
    ].filter(Boolean);
    await d.almacen.crear({
      clave: claveDelCredito(numero),
      pedido: numero,
      email,
      monto: plan.calculo.monto,
      porcentaje: plan.calculo.porcentaje,
      base: plan.calculo.base,
      anteojos: plan.calculo.anteojos,
      estado: "Pendiente",
      generadoEl: d.ahora().toISOString(),
      fechaEntrega,
      disponibleDesde,
      incidenciaAbierta,
      reglas: REGLAS_CREDITO,
      notas: notas.map((n) => linea(d, n as string)).join("\n"),
    });

    // Respaldo: se vuelve a leer; si quedaron dos vigentes, vale la más vieja.
    const despues = await leerDepurado(numero, d);
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
 * otra, se devuelve "distinta" para que Harper lo vea. Si todavía no hay
 * crédito ("sin-credito"), la fecha se toma al anotarlo (`fechaEntrega`).
 */
export async function confirmarEntrega(numero: string, fechaEntrega: string, deps: DependenciasCredito): Promise<ResultadoEntrega> {
  if (!esFechaValida(fechaEntrega)) throw new RangeError("La fecha de entrega tiene que ser una fecha que exista, como AAAA-MM-DD");
  const n = numero.trim();
  return conCerrojo(n, deps, async (d): Promise<ResultadoEntrega> => {
    const fila = vigente((await leerDepurado(n, d)).filas);
    if (!fila) return { estado: "sin-credito" };
    if (fila.fechaEntrega === fechaEntrega) return { estado: "ya", fila };
    if (fila.fechaEntrega) return { estado: "distinta", fila, fechaGuardada: fila.fechaEntrega };
    const { disponibleDesde } = estadoDelCredito({ anulado: false, fechaEntrega, incidenciaAbierta: fila.incidenciaAbierta, hoy: d.ahora() });
    const nueva = await d.almacen.actualizar(fila.id, {
      fechaEntrega,
      disponibleDesde,
      notas: conNota(fila, d, `Entrega confirmada el ${fechaEntrega}: disponible desde el ${disponibleDesde}.`),
    });
    return { estado: "anotada", fila: nueva };
  });
}

// ---------- 3. Liberar los que ya cumplieron los 30 días ----------

export type ResultadoLiberacion =
  | { estado: "liberado"; fila: FilaCredito }
  /** Sigue pendiente: sin entrega, sin los 30 días o con una incidencia abierta. */
  | { estado: "todavia-no"; fila: FilaCredito }
  /** Ya no es la fila pendiente de su pedido: se liberó, se anuló, se marcó o era un duplicado. */
  | { estado: "ya-no-pendiente"; fila: FilaCredito | null }
  /** Cumple en la tabla, pero la verificación de afuera (el pedido, Mercado Pago) dice que no. */
  | { estado: "retenido"; fila: FilaCredito; motivo: string }
  | Ocupado;

/** Lo que se comprueba afuera de la tabla justo antes de liberar, adentro del cerrojo. */
export type VerificacionLiberacion = { liberar: true; nota?: string } | { liberar: false; motivo: string };

/**
 * Pasa a Disponible un crédito Pendiente con entrega confirmada, 30 días
 * cumplidos (en Buenos Aires) y sin incidencias abiertas. Todo se vuelve a
 * leer adentro del cerrojo del pedido; `verificar` corre ahí mismo, después
 * de esos controles y antes de escribir (la ruta diaria relee el pedido y
 * Mercado Pago, §17.9 y §18.2). Sin Redis tira `ErrorCerrojo`.
 */
export async function liberarCredito(
  candidata: FilaCredito,
  deps: DependenciasCredito,
  opciones: { verificar?: (fila: FilaCredito) => Promise<VerificacionLiberacion> } = {}
): Promise<ResultadoLiberacion> {
  return conCerrojo(candidata.pedido, deps, async (d): Promise<ResultadoLiberacion> => {
    // Se vuelve a leer adentro del cerrojo: pudo cambiar (una devolución) o ser un duplicado.
    const fila = vigente((await leerDepurado(candidata.pedido, d)).filas);
    if (!fila || fila.id !== candidata.id || fila.estado !== "Pendiente") return { estado: "ya-no-pendiente", fila };
    const { estado } = estadoDelCredito({ anulado: false, fechaEntrega: fila.fechaEntrega, incidenciaAbierta: fila.incidenciaAbierta, hoy: d.ahora() });
    if (estado !== "disponible") return { estado: "todavia-no", fila };
    const control: VerificacionLiberacion = opciones.verificar ? await opciones.verificar(fila) : { liberar: true };
    if (!control.liberar) return { estado: "retenido", fila, motivo: control.motivo };
    const nueva = await d.almacen.actualizar(fila.id, { estado: "Disponible", notas: conNota(fila, d, control.nota ?? "Disponible.") });
    return { estado: "liberado", fila: nueva };
  });
}

/**
 * Pasa a Disponible cada crédito Pendiente que cumple (`liberarCredito`, sin
 * verificación de afuera). Cada uno con su cerrojo; uno ocupado queda para la
 * próxima vuelta. Sin Redis no corre. La ruta diaria usa `liberarCredito`
 * con la verificación del pedido y de Mercado Pago (lib/credito-diario.ts).
 */
export async function liberarDisponibles(deps: DependenciasCredito): Promise<{ liberados: string[]; ocupados: string[] }> {
  exigirCerrojo(deps);
  const liberados: string[] = [];
  const ocupados: string[] = [];
  for (const candidata of await deps.almacen.pendientes()) {
    const r = await liberarCredito(candidata, deps);
    if (r.estado === "liberado") liberados.push(candidata.pedido);
    else if (r.estado === "ocupado") ocupados.push(candidata.pedido);
  }
  return { liberados, ocupados };
}

// ---------- 4. Devoluciones, cancelaciones y contracargos ----------

export type ResultadoCambio =
  | { estado: "anulado" | "recalculado" | "sin-cambio" | "a-revisar" | "incidencia-abierta" | "incidencia-cerrada"; fila: FilaCredito }
  /** Llegó antes que el crédito: quedó una fila que impide anotarlo después. */
  | { estado: "anulado-antes" | "a-revisar-antes"; fila: FilaCredito }
  | { estado: "ya-anulado"; fila: FilaCredito }
  /** El pedido sigue cobrado (era un pago repetido): el crédito no se toca. */
  | { estado: "sigue-cobrado"; fila: FilaCredito | null }
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
 * Con el crédito disponible, «A revisar». Si todavía no hay crédito, queda
 * una fila que impide anotarlo solo: anulada si se devolvió todo, «A revisar»
 * si fue parcial (el crédito menor lo decide Harper).
 */
export async function aplicarDevolucion(numero: string, quedan: readonly RenglonCobrado[], deps: DependenciasCredito): Promise<ResultadoCambio> {
  const n = numero.trim();
  return conCerrojo(n, deps, async (d): Promise<ResultadoCambio> => {
    const fila = laDelPedido((await leerDepurado(n, d)).filas);
    if (!fila) {
      const r = creditoTrasDevolucion({ monto: 0, estado: "pendiente" }, quedan);
      return r.accion === "anular"
        ? { estado: "anulado-antes", fila: await bloquearAntes(n, "Anulado", "devolución total", d) }
        : { estado: "a-revisar-antes", fila: await bloquearAntes(n, "A revisar", "devolución parcial: el crédito menor lo decide Harper", d) };
    }
    if (fila.estado === "Anulado") return { estado: "ya-anulado", fila };
    if (fila.estado !== "Pendiente") return aRevisar(fila, d, "devolución");
    const r = creditoTrasDevolucion({ monto: fila.monto, estado: "pendiente" }, quedan);
    if (r.accion === "anular") {
      return { estado: "anulado", fila: await d.almacen.actualizar(fila.id, { estado: "Anulado", notas: conNota(fila, d, "Anulado: devolución total.") }) };
    }
    if (r.accion === "recalcular") {
      const nueva = await d.almacen.actualizar(fila.id, {
        monto: r.monto,
        porcentaje: r.calculo.porcentaje,
        base: r.calculo.base,
        anteojos: r.calculo.anteojos,
        notas: conNota(fila, d, `Recalculado por devolución parcial: $ ${fila.monto} → $ ${r.monto}.`),
      });
      return { estado: "recalculado", fila: nueva };
    }
    return { estado: "sin-cambio", fila };
  });
}

/**
 * El pedido se cancela, se reembolsa el pago o se pierde un contracargo: con
 * el crédito pendiente, se anula; disponible, «A revisar». Si llega antes que
 * el crédito, queda una fila anulada que impide anotarlo después.
 *
 * `quedoSinCobro` es OBLIGATORIO (revisión del PR #68): se lee adentro del
 * cerrojo, de Mercado Pago (lib/credito-pagos.ts), si el pedido quedó de
 * verdad sin cobro. Si sigue cobrado por otro pago (se reembolsó un pago
 * repetido), no se toca nada. Una anulación a mano de Harper lo dice
 * explícitamente con `async () => true`.
 */
export async function anularPorPedido(
  numero: string,
  motivo: "cancelacion" | "reembolso" | "contracargo-perdido",
  deps: DependenciasCredito,
  opciones: { quedoSinCobro: () => Promise<boolean> }
): Promise<ResultadoCambio> {
  if (typeof opciones?.quedoSinCobro !== "function") {
    throw new TypeError("Para anular hay que leer si el pedido quedó sin cobro (quedoSinCobro)");
  }
  const texto = { cancelacion: "cancelación del pedido", reembolso: "reembolso del pago", "contracargo-perdido": "contracargo perdido" }[motivo];
  const n = numero.trim();
  return conCerrojo(n, deps, async (d): Promise<ResultadoCambio> => {
    const fila = laDelPedido((await leerDepurado(n, d)).filas);
    if (!(await opciones.quedoSinCobro())) return { estado: "sigue-cobrado", fila };
    if (!fila) return { estado: "anulado-antes", fila: await bloquearAntes(n, "Anulado", texto, d) };
    if (fila.estado === "Anulado") return { estado: "ya-anulado", fila };
    if (fila.estado !== "Pendiente") return aRevisar(fila, d, texto);
    return { estado: "anulado", fila: await d.almacen.actualizar(fila.id, { estado: "Anulado", notas: conNota(fila, d, `Anulado: ${texto}.`) }) };
  });
}

/**
 * Una incidencia que se abre (devolución pedida, reclamo, contracargo) o se
 * cierra a favor de Harper (contracargo ganado, reclamo resuelto). Abierta, el
 * crédito pendiente no se libera; si ya estaba disponible, «A revisar».
 *
 * `abierta` puede ser una función que lee el estado de verdad adentro del
 * cerrojo: así, si «contracargo ganado» llega antes que «contracargo
 * abierto», el segundo aviso no vuelve a abrirla. Sin crédito todavía
 * ("sin-credito"), la incidencia se toma al anotarlo (`incidenciaAbierta`).
 */
export async function marcarIncidencia(
  numero: string,
  abierta: boolean | (() => Promise<boolean>),
  que: string,
  deps: DependenciasCredito
): Promise<ResultadoCambio> {
  const n = numero.trim();
  return conCerrojo(n, deps, async (d): Promise<ResultadoCambio> => {
    const fila = laDelPedido((await leerDepurado(n, d)).filas);
    if (!fila) return { estado: "sin-credito" };
    if (fila.estado === "Anulado") return { estado: "ya-anulado", fila };
    const ahoraAbierta = typeof abierta === "function" ? await abierta() : abierta;
    if (ahoraAbierta && fila.estado === "Disponible") {
      const conMarca = await d.almacen.actualizar(fila.id, { incidenciaAbierta: true, notas: conNota(fila, d, `Incidencia abierta: ${que}.`) });
      return aRevisar(conMarca, d, que);
    }
    if (fila.incidenciaAbierta === ahoraAbierta) return { estado: ahoraAbierta ? "incidencia-abierta" : "incidencia-cerrada", fila };
    const nueva = await d.almacen.actualizar(fila.id, {
      incidenciaAbierta: ahoraAbierta,
      notas: conNota(fila, d, ahoraAbierta ? `Incidencia abierta: ${que}.` : `Incidencia cerrada: ${que}.`),
    });
    return { estado: ahoraAbierta ? "incidencia-abierta" : "incidencia-cerrada", fila: nueva };
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
 * Usar el crédito (descontarlo en una compra) es otra tarea: esto es lo que
 * se ganó, no lo que queda después de usarlo.
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
