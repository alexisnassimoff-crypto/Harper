/**
 * Qué hacer con una notificación de pago, según el estado del pedido.
 *
 * Es una función pura, separada del webhook, para poder probar cada caso sin
 * Mercado Pago ni Airtable. El webhook la llama y ejecuta lo que decida.
 *
 * El caso que motivó separarla: un pedido ya "pagado" recibía la notificación
 * de OTRO pago (uno rechazado minutos después, o un segundo intento aprobado)
 * y el código lo pisaba a "rechazado", le mandaba al cliente un mail de "no
 * pudimos procesar tu pago" aunque sí se le había cobrado, o descontaba el
 * stock dos veces. Un pedido confirmado no se toca más: cualquier otro pago
 * sobre él lo mira una persona.
 */

/** Estados en los que la venta ya está confirmada y cobrada. */
export const ESTADOS_CONFIRMADOS = new Set(["pagado", "preparando", "enviado", "entregado"]);

/** Estados finales en los que el pedido ya fue procesado de alguna forma. */
export const ESTADOS_PROCESADOS = new Set([...ESTADOS_CONFIRMADOS, "cancelado", "rechazado"]);

/** Prefijo con el que se marca un pago que tiene que mirar una persona. */
export const MARCA_REVISAR = "revisar:";

export type Accion =
  /** Ya se procesó exactamente esta notificación: no hacer nada. */
  | "duplicado"
  /** Pago aprobado sobre un pedido abierto: confirmar, descontar stock, avisar. */
  | "aprobar"
  /** Pago rechazado sobre un pedido abierto: marcarlo y avisarle al cliente. */
  | "rechazar"
  /** Pago en proceso: registrar y esperar la próxima notificación. */
  | "esperar"
  /** Otro pago, no aprobado, sobre un pedido ya confirmado o cancelado: no tocarlo. */
  | "ignorar"
  /** Otro pago APROBADO sobre un pedido ya confirmado o cancelado: posible doble cobro. */
  | "revisar_segundo_pago";

export function decidirNotificacion(datos: {
  /** Estado del pedido en Airtable. */
  estadoActual: string;
  /** El MP_payment_id guardado en el pedido, si hay. */
  pagoRegistrado?: string;
  /** El MP_status guardado en el pedido, si hay. */
  mpStatusActual?: string;
  /** El pago que llega ahora. */
  pagoId: string;
  statusPago: string;
}): Accion {
  const { estadoActual, pagoRegistrado, mpStatusActual = "", pagoId, statusPago } = datos;
  const mismoPago = pagoRegistrado === pagoId;
  const aprobado = statusPago === "approved";

  // Exactamente este pago ya se procesó (o ya quedó marcado para revisar):
  // Mercado Pago reintenta y manda duplicados, y no hay nada nuevo que hacer.
  if (mismoPago && (ESTADOS_PROCESADOS.has(estadoActual) || mpStatusActual.startsWith(MARCA_REVISAR))) {
    return "duplicado";
  }

  // Un segundo pago ya marcado para revisar se identifica por su id dentro
  // del MP_status: así sus propios reintentos no vuelven a mandar la alerta.
  if (!mismoPago && mpStatusActual.startsWith(MARCA_REVISAR) && mpStatusActual.includes(pagoId)) {
    return "duplicado";
  }

  // Pedido confirmado o cancelado: ningún otro pago lo cambia de estado.
  if (!mismoPago && (ESTADOS_CONFIRMADOS.has(estadoActual) || estadoActual === "cancelado")) {
    return aprobado ? "revisar_segundo_pago" : "ignorar";
  }

  if (aprobado) return "aprobar";
  if (statusPago === "rejected" || statusPago === "cancelled") return "rechazar";
  return "esperar";
}
