import { randomUUID } from "node:crypto";
import { ErrorAirtable, TABLAS } from "./airtable";
import { cerrojoDesdeEntorno, type Cerrojo } from "./cerrojo";
import { marcarCompra } from "./clientes";
import { enviarMail, mailAvisoInterno, mailConfirmacion, mailsConfigurados, type DatosMail } from "./mails";
import { descontarStock } from "./stock";
import { saldoDe, type SuscriptorDelCarrito } from "./suscriptores";
import {
  anularMovimiento,
  claveSuscriptor,
  devolverCupon,
  estaActivo,
  movimientosDe,
  registrarCupon,
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
 *  3. El pedido, ya pagado (no hay nada que cobrar).
 *  4. El cupón y después el saldo anotados. Si algo de eso falla, se deshace
 *     lo anotado y el pedido se anula: el comprador puede volver a intentar.
 *  5. Stock, compra del cliente y mails. Si algo de esto falla, el pedido ya
 *     está hecho: Harper se entera en el aviso y lo completa a mano.
 */

const TTL_SIN_PAGO_MS = 60_000;

export type ResultadoSinPago = { ok: true } | { ok: false; status: number; error: string };

export async function confirmarPedidoSinPago(d: {
  suscriptor: Pick<SuscriptorDelCarrito, "id" | "email">;
  numero: string;
  /** Lo que el carrito usó, en pesos: tiene que seguir estando. */
  cupon: number;
  saldoUsado: number;
  /** Crea la fila del pedido, ya pagada. */
  crearPedido: () => Promise<{ id: string }>;
  /** Anula el pedido si el cupón o el saldo no se pudieron anotar. */
  anularPedido: (pedidoId: string) => Promise<void>;
  clienteId: string;
  datosMail: Omit<DatosMail, "suscriptor">;
  cerrojo?: Cerrojo | null;
  ahora?: () => Date;
}): Promise<ResultadoSinPago> {
  const cerrojo = d.cerrojo === undefined ? cerrojoDesdeEntorno() : d.cerrojo;
  const ahora = d.ahora ?? (() => new Date());
  const clave = claveSuscriptor(d.suscriptor.id);
  const nonce = randomUUID();

  if (cerrojo && !(await cerrojo.tomar(clave, nonce, TTL_SIN_PAGO_MS))) {
    return { ok: false, status: 409, error: "Ya estamos confirmando tu pedido. Esperá un momento y revisá tu mail." };
  }

  try {
    const [fresco, movimientos] = await Promise.all([suscriptorPorId(d.suscriptor.id), movimientosDe(d.suscriptor.id)]);
    if (!fresco || !estaActivo(fresco) || fresco.email !== d.suscriptor.email.toLowerCase()) {
      return { ok: false, status: 409, error: "Tu suscripción cambió. Entrá de nuevo con tu mail y revisá tu carrito." };
    }
    if (saldoDe(movimientos, ahora()).disponible < d.saldoUsado || (d.cupon > 0 && !tieneCupon(fresco))) {
      return { ok: false, status: 409, error: TEXTOS.suscriptores.saldoCambio };
    }

    const pedido = await d.crearPedido();
    const datosMovimiento = { suscriptorId: fresco.id, email: fresco.email, numeroPedido: d.numero, fecha: ahora() };
    let cuponAnotado = false;

    try {
      if (d.cupon > 0) {
        const cupon = await registrarCupon({ suscriptorId: fresco.id, numeroPedido: d.numero });
        if (cupon.estado !== "registrado" && cupon.estado !== "ya") {
          await d.anularPedido(pedido.id);
          return { ok: false, status: 409, error: TEXTOS.suscriptores.saldoCambio };
        }
        cuponAnotado = true;
      }
      if (d.saldoUsado > 0) await registrarUso({ ...datosMovimiento, monto: d.saldoUsado });
    } catch (error) {
      // Lo que se haya anotado se deshace: el pedido no existió.
      if (cuponAnotado) await devolverCupon({ suscriptorId: fresco.id, numeroPedido: d.numero }).catch(() => {});
      await deshacerUso(fresco.id, d.numero).catch(() => {});
      await d.anularPedido(pedido.id);
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
      suscriptor: { email: fresco.email, cupon: d.cupon, saldoUsado: d.saldoUsado, cashback: 0, cashbackDesde: null },
      alerta: [d.datosMail.alerta, ...problemas].filter(Boolean).join(" ") || null,
    };
    const pedidoUrl = `https://airtable.com/${process.env.AIRTABLE_BASE_ID}/${TABLAS.pedidos}/${pedido.id}`;
    for (const envio of [datos.cliente.email ? mailConfirmacion(datos) : null, mailAvisoInterno({ ...datos, pedidoUrl })]) {
      if (!envio) continue;
      try {
        const salio = await enviarMail(envio);
        if (!salio && mailsConfigurados()) console.error(`[suscriptores] no salió el mail "${envio.asunto}" del pedido ${d.numero}`);
      } catch (error) {
        console.error(`[suscriptores] falló el mail "${envio.asunto}" del pedido ${d.numero}`, error);
      }
    }

    console.info(`[suscriptores] el pedido ${d.numero} se pagó entero con saldo`);
    return { ok: true };
  } finally {
    if (cerrojo) await cerrojo.soltar(clave, nonce).catch(() => {});
  }
}

/** Anula el Uso de ese pedido, si llegó a crearse. */
async function deshacerUso(suscriptorId: string, numeroPedido: string) {
  const uso = (await movimientosDe(suscriptorId)).find((m) => m.tipo === "Uso" && m.pedido === numeroPedido && !m.anulado);
  if (uso) await anularMovimiento(uso.id, `Anulado: el pedido ${numeroPedido} no se pudo completar.`);
}
