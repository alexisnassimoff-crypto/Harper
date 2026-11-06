import { timingSafeEqual } from "node:crypto";
import { escaparFormula, listRecords, TABLAS } from "./airtable";
import { soltarSinFallar } from "./cerrojo";
import { getConfig, type ConfigTienda } from "./config";
import { dependenciasCredito } from "./credito-airtable";
import { creditoActivo, esFechaValida, estadoDelCredito } from "./credito-harper";
import {
  cobroCertificado,
  lectorMercadoPagoDesdeEntorno,
  pedidoConfirmado,
  pedidoDesdeFila,
  type CobroDelPedido,
  type FilaPedidoCredito,
  type LectorMercadoPago,
  type PedidoHarper,
} from "./credito-pagos";
import { confirmarEntrega, liberarCredito, type DependenciasCredito, type FilaCredito, type VerificacionLiberacion } from "./credito-persistencia";
import { precio } from "./formato";
import { enviarMail as enviarMailReal, mailAlertaInterna, mailsConfigurados as mailsConfiguradosReal } from "./mails";
import { fechaArgentina } from "./suscriptores";

/**
 * Crédito Harper, paso 2 (docs/plan-programa-harper.md §17.9, punto 3, y
 * §18.2): el control diario que libera el crédito 30 días después de la
 * entrega confirmada. Lo corre /api/credito/diario, SOLO con
 * HARPER_CREDITO_ACTIVO=1 y sin cron todavía.
 *
 * Por cada crédito Pendiente:
 *  1. lee su pedido en Pedidos (por número, sin cache) y la Fecha_entrega que
 *     anota la automatización de Airtable. Una fecha que no es válida, futura
 *     o anterior a la compra, un pedido «entregado» sin fecha, o un pedido que
 *     ya no está confirmado o cambió de régimen: no se usa nada, el crédito
 *     sigue pendiente y queda en «requieren atención»;
 *  2. si el crédito todavía no tiene la entrega, la anota con
 *     `confirmarEntrega` (que nunca pisa una fecha ya tomada);
 *  3. con los 30 días cumplidos en Buenos Aires y sin incidencias abiertas,
 *     lo libera con `liberarCredito`. Antes de escribir, adentro del cerrojo
 *     del pedido, vuelve a leer el pedido (sigue «entregado», con la misma
 *     fecha) y el cobro en Mercado Pago (cobrado entero, sin reclamos ni
 *     contracargos). Si algo no da, no se libera y se avisa.
 *
 * Solo escribe en «Créditos» (la fecha de entrega y el paso a Disponible).
 * No toca Pedidos, Saldos, el cashback de hoy ni Mercado Pago (solo GET).
 * Nunca anula ni libera por suposición: lo que no cierra queda pendiente y se
 * le avisa a Harper en el resumen.
 */

// ---------- El pedido de cada crédito ----------

/** El pedido como lo necesita el control diario. */
export type PedidoDelCredito = PedidoHarper & {
  /** Fecha_entrega tal como vino de Airtable, sin interpretar. */
  fechaEntrega: unknown;
  /** El día de la compra en Buenos Aires (cuándo se creó el pedido). */
  compra: string;
};

export interface LectorPedidosPorNumero {
  /** Todos los pedidos con ese número (tendría que haber uno). Sin cache. No escribe nada. */
  porNumero(numero: string): Promise<PedidoDelCredito[]>;
}

/** Lee Pedidos en Airtable por número. No escribe nada. */
export const lectorPedidosPorNumeroAirtable: LectorPedidosPorNumero = {
  async porNumero(numero) {
    const n = numero.trim();
    const filas = await listRecords<FilaPedidoCredito & { Fecha_entrega?: unknown }>(TABLAS.pedidos, {
      filterByFormula: `{Numero} = '${escaparFormula(n)}'`,
      revalidate: 0,
    });
    return filas
      .filter((f) => (f.fields.Numero ?? "").trim() === n)
      .map((f) => ({ ...pedidoDesdeFila(f, null), fechaEntrega: f.fields.Fecha_entrega ?? null, compra: fechaArgentina(new Date(f.createdTime)) }));
  },
};

export type LecturaEntrega =
  /** Entregado, con una fecha que se puede usar. */
  | { tipo: "entregado"; fecha: string }
  /** Todavía no se entregó (pagado, preparando o enviado, sin fecha): se espera. */
  | { tipo: "sin-entrega" }
  /** Algo no cierra: no se usa nada y se avisa. */
  | { tipo: "revisar"; motivo: string };

