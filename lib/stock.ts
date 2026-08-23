import { getRecord, TABLAS, updateRecords } from "./airtable";
import { aNumero } from "./formato";
import type { ItemResuelto } from "./tipos";

type FilaVariante = { Stock?: number };

/**
 * Descuenta el stock de las variantes vendidas.
 *
 * Se llama una sola vez por pedido, desde el webhook y solo con el pago
 * aprobado. Airtable no tiene transacciones, así que se lee y se escribe:
 * con el volumen de esta tienda la probabilidad de colisión es despreciable,
 * y el stock real se audita contra la tabla de Pedidos.
 *
 * Nunca deja el stock en negativo.
 */
export async function descontarStock(items: ItemResuelto[]) {
  const actualizaciones: { id: string; fields: FilaVariante }[] = [];

  for (const item of items) {
    try {
      const actual = await getRecord<FilaVariante>(TABLAS.variantes, item.varianteId);
      const stockActual = aNumero(actual.fields.Stock, 0);

      actualizaciones.push({
        id: item.varianteId,
        fields: { Stock: Math.max(0, stockActual - item.cantidad) },
      });
    } catch (error) {
      // Una variante borrada no puede frenar la confirmación de una venta.
      console.error(`[stock] no se pudo leer la variante ${item.varianteId}:`, error);
    }
  }

  if (actualizaciones.length > 0) {
    await updateRecords<FilaVariante>(TABLAS.variantes, actualizaciones);
  }
}
