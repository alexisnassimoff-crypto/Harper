import { precio as formatearPrecio } from "@/lib/formato";
import { packConDuo, porcentajeDelDuo } from "@/lib/pedidos";
import type { DuoParaPreguntas } from "@/lib/portada";
import type { Producto } from "@/lib/tipos";

/**
 * El Dúo para anunciarlo fuera del carrito (Ale, 18/11/2026): la portada y las
 * preguntas frecuentes. Solo para el servidor: pregunta si el Dúo está
 * prendido (HARPER_DUO_ACTIVO) y arma el carrito de dos anteojos con
 * `packConDuo`, el mismo cálculo que cobra. Así ningún importe del Dúo se
 * escribe ni se calcula aparte, y con el Dúo apagado no hay nada que anunciar.
 */
export type DuoAnunciado = {
  /** El descuento del Dúo, del servidor. */
  porcentaje: number;
  /**
   * Lo que cobra el servidor por dos anteojos y su precio de lista. Null si
   * los modelos no cuestan todos lo mismo (no hay un solo importe para «dos
   * anteojos») o si no pudo armar ese carrito: entonces se anuncia sin importes.
   */
  dos: { total: number; lista: number; totalDineroMP: number | null } | null;
};

/**
 * El Dúo para anunciar con estos anteojos (los que tienen stock), o null si
 * no hay que nombrarlo:
 *  - con el Dúo apagado;
 *  - si en dos anteojos el servidor no aplica el Dúo (por ejemplo, porque un
 *    tramo de Airtable deja menos total): ahí «25 % en el de menor precio» no
 *    sería lo que cobra.
 */
export async function duoParaAnunciar(anteojos: Producto[]): Promise<DuoAnunciado | null> {
  const porcentaje = porcentajeDelDuo();
  if (porcentaje === null) return null;
  const mismoPrecio = anteojos.length > 0 && anteojos.every((m) => m.precio === anteojos[0].precio);
  if (!mismoPrecio) return { porcentaje, dos: null };

  // El primer modelo con stock para dos: todos cuestan lo mismo, así que el
  // importe vale para cualquier combinación de dos.
  try {
    for (const modelo of anteojos) {
      const dos = await packConDuo(modelo, 2);
      if (!dos) continue;
      if (dos.promocion !== "duo") return null;
      return { porcentaje, dos: { total: dos.total, lista: dos.lista, totalDineroMP: dos.totalDineroMP } };
    }
  } catch (error) {
    // Es un dato para mostrar: si el carrito de prueba falla, la página sale
    // igual, con el Dúo anunciado sin importes.
    console.warn("[duo] no se pudo armar el carrito de dos anteojos para anunciarlo:", error);
  }
  return { porcentaje, dos: null };
}

/** El mismo dato con los importes ya escritos, para las preguntas frecuentes (lib/portada.ts). */
export function duoParaLasPreguntas(duo: DuoAnunciado | null): DuoParaPreguntas | null {
  if (!duo) return null;
  return {
    porcentaje: duo.porcentaje,
    dos: duo.dos
      ? {
          total: formatearPrecio(duo.dos.total),
          lista: formatearPrecio(duo.dos.lista),
          totalDineroMP: duo.dos.totalDineroMP === null ? null : formatearPrecio(duo.dos.totalDineroMP),
        }
      : null,
  };
}
