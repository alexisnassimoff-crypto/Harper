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
 *
 * Acá también vive el formato de la MARCA DE RECLAMO que una instancia deja en
 * `MP_status` mientras procesa un pago (ver lib/webhook-lock.ts), porque la
 * decisión depende de ella: una marca vigente significa "otra instancia está
 * en eso, esperá"; una marca vencida, "esa instancia murió a mitad de camino,
 * retomá lo que falta".
 */

/** Estados en los que la venta ya está confirmada y cobrada. */
export const ESTADOS_CONFIRMADOS = new Set(["pagado", "preparando", "enviado", "entregado"]);

/** Estados finales en los que el pedido ya fue procesado de alguna forma. */
export const ESTADOS_PROCESADOS = new Set([...ESTADOS_CONFIRMADOS, "cancelado", "rechazado"]);

/** Prefijo con el que se marca un pago que tiene que mirar una persona. */
export const MARCA_REVISAR = "revisar:";

/** Estados de un pago en Mercado Pago que todavía no son finales. */
export const ESTADOS_MP_ABIERTOS = new Set(["pending", "in_process", "authorized", "in_mediation"]);

/**
 * Cuánto vale una marca de reclamo. Pasado este tiempo se la considera de una
 * instancia muerta y el próximo reintento retoma el pedido.
 *
 * Tiene que ser MAYOR que el tiempo máximo que puede vivir una ejecución del
 * webhook (`maxDuration`, 60 s): así, cuando una marca vence, la instancia que
 * la escribió ya no puede estar corriendo, y no hay dos vivas sobre el mismo
 * pedido. Si se sube `maxDuration`, subir esto también.
 */
export const VIGENCIA_RECLAMO_MS = 120_000;

const PREFIJO_RECLAMO = "procesando";

/** La marca que una instancia deja en MP_status mientras procesa un pago. */
export type Reclamo = {
  /** El pago que se está procesando. */
  pagoId: string;
  /** Identificador único de la instancia (y del intento). */
  nonce: string;
  /** Cuándo se escribió, en ms desde epoch. 0 en marcas del formato viejo. */
  desde: number;
  /** Pasos con efecto ya cumplidos (p. ej. "mails"), para no repetirlos al retomar. */
  pasos: string[];
};

/** `procesando <pagoId> <nonce> <desde> [paso,paso]` */
export function marcaDeReclamo(reclamo: Reclamo): string {
  const pasos = reclamo.pasos.length > 0 ? ` ${reclamo.pasos.join(",")}` : "";
  return `${PREFIJO_RECLAMO} ${reclamo.pagoId} ${reclamo.nonce} ${reclamo.desde}${pasos}`;
}

/** Interpreta una marca de reclamo. `null` si el MP_status no es una. */
export function leerReclamo(mpStatus: string | undefined): Reclamo | null {
  if (!mpStatus?.startsWith(`${PREFIJO_RECLAMO} `)) return null;

  const partes = mpStatus.trim().split(/\s+/);
  const pagoId = partes[1];
  const nonce = partes[2];
  if (!pagoId || !nonce) return null;

  // Las marcas del formato anterior no traían fecha: se tratan como vencidas,
  // así un pedido que quedó trabado con una se retoma solo.
  const desde = Number(partes[3]);

  return {
    pagoId,
    nonce,
    desde: Number.isFinite(desde) ? desde : 0,
    pasos: partes[4] ? partes[4].split(",").filter(Boolean) : [],
  };
}

/** Verdadero si el MP_status es una marca de reclamo (de cualquier instancia). */
export function esMarcaDeReclamo(mpStatus: string | undefined) {
  return leerReclamo(mpStatus) !== null;
}

/** Una marca sigue valiendo mientras no haya pasado `VIGENCIA_RECLAMO_MS`. */
export function reclamoVigente(
  reclamo: Reclamo | null,
  ahora: number,
  vigenciaMs: number = VIGENCIA_RECLAMO_MS
) {
  return reclamo !== null && ahora - reclamo.desde < vigenciaMs;
}

export type Accion =
  /** Ya se procesó exactamente esta notificación: no hacer nada. */
  | "duplicado"
  /** Pago aprobado sobre un pedido abierto (o retomado tras una caída): confirmar, descontar stock, avisar. */
  | "aprobar"
  /** Pago rechazado sobre un pedido abierto: marcarlo y avisarle al cliente. */
  | "rechazar"
  /** Pago en proceso: registrar y esperar la próxima notificación. */
  | "esperar"
  /** Otro pago, no aprobado, sobre un pedido ya confirmado o cancelado: no tocarlo. */
  | "ignorar"
  /** Otro pago APROBADO sobre un pedido ya confirmado o cancelado: posible doble cobro. */
  | "revisar_segundo_pago"
  /** Otra instancia tiene el pedido reclamado y la marca está vigente: esperar a que termine. */
  | "en_curso";

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
  /** Reloj, para decidir si una marca de reclamo sigue vigente. */
  ahora?: number;
}): Accion {
  const { estadoActual, pagoRegistrado, mpStatusActual = "", pagoId, statusPago } = datos;
  const ahora = datos.ahora ?? Date.now();
  const mismoPago = pagoRegistrado === pagoId;
  const aprobado = statusPago === "approved";
  const rechazado = statusPago === "rejected" || statusPago === "cancelled";

  // ---- Marca de reclamo de otra instancia ----
  const reclamo = leerReclamo(mpStatusActual);

  if (reclamo) {
    if (reclamoVigente(reclamo, ahora)) return "en_curso";

    // Vencida: la instancia que la escribió se cayó a mitad de camino.
    if (reclamo.pagoId === pagoId) {
      // Si mientras tanto una persona cerró el pedido a mano, se respeta.
      if (estadoActual === "cancelado" || estadoActual === "rechazado") return "duplicado";

      // Se retoma por el mismo camino: cada paso sabe saltarse lo ya hecho
      // (el stock por la marca en la variante, el Estado porque ya está, los
      // mails por los pasos anotados en la marca).
      if (aprobado) return "aprobar";
      if (rechazado) return "rechazar";
      return "esperar";
    }

    // Marca vencida de OTRO pago: se decide como si no estuviera. Lo que ese
    // intento haya alcanzado a hacer queda protegido por las mismas marcas.
  }

  // ---- Sin reclamo: decisión por el estado del pedido ----

  // Pagado pero sin cerrar: el MP_status quedó vacío o en un estado intermedio
  // del pago (otra instancia pisó la marca de la que aprobaba, y la soltó sin
  // cerrar nada). La que aprobaba se retiró; se completa lo que falte.
  if (
    mismoPago &&
    aprobado &&
    ESTADOS_CONFIRMADOS.has(estadoActual) &&
    (mpStatusActual === "" || ESTADOS_MP_ABIERTOS.has(mpStatusActual))
  ) {
    return "aprobar";
  }

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
  if (rechazado) return "rechazar";
  return "esperar";
}
