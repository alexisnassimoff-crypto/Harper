import { timingSafeEqual } from "node:crypto";
import { escaparFormula, listRecords, TABLAS } from "./airtable";
import { soltarSinFallar } from "./cerrojo";
import { getConfig, type ConfigTienda } from "./config";
import { creditosDisponibles, dependenciasCredito } from "./credito-airtable";
import { creditoActivo, DIAS_AVISO_VENCIMIENTO, esFechaValida, estadoDelCredito, venceEl } from "./credito-harper";
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
import {
  anotarAviso,
  confirmarEntrega,
  creditoRetenido,
  liberarCredito,
  type DependenciasCredito,
  type FilaCredito,
  type VerificacionLiberacion,
} from "./credito-persistencia";
import { almacenUsosAirtable, anotarEnUso, leerSaldoDeCredito, lectorPedidosDeUsosAirtable, usosDevueltos, type FilaUso, type SaldoDeCredito } from "./credito-uso";
import { precio } from "./formato";
import {
  enviarMail as enviarMailReal,
  enviarMailConDetalle,
  mailAlertaInterna,
  // Las plantillas de los avisos al comprador (Ale, 18/11/2026).
  mailCreditoDisponible,
  mailCreditoPorVencer,
  mailsConfigurados as mailsConfiguradosReal,
} from "./mails";
import { fechaArgentina, sumarDias } from "./suscriptores";

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
 * Después de liberar (Ale, 18/11/2026: el comprador se tiene que enterar):
 *  4. mira los créditos «Disponible» y arma dos listas: los que quedaron
 *     disponibles hoy y los que vencen en 15 días o menos con algo sin usar
 *     (lo que queda de cada uno sale de `saldoDeCredito`, con los usos de la
 *     cuenta). Con el interruptor prendido, le manda a cada comprador su aviso
 *     (`avisos`) y deja la marca en las Notas del crédito para no repetirlo:
 *     «Aviso de disponible enviado: AAAA-MM-DD» y «Aviso de vencimiento
 *     enviado: AAAA-MM-DD». Si un aviso no sale, queda «… no salió:
 *     AAAA-MM-DD (motivo)»: ese día no se reintenta, al siguiente sí. Un aviso
 *     que falla nunca frena ni deshace una liberación;
 *  5. las filas «Disponible» sin Disponible_desde (solo por una edición a
 *     mano) no vencen: van al resumen para que Harper les ponga la fecha;
 *  6. el crédito devuelto (20/11/2026: lo que se usó en una compra que se
 *     reembolsó entera, un uso «Devuelto») también vence a los 6 meses y
 *     también recibe el aviso de «por vencer», con la marca en las Notas de
 *     su uso (`devueltos`). No recibe el de «ya disponible»: ese mail dice
 *     «Lo sumaste con tu pedido», que no es lo que pasó, y quien lo recibe
 *     acaba de devolver la compra. Uno devuelto sin fecha no vence y no se
 *     avisa (Harper lo marcó a mano así).
 *
 * Solo escribe en «Créditos» (la fecha de entrega, el paso a Disponible y las
 * marcas de los avisos en Notas). No toca Pedidos, Saldos, el cashback de hoy
 * ni Mercado Pago (solo GET). Nunca anula ni libera por suposición: lo que no
 * cierra queda pendiente y se le avisa a Harper en el resumen.
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

// ---------- Los avisos al comprador (Ale, 18/11/2026) ----------

/**
 * Cuántos días antes del vencimiento se le avisa al comprador: 15 o menos. El
 * número vive en lib/credito-harper.ts, con los demás números publicados; se
 * sigue exportando desde acá para quien lo importaba de este módulo.
 */
export { DIAS_AVISO_VENCIMIENTO };
/** Si el aviso de «ya disponible» no salió, se reintenta hasta 7 días después de que quedó disponible. */
export const DIAS_REINTENTO_AVISO_DISPONIBLE = 7;

