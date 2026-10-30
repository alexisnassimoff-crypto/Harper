import { conDescuento, escalaDe, porcentajeParaCantidad, totalConDescuento, type Tramo } from "./descuentos";
import type { Categoria } from "./tipos";

/**
 * Los packs de la portada: 1, 2 o 4 pares del modelo estrella.
 *
 * No son una promoción nueva: cada pack muestra lo que el carrito ya cobra
 * por esa cantidad, con los descuentos por cantidad vigentes (Airtable,
 * tabla Descuentos) o con HARPER10 si está aplicado y conviene más (nunca
 * los dos), con la misma regla que lib/cupones.ts. El precio tachado es el
 * de lista por la cantidad: un precio real.
 */

export const CANTIDADES_PACK = [1, 2, 4] as const;

/** El pack que aparece elegido al entrar. */
export const PACK_RECOMENDADO = 2;

/**
 * Las cantidades que se ofrecen: 1 y cada escalón de la escala «llevá N,
 * pagá M» (1, 3 y 5 desde el 30/10/2026). Sin escala, las de siempre.
 */
export function cantidadesDePack(tramos: Tramo[], categoria: Categoria): number[] {
  const escala = escalaDe(tramos, categoria).map((t) => t.desdeUnidades);
  return escala.length > 0 ? [1, ...escala] : [...CANTIDADES_PACK];
}

/** Un complemento que se suma al pack (el estuche), a su precio de siempre. */
export type ExtraPack = { precio: number; categoria: Categoria };

export type Pack = {
  cantidad: number;
  /** El descuento que se aplica a los pares, en %. */
  porcentaje: number;
  /** Verdadero si el descuento es el del cupón (y no el de cantidad). */
  conCupon: boolean;
  /** Lo que se paga por cada par. */
  precioUnitario: number;
  /** Lo que se paga por el complemento; null si no hay. */
  precioExtra: number | null;
  /** Todo: los pares y el complemento. */
  total: number;
  /** El precio de lista de todo: el tachado. */
  lista: number;
  ahorro: number;
  /**
   * Todo sin el cupón: la base del envío gratis, como en el carrito (el
   * cupón no cambia quién tiene envío gratis).
   */
  totalParaEnvio: number;
};

export function armarPack(datos: {
  precio: number;
  cantidad: number;
  tramos: Tramo[];
  categoria: Categoria;
  /** El % de HARPER10 si está aplicado; 0 si no. */
  cuponPorcentaje?: number;
  extra?: ExtraPack | null;
}): Pack {
  const { precio, cantidad, tramos, extra = null } = datos;

  // Con los descuentos por cantidad: el complemento va solo (1 unidad). El
  // total de los pares se redondea una sola vez, como al cobrar.
  const porTramo = porcentajeParaCantidad(tramos, datos.categoria, cantidad);
  const paresPorTramo = totalConDescuento(precio * cantidad, porTramo);
  const unitarioPorTramo = paresPorTramo / cantidad;
  const extraPorTramo = extra ? conDescuento(extra.precio, porcentajeParaCantidad(tramos, extra.categoria, 1)) : 0;
  const totalPorTramo = paresPorTramo + extraPorTramo;

  // Con el cupón: todo a precio de lista menos el cupón.
  const porCupon = datos.cuponPorcentaje ?? 0;
  const unitarioPorCupon = conDescuento(precio, porCupon);
  const extraPorCupon = extra ? conDescuento(extra.precio, porCupon) : 0;
  const totalPorCupon = unitarioPorCupon * cantidad + extraPorCupon;

  // Como en el carrito: el cupón solo si deja el total más bajo.
  const conCupon = porCupon > 0 && totalPorCupon < totalPorTramo;
  const total = conCupon ? totalPorCupon : totalPorTramo;
  const lista = precio * cantidad + (extra?.precio ?? 0);

  return {
    cantidad,
    porcentaje: conCupon ? porCupon : porTramo,
    conCupon,
    precioUnitario: conCupon ? unitarioPorCupon : unitarioPorTramo,
    precioExtra: extra ? (conCupon ? extraPorCupon : extraPorTramo) : null,
    total,
    lista,
    ahorro: lista - total,
    totalParaEnvio: totalPorTramo,
  };
}

/** "1 par", "2 pares". */
export function nombrePack(cantidad: number): string {
  return cantidad === 1 ? "1 par" : `${cantidad} pares`;
}

/**
 * Todos los totales que la portada puede llegar a mostrar (cada pack, con y
 * sin cupón, con y sin complemento), para confirmar las cuotas de cada uno
 * con Mercado Pago antes de anunciarlas.
 */
export function totalesPosibles(datos: {
  precio: number;
  tramos: Tramo[];
  categoria: Categoria;
  cuponPorcentaje: number;
  extra: ExtraPack | null;
}): number[] {
  const totales = new Set<number>();
  for (const cantidad of CANTIDADES_PACK) {
    for (const cuponPorcentaje of [0, datos.cuponPorcentaje]) {
      for (const extra of datos.extra ? [null, datos.extra] : [null]) {
        totales.add(armarPack({ ...datos, cantidad, cuponPorcentaje, extra }).total);
      }
    }
  }
  return [...totales].sort((a, b) => a - b);
}

type ColorConStock = { stock: number; agotada: boolean };

/**
 * El color de cada par, respetando lo que eligió el visitante (`deseados`)
 * mientras haya stock. Los pares sin elegir arrancan con un color distinto
 * cada uno, empezando por `primero`, salteando los agotados y sin pedir más
 * unidades de un color que las que hay; si no alcanzan los colores, se repite
 * el que todavía tenga stock. Devuelve índices de `variantes`; -1 si ya no
 * queda stock para ese par.
 */
export function repartirColores(
  variantes: ColorConStock[],
  cantidad: number,
  deseados: (number | undefined)[],
  primero = 0
): number[] {
  const usados = new Map<number, number>();
  const disponible = (i: number) =>
    i >= 0 && i < variantes.length && !variantes[i].agotada && variantes[i].stock > (usados.get(i) ?? 0);
  // El orden de preferencia: el primero y después los demás, en orden.
  const orden = variantes.map((_, n) => (primero + n) % variantes.length);

  const elegidos: number[] = [];
  for (let par = 0; par < cantidad; par++) {
    const deseado = deseados[par];
    const nuevo =
      deseado !== undefined && disponible(deseado)
        ? deseado
        : (orden.find((i) => disponible(i) && !usados.has(i)) ?? orden.find(disponible) ?? -1);
    if (nuevo >= 0) usados.set(nuevo, (usados.get(nuevo) ?? 0) + 1);
    elegidos.push(nuevo);
  }
  return elegidos;
}

/** Los colores con los que arranca cada par, sin nada elegido todavía. */
export function coloresIniciales(variantes: ColorConStock[], cantidad: number, primero: number): number[] {
  return repartirColores(variantes, cantidad, [], primero);
}

/** Cuántos pares se pueden llevar como máximo, sumando el stock de todos los colores. */
export function paresDisponibles(variantes: ColorConStock[]): number {
  return variantes.reduce((total, v) => total + (v.agotada ? 0 : Math.max(0, v.stock)), 0);
}
