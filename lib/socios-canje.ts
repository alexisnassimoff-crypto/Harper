import { randomUUID } from "node:crypto";
import { ErrorAirtable, TABLAS } from "./airtable";
import { cerrojoDesdeEntorno, type Cerrojo } from "./cerrojo";
import { marcarCompra } from "./clientes";
import { enviarMail, mailAvisoInterno, mailConfirmacion, mailsConfigurados, type DatosMail } from "./mails";
import { canjePendiente, registrarCanje, socioPorId, type CuentaSocio } from "./socios-cuenta";
import { numeroDeSocio } from "./socios-alta";
import { descontarStock } from "./stock";

/**
 * El canje del segundo par que no cuesta nada (Ale, 30/10/2026: el socio entra
 * con su mail y canjea sus anteojos). Si el pedido es solo el segundo par, con
 * el envío gratis de socio, el total es $ 0 y no pasa por Mercado Pago: se
 * confirma acá, con los mismos pasos que el webhook después de un pago
 * (stock, mails), y queda anotado en la fila del socio.
 *
 * El orden cuida que nunca se canjee dos veces:
 *  1. Un cerrojo por socio (Redis), para dos pestañas que confirman a la vez.
 *  2. La fila del socio leída de nuevo: si ya lo canjeó, no sigue.
 *  3. El pedido, ya pagado (no hay nada que cobrar).
 *  4. El canje anotado en la fila del socio. Si eso falla, el pedido se anula
 *     y el socio puede volver a intentar: su segundo par sigue pendiente.
 *  5. Stock, compra del cliente y mails. Si algo de esto falla, el canje ya
 *     está hecho: Harper se entera en el aviso y lo completa a mano.
 */

const TTL_CANJE_MS = 60_000;

export type ResultadoCanjeSinPago = { ok: true } | { ok: false; status: number; error: string };

export async function confirmarCanjeSinPago(d: {
  socio: CuentaSocio;
  numero: string;
  /** Crea la fila del pedido, ya pagada. */
  crearPedido: () => Promise<{ id: string }>;
  /** Anula el pedido si el canje no se pudo anotar. */
  anularPedido: (pedidoId: string) => Promise<void>;
  clienteId: string;
  datosMail: Omit<DatosMail, "canje">;
  cerrojo?: Cerrojo | null;
  ahora?: () => Date;
}): Promise<ResultadoCanjeSinPago> {
  const cerrojo = d.cerrojo === undefined ? cerrojoDesdeEntorno() : d.cerrojo;
  const ahora = d.ahora ?? (() => new Date());
  const clave = `harper:socio:${d.socio.id}`;
  const nonce = randomUUID();

  if (cerrojo && !(await cerrojo.tomar(clave, nonce, TTL_CANJE_MS))) {
    return { ok: false, status: 409, error: "Ya estamos confirmando tu canje. Esperá un momento y revisá tu mail." };
  }

  try {
    const fresco = await socioPorId(d.socio.id);
    if (!fresco || !canjePendiente(fresco)) {
      return { ok: false, status: 409, error: "Tu segundo par ya está canjeado. Lo ves en tu membresía." };
    }

    const pedido = await d.crearPedido();

    try {
      const canje = await registrarCanje({ socioId: fresco.id, numeroPedido: d.numero });
      if (canje.estado !== "registrado" && canje.estado !== "ya") {
        await d.anularPedido(pedido.id);
        return { ok: false, status: 409, error: "Tu segundo par ya está canjeado. Lo ves en tu membresía." };
      }
    } catch (error) {
      await d.anularPedido(pedido.id);
      throw error;
    }

    // Desde acá el canje está hecho: lo que falle se avisa, no se deshace.
    const problemas: string[] = [];
    try {
      await descontarStock(d.datosMail.items, d.numero, { cerrojo });
    } catch (error) {
      console.error("[socios] no se pudo descontar el stock del canje", d.numero, error);
      problemas.push("No se pudo descontar el stock: descontalo a mano.");
    }
    try {
      await marcarCompra(d.clienteId, ahora().toISOString());
    } catch (error) {
      if (!(error instanceof ErrorAirtable && error.status === 404)) console.error("[socios] no se pudo marcar la compra del canje", error);
    }

    const datos: DatosMail = {
      ...d.datosMail,
      canje: { numero: fresco.numero, plan: fresco.plan },
      alerta: [d.datosMail.alerta, ...problemas].filter(Boolean).join(" ") || null,
    };
    const pedidoUrl = `https://airtable.com/${process.env.AIRTABLE_BASE_ID}/${TABLAS.pedidos}/${pedido.id}`;
    for (const envio of [datos.cliente.email ? mailConfirmacion(datos) : null, mailAvisoInterno({ ...datos, pedidoUrl })]) {
      if (!envio) continue;
      try {
        const salio = await enviarMail(envio);
        if (!salio && mailsConfigurados()) console.error(`[socios] no salió el mail "${envio.asunto}" del canje ${d.numero}`);
      } catch (error) {
        console.error(`[socios] falló el mail "${envio.asunto}" del canje ${d.numero}`, error);
      }
    }

    console.info(`[socios] ${numeroDeSocio(fresco.numero)} canjeó su segundo par en el pedido ${d.numero}`);
    return { ok: true };
  } finally {
    if (cerrojo) await cerrojo.soltar(clave, nonce).catch(() => {});
  }
}