/** Las marcas en las Notas del crédito: con una, ese aviso ya salió y no se repite. */
export const MARCA_AVISO_DISPONIBLE = "Aviso de disponible enviado:";
export const MARCA_AVISO_VENCIMIENTO = "Aviso de vencimiento enviado:";
/** Si no salió: ese día no se reintenta (la marca lleva la fecha); al siguiente, sí. */
export const MARCA_AVISO_DISPONIBLE_FALLIDO = "Aviso de disponible no salió:";
export const MARCA_AVISO_VENCIMIENTO_FALLIDO = "Aviso de vencimiento no salió:";

/** Un crédito que ya se puede usar: lo que necesita el mail al comprador. */
export type AvisoDisponible = {
  email: string;
  pedido: string;
  /** Lo que se puede usar de ese crédito, en pesos (lo que queda después de los usos de la cuenta). */
  monto: number;
  /** El día en que quedó disponible ("AAAA-MM-DD"). */
  disponibleDesde: string;
  /** El último día en que se puede usar ("AAAA-MM-DD", inclusive). */
  venceEl: string;
};

/** Un crédito con algo sin usar que vence en 15 días o menos. */
export type AvisoPorVencer = {
  email: string;
  /** El pedido con que se ganó; en uno devuelto, la compra que se reembolsó. */
  pedido: string;
  /** Lo que queda sin usar de ese crédito, en pesos: lo que se pierde si no lo usa. */
  monto: number;
  /** El último día en que se puede usar ("AAAA-MM-DD", inclusive). */
  venceEl: string;
  /** Días que faltan hasta `venceEl`: 0 si vence hoy (hoy todavía se puede usar). */
  dias: number;
  /** Es un crédito devuelto (20/11/2026): volvió a la cuenta porque esa compra se reembolsó entera. */
  devuelto?: boolean;
};

export type TipoAviso = "disponible" | "vencimiento";

/** Cómo se le avisa al comprador. Si tira, el aviso cuenta como no enviado. */
export type AvisosCredito = {
  disponible(datos: AvisoDisponible): Promise<void>;
  porVencer(datos: AvisoPorVencer): Promise<void>;
};

/** Lo que el control lee para los avisos y para las filas sin fecha. Solo lectura. */
export type LecturaDeCuentas = {
  /** Los créditos ganados en «Disponible», de todas las cuentas (lib/credito-airtable.ts, creditosDisponibles). */
  disponibles(): Promise<FilaCredito[]>;
  /** Lo que una cuenta puede usar, crédito por crédito (lib/credito-uso.ts, leerSaldoDeCredito). */
  saldo(email: string): Promise<SaldoDeCredito>;
};

/** El crédito devuelto (usos «Devuelto», 20/11/2026), para su aviso de vencimiento. */
export type DevueltosDelDiario = {
  /** Los usos «Devuelto» de todas las cuentas (lib/credito-uso.ts, usosDevueltos). Solo lectura. */
  leer(): Promise<FilaUso[]>;
  /** Deja la marca del aviso en las Notas del uso, con el cerrojo de su cuenta (lib/credito-uso.ts, anotarEnUso). */
  anotar(uso: FilaUso, texto: string): Promise<{ estado: string }>;
};

