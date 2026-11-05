import { precio as formatearPrecio } from "./formato";
import type { DuoDelCarrito, ItemResuelto } from "./tipos";

/**
 * Cómo se cuenta el Dúo en la tienda (Tarea 07): la ficha, los packs, el
 * carrito y el checkout.
 *
 * Acá no se calcula ningún precio ni ningún descuento: todo sale de lo que
 * resolvió el servidor (el detalle `duo` de cada renglón y el `duo` del
 * carrito, lib/pedidos.ts). Con el Dúo apagado el servidor no manda nada de
 * eso, y cada función devuelve lo de siempre o nada.
 *
 * Reglas para no contradecirse:
 *  - «Dúo aplicado» solo si algún renglón trae el Dúo.
 *  - «Sumá otro par… 25% OFF» solo si el servidor dice que con un anteojo más
 *    suma otro con el Dúo (`siguiente: "duo"`). Si ahí conviene un tramo de
 *    Airtable (`"tramos"`), se cuenta el tramo, como siempre.
 *  - El envío gratis y lo que falta se miden sobre la misma base que el
 *    servidor (`subtotalSinCupon`, antes del 25 %).
 */

/** "25% OFF", como el resto de la tienda ("10% OFF extra…"). */
export function textoDelDuo(porcentaje: number): string {
  return `${porcentaje}% OFF`;
}

/** Los pesos que descontó el Dúo, sumando lo que trae cada renglón del servidor. */
export function ahorroDelDuo(items: readonly Pick<ItemResuelto, "duo">[]): number {
  return items.reduce((total, i) => total + (i.duo?.descuento ?? 0), 0);
}

/**
 * Lo que dice el renglón del carrito cuando lleva el Dúo: «Dúo · 25% OFF» o,
 * si no todas sus unidades lo llevan, «Dúo · 25% OFF en 1 de 2». Null sin Dúo
 * (y el renglón muestra su porcentaje de siempre).
 */
export function textoDelRenglon(item: Pick<ItemResuelto, "duo" | "cantidad">): string | null {
  if (!item.duo) return null;
  const base = `Dúo · ${textoDelDuo(item.duo.porcentaje)}`;
  return item.duo.unidades >= item.cantidad ? base : `${base} en ${item.duo.unidades} de ${item.cantidad}`;
}

export type FilaDeDescuento = { etiqueta: string; monto: number };

/**
 * Las filas de descuento del resumen (carrito, panel y checkout). Sin Dúo,
 * exactamente las de siempre: «Cupón X» o «Descuento». Con el Dúo, en su
 * propia fila («Dúo · 25% OFF») y, si además hay tramos en estuches o paños,
 * esos en «Descuento». Los montos son los del servidor.
 */
export function filasDeDescuento(datos: {
  /** El ahorro de las promociones, del servidor (CarritoResuelto.ahorro). */
  ahorro: number;
  items: readonly Pick<ItemResuelto, "duo">[];
  /** El cupón aplicado, si lo hay. */
  cupon: { codigo: string; estado: string } | null | undefined;
}): FilaDeDescuento[] {
  const total = Math.max(0, datos.ahorro);
  if (total <= 0) return [];
  if (datos.cupon?.estado === "aplicado") return [{ etiqueta: `Cupón ${datos.cupon.codigo}`, monto: total }];
  const duo = Math.min(total, ahorroDelDuo(datos.items));
  const porcentaje = datos.items.find((i) => i.duo)?.duo?.porcentaje;
  if (duo <= 0 || porcentaje === undefined) return [{ etiqueta: "Descuento", monto: total }];
  return [
    { etiqueta: `Dúo · ${textoDelDuo(porcentaje)}`, monto: duo },
    ...(total - duo > 0 ? [{ etiqueta: "Descuento", monto: total - duo }] : []),
  ];
}

const EN_LETRAS = ["cero", "uno", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez"];
const enLetras = (n: number) => EN_LETRAS[n] ?? String(n);

/**
 * El Dúo en la ficha y en el carrito, con lo que ya tiene el carrito:
 *  - `aplicado`: lo que ya tiene (solo la ficha lo dice; en el carrito ya se ve
 *    en el renglón y en el resumen);
 *  - `siguiente`: qué gana con otro par, solo si el servidor dice que es el Dúo.
 * Si con otro par conviene un tramo, `siguiente` es null y `tramos` es
 * verdadero: la tienda muestra el tramo como siempre.
 */
export function mensajesDelDuo(duo: DuoDelCarrito, contexto: "ficha" | "carrito"): {
  aplicado: string | null;
  siguiente: string | null;
  tramos: boolean;
} {
  const pct = textoDelDuo(duo.porcentaje);
  const aplicado =
    contexto === "ficha" && duo.ahorro > 0
      ? `Tu carrito ya tiene el Dúo: ${pct} en ${duo.unidades === 1 ? "el anteojo de menor precio" : `los ${enLetras(duo.unidades)} de menor precio`}.`
      : null;
  const siguiente =
    duo.siguiente === "duo"
      ? duo.unidades === 0
        ? `Sumá otro par y el de menor precio tiene ${pct}.`
        : `Sumá otro par y ${enLetras(duo.unidades + 1)} pares tienen ${pct}.`
      : null;
  return { aplicado, siguiente, tramos: duo.siguiente === "tramos" };
}

/**
 * La ficha sin anteojos en el carrito: la promoción con lo que cobra el
 * servidor por dos pares de este modelo. «Dúo: llevá dos y el de menor precio
 * tiene 25% OFF» y «Dos de este modelo: $ 157.325 (antes $ 179.800)».
 */
export function ofertaDuoDeLaFicha(datos: { porcentaje: number; dos: { total: number; lista: number } | null }): {
  titulo: string;
  detalle: string | null;
} {
  return {
    titulo: `Dúo: llevá dos anteojos y el de menor precio tiene ${textoDelDuo(datos.porcentaje)}.`,
    detalle:
      datos.dos && datos.dos.lista > datos.dos.total
        ? `Dos de este modelo: ${formatearPrecio(datos.dos.total)} (antes ${formatearPrecio(datos.dos.lista)}).`
        : null,
  };
}

/**
 * Cuando el envío es gratis solo porque el mínimo se cuenta antes del 25 %
 * (Tarea 06): se aclara, para que «$ 157.325 con envío gratis desde
 * $ 160.000» no parezca un error. Null en cualquier otro caso.
 */
export function notaEnvioGratisDelDuo(datos: {
  /** La base del envío gratis, del servidor (subtotalSinCupon). */
  base: number;
  items: readonly Pick<ItemResuelto, "duo">[];
  /** El mínimo de la zona que se está mostrando; 0 = no hay. */
  umbral: number;
  /** Si el envío de verdad quedó gratis (lo dice el servidor). */
  gratis: boolean;
}): string | null {
  const duo = ahorroDelDuo(datos.items);
  if (!datos.gratis || duo <= 0 || datos.umbral <= 0) return null;
  if (datos.base < datos.umbral || datos.base - duo >= datos.umbral) return null;
  return "Envío gratis por tu compra: el mínimo se cuenta antes del descuento del Dúo.";
}
