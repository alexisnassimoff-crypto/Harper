import { randomUUID } from "node:crypto";
import { ErrorAirtable, TABLAS } from "./airtable";
import { cerrojoDesdeEntorno, type Cerrojo } from "./cerrojo";
import { marcarCompra } from "./clientes";
import { enviarMail, mailAlertaInterna, mailAvisoInterno, mailConfirmacion, mailsConfigurados, type DatosMail } from "./mails";
import { descontarStock } from "./stock";
import { saldoDe, type SuscriptorDelCarrito } from "./suscriptores";
import {
  anularMovimiento,
  claveSuscriptor,
  devolverCupon,
  estaActivo,
  movimientosDe,
  registrarCupon,
  reservasDe,
  registrarUso,
  suscriptorPorId,
  tieneCupon,
} from "./suscriptores-cuenta";
import { TEXTOS } from "./textos";

/**
 * El pedido que un suscriptor paga entero con su saldo (Ale, 03/11/2026: el
 * cashback puede cubrir toda la compra). Con el envío gratis de suscriptor,
 * el total es $ 0 y no pasa por Mercado Pago: se confirma acá, con los mismos
 * pasos que el webhook después de un pago (stock, mails), y quedan anotados el
 * saldo usado y, si lo usó, el cupón. Es lo que era el canje sin pago de los
 * socios, generalizado.
 *
 * El orden cuida que nunca se use dos veces el mismo saldo ni el mismo cupón:
 *  1. Un cerrojo por suscriptor (Redis), el mismo que toma el webhook al
 *     anotar sus beneficios: dos pestañas, o este pedido y un pago que llega,
 *     no los tocan a la vez.
 *  2. La fila y el saldo leídos de nuevo: si ya no alcanza (o el cupón ya no
 *     está), no sigue y el comprador revisa el total.
 *  3. El pedido, en «pendiente»: si el proceso se corta acá, o si después no
 *     se puede anular, queda un pedido pendiente que nadie despacha, nunca
 *     uno «pagado» sin el saldo descontado.
 *  4. El cupón y después el saldo anotados, y recién entonces el pedido pasa
 *     a «pagado». Si algo de eso falla, se deshace lo anotado y el pedido se
 *     anula: el comprador puede volver a intentar.
 *  5. Stock, compra del cliente y mails. Si algo de esto falla, el pedido ya
 *     está hecho: Harper se entera en el aviso y lo completa a mano.
 *
 * Crédito Harper (paso 4, solo con HARPER_CREDITO_ACTIVO=1): si el pedido
 * queda en $ 0 por el crédito, `credito` confirma su uso (ya reservado por el
 * checkout, con la cuenta tomada) junto con el cupón y el saldo, y lo libera
 * si algo falla. Puede no haber suscriptor: quien compró sin suscribirse paga
 * solo con su crédito.
 */

const TTL_SIN_PAGO_MS = 60_000;

export type ResultadoSinPago =
  | { ok: true }
  /** `creditoCambio`: el Crédito Harper no se pudo confirmar; el comprador revisa el total. */
  | { ok: false; status: number; error: string; creditoCambio?: boolean };

/**
 * Qué está mal en la confirmación del Crédito Harper del pedido en $ 0, o
 * null si está bien: el uso de ESE pedido, «Usado», por el importe reservado,
 * sin dejar la cuenta con más usado que ganado. Cualquier otra respuesta
 * («sin-uso», «decidido», «ocupado», otro pedido, otro monto, nada) es un
 * fallo: sin esto, el pedido saldría pagado sin crédito que lo cubra.
 */
export function problemaDeLaConfirmacion(resultado: unknown, numero: string, monto: number): string | null {
  if (!resultado || typeof resultado !== "object") return "no devolvió ningún resultado";
  const r = resultado as { estado?: unknown; uso?: { pedido?: unknown; monto?: unknown; estado?: unknown } | null; sobregiro?: unknown };
  if (r.estado !== "confirmado" && r.estado !== "ya") return `devolvió «${String(r.estado)}»`;
  if (!r.uso || typeof r.uso !== "object") return "no devolvió el uso";
  if (r.uso.pedido !== numero.trim()) return `el uso es del pedido ${String(r.uso.pedido)}`;
  if (r.uso.estado !== "Usado") return `el uso quedó «${String(r.uso.estado)}»`;
  if (r.uso.monto !== monto) return `el uso es de $ ${String(r.uso.monto)} y se reservaron $ ${monto}`;
  if (r.sobregiro !== 0) return `la cuenta quedó con $ ${String(r.sobregiro)} más usado que ganado`;
  return null;
}

/** El Crédito Harper del pedido en $ 0 no se confirmó como se reservó. */
class CreditoSinConfirmar extends Error {
  constructor(readonly problema: string) {
    super(`El Crédito Harper no se confirmó: ${problema}`);
    this.name = "CreditoSinConfirmar";
  }
}

