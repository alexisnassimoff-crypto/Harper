import { esCategoriaDeAnteojos, type Categoria } from "./categorias";
import { totalConDescuento } from "./descuentos";
import type { ItemResuelto } from "./tipos";

/**
 * Descuento Dúo (Ale, 05/11/2026 · Tarea 03): 25 % sobre los anteojos
 * elegibles de menor precio. Con n anteojos, llevan el descuento los ⌊n/2⌋
 * más baratos: con 2, uno; con 3, uno; con 4, dos; con 5, dos; con 6, tres.
 * Se pueden combinar modelos, colores y precios distintos
 * (docs/plan-programa-harper.md, §5.3).
 *
 * TODAVÍA NO ESTÁ ACTIVO: ninguna página, ruta, carrito ni checkout lo usa
 * (lo controla tests/duo.test.ts). Cuando se integre, lo llama el servidor
 * en `resolverCarrito` (lib/pedidos.ts), en el mismo paso que los descuentos
 * por cantidad: después de armar los renglones con su precio de lista y
 * antes del cupón, del saldo y del 10 % por dinero en Mercado Pago. El
 * navegador nunca lo calcula: solo muestra lo que devuelve el servidor.
 *
 * Usa el sistema de precios de siempre:
 *  - el precio de lista de cada renglón (`precioLista`, de Airtable);
 *  - el redondeo de lib/descuentos.ts (`totalConDescuento`): el descuento se
 *    redondea a peso entero UNA sola vez, sobre el total, y se reparte entre
 *    los renglones; la diferencia de redondeo la absorbe el renglón con más
 *    descuento (como en lib/pedidos.ts y lib/dinero-mp.ts);
 *  - qué es un anteojo, de lib/categorias.ts (`esCategoriaDeAnteojos`).
 *
 * Cuentan las cuatro categorías de anteojos completos: Anteojos, Anteojos de
 * sol, Clip-On y Anteojos de receta (Ale, 05/11/2026). Estuches, paños y
 * cualquier complemento no cuentan ni llevan este descuento. Un clip que se
 * venda suelto es un complemento: se carga con una categoría de complemento,
 * no como Clip-On.
 */

/** El descuento Dúo, en %. */
export const PORCENTAJE_DUO = 25;

/** Cuántos anteojos llevan el descuento: la mitad, redondeada hacia abajo. */
export function unidadesConDescuentoDuo(anteojos: number): number {
  if (!Number.isFinite(anteojos) || anteojos < 2) return 0;
  return Math.floor(anteojos / 2);
}

/**
 * Los precios que llevan el descuento: los ⌊n/2⌋ más bajos, de menor a
 * mayor. Es la misma regla que usa el modelo financiero
 * (lib/contribucion.ts, `descuentoDelSegundo`).
 */
export function preciosConDescuentoDuo(precios: readonly number[]): number[] {
  return [...precios].sort((a, b) => a - b).slice(0, unidadesConDescuentoDuo(precios.length));
}

/** Lo mínimo que el motor necesita de cada renglón del carrito. */
export type RenglonDuo = {
  categoria: Categoria;
  /** Precio de lista por unidad, con IVA, en pesos. */
  precioLista: number;
  cantidad: number;
};

export type OpcionesDuo = {
  /** El descuento en %. Sin esto, `PORCENTAJE_DUO`. */
  porcentaje?: number;
  /** Qué categorías cuentan para el Dúo. Sin esto, todas las de anteojos. */
  esElegible?: (categoria: Categoria) => boolean;
};

export type DuoDelRenglon = {
  /** Unidades de este renglón que llevan el descuento. */
  unidadesConDescuento: number;
  /** Pesos enteros que descuenta en este renglón. */
  descuento: number;
  /** Lo que queda el renglón: precio de lista × cantidad − descuento. */
  subtotal: number;
};

export type ResultadoDuo = {
  porcentaje: number;
  /** Anteojos elegibles en el pedido (suma de cantidades). */
  anteojos: number;
  /** Cuántos llevan el descuento: ⌊anteojos / 2⌋. */
  unidadesConDescuento: number;
  /** El descuento total, en pesos enteros. */
  descuento: number;
  /** Uno por renglón, en el mismo orden. Los no elegibles quedan sin descuento. */
  renglones: DuoDelRenglon[];
};

function exigir(condicion: boolean, mensaje: string): asserts condicion {
  if (!condicion) throw new RangeError(mensaje);
}

/**
 * El descuento Dúo de un pedido, renglón por renglón.
 *
 * Elige las unidades de menor precio de lista. A igual precio, gana el
 * renglón que aparece primero, así el resultado no depende del azar. El
 * total no cambia con el orden de los renglones. No modifica lo que recibe.
 * Tira `RangeError` si un renglón no tiene sentido.
 */