/**
 * La entrega del pedido de un crédito, validada (§18.2, punto 3). `hoy` es el
 * día en Buenos Aires. Nunca presume la entrega: sin una fecha que cierre,
 * no hay fecha.
 */
export function entregaDelPedido(pedidos: readonly PedidoDelCredito[], hoy: string): LecturaEntrega {
  const revisar = (motivo: string): LecturaEntrega => ({ tipo: "revisar", motivo });
  if (pedidos.length === 0) return revisar("no se encontró el pedido en Pedidos");
  if (pedidos.length > 1) return revisar(`hay ${pedidos.length} pedidos con ese número en Pedidos`);
  const p = pedidos[0];
  if (p.regimen.regimen !== "nuevo") return revisar("el pedido ya no figura con las reglas del Crédito Harper (Notas)");
  if (!pedidoConfirmado(p)) return revisar(`el pedido está «${p.estado || "sin estado"}» y tiene un crédito pendiente`);
  const cruda = p.fechaEntrega;
  const vacia = cruda === null || cruda === undefined || cruda === "";
  if (p.estado !== "entregado") {
    return vacia ? { tipo: "sin-entrega" } : revisar(`tiene Fecha_entrega pero está «${p.estado}», no «entregado»`);
  }
  if (vacia) return revisar("está «entregado» sin Fecha_entrega (la automatización no la anotó)");
  if (!esFechaValida(cruda)) return revisar(`la Fecha_entrega no es una fecha válida (${String(cruda).slice(0, 40)})`);
  if (cruda > hoy) return revisar(`la Fecha_entrega ${cruda} es posterior a hoy (${hoy})`);
  if (cruda < p.compra) return revisar(`la Fecha_entrega ${cruda} es anterior a la compra (${p.compra})`);
  return { tipo: "entregado", fecha: cruda };
}

// ---------- El control del día ----------

export type DependenciasDiario = {
  credito: DependenciasCredito;
  mp: LectorMercadoPago;
  pedidos: LectorPedidosPorNumero;
};

export type ResumenDiario = {
  /** El día del control, en Buenos Aires. */
  dia: string;
  /** Pedidos con un crédito pendiente que se miraron. */
  revisados: number;
  liberados: { pedido: string; monto: number; fechaEntrega: string }[];
  fechasAnotadas: { pedido: string; fechaEntrega: string; disponibleDesde: string }[];
  /** Pendientes que siguen esperando: sin entrega, sin los 30 días o con una incidencia abierta. */
  esperando: { pedido: string; motivo: string }[];
  /** No se liberan hasta que Harper lo resuelva. */
  atencion: { pedido: string; motivo: string }[];
  /** Otra instancia tenía el crédito: queda para la próxima corrida. */
  ocupados: string[];
  /** Errores pasajeros (Airtable, Mercado Pago, Redis): se reintenta en la próxima corrida. */
  errores: { pedido: string; error: string }[];
};

function describir(error: unknown) {
  const texto = error instanceof Error ? error.message : String(error);
  return texto.replace(/\s+/g, " ").slice(0, 300);
}

function motivoDelCobro(cobro: CobroDelPedido): string {
  if (cobro.estado === "sin-cobro") return cobro.contracargoPerdido ? "contracargo perdido en Mercado Pago" : "reembolsado en Mercado Pago: no queda cobro vigente";
  if (cobro.estado === "parcial") return "reembolso parcial en Mercado Pago: registrar la devolución";
  return `Mercado Pago no muestra el pedido cobrado (${cobro.estado})`;
}

/**
 * Lo que se comprueba adentro del cerrojo, justo antes de liberar: el pedido
 * sigue «entregado» con la misma fecha, y Mercado Pago lo muestra cobrado
 * entero y sin reclamos ni contracargos. Un cobro que no se puede certificar
 * (`CobroIncierto`) sube como error: no se libera y se reintenta mañana.
 */
