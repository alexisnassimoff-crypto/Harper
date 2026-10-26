import { conDescuento } from "./descuentos";
import type { ItemResuelto } from "./tipos";

/**
 * Cupón de bienvenida: HARPER10.
 *
 *  - 10% sobre los productos, nunca sobre el envío.
 *  - Solo en la primera compra: lo comprueba el checkout con las compras ya
 *    confirmadas (Clientes.Primera_compra), por email o DNI. Un pedido
 *    pendiente o un pago rechazado no cuenta como compra.
 *  - No se acumula: si el pedido ya tiene una promoción por cantidad, se
 *    aplica la que le deje el total más bajo al comprador, nunca las dos.
 *  - El envío se calcula como siempre, sobre el subtotal sin el cupón: el
 *    cupón no cambia quién tiene envío gratis.
 *
 * El navegador solo manda el código. Cuánto descuenta lo decide el servidor
 * (lib/pedidos.ts), con la misma cuenta que se usa acá para mostrarlo.
 *
 * Este archivo lo usan la ficha, el carrito y el servidor: sin nada de servidor.
 */

export type Cupon = {
  codigo: string;
  porcentaje: number;
  soloPrimeraCompra: boolean;
};

export const CUPON_BIENVENIDA: Cupon = { codigo: "HARPER10", porcentaje: 10, soloPrimeraCompra: true };

const CUPONES: Cupon[] = [CUPON_BIENVENIDA];

/** " harper10 " → "HARPER10". Lo que no es letra o número se descarta. */
export function normalizarCodigo(crudo: unknown): string {
  return typeof crudo === "string" ? crudo.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 30) : "";
}

export function buscarCupon(crudo: unknown): Cupon | null {
  const codigo = normalizarCodigo(crudo);
  return CUPONES.find((c) => c.codigo === codigo) ?? null;
}

/** Lo que paga por UNA unidad con el cupón. La misma cuenta que al cobrar. */
export function precioConCupon(precioLista: number, cupon: Cupon = CUPON_BIENVENIDA): number {
  return conDescuento(precioLista, cupon.porcentaje);
}

export type EstadoCupon =
  /** Se aplicó: es lo más conveniente para este pedido. */
  | "aplicado"
  /** Válido, pero el pedido ya tiene una promoción mejor (o igual). */
  | "no-conviene"
  /** Ese código no existe. */
  | "invalido"
  /** Ya hay una compra confirmada con ese email o DNI (lo decide el checkout). */
  | "no-primera-compra";

export type CuponResuelto = {
  codigo: string;
  estado: EstadoCupon;
  /** Cuánto descuenta el cupón en este pedido; 0 si no se aplicó. */
  ahorro: number;
};

/**
 * Elige la mejor promoción para el pedido y, si es el cupón, lo aplica.
 *
 * Recibe los ítems YA resueltos con los descuentos por cantidad. Si con el
 * cupón el total de productos queda más bajo, cada ítem pasa al precio de
 * lista menos el cupón (sin el descuento por cantidad); si no, quedan como
 * estaban. Devuelve los ítems a cobrar y qué pasó con el cupón.
 */
export function aplicarMejorPromocion(
  items: ItemResuelto[],
  codigoCrudo: unknown
): { items: ItemResuelto[]; cupon: CuponResuelto | null } {
  const codigo = normalizarCodigo(codigoCrudo);
  if (!codigo) return { items, cupon: null };

  const cupon = buscarCupon(codigo);
  if (!cupon) return { items, cupon: { codigo, estado: "invalido", ahorro: 0 } };
  if (items.length === 0) return { items, cupon: { codigo: cupon.codigo, estado: "no-conviene", ahorro: 0 } };

  const conTramos = items.reduce((total, i) => total + i.subtotal, 0);
  const conCupon = items.reduce((total, i) => total + precioConCupon(i.precioLista, cupon) * i.cantidad, 0);

  if (conCupon >= conTramos) {
    return { items, cupon: { codigo: cupon.codigo, estado: "no-conviene", ahorro: 0 } };
  }

  const aplicados = items.map((i) => {
    const precioUnitario = precioConCupon(i.precioLista, cupon);
    return { ...i, descuento: cupon.porcentaje, precioUnitario, subtotal: precioUnitario * i.cantidad };
  });
  const lista = items.reduce((total, i) => total + i.precioLista * i.cantidad, 0);

  return { items: aplicados, cupon: { codigo: cupon.codigo, estado: "aplicado", ahorro: lista - conCupon } };
}

/** Lo que se le dice al comprador cuando el cupón no se aplicó. */
export function mensajeDelCupon(cupon: CuponResuelto): string | null {
  switch (cupon.estado) {
    case "aplicado":
      return null;
    case "no-conviene":
      return `${cupon.codigo} no se suma a otras promociones: este pedido ya tiene un descuento mejor.`;
    case "invalido":
      return "Ese código no es válido.";
    case "no-primera-compra":
      return `${cupon.codigo} es para la primera compra, y ya hay una compra con este email o DNI.`;
  }
}

/** Para el pedido en Airtable y el aviso interno: "HARPER10 (−$ 8.990)". */
export function constanciaDelCupon(cupon: CuponResuelto, formatear: (n: number) => string): string {
  return `${cupon.codigo} (−${formatear(cupon.ahorro)})`;
}

/** El cupón guardado en Notas cuando el pedido no tenía el campo Cupon. */
export function cuponDeNotas(notas: unknown): string | null {
  if (typeof notas !== "string") return null;
  const linea = notas.split("\n").find((l) => l.startsWith("Cupón: "));
  return linea ? linea.slice("Cupón: ".length).trim() || null : null;
}
