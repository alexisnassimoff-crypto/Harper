import type { Envase, Paquete } from "./tipos";

/**
 * Convierte los productos de un pedido en la caja que se va a despachar.
 *
 * Correo Argentino cotiza sobre un solo bulto con peso y tres medidas, así que
 * hay que decidir cómo se combinan varias unidades. El modelo es apilarlas:
 *
 *   peso  = suma de todos los pesos
 *   largo = el mayor de los largos
 *   ancho = el mayor de los anchos
 *   alto  = la SUMA de los altos
 *
 * Es deliberadamente conservador. Cuando el pedido mezcla productos de tamaños
 * distintos, la caja calculada sale más grande que la real y el envío cotiza un
 * poco de más. Ese error va a favor de Harper: cobrar de menos significa poner
 * plata de su bolsillo en cada envío, y eso no se descubre hasta el cierre del
 * mes.
 *
 * Al final se suma el embalaje. Lo que viaja nunca es el producto desnudo: va
 * dentro de un sobre o una caja, y Correo Argentino cobra por peso volumétrico
 * —el espacio que ocupa el bulto, no lo que pesa—, así que ignorar el embalaje
 * es cobrarle al cliente menos de lo que después paga Harper.
 */

/** Límites que impone la API de MiCorreo. */
export const LIMITES = {
  pesoMinG: 1,
  pesoMaxG: 25_000,
  ladoMaxCm: 150,
} as const;

export type ItemAEmpacar = {
  envase: Envase | null;
  cantidad: number;
};

/** Lo que agrega el embalaje al bulto. Sale de la tabla Config. */
export type Embalaje = {
  margenCm: number;
  pesoG: number;
};

const SIN_EMBALAJE: Embalaje = { margenCm: 0, pesoG: 0 };

/**
 * Arma el paquete, o `null` si no se puede cotizar.
 *
 * Devuelve `null` —y quien llame cae al precio plano— cuando:
 *  - a algún producto le faltan el peso o las medidas en Airtable
 *  - el pedido excede los límites de la API
 *
 * Repartir un pedido en varios bultos es otro problema, y no vale la pena
 * resolverlo antes de que exista un pedido que lo necesite.
 */
export function armarPaquete(
  items: ItemAEmpacar[],
  embalaje: Embalaje = SIN_EMBALAJE
): Paquete | null {
  if (items.length === 0) return null;

  let pesoG = 0;
  let largoCm = 0;
  let anchoCm = 0;
  let altoCm = 0;

  for (const item of items) {
    // Un solo producto sin medidas cargadas invalida todo el cálculo.
    if (!item.envase) return null;

    const cantidad = Math.max(1, Math.floor(item.cantidad));

    pesoG += item.envase.pesoG * cantidad;
    largoCm = Math.max(largoCm, item.envase.largoCm);
    anchoCm = Math.max(anchoCm, item.envase.anchoCm);
    altoCm += item.envase.altoCm * cantidad;
  }

  // El embalaje se suma UNA sola vez: el sobre es uno solo, lleve una unidad o
  // cinco. Sumarlo por producto inflaría el bulto de cada pedido múltiple.
  const margen = Math.max(0, embalaje.margenCm);

  const paquete: Paquete = {
    // La API trabaja en gramos enteros y centímetros con un decimal.
    pesoG: Math.max(LIMITES.pesoMinG, Math.round(pesoG + Math.max(0, embalaje.pesoG))),
    largoCm: redondear(largoCm + margen),
    anchoCm: redondear(anchoCm + margen),
    altoCm: redondear(altoCm + margen),
  };

  // Los límites se validan sobre el bulto FINAL, no sobre los productos pelados:
  // un pedido al borde de los 150 cm pasaría este control y lo rechazaría la API.
  return dentroDeLimites(paquete) ? paquete : null;
}

/** Verdadero si el paquete es despachable como un solo bulto. */
export function dentroDeLimites(paquete: Paquete) {
  return (
    paquete.pesoG >= LIMITES.pesoMinG &&
    paquete.pesoG <= LIMITES.pesoMaxG &&
    paquete.largoCm > 0 &&
    paquete.anchoCm > 0 &&
    paquete.altoCm > 0 &&
    paquete.largoCm <= LIMITES.ladoMaxCm &&
    paquete.anchoCm <= LIMITES.ladoMaxCm &&
    paquete.altoCm <= LIMITES.ladoMaxCm
  );
}

function redondear(cm: number) {
  return Math.round(cm * 10) / 10;
}
