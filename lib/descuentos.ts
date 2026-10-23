import { listRecords, TABLAS } from "./airtable";
import { aNumero } from "./formato";
import type { Categoria } from "./tipos";

/**
 * Descuentos por cantidad.
 *
 * Existen por una razón concreta: el envío se paga por paquete, no por unidad.
 * Cuatro estuches entran en el mismo sobre que uno y cuestan lo mismo de
 * despachar, así que cada unidad extra amortiza un costo ya pagado. Sin esto,
 * un estuche de $6.990 con $10.100 de envío no lo compra nadie.
 *
 * Los tramos viven en Airtable para que se ajusten sin tocar código: el margen
 * depende del tipo de cambio y se comprime cuando el dólar salta.
 */

/** Cada cuántos segundos se refrescan los tramos. */
const REVALIDATE = 60;

export type Tramo = {
  categoria: Categoria;
  desdeUnidades: number;
  porcentaje: number;
};

type FilaDescuento = {
  Categoria?: string;
  Desde_unidades?: number;
  Porcentaje?: number;
  Activo?: boolean;
};

/**
 * Lee los tramos activos.
 *
 * Si Airtable no responde devuelve una lista vacía, y entonces no se aplica
 * ningún descuento: se cobra el precio de lista. Degradar hacia el precio
 * completo es lo correcto — cobrar de más se reclama, cobrar de menos no se
 * descubre nunca.
 */
export async function getTramos(): Promise<Tramo[]> {
  try {
    return await leerTramos(REVALIDATE);
  } catch (error) {
    console.error("[descuentos] no se pudieron leer los tramos:", error);
    return [];
  }
}

/**
 * Los tramos para cobrar: sin cache y sin red de contención.
 *
 * Al cobrar, degradar al precio de lista NO es lo correcto: el comprador vio
 * $170.810 en el carrito y Mercado Pago le cobraría $179.800. Si Airtable no
 * responde, esto explota, el checkout contesta "problema momentáneo" y el
 * comprador reintenta en un minuto con el precio que vio.
 */
export async function getTramosParaCobrar(): Promise<Tramo[]> {
  return leerTramos(0);
}

async function leerTramos(revalidate: number): Promise<Tramo[]> {
  const filas = await listRecords<FilaDescuento>(TABLAS.descuentos, { revalidate });

  return filas
    .filter((f) => f.fields.Activo)
    .flatMap((f): Tramo[] => {
      const categoria = f.fields.Categoria?.trim() as Categoria | undefined;
      const desdeUnidades = aNumero(f.fields.Desde_unidades, 0);
      const porcentaje = aNumero(f.fields.Porcentaje, 0);

      if (!categoria || desdeUnidades < 1) return [];
      // Un 0 no descuenta nada y un 100 regalaría el producto.
      if (porcentaje <= 0 || porcentaje >= 100) return [];

      return [{ categoria, desdeUnidades, porcentaje }];
    })
    .sort((a, b) => a.desdeUnidades - b.desdeUnidades);
}

/**
 * El descuento que corresponde a una cantidad de unidades de una categoría.
 *
 * Gana el tramo más alto que se alcance. Devuelve 0 si no llega a ninguno.
 */
export function porcentajeParaCantidad(
  tramos: Tramo[],
  categoria: Categoria,
  unidades: number
): number {
  let mejor = 0;

  for (const tramo of tramos) {
    if (tramo.categoria !== categoria) continue;
    if (unidades < tramo.desdeUnidades) continue;
    if (tramo.porcentaje > mejor) mejor = tramo.porcentaje;
  }

  return mejor;
}

/**
 * El próximo tramo al que podría llegar, para poder empujarlo desde el carrito.
 *
 * Devuelve `null` si ya está en el tramo más alto o si no hay ninguno arriba.
 */
export function proximoTramo(
  tramos: Tramo[],
  categoria: Categoria,
  unidades: number
): { faltan: number; porcentaje: number } | null {
  const actual = porcentajeParaCantidad(tramos, categoria, unidades);

  const candidatos = tramos
    .filter((t) => t.categoria === categoria)
    .filter((t) => t.desdeUnidades > unidades && t.porcentaje > actual)
    .sort((a, b) => a.desdeUnidades - b.desdeUnidades);

  const siguiente = candidatos[0];
  if (!siguiente) return null;

  return {
    faltan: siguiente.desdeUnidades - unidades,
    porcentaje: siguiente.porcentaje,
  };
}

/** Aplica un porcentaje a un precio, redondeando a peso entero. */
export function conDescuento(precio: number, porcentaje: number) {
  if (porcentaje <= 0) return precio;
  return Math.round(precio * (1 - porcentaje / 100));
}