export function calcularDuo(renglones: readonly RenglonDuo[], opciones: OpcionesDuo = {}): ResultadoDuo {
  const porcentaje = opciones.porcentaje ?? PORCENTAJE_DUO;
  const esElegible = opciones.esElegible ?? esCategoriaDeAnteojos;
  exigir(Number.isFinite(porcentaje) && porcentaje > 0 && porcentaje < 100, "El descuento Dúo va de más de 0 a menos de 100");
  renglones.forEach((r, n) => {
    exigir(Number.isFinite(r.precioLista) && r.precioLista > 0, `Renglón ${n + 1}: el precio de lista tiene que ser mayor que cero`);
    exigir(Number.isInteger(r.cantidad) && r.cantidad >= 0, `Renglón ${n + 1}: la cantidad tiene que ser un entero de 0 o más`);
  });

  // Cada anteojo elegible, con su renglón; de menor a mayor precio y, a igual
  // precio, por orden de renglón.
  const unidades = renglones
    .flatMap((r, linea) => (esElegible(r.categoria) ? Array.from({ length: r.cantidad }, () => ({ linea, precio: r.precioLista })) : []))
    .sort((a, b) => a.precio - b.precio || a.linea - b.linea);
  const conDescuento = unidades.slice(0, unidadesConDescuentoDuo(unidades.length));

  // Por renglón: cuántas unidades llevan descuento y cuánto suman a precio de lista.
  const porRenglon = renglones.map(() => ({ unidades: 0, lista: 0 }));
  for (const u of conDescuento) {
    porRenglon[u.linea].unidades += 1;
    porRenglon[u.linea].lista += u.precio;
  }

  // El total se redondea una sola vez; cada renglón, por su lado; la diferencia
  // la absorbe el renglón con más lista descontada (el primero, si empatan).
  const descuentoDe = (lista: number) => lista - totalConDescuento(lista, porcentaje);
  const listaDescontada = porRenglon.reduce((total, r) => total + r.lista, 0);
  const descuento = listaDescontada > 0 ? descuentoDe(listaDescontada) : 0;
  const descuentos = porRenglon.map((r) => (r.lista > 0 ? descuentoDe(r.lista) : 0));
  if (descuento > 0) {
    const mayor = porRenglon.reduce((m, r, n) => (r.lista > porRenglon[m].lista ? n : m), 0);
    descuentos[mayor] += descuento - descuentos.reduce((total, d) => total + d, 0);
  }

  return {
    porcentaje,
    anteojos: unidades.length,
    unidadesConDescuento: conDescuento.length,
    descuento,
    renglones: renglones.map((r, n) => ({
      unidadesConDescuento: porRenglon[n].unidades,
      descuento: descuentos[n],
      subtotal: r.precioLista * r.cantidad - descuentos[n],
    })),
  };
}

export type CarritoConDuo = {
  /** Los renglones, copiados; los que llevan descuento, con su subtotal nuevo. */
  items: ItemResuelto[];
  /** Si se aplicó. Si no, `items` queda igual a lo que entró. */
  aplicado: boolean;
  /**
   * Por qué no se aplicó:
   *  - "sin-pares": hay menos de dos anteojos elegibles;
   *  - "otro-descuento": un anteojo ya tiene otro descuento por cantidad (un
   *    tramo de Airtable). El Dúo no se acumula con eso.
   */
  motivo?: "sin-pares" | "otro-descuento";
  /** Los pesos que descuenta el Dúo en todo el carrito. */
  ahorro: number;
  duo: ResultadoDuo;
};

/**
 * Aplica el Dúo a los renglones del carrito (ItemResuelto, lib/pedidos.ts),
 * preparado para el servidor. Va en el paso de los descuentos por cantidad:
 * antes del cupón, del saldo y del 10 % por dinero en Mercado Pago. Si esos
 * ya están aplicados, es un error de integración y tira `Error`.
 *
 * En cada renglón con descuento:
 *  - `subtotal` es la lista menos el Dúo (pesos enteros);
 *  - `precioUnitario` es subtotal ÷ cantidad (puede tener fracción de peso:
 *    a Mercado Pago se le manda partido en pesos enteros, ver
 *    `unidadesParaCobrar` en lib/dinero-mp.ts);
 *  - `descuento` es el porcentaje efectivo del renglón (con 2 unidades y una
 *    sola con el 25 %, 12,5 %).
 *
 * No modifica lo que recibe. Aplicarlo dos veces no descuenta dos veces.
 */
export function aplicarDuo(items: readonly ItemResuelto[], opciones: OpcionesDuo = {}): CarritoConDuo {
  if (items.some((i) => (i.cupon ?? 0) > 0 || (i.saldo ?? 0) > 0 || (i.descuentoDineroMP ?? 0) > 0)) {
    throw new Error("El Dúo va antes del cupón, del saldo y del 10 % por dinero en Mercado Pago");
  }
  const esElegible = opciones.esElegible ?? esCategoriaDeAnteojos;
  const copias = items.map((i) => ({ ...i }));
  const duo = calcularDuo(items, opciones);
  const sinAplicar = (motivo: CarritoConDuo["motivo"]): CarritoConDuo => ({ items: copias, aplicado: false, motivo, ahorro: 0, duo });

  if (duo.unidadesConDescuento === 0) return sinAplicar("sin-pares");
  if (items.some((i) => esElegible(i.categoria) && i.cantidad > 0 && i.descuento > 0)) return sinAplicar("otro-descuento");

  duo.renglones.forEach((r, n) => {
    if (r.descuento <= 0) return;
    const item = copias[n];
    const lista = item.precioLista * item.cantidad;
    item.subtotal = r.subtotal;
    item.precioUnitario = r.subtotal / item.cantidad;
    item.descuento = (r.descuento / lista) * 100;
  });
  return { items: copias, aplicado: true, ahorro: duo.descuento, duo };
}
