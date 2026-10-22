import { ErrorAirtable, getRecord, TABLAS, updateRecords } from "./airtable";
import {
  claveVariante,
  ErrorCerrojoOcupado,
  ESPERA_VARIANTE_MS,
  soltarSinFallar,
  tomarConEspera,
  TTL_VARIANTE_MS,
  type Cerrojo,
} from "./cerrojo";
import { aNumero } from "./formato";
import type { ItemResuelto } from "./tipos";
import { RELOJ_REAL, type Reloj } from "./webhook-lock";

/**
 * Campo de Variantes con los números de pedido que ya descontaron stock de esa
 * variante (texto largo, separados por coma, el más reciente primero).
 *
 * Es lo que hace idempotente el descuento: se escribe en la MISMA llamada que
 * el nuevo stock, así no existe un instante en que el stock esté descontado y
 * la marca no. Un reintento del webhook (otra instancia, o la misma después de
 * una caída) ve la marca y no vuelve a descontar.
 *
 * Si Airtable rechaza la escritura (el campo no existe, tiene otro tipo, o
 * cualquier otro error) NO se descuenta nada: el error sube y el webhook deja
 * el pedido marcado para revisar o lo reintenta. Nunca un descuento sin marca.
 */
export const CAMPO_MARCAS = "Stock_pedidos";

/** Cuántos pedidos recientes recuerda cada variante. Sobra para los reintentos. */
const MAXIMO_MARCAS = 50;

type FilaVariante = { Stock?: number; Stock_pedidos?: string };

export type ResultadoStock = {
  /** Variantes a las que se les descontó stock en esta llamada. */
  descontadas: string[];
  /** Variantes que ya tenían la marca de este pedido: no se tocaron. */
  omitidas: string[];
  /** Variantes que ya no existen en Airtable (borradas a mano): no hay qué descontar. */
  noEncontradas: string[];
};

/** Los números de pedido anotados en una variante. */
export function leerMarcas(valor: string | undefined): string[] {
  return (valor ?? "")
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Descuenta el stock de las variantes vendidas, una sola vez por pedido.
 *
 * Se llama desde el webhook, con el pago aprobado y el pedido reclamado.
 *
 * Dos protecciones, para dos problemas distintos:
 *  - La marca en la variante (`Stock_pedidos`), que evita que el MISMO pedido
 *    descuente dos veces (los reintentos de Mercado Pago, una caída a mitad).
 *  - El cerrojo por variante (Redis), que evita que dos pedidos DISTINTOS
 *    aprobados a la vez sobre el mismo color se pisen la lectura: cada uno
 *    toma la llave de sus variantes antes de leer y la suelta después de
 *    escribir. Si otro pedido la tiene y no la suelta en `ESPERA_VARIANTE_MS`,
 *    se corta como transitorio y el webhook reintenta. Sin Redis configurado
 *    (`cerrojo` null) esa protección no existe y se avisa en /api/health.
 *
 * Nunca deja el stock en negativo.
 */
export async function descontarStock(
  items: ItemResuelto[],
  numeroPedido: string,
  opciones: { cerrojo?: Cerrojo | null; reloj?: Reloj } = {}
): Promise<ResultadoStock> {
  const cerrojo = opciones.cerrojo ?? null;
  const reloj = opciones.reloj ?? RELOJ_REAL;

  // Por variante, por si el mismo color viene en dos renglones. En orden fijo,
  // para que dos pedidos que comparten variantes pidan las llaves en el mismo
  // orden y no se esperen mutuamente.
  const porVariante = new Map<string, number>();
  for (const item of items) {
    porVariante.set(item.varianteId, (porVariante.get(item.varianteId) ?? 0) + item.cantidad);
  }
  const variantes = [...porVariante.keys()].sort();

  const llaves: { clave: string; nonce: string }[] = [];

  try {
    if (cerrojo) {
      for (const varianteId of variantes) {
        const clave = claveVariante(varianteId);
        const nonce = await tomarConEspera(cerrojo, clave, TTL_VARIANTE_MS, { esperaMaxMs: ESPERA_VARIANTE_MS, reloj });
        if (!nonce) throw new ErrorCerrojoOcupado(clave);
        llaves.push({ clave, nonce });
      }
    }

    return await descontarConLlaves(variantes, porVariante, numeroPedido);
  } finally {
    // Se sueltan en orden inverso; un fallo al soltar no tapa el resultado.
    for (const { clave, nonce } of llaves.reverse()) {
      await soltarSinFallar(cerrojo!, clave, nonce);
    }
  }
}

async function descontarConLlaves(
  variantes: string[],
  porVariante: Map<string, number>,
  numeroPedido: string
): Promise<ResultadoStock> {
  const actualizaciones: { id: string; fields: FilaVariante }[] = [];
  const omitidas: string[] = [];
  const noEncontradas: string[] = [];

  for (const varianteId of variantes) {
    const cantidad = porVariante.get(varianteId) ?? 0;
    let actual;

    try {
      actual = await getRecord<FilaVariante>(TABLAS.variantes, varianteId);
    } catch (error) {
      // Una variante borrada a mano (404) no puede frenar la confirmación de
      // una venta ya cobrada: se la salta y se deja constancia. Cualquier otro
      // error (429, 5xx, red) SUBE: el stock es el primer paso del webhook y la
      // marca de reclamo sigue puesta, así que el reintento de Mercado Pago
      // retoma y descuenta lo que faltó.
      if (error instanceof ErrorAirtable && error.status === 404) {
        console.error(`[stock] la variante ${varianteId} del pedido ${numeroPedido} no existe: no se descuenta`);
        noEncontradas.push(varianteId);
        continue;
      }
      throw error;
    }

    const marcas = leerMarcas(actual.fields.Stock_pedidos);

    if (marcas.includes(numeroPedido)) {
      omitidas.push(varianteId);
      continue;
    }

    const stockActual = aNumero(actual.fields.Stock, 0);

    actualizaciones.push({
      id: varianteId,
      fields: {
        Stock: Math.max(0, stockActual - cantidad),
        Stock_pedidos: [numeroPedido, ...marcas].slice(0, MAXIMO_MARCAS).join(", "),
      },
    });
  }

  const descontadas = actualizaciones.map((a) => a.id);

  if (actualizaciones.length > 0) {
    // Stock y marca en la misma escritura. Si Airtable la rechaza, no se
    // descuenta nada: el error sube tal cual.
    await updateRecords<FilaVariante>(TABLAS.variantes, actualizaciones);
  }

  return { descontadas, omitidas, noEncontradas };
}
