import { listRecords, TABLAS } from "./airtable";
import { getProductos } from "./catalogo";
import { categoriaDesdeTexto } from "./categorias";
import { planesDeSocio } from "./socios";
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
  /**
   * En la escala «llevá N, pagá M» (Ale, 30/10/2026): cuántas paga de las
   * `desdeUnidades` que lleva. El porcentaje sale exacto de esa cuenta
   * (3x2 = 33,33… %), sin redondear a un decimal.
   */
  paga?: number;
};

type FilaDescuento = {
  Categoria?: string;
  Desde_unidades?: number;
  Porcentaje?: number;
  Paga_unidades?: number;
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
    const [tramos, productos] = await Promise.all([leerTramos(REVALIDATE), getProductos()]);
    return tramosVigentes(tramos, planesDeSocio(productos) !== null);
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
 *
 * Vienen tal cual están en Airtable: el que cobra los pasa por
 * `tramosVigentes` con los productos que ya leyó (lib/pedidos.ts).
 */
export async function getTramosParaCobrar(): Promise<Tramo[]> {
  return leerTramos(0);
}

/**
 * Los tramos que corren de verdad. Con Socios Harper a la venta, el «llevá N,
 * pagá M» ya no se usa (Ale, 30/10/2026: la membresía reemplaza al 3x2; no
 * quiere que parezca que se regala mercadería), aunque en Airtable sigan
 * cargados. Después, en cada categoría con escala, manda la escala.
 */
export function tramosVigentes(tramos: Tramo[], conSocios: boolean): Tramo[] {
  return conEscala(conSocios ? tramos.filter((t) => !t.paga) : tramos).sort((a, b) => a.desdeUnidades - b.desdeUnidades);
}

async function leerTramos(revalidate: number): Promise<Tramo[]> {
  const filas = await listRecords<FilaDescuento>(TABLAS.descuentos, { revalidate });

  const tramos = filas
    .filter((f) => f.fields.Activo)
    .flatMap((f): Tramo[] => {
      const categoria = categoriaDesdeTexto(f.fields.Categoria);
      const desdeUnidades = aNumero(f.fields.Desde_unidades, 0);
      const paga = aNumero(f.fields.Paga_unidades, 0);

      if (!categoria || desdeUnidades < 1) return [];

      // «Llevá 3, pagá 2»: paga menos de las que lleva, y al menos una.
      if (paga > 0) {
        if (!Number.isInteger(paga) || !Number.isInteger(desdeUnidades) || paga >= desdeUnidades) return [];
        return [{ categoria, desdeUnidades, porcentaje: (1 - paga / desdeUnidades) * 100, paga }];
      }

      const porcentaje = aNumero(f.fields.Porcentaje, 0);
      // Un 0 no descuenta nada y un 100 regalaría el producto.
      if (porcentaje <= 0 || porcentaje >= 100) return [];

      return [{ categoria, desdeUnidades, porcentaje }];
    });

  return tramos;
}

/**
 * En una categoría con escala «llevá N, pagá M», manda la escala: los tramos
 * por porcentaje de esa categoría no se aplican (en anteojos eran 2+ 5 %, 4+
 * 10 %…). Las demás categorías siguen con sus porcentajes.
 */
export function conEscala(tramos: Tramo[]): Tramo[] {
  const conPaga = new Set(tramos.filter((t) => t.paga).map((t) => t.categoria));
  return tramos.filter((t) => t.paga || !conPaga.has(t.categoria));
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

/**
 * Lo que se paga por varias unidades con el descuento, redondeado una sola
 * vez sobre el total: tres pares de $ 89.900 con «llevá 3, pagá 2» son
 * $ 179.800 justos (de a uno, $ 59.933 × 3 daría $ 179.799).
 */
export function totalConDescuento(lista: number, porcentaje: number) {
  return conDescuento(lista, porcentaje);
}

/** Los tramos de la escala «llevá N, pagá M» de una categoría, de menor a mayor. */
export function escalaDe(tramos: Tramo[], categoria: Categoria): (Tramo & { paga: number })[] {
  return tramos
    .filter((t): t is Tramo & { paga: number } => t.categoria === categoria && typeof t.paga === "number")
    .sort((a, b) => a.desdeUnidades - b.desdeUnidades);
}

export type OfertaDeEscala = {
  /** El escalón en el que está (null si todavía no llegó al primero). */
  actual: { lleva: number; paga: number } | null;
  /** El próximo escalón, con cuántas faltan; null si ya está en el último. */
  siguiente: { lleva: number; paga: number; faltan: number } | null;
};

/**
 * Dónde está un carrito en la escala «llevá N, pagá M» y cuánto le falta
 * para el próximo escalón. Null si la categoría no tiene escala.
 */
export function ofertaDeEscala(tramos: Tramo[], categoria: Categoria, unidades: number): OfertaDeEscala | null {
  const escala = escalaDe(tramos, categoria);
  if (escala.length === 0) return null;
  const cantidad = Math.max(0, Math.floor(unidades));
  const alcanzados = escala.filter((t) => cantidad >= t.desdeUnidades);
  const actual = alcanzados[alcanzados.length - 1] ?? null;
  const proximo = escala.find((t) => t.desdeUnidades > cantidad) ?? null;
  return {
    actual: actual ? { lleva: actual.desdeUnidades, paga: actual.paga } : null,
    siguiente: proximo ? { lleva: proximo.desdeUnidades, paga: proximo.paga, faltan: proximo.desdeUnidades - cantidad } : null,
  };
}

/** "33,3", "5": un porcentaje para mostrar, con un decimal como mucho. */
export function textoPorcentaje(porcentaje: number): string {
  return porcentaje.toLocaleString("es-AR", { maximumFractionDigits: 1 });
}

/** "llevá 3 y pagá 2, o llevá 5 y pagá 3": la escala de una categoría en una frase; null sin escala. */
export function fraseDeLaEscala(tramos: Tramo[], categoria: Categoria): string | null {
  const escala = escalaDe(tramos, categoria).map((t) => `llevá ${t.desdeUnidades} y pagá ${t.paga}`);
  if (escala.length === 0) return null;
  return escala.length === 1 ? escala[0] : `${escala.slice(0, -1).join(", ")}, o ${escala[escala.length - 1]}`;
}

/** "Llevá 3, pagá 2" o "10 % OFF": cómo se nombra un tramo. */
export function nombreDelTramo(tramo: Pick<Tramo, "desdeUnidades" | "porcentaje" | "paga">): string {
  return tramo.paga ? `Llevá ${tramo.desdeUnidades}, pagá ${tramo.paga}` : `${textoPorcentaje(tramo.porcentaje)} % OFF`;
}

/**
 * La promoción que se le cuenta al público: solo el primer tramo de la
 * categoría (en anteojos, el segundo par), en una línea. Los tramos mayores
 * se siguen aplicando en el servidor, pero no se publicitan: una tabla hasta
 * 15 unidades hace que la tienda parezca mayorista.
 *
 * Solo presentación. Nunca arma un total combinado: el servidor cobra cada
 * producto a su propio precio de lista, y un total calculado con el precio de
 * esta ficha no coincidiría si en el carrito hay otro producto.
 */
export type OfertaCantidad =
  | {
      estado: "pendiente";
      /** Unidades del primer tramo (2 en anteojos). */
      unidades: number;
      /** Cuántas faltan para llegar, contando lo que ya está en el carrito. */
      faltan: number;
      /** El porcentaje que aplica el servidor con esas unidades. */
      porcentaje: number;
      /** Lo que queda cada unidad de ESTE producto con el descuento. */
      unitario: number;
    }
  | {
      estado: "aplicada";
      unidades: number;
    };

export function ofertaPorCantidad(
  tramos: Tramo[],
  categoria: Categoria,
  precioLista: number,
  cantidadEnCarrito: number,
  /** El mayor descuento que el servidor aplicó a esta categoría en el carrito. */
  descuentoAplicado = 0
): OfertaCantidad | null {
  const primero = tramos
    .filter((t) => t.categoria === categoria)
    .sort((a, b) => a.desdeUnidades - b.desdeUnidades)[0];

  if (!primero) return null;

  const cantidad = Math.max(0, Math.floor(cantidadEnCarrito));

  if (cantidad >= primero.desdeUnidades) {
    // "Ya lo tenés" solo si el servidor de verdad lo aplicó: si los tramos no
    // se pudieron leer al resolver el carrito, no se promete nada.
    return descuentoAplicado > 0 ? { estado: "aplicada", unidades: primero.desdeUnidades } : null;
  }

  // El mismo porcentaje que usa el servidor para esa cantidad (si hubiera dos
  // tramos con el mismo mínimo, gana el mayor, como al cobrar).
  const porcentaje = porcentajeParaCantidad(tramos, categoria, primero.desdeUnidades);
  if (porcentaje <= 0) return null;

  return {
    estado: "pendiente",
    unidades: primero.desdeUnidades,
    faltan: primero.desdeUnidades - cantidad,
    porcentaje,
    unitario: conDescuento(precioLista, porcentaje),
  };
}
