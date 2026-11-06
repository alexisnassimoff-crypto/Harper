import { escaparFormula, listRecords, TABLAS } from "./airtable";
import { pedidoParaMostrar, type SolicitudArrepentimiento } from "./arrepentimiento";
import { dependenciasCredito } from "./credito-airtable";
import { creditoActivo } from "./credito-harper";
import { lectorPedidosAirtable, type LectorPedidos } from "./credito-pagos";
import { laDelPedido, marcarIncidencia, type DependenciasCredito, type ResultadoCambio } from "./credito-persistencia";
import { dependenciasUsoReales, leerSaldoDeCredito, type DependenciasUso } from "./credito-uso";
import { precio as formatearPrecio } from "./formato";
import { ESTADOS_CONFIRMADOS } from "./webhook-decision";

/**
 * Crédito Harper, paso 5: devoluciones e incidencias (§17.13).
 *
 * Lo que está definido (§18.2 y §18.3) y se hace acá:
 *  - Detección: una solicitud de arrepentimiento abre sola la incidencia del
 *    crédito del pedido, pero SOLO si el pedido se verifica (existe y es uno
 *    solo, el mail es el del cliente, está confirmado y tiene Crédito Harper).
 *    Si falta algo, no se toca nada y el aviso a Harper lo dice.
 *  - Retención: con la incidencia abierta, un crédito pendiente no se libera
 *    (la ruta diaria lo frena) y uno disponible queda «A revisar», sin poder
 *    usarse. Un cambio o un reclamo interno los marca Harper a mano en
 *    Incidencia_abierta: retiene igual (`creditoRetenido`).
 *  - Trazabilidad: cada paso queda en las Notas de la fila de Créditos y en
 *    el aviso del arrepentimiento.
 *  - Resolución controlada: cerrar una incidencia es siempre de Harper.
 *
 * Lo que NO está definido (L1–L5, revisión legal) queda bloqueado para
 * revisión y nunca se resuelve solo:
 *  - la devolución parcial (no se recalcula el crédito: `aplicarDevolucion`
 *    no se usa desde ningún circuito);
 *  - el crédito ya gastado de un pedido que se devuelve (no se recupera: la
 *    cuenta queda sin poder usar más crédito hasta que Harper decida);
 *  - el crédito usado en el pedido que se devuelve (no vuelve solo: queda
 *    descontado; si corresponde, Harper lo marca «Devuelto»).
 *
 * Solo con HARPER_CREDITO_ACTIVO=1. Apagado, no lee ni escribe nada y el
 * arrepentimiento es el de siempre.
 */

export type DependenciasIncidencia = {
  /** El interruptor del Crédito Harper. */
  activo: () => boolean;
  /** Los IDs de Pedidos con ese número, sin cache. */
  pedidosConNumero: (numero: string) => Promise<string[]>;
  pedidos: LectorPedidos;
  credito: DependenciasCredito;
  uso: DependenciasUso;
};

export function dependenciasIncidenciaReales(): DependenciasIncidencia {
  const credito = dependenciasCredito();
  return {
    activo: () => creditoActivo(),
    pedidosConNumero: async (numero) =>
      (await listRecords<{ Numero?: string }>(TABLAS.pedidos, { filterByFormula: `{Numero} = '${escaparFormula(numero)}'`, revalidate: 0 }))
        .filter((r) => (r.fields.Numero ?? "").trim() === numero)
        .map((r) => r.id),
    pedidos: lectorPedidosAirtable,
    credito,
    uso: dependenciasUsoReales(credito.cerrojo),
  };
}

export type VinculoDelArrepentimiento =
  | { vinculado: true; numero: string; email: string }
  | { vinculado: false; numero: string | null; motivo: string; /** Sin nada que revisar en el crédito (el pedido no tiene Crédito Harper). */ sinCredito?: boolean };

/**
 * Las cuatro condiciones de §18.2, leídas de verdad: el número existe y es de
 * un solo pedido, el mail de la solicitud es el del cliente de ese pedido, el
 * pedido está confirmado y tiene Crédito Harper (no anulado). El formulario
 * no verifica el mail: por eso tienen que coincidir el número y el mail.
 */
