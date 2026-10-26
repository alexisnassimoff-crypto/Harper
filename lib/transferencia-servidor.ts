import { createHmac, timingSafeEqual } from "node:crypto";
import { escaparFormula, listRecords, modoFixtures, TABLAS, type AirtableRecord } from "./airtable";
import type { PagoMP } from "./mercadopago";
import { avisarCompraAMeta } from "./meta";
import { esPedidoPorTransferencia } from "./transferencia";
import { ESTADOS_CONFIRMADOS } from "./webhook-decision";
import { dependenciasReales, procesarNotificacion, type Dependencias, type FilaPedido } from "./webhook-proceso";

/**
 * El enlace con el que Harper confirma que recibió una transferencia.
 *
 * Lleva el número de pedido y una firma (HMAC) hecha con el token de
 * Airtable: quien no tiene ese token no puede fabricar el enlace de otro
 * pedido, y quien lo tiene ya puede cambiar cualquier pedido en Airtable. No
 * hace falta otra variable en Vercel.
 *
 * Abrir el enlace no confirma nada: muestra el pedido y un botón. Así, un
 * lector de mails que abre los enlaces solo para revisarlos no da por pagado
 * un pedido.
 */

const PROPOSITO = "harper:confirmar-transferencia:";

function clave(): string | null {
  return process.env.AIRTABLE_TOKEN?.trim() || (modoFixtures() ? "fixtures" : null);
}

function firmar(numero: string, secreto: string) {
  return createHmac("sha256", secreto).update(`${PROPOSITO}${numero}`).digest("base64url");
}

export function firmaValida(numero: string | null | undefined, firma: string | null | undefined): boolean {
  const secreto = clave();
  if (!secreto || !numero || !firma) return false;

  const esperada = Buffer.from(firmar(numero, secreto));
  const recibida = Buffer.from(firma);
  return esperada.length === recibida.length && timingSafeEqual(esperada, recibida);
}

/** La página para confirmar el pago. Null si no hay con qué firmar. */
export function enlaceDeConfirmacion(sitio: string, numero: string): string | null {
  const secreto = clave();
  if (!secreto) return null;
  const query = new URLSearchParams({ pedido: numero, firma: firmar(numero, secreto) });
  return `${sitio}/transferencia/confirmar?${query}`;
}

/** El pedido completo por su número, sin cache. */
export async function pedidoPorNumero(numero: string): Promise<AirtableRecord<FilaPedido & { Fecha?: string }> | null> {
  const registros = await listRecords<FilaPedido & { Fecha?: string }>(TABLAS.pedidos, {
    filterByFormula: `{Numero} = "${escaparFormula(numero)}"`,
    maxRecords: 1,
    revalidate: 0,
  });
  return registros[0] ?? null;
}

export type ResultadoConfirmacion =
  /** Quedó pagado: stock descontado, mails enviados. */
  | { estado: "confirmada" }
  /** Ya estaba confirmado: no se hizo nada. */
  | { estado: "ya-confirmada" }
  | { estado: "no-existe" }
  | { estado: "no-es-transferencia" }
  /** Cancelado o rechazado: no se confirma sin que una persona lo reabra. */
  | { estado: "cerrado"; estadoPedido: string }
  /** Quedó marcado para revisar (por ejemplo, un dato que Airtable rechazó). */
  | { estado: "revisar"; detalle: string }
  /** Algo transitorio (Airtable, Redis, un mail): se puede volver a intentar. */
  | { estado: "reintentar"; detalle: string };

/**
 * Harper recibió la transferencia: el pedido sigue el mismo camino que un
 * pago aprobado de Mercado Pago (lib/webhook-proceso.ts), con un pago que no
 * viene de Mercado Pago sino de esta confirmación, por el total del pedido.
 * Así se descuenta el stock una sola vez, el pedido pasa a "pagado", salen
 * los mails de siempre y la compra va a Meta, con las mismas protecciones
 * contra dobles confirmaciones (un segundo click es un duplicado).
 */
export async function confirmarTransferencia(
  numero: string,
  sitio: string,
  extra: Partial<Dependencias> = {}
): Promise<ResultadoConfirmacion> {
  const pedido = await pedidoPorNumero(numero);
  if (!pedido) return { estado: "no-existe" };
  if (!esPedidoPorTransferencia(pedido.fields)) return { estado: "no-es-transferencia" };

  const estadoPedido = pedido.fields.Estado ?? "pendiente";
  if (estadoPedido === "cancelado" || estadoPedido === "rechazado") return { estado: "cerrado", estadoPedido };

  const pagoId = `transferencia-${pedido.id}`;
  if (ESTADOS_CONFIRMADOS.has(estadoPedido) && pedido.fields.MP_payment_id === pagoId && pedido.fields.MP_status === "approved") {
    return { estado: "ya-confirmada" };
  }

  const pago: PagoMP = {
    id: pagoId,
    status: "approved",
    transaction_amount: pedido.fields.Total,
    external_reference: pedido.id,
  };

  try {
    const resultado = await procesarNotificacion(
      pagoId,
      dependenciasReales(sitio, { obtenerPago: async () => pago, alConfirmar: avisarCompraAMeta, ...extra })
    );
    const cuerpo = resultado.cuerpo;

    if (resultado.status !== 200) {
      return { estado: "reintentar", detalle: cuerpo.sinCerrojo ? "falta Redis (el cerrojo)" : "el pedido está ocupado" };
    }
    if (cuerpo.estado === "pagado") return { estado: "confirmada" };
    if (cuerpo.duplicado) return { estado: "ya-confirmada" };
    if (cuerpo.estado === "revisar") return { estado: "revisar", detalle: String(cuerpo.fallo ?? "revisar el pedido en Airtable") };
    return { estado: "revisar", detalle: JSON.stringify(cuerpo) };
  } catch (error) {
    console.error(`[transferencia] no se pudo confirmar el pedido ${numero}:`, error);
    return { estado: "reintentar", detalle: error instanceof Error ? error.message.slice(0, 200) : String(error) };
  }
}