async function verificarAntesDeLiberar(fila: FilaCredito, deps: DependenciasDiario, hoy: string): Promise<VerificacionLiberacion> {
  const pedidos = await deps.pedidos.porNumero(fila.pedido);
  const entrega = entregaDelPedido(pedidos, hoy);
  if (entrega.tipo === "revisar") return { liberar: false, motivo: entrega.motivo };
  if (entrega.tipo === "sin-entrega") return { liberar: false, motivo: "el pedido ya no figura «entregado»" };
  if (entrega.fecha !== fila.fechaEntrega) {
    return { liberar: false, motivo: `la Fecha_entrega del pedido (${entrega.fecha}) no es la que tomó el crédito (${fila.fechaEntrega}): decide Harper` };
  }
  const pedido = pedidos[0];
  const cobro = await cobroCertificado(deps.mp, pedido.id, [pedido.pagoRegistrado], pedido.total, pedido.numero);
  if (cobro.estado !== "cobrado") return { liberar: false, motivo: motivoDelCobro(cobro) };
  if (cobro.incidenciaAbierta) return { liberar: false, motivo: "reclamo o contracargo abierto en Mercado Pago" };
  return {
    liberar: true,
    nota: `Disponible: entregado el ${fila.fechaEntrega} y 30 días cumplidos; pedido «entregado», cobrado en Mercado Pago y sin incidencias (control diario).`,
  };
}

/** Un crédito pendiente: anota la entrega si hace falta y lo libera si corresponde. */
async function revisarCredito(candidata: FilaCredito, deps: DependenciasDiario, hoy: string, r: ResumenDiario): Promise<void> {
  const n = candidata.pedido;
  const atencion = (motivo: string) => r.atencion.push({ pedido: n, motivo });
  const esperando = (motivo: string) => r.esperando.push({ pedido: n, motivo });

  const entrega = entregaDelPedido(await deps.pedidos.porNumero(n), hoy);
  if (entrega.tipo === "revisar") return void atencion(entrega.motivo);

  let fila = candidata;
  if (!fila.fechaEntrega) {
    if (entrega.tipo === "sin-entrega") return void esperando("sin entrega confirmada");
    const anotada = await confirmarEntrega(n, entrega.fecha, deps.credito);
    if (anotada.estado === "ocupado") return void r.ocupados.push(n);
    if (anotada.estado === "sin-credito") return;
    if (anotada.estado === "distinta") {
      return void atencion(`el crédito ya tiene la entrega del ${anotada.fechaGuardada} y el pedido dice ${entrega.fecha}: decide Harper`);
    }
    fila = anotada.fila;
    if (anotada.estado === "anotada" && fila.disponibleDesde) r.fechasAnotadas.push({ pedido: n, fechaEntrega: entrega.fecha, disponibleDesde: fila.disponibleDesde });
    if (fila.estado !== "Pendiente") return;
  } else if (entrega.tipo === "sin-entrega") {
    return void atencion(`el crédito tomó la entrega del ${fila.fechaEntrega}, pero el pedido ya no figura «entregado»`);
  } else if (entrega.fecha !== fila.fechaEntrega) {
    return void atencion(`la Fecha_entrega del pedido (${entrega.fecha}) no es la que tomó el crédito (${fila.fechaEntrega}): decide Harper`);
  }

  const { estado, disponibleDesde } = estadoDelCredito({ anulado: false, fechaEntrega: fila.fechaEntrega, incidenciaAbierta: fila.incidenciaAbierta, hoy: deps.credito.ahora() });
  if (estado !== "disponible") {
    if (fila.incidenciaAbierta && disponibleDesde !== null && hoy >= disponibleDesde) {
      return void atencion("cumplió los 30 días con una incidencia abierta: se libera cuando Harper la cierre");
    }
    return void esperando(fila.incidenciaAbierta ? "incidencia abierta" : `disponible desde el ${disponibleDesde}`);
  }

  const liberacion = await liberarCredito(fila, deps.credito, { verificar: (f) => verificarAntesDeLiberar(f, deps, hoy) });
  if (liberacion.estado === "liberado") r.liberados.push({ pedido: n, monto: liberacion.fila.monto, fechaEntrega: fila.fechaEntrega as string });
  else if (liberacion.estado === "retenido") atencion(liberacion.motivo);
  else if (liberacion.estado === "ocupado") r.ocupados.push(n);
  else if (liberacion.estado === "todavia-no") esperando(`disponible desde el ${disponibleDesde}`);
}

/**
 * El control de un día sobre todos los créditos pendientes. Uno que falla no
 * frena a los demás: un dato que no sirve (RangeError) va a «atención» y un
 * error pasajero a «errores»; ninguno se libera. Si no se pueden leer los
 * pendientes, tira.
 */