export async function vincularArrepentimiento(solicitud: SolicitudArrepentimiento, deps: DependenciasIncidencia): Promise<VinculoDelArrepentimiento> {
  const numero = pedidoParaMostrar(solicitud.pedido);
  if (!numero) return { vinculado: false, numero: null, motivo: "la solicitud no trae un número de pedido válido" };
  const ids = await deps.pedidosConNumero(numero);
  if (ids.length === 0) return { vinculado: false, numero, motivo: `no hay ningún pedido ${numero}` };
  if (ids.length > 1) return { vinculado: false, numero, motivo: `hay ${ids.length} pedidos con el número ${numero}` };
  const pedido = await deps.pedidos.leer(ids[0]);
  if (!pedido) return { vinculado: false, numero, motivo: `no hay ningún pedido ${numero}` };
  const email = solicitud.email.trim().toLowerCase();
  if (!pedido.email || pedido.email !== email) return { vinculado: false, numero, motivo: `el mail de la solicitud no es el del cliente del pedido ${numero}` };
  if (!ESTADOS_CONFIRMADOS.has(pedido.estado)) return { vinculado: false, numero, motivo: `el pedido ${numero} no está confirmado (${pedido.estado || "sin estado"})` };
  const credito = laDelPedido(await deps.credito.almacen.delPedido(numero));
  if (!credito) {
    return pedido.regimen.regimen === "nuevo"
      ? { vinculado: false, numero, motivo: `el pedido ${numero} todavía no tiene el Crédito Harper anotado` }
      : { vinculado: false, numero, motivo: `el pedido ${numero} no tiene Crédito Harper`, sinCredito: true };
  }
  if (credito.estado === "Anulado") return { vinculado: false, numero, motivo: `el Crédito Harper del pedido ${numero} ya está anulado`, sinCredito: true };
  return { vinculado: true, numero, email };
}

const describir = (error: unknown) => (error instanceof Error ? error.message : String(error)).replace(/\s+/g, " ").slice(0, 200);

/** Lo que el resultado de abrir la incidencia le dice a Harper. */
function notaDeLaIncidencia(r: ResultadoCambio, numero: string, codigo: string): string {
  const manual = `Marcá Incidencia_abierta a mano en Créditos (pedido ${numero}).`;
  switch (r.estado) {
    case "incidencia-abierta":
      return `Crédito Harper: el crédito de ${formatearPrecio(r.fila.monto)} del pedido ${numero} queda retenido por el arrepentimiento ${codigo} (incidencia abierta): no se libera ni se usa hasta que la cierres en Créditos.`;
    case "a-revisar":
      return `Crédito Harper: el crédito de ${formatearPrecio(r.fila.monto)} del pedido ${numero} ya estaba disponible: quedó «A revisar» por el arrepentimiento ${codigo} y no se puede usar hasta que decidas.`;
    case "ya-anulado":
      return `Crédito Harper: el crédito del pedido ${numero} ya estaba anulado.`;
    case "sin-credito":
      return `Crédito Harper: el pedido ${numero} no tiene crédito anotado. Si se anota, ${manual.charAt(0).toLowerCase()}${manual.slice(1)}`;
    case "ocupado":
      return `Crédito Harper: no se pudo abrir la incidencia del pedido ${numero} (otro proceso tenía el crédito en ese momento). ${manual}`;
    default:
      return `Crédito Harper: la incidencia del pedido ${numero} quedó «${r.estado}». Revisalo en Créditos.`;
  }
}

/**
 * Abre la incidencia del crédito de un pedido que se arrepiente, si el pedido
 * se verifica (`vincularArrepentimiento`), y devuelve la nota para el aviso a
 * Harper (null con el interruptor apagado, o si el pedido no tiene Crédito
 * Harper). Nunca tira: el arrepentimiento se registra igual y, si algo falla,
 * la nota le pide a Harper que lo marque a mano.
 *
 * No anula ni cambia el monto (§18.2): abrir la incidencia solo frena la
 * liberación y el uso. Lo que no tiene regla todavía (devolución parcial,
 * crédito ya gastado, crédito usado en el pedido) solo se avisa.
 */
