import { ErrorAirtable, getRecord, TABLAS, updateRecords } from "./airtable";
import { aNumero } from "./formato";
import type { ItemResuelto } from "./tipos";

/**
 * Campo de Variantes con los números de pedido que ya descontaron stock de esa
 * variante (texto largo, separados por coma, el más reciente primero).
 *
 * Es lo que hace idempotente el descuento: se escribe en la MISMA llamada que
 * el nuevo stock, así no existe un instante en que el stock esté descontado y
 * la marca no. Un reintento del webhook (otra instancia, o la misma después de
 * una caída) ve la marca y no vuelve a descontar.
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
  /**
   * Verdadero si Airtable no tiene el campo de marcas y hubo que escribir el
   * stock solo. Se vende igual, pero sin la protección contra el doble
   * descuento: hay que crear el campo.
   */
  sinMarca: boolean;
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
 * Se llama desde el webhook, con el pago aprobado. Airtable no tiene
 * transacciones: la variante se lee y se escribe. Si dos pedidos DISTINTOS se
 * aprueban sobre la misma variante en el mismo segundo, uno puede pisar al
 * otro (el stock queda uno más alto de lo real); con el volumen de la tienda
 * es despreciable y el stock se audita contra la tabla de Pedidos. Lo que acá
 * sí se asegura es que el MISMO pedido no descuente dos veces, que es el caso
 * frecuente: los reintentos de Mercado Pago.
 *
 * Nunca deja el stock en negativo.
 */
export async function descontarStock(items: ItemResuelto[], numeroPedido: string): Promise<ResultadoStock> {
  // Por variante, por si el mismo color viene en dos renglones.
  const porVariante = new Map<string, number>();
  for (const item of items) {
    porVariante.set(item.varianteId, (porVariante.get(item.varianteId) ?? 0) + item.cantidad);
  }

  const actualizaciones: { id: string; fields: FilaVariante }[] = [];
  const omitidas: string[] = [];

  for (const [varianteId, cantidad] of porVariante) {
    try {
      const actual = await getRecord<FilaVariante>(TABLAS.variantes, varianteId);
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
    } catch (error) {
      // Una variante borrada no puede frenar la confirmación de una venta.
      console.error(`[stock] no se pudo leer la variante ${varianteId}:`, error);
    }
  }

  const descontadas = actualizaciones.map((a) => a.id);

  if (actualizaciones.length === 0) {
    return { descontadas, omitidas, sinMarca: false };
  }

  try {
    await updateRecords<FilaVariante>(TABLAS.variantes, actualizaciones);
    return { descontadas, omitidas, sinMarca: false };
  } catch (error) {
    if (!esCampoDeMarcasDesconocido(error)) throw error;

    // La base todavía no tiene el campo: se descuenta igual (la venta ya está
    // cobrada) y se avisa fuerte. Sin la marca, un reintento podría volver a
    // descontar este pedido.
    console.error(
      `[stock] la tabla Variantes no tiene el campo "${CAMPO_MARCAS}": el descuento del pedido ${numeroPedido} queda sin marcar. Crear el campo (texto largo) para que un reintento no lo repita.`
    );

    await updateRecords<FilaVariante>(
      TABLAS.variantes,
      actualizaciones.map((a) => ({ id: a.id, fields: { Stock: a.fields.Stock } }))
    );

    return { descontadas, omitidas, sinMarca: true };
  }
}

/** Airtable contesta 422 UNKNOWN_FIELD_NAME cuando se escribe un campo que no existe. */
function esCampoDeMarcasDesconocido(error: unknown) {
  return (
    error instanceof ErrorAirtable &&
    error.status === 422 &&
    /unknown field name/i.test(error.message) &&
    error.message.includes(CAMPO_MARCAS)
  );
}