export async function confirmarPedidoSinPago(d: {
  /** Null: compra sin suscripción, pagada con Crédito Harper. */
  suscriptor: Pick<SuscriptorDelCarrito, "id" | "email"> | null;
  /** El Crédito Harper usado (paso 4): confirmarlo o liberarlo, con la cuenta ya tomada por el checkout. */
  credito?: { monto: number; confirmar: () => Promise<unknown>; liberar: () => Promise<void> } | null;
  numero: string;
  /** Lo que el carrito usó, en pesos: tiene que seguir estando. */
  cupon: number;
  saldoUsado: number;
  /** Crea la fila del pedido, en «pendiente». */
  crearPedido: () => Promise<{ id: string }>;
  /** Lo pasa a «pagado», con el cupón y el saldo ya anotados. */
  marcarPagado: (pedidoId: string) => Promise<void>;
  /** Anula el pedido si el cupón o el saldo no se pudieron anotar. */
  anularPedido: (pedidoId: string) => Promise<void>;
  clienteId: string;
  datosMail: Omit<DatosMail, "suscriptor">;
  cerrojo?: Cerrojo | null;
  /** Quien llama ya tiene el cerrojo del suscriptor (el checkout): no se vuelve a tomar. */
  cerrojoTomado?: boolean;
  ahora?: () => Date;
  /** Cómo salen los mails (en las pruebas, uno de mentira). */
  enviarMail?: (envio: Parameters<typeof enviarMail>[0]) => Promise<boolean>;
}): Promise<ResultadoSinPago> {
  const cerrojo = d.cerrojo === undefined ? cerrojoDesdeEntorno() : d.cerrojo;
  const ahora = d.ahora ?? (() => new Date());
  const clave = d.suscriptor ? claveSuscriptor(d.suscriptor.id) : null;
  const nonce = randomUUID();
  const tomarlo = Boolean(cerrojo) && Boolean(clave) && !d.cerrojoTomado;

  if (tomarlo && cerrojo && clave && !(await cerrojo.tomar(clave, nonce, TTL_SIN_PAGO_MS))) {
    return { ok: false, status: 409, error: "Ya estamos confirmando tu pedido. Esperá un momento y revisá tu mail." };
  }

  try {
    let fresco: Awaited<ReturnType<typeof suscriptorPorId>> = null;
    if (d.suscriptor) {
      const [leido, movimientos, reservas] = await Promise.all([
        suscriptorPorId(d.suscriptor.id),
        movimientosDe(d.suscriptor.id),
        reservasDe(d.suscriptor.id, ahora()),
      ]);
      fresco = leido;
      // Dado de baja también puede: paga con el saldo que ya ganó (sin cupón, que el carrito no le da).
      if (!fresco || fresco.email !== d.suscriptor.email.toLowerCase()) {
        return { ok: false, status: 409, error: "Tu suscripción cambió. Entrá de nuevo con tu mail y revisá tu carrito." };
      }
      // Sin lo que apartan sus otros pedidos sin pagar (un link de Mercado Pago abierto con el mismo saldo).
      const disponible = saldoDe(movimientos, ahora()).disponible - reservas.saldo;
      if (disponible < d.saldoUsado || (d.cupon > 0 && (!tieneCupon(fresco) || !estaActivo(fresco) || reservas.cupon))) {
        return { ok: false, status: 409, error: TEXTOS.suscriptores.saldoCambio };
      }
    } else if (d.cupon > 0 || d.saldoUsado > 0 || !d.credito) {
      return { ok: false, status: 400, error: "No hay nada que cobrar en tu carrito." };
    }

    const pedido = await d.crearPedido();
    let cuponAnotado = false;

    try {
      if (fresco) {
        const datosMovimiento = { suscriptorId: fresco.id, email: fresco.email, numeroPedido: d.numero, fecha: ahora() };
        if (d.cupon > 0) {
          const cupon = await registrarCupon({ suscriptorId: fresco.id, numeroPedido: d.numero });
          if (cupon.estado !== "registrado" && cupon.estado !== "ya") {
            await d.credito?.liberar().catch(() => {});
            await d.anularPedido(pedido.id);
            return { ok: false, status: 409, error: TEXTOS.suscriptores.saldoCambio };
          }
          cuponAnotado = true;
        }
        if (d.saldoUsado > 0) await registrarUso({ ...datosMovimiento, monto: d.saldoUsado });
      }
      if (d.credito) {
        // No alcanza con llamarla: el uso tiene que quedar «Usado» para este
        // pedido y por lo reservado. Si no, no se marca pagado ni se despacha.
        let confirmado: unknown;
        try {
          confirmado = await d.credito.confirmar();
        } catch (error) {
          throw new CreditoSinConfirmar(`falló al confirmar (${error instanceof Error ? error.message : String(error)})`);
        }
        const problema = problemaDeLaConfirmacion(confirmado, d.numero, d.credito.monto);
        if (problema) throw new CreditoSinConfirmar(problema);
      }
      await d.marcarPagado(pedido.id);
    } catch (error) {
      // Lo que se haya anotado se deshace: el pedido no existió.
      if (fresco) {
        if (cuponAnotado) await devolverCupon({ suscriptorId: fresco.id, numeroPedido: d.numero }).catch(() => {});
        await deshacerUso(fresco.id, d.numero).catch(() => {});
      }
      if (d.credito) await d.credito.liberar().catch(() => {});
      await d.anularPedido(pedido.id);
      if (error instanceof CreditoSinConfirmar) {
        console.error(`[suscriptores] el pedido en $ 0 ${d.numero} no se completó: ${error.message}`);
        await avisarCreditoSinConfirmar(d, error.problema);
        return { ok: false, status: 409, error: TEXTOS.suscriptores.cuenta.credito.cambio, creditoCambio: true };
      }
      throw error;
    }

    // Desde acá el pedido está hecho: lo que falle se avisa, no se deshace.
    const problemas: string[] = [];
    try {
      await descontarStock(d.datosMail.items, d.numero, { cerrojo });
    } catch (error) {
      console.error("[suscriptores] no se pudo descontar el stock del pedido sin pago", d.numero, error);
      problemas.push("No se pudo descontar el stock: descontalo a mano.");
    }
    try {
      await marcarCompra(d.clienteId, ahora().toISOString());
    } catch (error) {
      if (!(error instanceof ErrorAirtable && error.status === 404)) console.error("[suscriptores] no se pudo marcar la compra", error);
    }

    const datos: DatosMail = {
      ...d.datosMail,
      ...(fresco ? { suscriptor: { email: fresco.email, cupon: d.cupon, saldoUsado: d.saldoUsado, cashback: 0, cashbackDesde: null } } : {}),
      alerta: [d.datosMail.alerta, ...problemas].filter(Boolean).join(" ") || null,
    };
    const pedidoUrl = `https://airtable.com/${process.env.AIRTABLE_BASE_ID}/${TABLAS.pedidos}/${pedido.id}`;
    for (const envio of [datos.cliente.email ? mailConfirmacion(datos) : null, mailAvisoInterno({ ...datos, pedidoUrl })]) {
      if (!envio) continue;
      try {
        const salio = await (d.enviarMail ?? enviarMail)(envio);
        if (!salio && mailsConfigurados()) console.error(`[suscriptores] no salió el mail "${envio.asunto}" del pedido ${d.numero}`);
      } catch (error) {
        console.error(`[suscriptores] falló el mail "${envio.asunto}" del pedido ${d.numero}`, error);
      }
    }

    console.info(`[suscriptores] el pedido ${d.numero} se pagó entero con ${d.credito ? "saldo o Crédito Harper" : "saldo"}`);
    return { ok: true };
  } finally {
    if (tomarlo && cerrojo && clave) await cerrojo.soltar(clave, nonce).catch(() => {});
  }
}