export async function incidenciaPorArrepentimiento(
  solicitud: SolicitudArrepentimiento,
  codigo: string,
  deps: DependenciasIncidencia | (() => DependenciasIncidencia) = dependenciasIncidenciaReales
): Promise<string | null> {
  // Apagado: ni siquiera se arman las dependencias (no se lee ni se escribe nada).
  if (typeof deps === "function" && !creditoActivo()) return null;
  let d: DependenciasIncidencia;
  try {
    d = typeof deps === "function" ? deps() : deps;
  } catch (error) {
    return `Crédito Harper: no se pudo revisar el crédito del pedido (${describir(error)}). Si la compra tiene Crédito Harper, marcá Incidencia_abierta a mano en Créditos.`;
  }
  if (!d.activo()) return null;
  try {
    const vinculo = await vincularArrepentimiento(solicitud, d);
    if (!vinculo.vinculado) {
      if (vinculo.sinCredito) return null;
      return `Crédito Harper: no se abrió ninguna incidencia porque ${vinculo.motivo}. Revisalo a mano y, si la compra tiene Crédito Harper, marcá Incidencia_abierta en Créditos.`;
    }
    const { numero, email } = vinculo;
    const r = await marcarIncidencia(numero, true, `arrepentimiento ${codigo}`, d.credito);
    const notas = [notaDeLaIncidencia(r, numero, codigo)];
    if (r.estado === "incidencia-abierta" || r.estado === "a-revisar") {
      notas.push(
        "Si se concreta la devolución con reembolso total en Mercado Pago, el crédito se anula solo. Si es parcial, o sin Mercado Pago, decidilo a mano: la regla de la devolución parcial está pendiente (no se recalcula sola)."
      );
    }
    try {
      notas.push(...(await bloqueosParaRevisar(numero, email, d)));
    } catch (error) {
      notas.push(`No se pudo revisar si el pedido usó Crédito Harper o si la cuenta ya lo gastó (${describir(error)}): miralo en Créditos.`);
    }
    return notas.join(" ");
  } catch (error) {
    console.error(`[credito] ${codigo}: no se pudo abrir la incidencia del arrepentimiento:`, describir(error));
    const numero = pedidoParaMostrar(solicitud.pedido);
    return `Crédito Harper: no se pudo abrir la incidencia${numero ? ` del pedido ${numero}` : ""} (${describir(error)}). Marcá Incidencia_abierta a mano en Créditos.`;
  }
}

/**
 * Lo que queda bloqueado para revisión hasta que haya política (L1–L5): el
 * crédito usado en este pedido (no vuelve solo) y el crédito de este pedido
 * que la cuenta ya gastó en otra compra (no se recupera solo; la cuenta no
 * puede usar más crédito mientras tanto). Solo lee y avisa.
 */
async function bloqueosParaRevisar(numero: string, email: string, d: DependenciasIncidencia): Promise<string[]> {
  const notas: string[] = [];
  const usado = (await d.uso.almacen.delPedido(numero)).filter((u) => u.email === email && (u.estado === "Usado" || u.estado === "Reservado" || u.estado === "A revisar"));
  const montoUsado = usado.reduce((t, u) => t + u.monto, 0);
  if (montoUsado > 0) {
    notas.push(
      `El pedido ${numero} se pagó en parte con ${formatearPrecio(montoUsado)} de Crédito Harper: si se concreta la devolución, ese crédito no vuelve solo (la regla está pendiente). Queda descontado; si corresponde devolverlo, marcá «Devuelto» su uso en Créditos.`
    );
  }
  const saldo = await leerSaldoDeCredito(email, d.uso);
  if (saldo.sobregiro > 0) {
    notas.push(
      `La cuenta ya usó ${formatearPrecio(saldo.sobregiro)} más de lo que ahora tiene disponible (gastó crédito de este pedido): no se recupera solo, porque la regla está pendiente. Hasta que decidas, no puede usar más Crédito Harper.`
    );
  }
  return notas;
}
