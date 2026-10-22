import crypto from "node:crypto";
import { getRecord, TABLAS, updateRecord, type AirtableRecord } from "./airtable";

/**
 * Reclamo de un pedido entre instancias del servidor.
 *
 * Mercado Pago manda más de una notificación por pago (`payment.created` y
 * `payment.updated`, con segundos de diferencia) y reintenta las que no
 * contestan rápido. En Vercel cada notificación puede caer en una instancia
 * distinta, así que un candado en memoria no alcanza: dos instancias leían el
 * pedido "pendiente" a la vez, las dos lo pasaban a "pagado", las dos
 * descontaban el stock y las dos mandaban los mails.
 *
 * Airtable no tiene transacciones ni escritura condicional, así que el
 * reclamo se hace en dos pasos: cada instancia escribe una marca única en
 * `MP_status`, espera más de lo que tarda una escritura, y vuelve a leer. La
 * marca que quedó es la del último que escribió: esa instancia gana y las
 * demás se retiran. Para que dos ganen, la segunda tendría que escribir
 * después de que la primera releyó, y la primera relee recién después de
 * esperar `ESPERA_RECLAMO_MS`, que es más que la latencia de una escritura.
 *
 * Si la instancia ganadora se cae a mitad de camino, la marca queda y el
 * pedido sigue "pendiente": el próximo reintento de Mercado Pago vuelve a
 * reclamar y procesa. Nada queda trabado para siempre.
 */

/** Cuánto se espera entre escribir la marca y releer. Más que una escritura. */
export const ESPERA_RECLAMO_MS = 700;

const PREFIJO = "procesando";

export function marcaDeReclamo(pagoId: string, nonce: string) {
  return `${PREFIJO} ${pagoId} ${nonce}`;
}

/** Verdadero si el MP_status es una marca de reclamo (de cualquier instancia). */
export function esMarcaDeReclamo(mpStatus: string | undefined) {
  return Boolean(mpStatus?.startsWith(`${PREFIJO} `));
}

export async function reclamarPedido<T extends { MP_status?: string }>(
  pedidoId: string,
  pagoId: string,
  esperaMs: number = ESPERA_RECLAMO_MS
): Promise<{ gano: boolean; pedido: AirtableRecord<T> }> {
  const marca = marcaDeReclamo(pagoId, crypto.randomUUID());

  await updateRecord<T>(TABLAS.pedidos, pedidoId, { MP_status: marca } as Partial<T>);
  await new Promise((resolver) => setTimeout(resolver, esperaMs));

  const pedido = await getRecord<T>(TABLAS.pedidos, pedidoId);
  return { gano: pedido.fields.MP_status === marca, pedido };
}