/** Avisa a Harper que un pedido en $ 0 con Crédito Harper no se completó (no se despachó nada). */
async function avisarCreditoSinConfirmar(d: Parameters<typeof confirmarPedidoSinPago>[0], problema: string) {
  const envio = mailAlertaInterna({
    config: d.datosMail.config,
    asunto: `REVISAR Crédito Harper — pedido ${d.numero} en $ 0 sin confirmar`,
    lineas: [
      `El pedido ${d.numero} se iba a pagar entero con Crédito Harper ($ ${d.credito?.monto ?? 0}), pero el uso no se confirmó: ${problema}.`,
      "No se marcó pagado ni se despachó: el pedido quedó anulado, se liberó la reserva del crédito y se deshizo lo anotado. Revisá la fila del uso en Créditos.",
    ],
  });
  try {
    const salio = await (d.enviarMail ?? enviarMail)(envio);
    if (!salio && mailsConfigurados()) console.error(`[suscriptores] no salió el aviso del crédito sin confirmar del pedido ${d.numero}`);
  } catch (error) {
    console.error(`[suscriptores] falló el aviso del crédito sin confirmar del pedido ${d.numero}`, error);
  }
}

/** Anula el Uso de ese pedido, si llegó a crearse. */
async function deshacerUso(suscriptorId: string, numeroPedido: string) {
  const uso = (await movimientosDe(suscriptorId)).find((m) => m.tipo === "Uso" && m.pedido === numeroPedido && !m.anulado);
  if (uso) await anularMovimiento(uso.id, `Anulado: el pedido ${numeroPedido} no se pudo completar.`);
}