export async function procesarCreditosDelDia(deps: DependenciasDiario): Promise<ResumenDiario> {
  const dia = fechaArgentina(deps.credito.ahora());
  const r: ResumenDiario = { dia, revisados: 0, liberados: [], fechasAnotadas: [], esperando: [], atencion: [], ocupados: [], errores: [] };
  const vistos = new Set<string>();
  for (const candidata of await deps.credito.almacen.pendientes()) {
    // Un pedido con dos filas pendientes (duplicado) se mira una vez: la persistencia decide cuál vale.
    if (vistos.has(candidata.pedido)) continue;
    vistos.add(candidata.pedido);
    r.revisados += 1;
    try {
      await revisarCredito(candidata, deps, dia, r);
    } catch (error) {
      if (error instanceof RangeError) r.atencion.push({ pedido: candidata.pedido, motivo: `datos que no sirven: ${describir(error)}` });
      else r.errores.push({ pedido: candidata.pedido, error: describir(error) });
    }
  }
  return r;
}

// ---------- La corrida: una a la vez, con su registro ----------

/** Una sola corrida a la vez (además del cerrojo de cada crédito). */
export const CLAVE_CORRIDA_DIARIA = "harper:credito:diario";
export const TTL_CORRIDA_MS = 15 * 60_000;

type Mail = Parameters<typeof enviarMailReal>[0];

export type DependenciasCorrida = {
  /** Con lo indispensable, o lo que falta (MP_ACCESS_TOKEN, Redis). */
  diario: DependenciasDiario | { sinConfigurar: string[] };
  enviarMail: (mail: Mail) => Promise<boolean>;
  mailsConfigurados: () => boolean;
  config: () => Promise<ConfigTienda>;
};

export type ResultadoCorrida = { status: number; cuerpo: Record<string, unknown> };

/** Manda un aviso a Harper. Verdadero si salió, o si los mails están apagados a propósito. */
async function avisar(deps: DependenciasCorrida, asunto: string, lineas: string[]): Promise<boolean> {
  try {
    const salio = await deps.enviarMail(mailAlertaInterna({ config: await deps.config(), asunto, lineas }));
    return salio || !deps.mailsConfigurados();
  } catch (error) {
    console.error("[credito-diario] no salió el aviso a Harper:", error);
    return false;
  }
}

/** El texto del resumen, para el mail y el registro. Sin mails de clientes: pedido y monto. */
export function lineasDelResumen(r: ResumenDiario): string[] {
  const lineas: string[] = [];
  if (r.liberados.length) lineas.push(`Liberados (pasaron a Disponible): ${r.liberados.map((l) => `${l.pedido} (${precio(l.monto)}, entregado el ${l.fechaEntrega})`).join("; ")}.`);
  if (r.fechasAnotadas.length) lineas.push(`Entregas anotadas: ${r.fechasAnotadas.map((f) => `${f.pedido} (entregado el ${f.fechaEntrega}, disponible desde el ${f.disponibleDesde})`).join("; ")}.`);
  if (r.atencion.length) lineas.push(`Requieren atención, no se liberan hasta resolverlo: ${r.atencion.map((a) => `${a.pedido}: ${a.motivo}`).join("; ")}.`);
  if (r.errores.length) lineas.push(`Errores, se reintenta en la próxima corrida: ${r.errores.map((e) => `${e.pedido}: ${e.error}`).join("; ")}.`);
  if (r.ocupados.length) lineas.push(`Ocupados, quedan para la próxima corrida: ${r.ocupados.join(", ")}.`);
  lineas.push(`Pendientes revisados: ${r.revisados}; siguen esperando (sin entrega confirmada o sin los 30 días): ${r.esperando.length}.`);
  return lineas;
}

/**
 * La corrida del día: el cerrojo de la corrida, el control y su registro (el
 * log, la respuesta y un mail a Harper si hubo algo que contar). 200 si todo
 * salió; 500 si hubo errores o no salió el aviso (el próximo día se repite lo
 * que haga falta: es idempotente); 409 si había otra corrida; 503 si falta
 * configurar algo.
 */