export type DependenciasDiario = {
  credito: DependenciasCredito;
  mp: LectorMercadoPago;
  pedidos: LectorPedidosPorNumero;
  /** Para los avisos y el control de las filas sin fecha. Sin esto, se avisa solo lo liberado hoy, con su monto. */
  cuentas?: LecturaDeCuentas;
  /** Para el aviso de vencimiento del crédito devuelto. Solo con `cuentas` (de ahí sale lo que le queda). */
  devueltos?: DevueltosDelDiario;
  /** Los mails al comprador. Se llaman solo con HARPER_CREDITO_ACTIVO=1; sin esto, no se manda ninguno. */
  avisos?: AvisosCredito;
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
  /**
   * Los créditos que quedaron disponibles hoy y todavía no tienen su aviso (si
   * el de un día anterior no salió, también los de los últimos 7 días), con
   * lo que se puede usar de cada uno. Con mails: no van a la respuesta de la
   * ruta ni al resumen a Harper.
   */
  disponiblesHoy: AvisoDisponible[];
  /** Los que vencen en 15 días o menos, con algo sin usar y sin su aviso todavía. Con mails, como arriba. */
  porVencer: AvisoPorVencer[];
  /** Pedidos con un crédito «Disponible» sin Disponible_desde: no vence; Harper le pone la fecha. */
  sinFecha: string[];
  /** Los avisos al comprador que salieron en esta corrida. */
  avisosEnviados: { pedido: string; aviso: TipoAviso }[];
  /** Los que no salieron (se reintentan desde mañana), o salieron sin que quedara la marca. */
  avisosFallidos: { pedido: string; aviso: TipoAviso; error: string }[];
  /** No se pudieron leer los créditos disponibles: hoy no hubo avisos ni control de fechas. */
  errorAvisos: string | null;
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

/** Un crédito pendiente: anota la entrega si hace falta y lo libera si corresponde. Lo liberado va a `liberadas`. */
async function revisarCredito(candidata: FilaCredito, deps: DependenciasDiario, hoy: string, r: ResumenDiario, liberadas: FilaCredito[]): Promise<void> {
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
  if (liberacion.estado === "liberado") {
    r.liberados.push({ pedido: n, monto: liberacion.fila.monto, fechaEntrega: fila.fechaEntrega as string });
    liberadas.push(liberacion.fila);
  } else if (liberacion.estado === "retenido") atencion(liberacion.motivo);
  else if (liberacion.estado === "ocupado") r.ocupados.push(n);
  else if (liberacion.estado === "todavia-no") esperando(`disponible desde el ${disponibleDesde}`);
}

/** Días de `desde` a `hasta` ("AAAA-MM-DD"). */
const diasEntre = (desde: string, hasta: string) => Math.round((Date.parse(`${hasta}T00:00:00.000Z`) - Date.parse(`${desde}T00:00:00.000Z`)) / 86_400_000);

/** Sin la marca de que salió, ni la de que hoy no salió (en las Notas de un crédito o de un uso «Devuelto»). */
const sinMarca = (fila: { notas: string }, enviado: string, fallido: string, hoy: string) => !fila.notas.includes(enviado) && !fila.notas.includes(`${fallido} ${hoy}`);

/** A quién se le deja la marca de un aviso: el pedido (para el resumen) y cómo se anota en su fila. */
type Avisable = { pedido: string; anotar: (texto: string) => Promise<{ estado: string }> };

/** Un error para el resumen a Harper y las Notas: sin mails de clientes. */
const sinMails = (texto: string) => texto.replace(/[^\s<>()]+@[^\s<>()]+/g, "(mail)");

/**
 * Manda un aviso al comprador y deja la marca en las Notas del crédito: la de
 * que salió o, si no, la de que hoy no salió (así hoy no se reintenta). Nunca
 * tira: lo que falla queda en `avisosFallidos` y en el log.
 */
async function mandarAviso(fila: Avisable, aviso: TipoAviso, mandar: () => Promise<void>, hoy: string, r: ResumenDiario): Promise<void> {
  const [enviado, fallido] = aviso === "disponible" ? [MARCA_AVISO_DISPONIBLE, MARCA_AVISO_DISPONIBLE_FALLIDO] : [MARCA_AVISO_VENCIMIENTO, MARCA_AVISO_VENCIMIENTO_FALLIDO];
  let salio = false;
  let marca: string;
  try {
    await mandar();
    salio = true;
    r.avisosEnviados.push({ pedido: fila.pedido, aviso });
    marca = `${enviado} ${hoy}`;
  } catch (error) {
    const motivo = sinMails(describir(error));
    console.error(`[credito-diario] no salió el aviso de ${aviso} del pedido ${fila.pedido}: ${motivo}`);
    r.avisosFallidos.push({ pedido: fila.pedido, aviso, error: motivo });
    marca = `${fallido} ${hoy} (${motivo})`;
  }
  try {
    const anotada = await fila.anotar(marca);
    if (anotada.estado === "ocupado") throw new Error("otra instancia tenía el crédito en ese momento");
  } catch (error) {
    const motivo = sinMails(describir(error));
    console.error(`[credito-diario] no quedó la marca del aviso de ${aviso} del pedido ${fila.pedido}: ${motivo}`);
    if (salio) r.avisosFallidos.push({ pedido: fila.pedido, aviso, error: `el mail salió, pero no quedó la marca en Notas (${motivo}): puede repetirse mañana` });
  }
}

/**
 * Los avisos al comprador y el control de las filas sin fecha (Ale,
 * 18/11/2026), después de liberar. Lee los créditos «Disponible» y, de cada
 * cuenta con algo que avisar, lo que puede usar (`saldoDeCredito`): solo se
 * avisa lo que de verdad queda sin usar, y nunca en una cuenta bloqueada. Los
 * mails salen solo con el interruptor prendido. Nunca tira.
 */
async function avisosDelDia(deps: DependenciasDiario, hoy: string, r: ResumenDiario, liberadas: readonly FilaCredito[]): Promise<void> {
  let filas: FilaCredito[];
  if (deps.cuentas) {
    try {
      filas = await deps.cuentas.disponibles();
    } catch (error) {
      r.errorAvisos = describir(error);
      console.error(`[credito-diario] no se pudieron leer los créditos disponibles para los avisos: ${r.errorAvisos}`);
      return;
    }
    // La lectura pudo venir sin lo que se acaba de liberar: se suma.
    const ids = new Set(filas.map((f) => f.id));
    filas = [...filas, ...liberadas.filter((f) => !ids.has(f.id))];
  } else {
    filas = [...liberadas];
  }

  const desdeReintento = sumarDias(hoy, -(DIAS_REINTENTO_AVISO_DISPONIBLE - 1));
  const sinFecha = new Set<string>();
  const paraDisponible: { fila: FilaCredito; desde: string; vence: string }[] = [];
  const paraVencimiento: { fila: FilaCredito; vence: string }[] = [];
  for (const fila of filas) {
    if (fila.estado !== "Disponible" || !(fila.monto > 0)) continue;
    const desde = fila.disponibleDesde;
    if (!esFechaValida(desde)) {
      sinFecha.add(fila.pedido);
      continue;
    }
    // Retenido por una incidencia: no se puede usar, no se avisa.
    if (creditoRetenido(fila) || !fila.email.includes("@")) continue;
    const vence = venceEl(desde);
    if (hoy > vence) continue;
    if (desde <= hoy && desde >= desdeReintento && sinMarca(fila, MARCA_AVISO_DISPONIBLE, MARCA_AVISO_DISPONIBLE_FALLIDO, hoy)) paraDisponible.push({ fila, desde, vence });
    if (diasEntre(hoy, vence) <= DIAS_AVISO_VENCIMIENTO && sinMarca(fila, MARCA_AVISO_VENCIMIENTO, MARCA_AVISO_VENCIMIENTO_FALLIDO, hoy)) paraVencimiento.push({ fila, vence });
  }
  r.sinFecha = [...sinFecha].sort();

  // El crédito devuelto (20/11/2026): los usos «Devuelto» con fecha, que vencen
  // como cualquier crédito. Solo el aviso de «por vencer» (ver arriba).
  const devueltosPorVencer: { uso: FilaUso; vence: string }[] = [];
  if (deps.devueltos && deps.cuentas) {
    let devueltos: FilaUso[] = [];
    try {
      devueltos = await deps.devueltos.leer();
    } catch (error) {
      // No frena los demás avisos: hoy no se avisa el crédito devuelto y mañana se reintenta.
      const motivo = sinMails(describir(error));
      console.error(`[credito-diario] no se pudieron leer los créditos devueltos para los avisos: ${motivo}`);
      r.avisosFallidos.push({ pedido: "créditos devueltos", aviso: "vencimiento", error: `no se pudieron leer (${motivo})` });
    }
    for (const uso of devueltos) {
      if (uso.estado !== "Devuelto" || uso.rota || !(uso.monto > 0) || !uso.email.includes("@")) continue;
      // Sin fecha no vence: no hay nada que avisar.
      if (!esFechaValida(uso.disponibleDesde) || uso.disponibleDesde > hoy) continue;
      const vence = venceEl(uso.disponibleDesde);
      if (hoy > vence) continue;
      if (diasEntre(hoy, vence) <= DIAS_AVISO_VENCIMIENTO && sinMarca(uso, MARCA_AVISO_VENCIMIENTO, MARCA_AVISO_VENCIMIENTO_FALLIDO, hoy)) devueltosPorVencer.push({ uso, vence });
    }
  }

  // Lo que queda sin usar de cada crédito, con los usos de su cuenta (una lectura por mail).
  const cuentas = new Map<string, Promise<SaldoDeCredito>>();
  const restante = async (fila: { id: string; email: string; pedido: string; monto: number }, aviso: TipoAviso, origen: "ganado" | "devuelto" = "ganado"): Promise<number> => {
    if (!deps.cuentas) return fila.monto;
    const lectura = cuentas.get(fila.email) ?? deps.cuentas.saldo(fila.email);
    cuentas.set(fila.email, lectura);
    try {
      const saldo = await lectura;
      const suyo = saldo.porCredito.find((c) => c.id === fila.id && c.origen === origen);
      return saldo.bloqueado || !suyo || suyo.vencido ? 0 : suyo.restante;
    } catch (error) {
      // No se sabe cuánto queda: hoy no se avisa; mañana se vuelve a intentar.
      r.avisosFallidos.push({ pedido: fila.pedido, aviso, error: `no se pudo leer la cuenta (${sinMails(describir(error))})` });
      return 0;
    }
  };
  const delCredito = (fila: FilaCredito): Avisable => ({ pedido: fila.pedido, anotar: (texto) => anotarAviso(fila, texto, deps.credito) });

  const disponibles: { datos: AvisoDisponible; destino: Avisable }[] = [];
  for (const { fila, desde, vence } of paraDisponible) {
    const monto = await restante(fila, "disponible");
    if (monto > 0) disponibles.push({ datos: { email: fila.email, pedido: fila.pedido, monto, disponibleDesde: desde, venceEl: vence }, destino: delCredito(fila) });
  }
  const porVencer: { datos: AvisoPorVencer; destino: Avisable }[] = [];
  for (const { fila, vence } of paraVencimiento) {
    const monto = await restante(fila, "vencimiento");
    if (monto > 0) porVencer.push({ datos: { email: fila.email, pedido: fila.pedido, monto, venceEl: vence, dias: diasEntre(hoy, vence) }, destino: delCredito(fila) });
  }
  const devueltos = deps.devueltos;
  for (const { uso, vence } of devueltosPorVencer) {
    const monto = await restante(uso, "vencimiento", "devuelto");
    if (monto > 0 && devueltos) {
      porVencer.push({
        datos: { email: uso.email, pedido: uso.pedido, monto, venceEl: vence, dias: diasEntre(hoy, vence), devuelto: true },
        destino: { pedido: uso.pedido, anotar: (texto) => devueltos.anotar(uso, texto) },
      });
    }
  }
  r.disponiblesHoy = disponibles.map((d) => d.datos);
  r.porVencer = porVencer.map((d) => d.datos);

  // Los mails, solo con el interruptor prendido.
  const avisos = deps.avisos;
  if (!avisos || !creditoActivo()) return;
  for (const { datos, destino } of disponibles) await mandarAviso(destino, "disponible", () => avisos.disponible(datos), hoy, r);
  for (const { datos, destino } of porVencer) await mandarAviso(destino, "vencimiento", () => avisos.porVencer(datos), hoy, r);
}

/**
 * El control de un día sobre todos los créditos pendientes. Uno que falla no
 * frena a los demás: un dato que no sirve (RangeError) va a «atención» y un
 * error pasajero a «errores»; ninguno se libera. Si no se pueden leer los
 * pendientes, tira. Después, los avisos al comprador (`avisosDelDia`): lo que
 * pase con ellos nunca cambia lo liberado.
 */
export async function procesarCreditosDelDia(deps: DependenciasDiario): Promise<ResumenDiario> {
  const dia = fechaArgentina(deps.credito.ahora());
  const r: ResumenDiario = {
    dia,
    revisados: 0,
    liberados: [],
    fechasAnotadas: [],
    esperando: [],
    atencion: [],
    ocupados: [],
    errores: [],
    disponiblesHoy: [],
    porVencer: [],
    sinFecha: [],
    avisosEnviados: [],
    avisosFallidos: [],
    errorAvisos: null,
  };
  const vistos = new Set<string>();
  const liberadas: FilaCredito[] = [];
  for (const candidata of await deps.credito.almacen.pendientes()) {
    // Un pedido con dos filas pendientes (duplicado) se mira una vez: la persistencia decide cuál vale.
    if (vistos.has(candidata.pedido)) continue;
    vistos.add(candidata.pedido);
    r.revisados += 1;
    try {
      await revisarCredito(candidata, deps, dia, r, liberadas);
    } catch (error) {
      if (error instanceof RangeError) r.atencion.push({ pedido: candidata.pedido, motivo: `datos que no sirven: ${describir(error)}` });
      else r.errores.push({ pedido: candidata.pedido, error: describir(error) });
    }
  }
  try {
    await avisosDelDia(deps, dia, r, liberadas);
  } catch (error) {
    // No tendría que pasar (avisosDelDia no tira), pero lo liberado queda liberado igual.
    r.errorAvisos = describir(error);
    console.error(`[credito-diario] los avisos del día fallaron: ${r.errorAvisos}`);
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
  // Ale, 18/11/2026: el vencimiento y los avisos al comprador (sin sus mails).
  if (r.sinFecha.length) lineas.push(`Disponibles sin Disponible_desde: no vencen hasta que tengan fecha. Revisalos en Créditos: ${r.sinFecha.join(", ")}.`);
  const enviados = (aviso: TipoAviso) => r.avisosEnviados.filter((a) => a.aviso === aviso).length;
  if (r.avisosEnviados.length) lineas.push(`Avisos al comprador enviados: ${enviados("disponible")} de crédito disponible y ${enviados("vencimiento")} de vencimiento.`);
  if (r.avisosFallidos.length) {
    lineas.push(`Avisos al comprador que no salieron (se reintentan desde mañana): ${r.avisosFallidos.map((a) => `${a.pedido} (${a.aviso}): ${a.error}`).join("; ")}.`);
  }
  if (r.errorAvisos) {
    lineas.push(`No se pudieron leer los créditos disponibles (${r.errorAvisos}): hoy no salió ningún aviso al comprador ni se controlaron las fechas. Se reintenta en la próxima corrida.`);
  }
  lineas.push(`Pendientes revisados: ${r.revisados}; siguen esperando (sin entrega confirmada o sin los 30 días): ${r.esperando.length}.`);
  return lineas;
}

/** Lo que va a la respuesta de la ruta: los avisos, sin el mail del comprador. */
const sinMailDelComprador = <T extends { email: string }>(lista: readonly T[]): Omit<T, "email">[] => lista.map(({ email: _email, ...resto }) => resto);

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
  const hayQueContar =
    resumen.liberados.length +
      resumen.fechasAnotadas.length +
      resumen.atencion.length +
      resumen.errores.length +
      resumen.sinFecha.length +
      resumen.avisosFallidos.length +
      (resumen.errorAvisos ? 1 : 0) >
    0;
  const avisado = hayQueContar
    ? await avisar(
        deps,
        `Crédito Harper — control diario del ${resumen.dia}: ${resumen.liberados.length} liberado(s), ${resumen.atencion.length} a revisar, ${resumen.errores.length} error(es)`,
        lineas
      )
    : true;
  // Un aviso al comprador que no salió no cambia el estado de la corrida: va
  // al resumen y se reintenta desde mañana (Ale, 18/11/2026).
  const ok = resumen.errores.length === 0 && avisado;
  return {
    status: ok ? 200 : 500,
    cuerpo: {
      ok,
      ...resumen,
      disponiblesHoy: sinMailDelComprador(resumen.disponiblesHoy),
      porVencer: sinMailDelComprador(resumen.porVencer),
      avisoEnviado: avisado,
    },
  };
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

/** Manda un mail al comprador; si no sale (o los mails no están configurados), tira con el motivo. */
async function mandarMail(mail: Mail): Promise<void> {
  const r = await enviarMailConDetalle(mail);
  if (!r.ok) throw new Error(r.error);
}

/**
 * Los avisos de verdad (Ale, 18/11/2026): las plantillas de lib/mails.ts,
 * con la configuración de la tienda. Se llaman solo con el interruptor prendido.
 */
export const avisosPorMail: AvisosCredito = {
  async disponible(datos) {
    await mandarMail(mailCreditoDisponible({ config: await getConfig(), ...datos }));
  },
  async porVencer({ devuelto, ...datos }) {
    // Un crédito devuelto no se sumó con ese pedido: sin el pedido, el mail no
    // dice «Lo sumaste con tu pedido …» (20/11/2026).
    await mandarMail(mailCreditoPorVencer({ config: await getConfig(), ...datos, ...(devuelto ? { pedido: "" } : {}) }));
  },
};

/** Las dependencias de verdad. Solo se arman con HARPER_CREDITO_ACTIVO=1 (lo controla la ruta). */
export function dependenciasCorridaReales(): DependenciasCorrida {
  const credito = dependenciasCredito();
  const mp = lectorMercadoPagoDesdeEntorno();
  const faltan = [mp ? null : "MP_ACCESS_TOKEN", credito.cerrojo ? null : "Redis (cerrojo)"].filter((f): f is string => f !== null);
  // Lo que puede usar cada cuenta, con el mismo reloj del control.
  const uso = {
    almacen: almacenUsosAirtable,
    pedidos: lectorPedidosDeUsosAirtable,
    reloj: { ahora: () => credito.ahora().getTime(), dormir: (ms: number) => new Promise<void>((listo) => setTimeout(listo, ms)) },
  };
  const cuentas: LecturaDeCuentas = { disponibles: creditosDisponibles, saldo: (email) => leerSaldoDeCredito(email, uso) };
  // El crédito devuelto (20/11/2026): la marca de su aviso va en el uso, con el cerrojo de la cuenta.
  const devueltos: DevueltosDelDiario = { leer: usosDevueltos, anotar: (fila, texto) => anotarEnUso(fila, texto, { ...uso, cerrojo: credito.cerrojo }) };
  return {
    diario: mp && faltan.length === 0 ? { credito, mp, pedidos: lectorPedidosPorNumeroAirtable, cuentas, devueltos, avisos: avisosPorMail } : { sinConfigurar: faltan },
    enviarMail: enviarMailReal,
    mailsConfigurados: mailsConfiguradosReal,
    config: getConfig,
  };
}

/** Si la ruta tiene que correr: el interruptor del Crédito Harper (apagado, no se lee ni se escribe nada). */
export const controlDiarioActivo = (): boolean => creditoActivo();
