import crypto from "node:crypto";
import { getRecord, TABLAS, updateRecord, type AirtableRecord } from "./airtable";
import { leerReclamo, marcaDeReclamo, type Reclamo } from "./webhook-decision";

/**
 * Reclamo de un pedido entre instancias del servidor.
 *
 * Mercado Pago manda más de una notificación por pago (`payment.created` y
 * `payment.updated`, con segundos de diferencia) y reintenta las que no
 * contestan rápido. En Vercel cada notificación puede caer en una instancia
 * distinta, así que un candado en memoria no alcanza.
 *
 * LO QUE ESTO ES Y LO QUE NO ES. Airtable no tiene transacciones ni escritura
 * condicional, así que acá NO hay exclusión mutua garantizada: ninguna
 * secuencia de "escribir, esperar, releer" sobre Airtable puede asegurar que
 * una sola instancia crea tener el pedido. Lo que hay es una defensa en tres
 * capas, y la que de verdad protege la plata y el stock es la tercera:
 *
 *  1. Reclamo con vencimiento. Cada instancia escribe en `MP_status` una marca
 *     con el pago, un nonce y la hora; espera más de lo que tarda una
 *     escritura; relee. Si la marca que quedó no es la suya, otra llegó
 *     después y es ella la que sigue. Mientras una marca está vigente
 *     (`VIGENCIA_RECLAMO_MS`, más que lo que puede vivir una ejecución), las
 *     demás notificaciones esperan o le piden a Mercado Pago que reintente.
 *     Cuando vence, la instancia que la escribió ya no puede estar viva, y el
 *     próximo reintento retoma.
 *
 *  2. Verificación antes de cada efecto. Antes de descontar stock, de marcar
 *     pagado, de mandar mails y de cerrar, la instancia relee el pedido y
 *     comprueba que la marca siga siendo la suya. Si otra la pisó, se retira
 *     sin tocar nada más.
 *
 *  3. Idempotencia de cada efecto, que es lo que vale aunque las dos capas
 *     anteriores fallen: el stock se descuenta UNA vez por pedido y variante
 *     porque la variante guarda qué pedidos ya la descontaron, en la MISMA
 *     escritura que el stock (lib/stock.ts); el Estado "pagado" se puede
 *     escribir dos veces sin daño; los mails quedan anotados como paso
 *     cumplido en la marca; la Conversions API deduplica por event_id.
 *
 *  4. Nunca un 200 a ciegas. Una instancia que se retira (perdió el reclamo o
 *     le pisaron la marca) vuelve a mirar el pedido y contesta 200 solo si SU
 *     pago quedó resuelto; si no, 503, y Mercado Pago reintenta esa
 *     notificación. Si algo falla con la marca puesta, 500, y Mercado Pago
 *     reintenta. Así, lo que una instancia no termina lo termina otra.
 *
 * El residuo honesto: si dos instancias pasan la capa 1 a la vez (la segunda
 * leyó antes de que la primera escribiera y escribió después de que la primera
 * releyó, es decir, más de `ESPERA_RECLAMO_MS` entre su lectura y su
 * escritura), puede repetirse un mail, o puede salirle al cliente un mail de
 * "pago rechazado" (por un intento anterior que llegó tarde) antes del de
 * confirmación. Ni el cobro, ni el stock, ni el Estado final se pierden ni se
 * duplican, siempre que Mercado Pago reintente lo que recibe 503 o 500 (lo
 * hace cada 15 minutos).
 *
 * Si se quiere exclusión mutua real hace falta un almacenamiento con
 * escritura condicional (p. ej. Redis `SET NX`); ver la propuesta en el PR.
 */

/** Cuánto se espera entre escribir la marca y releer. Más que una escritura. */
export const ESPERA_RECLAMO_MS = 1_000;

/** El tiempo y la espera, inyectables para que las pruebas sean deterministas. */
export type Reloj = {
  ahora(): number;
  dormir(ms: number): Promise<void>;
};

export const RELOJ_REAL: Reloj = {
  ahora: () => Date.now(),
  dormir: (ms) => new Promise((resolver) => setTimeout(resolver, ms)),
};

type ConReclamo = { MP_status?: string };

function esNuestra(mpStatus: string | undefined, reclamo: Reclamo) {
  const actual = leerReclamo(mpStatus);
  return actual !== null && actual.nonce === reclamo.nonce;
}

/**
 * Escribe nuestra marca, espera, relee. `gano` si la marca que quedó es la
 * nuestra. Devuelve el pedido releído, para decidir sobre datos frescos.
 *
 * `pasos` son los pasos que hereda de una marca vencida del mismo pago, para
 * que al retomar no se repitan.
 */
export async function reclamarPedido<T extends ConReclamo>(
  pedidoId: string,
  pagoId: string,
  opciones: { esperaMs?: number; reloj?: Reloj; pasos?: string[] } = {}
): Promise<{ gano: boolean; reclamo: Reclamo; pedido: AirtableRecord<T> }> {
  const reloj = opciones.reloj ?? RELOJ_REAL;

  const reclamo: Reclamo = {
    pagoId,
    nonce: crypto.randomUUID().replace(/-/g, "").slice(0, 12),
    desde: reloj.ahora(),
    pasos: opciones.pasos ?? [],
  };

  await updateRecord<T>(TABLAS.pedidos, pedidoId, { MP_status: marcaDeReclamo(reclamo) } as Partial<T>);
  await reloj.dormir(opciones.esperaMs ?? ESPERA_RECLAMO_MS);

  const pedido = await getRecord<T>(TABLAS.pedidos, pedidoId);
  return { gano: esNuestra(pedido.fields.MP_status, reclamo), reclamo, pedido };
}

/**
 * Relee el pedido antes de un paso con efecto: ¿la marca sigue siendo la
 * nuestra? Si no, otra instancia nos pisó y hay que retirarse. Devuelve la
 * marca tal como está (con los pasos ya anotados) y el pedido fresco.
 */
export async function verificarReclamo<T extends ConReclamo>(
  pedidoId: string,
  reclamo: Reclamo
): Promise<{ vigente: boolean; reclamo: Reclamo; pedido: AirtableRecord<T> }> {
  const pedido = await getRecord<T>(TABLAS.pedidos, pedidoId);
  const actual = leerReclamo(pedido.fields.MP_status);
  const vigente = actual !== null && actual.nonce === reclamo.nonce;

  return { vigente, reclamo: vigente ? actual! : reclamo, pedido };
}

/**
 * Anota un paso cumplido en la marca, junto con otros campos del pedido si
 * hace falta (p. ej. Estado "pagado"), en una sola escritura.
 */
export async function anotarPaso<T extends ConReclamo>(
  pedidoId: string,
  reclamo: Reclamo,
  paso: string,
  extra: Partial<T> = {}
): Promise<Reclamo> {
  const nuevo: Reclamo = {
    ...reclamo,
    pasos: reclamo.pasos.includes(paso) ? reclamo.pasos : [...reclamo.pasos, paso],
  };

  await updateRecord<T>(TABLAS.pedidos, pedidoId, {
    ...extra,
    MP_status: marcaDeReclamo(nuevo),
  } as Partial<T>);

  return nuevo;
}