export async function correrDiario(deps: DependenciasCorrida): Promise<ResultadoCorrida> {
  if ("sinConfigurar" in deps.diario) {
    const que = deps.diario.sinConfigurar.join(" y ");
    console.error(`[credito-diario] HARPER_CREDITO_ACTIVO=1 pero falta ${que}: no se revisan ni se liberan créditos`);
    const avisado = await avisar(deps, `ALERTA Harper — control diario del Crédito Harper sin configurar: falta ${que}`, [
      `HARPER_CREDITO_ACTIVO está en 1, pero falta ${que}. El control diario no revisó ni liberó ningún crédito.`,
      "Los créditos siguen pendientes, sin cambios. Se liberan solos en la primera corrida con todo configurado.",
    ]);
    return { status: 503, cuerpo: { ok: false, sinConfigurar: deps.diario.sinConfigurar, avisoEnviado: avisado } };
  }

  const diario = deps.diario;
  const cerrojo = diario.credito.cerrojo;
  if (!cerrojo) return correrDiario({ ...deps, diario: { sinConfigurar: ["Redis (cerrojo)"] } });
  const nonce = diario.credito.nonce();
  if (!(await cerrojo.tomar(CLAVE_CORRIDA_DIARIA, nonce, TTL_CORRIDA_MS))) {
    console.warn("[credito-diario] otra corrida está en curso: esta no hace nada");
    return { status: 409, cuerpo: { ok: false, ocupado: true, detalle: "otra corrida del control diario está en curso" } };
  }

  let resumen: ResumenDiario;
  try {
    resumen = await procesarCreditosDelDia(diario);
  } catch (error) {
    const detalle = describir(error);
    console.error("[credito-diario] no se pudo correr el control:", error);
    const avisado = await avisar(deps, "ALERTA Harper — el control diario del Crédito Harper no pudo correr", [
      `No se pudieron leer los créditos pendientes: ${detalle}.`,
      "No se liberó nada. La próxima corrida lo vuelve a intentar.",
    ]);
    return { status: 500, cuerpo: { ok: false, error: detalle, avisoEnviado: avisado } };
  } finally {
    await soltarSinFallar(cerrojo, CLAVE_CORRIDA_DIARIA, nonce);
  }

  const lineas = lineasDelResumen(resumen);
  console.log(`[credito-diario] ${resumen.dia}: ${lineas.join(" ")}`);
  const hayQueContar = resumen.liberados.length + resumen.fechasAnotadas.length + resumen.atencion.length + resumen.errores.length > 0;
  const avisado = hayQueContar
    ? await avisar(
        deps,
        `Crédito Harper — control diario del ${resumen.dia}: ${resumen.liberados.length} liberado(s), ${resumen.atencion.length} a revisar, ${resumen.errores.length} error(es)`,
        lineas
      )
    : true;
  const ok = resumen.errores.length === 0 && avisado;
  return { status: ok ? 200 : 500, cuerpo: { ok, ...resumen, avisoEnviado: avisado } };
}

// ---------- Producción ----------

/**
 * Solo el cron de Vercel: `Authorization: Bearer <CRON_SECRET>`. Sin
 * CRON_SECRET configurado no entra nadie. No acepta SYNC_TOKEN.
 */
export function cronAutorizado(header: string | null, secreto: string | undefined = process.env.CRON_SECRET): boolean {
  if (!secreto || !header?.startsWith("Bearer ")) return false;
  const recibido = Buffer.from(header.slice("Bearer ".length));
  const esperado = Buffer.from(secreto);
  return recibido.length === esperado.length && timingSafeEqual(recibido, esperado);
}

/** Las dependencias de verdad. Solo se arman con HARPER_CREDITO_ACTIVO=1 (lo controla la ruta). */
export function dependenciasCorridaReales(): DependenciasCorrida {
  const credito = dependenciasCredito();
  const mp = lectorMercadoPagoDesdeEntorno();
  const faltan = [mp ? null : "MP_ACCESS_TOKEN", credito.cerrojo ? null : "Redis (cerrojo)"].filter((f): f is string => f !== null);
  return {
    diario: mp && faltan.length === 0 ? { credito, mp, pedidos: lectorPedidosPorNumeroAirtable } : { sinConfigurar: faltan },
    enviarMail: enviarMailReal,
    mailsConfigurados: mailsConfiguradosReal,
    config: getConfig,
  };
}

/** Si la ruta tiene que correr: el interruptor del Crédito Harper (apagado, no se lee ni se escribe nada). */
export const controlDiarioActivo = (): boolean => creditoActivo();
