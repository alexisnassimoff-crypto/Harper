import { conDescuento } from "./descuentos";
import type { ItemResuelto } from "./tipos";

/**
 * Pago por transferencia: en Mercado Pago, con dinero en cuenta.
 *
 *  - 10% más sobre los productos, nunca sobre el envío.
 *  - Se suma a la mejor promoción del pedido (el cupón HARPER10 o el
 *    descuento por cantidad, la que convenga): primero esa, después el 10%
 *    sobre el importe ya descontado. $ 89.900 con HARPER10 es $ 80.910, y por
 *    transferencia $ 72.819.
 *  - El envío se calcula como siempre: la transferencia no cambia quién
 *    tiene envío gratis.
 *  - Se paga en Mercado Pago, que solo ofrece el dinero de la cuenta del
 *    comprador (lib/mercadopago.ts). El pedido se confirma como cualquier
 *    otro: con el webhook, en el momento.
 *
 * Este archivo lo usan el checkout y el servidor: sin nada de servidor.
 */

export const PORCENTAJE_TRANSFERENCIA = 10;

export type MedioPago = "mercadopago" | "transferencia";

/** Cualquier cosa que no sea "transferencia" es Mercado Pago, como siempre. */
export function leerMedioPago(crudo: unknown): MedioPago {
  return crudo === "transferencia" ? "transferencia" : "mercadopago";
}

/** Lo que queda en el pedido de Airtable (campo Medio_pago, o una línea de Notas). */
export const MEDIO_TRANSFERENCIA = "Transferencia (dinero en cuenta de Mercado Pago)";
export const NOTA_TRANSFERENCIA = `Medio de pago: ${MEDIO_TRANSFERENCIA}`;

/** Verdadero si el pedido de Airtable se pidió con el descuento por transferencia. */
export function esPedidoPorTransferencia(fila: { Medio_pago?: unknown; Notas?: unknown }): boolean {
  if (fila.Medio_pago === MEDIO_TRANSFERENCIA) return true;
  return typeof fila.Notas === "string" && fila.Notas.split("\n").some((l) => l.trim() === NOTA_TRANSFERENCIA);
}

/**
 * Los tipos de pago que Mercado Pago NO ofrece cuando se paga por
 * transferencia: queda solo el dinero en cuenta (`account_money`), que
 * además no se puede excluir. Son los tipos de Argentina según Mercado Pago;
 * `atm` no existe acá, pero el checkout de siempre ya lo excluye.
 */
export const TIPOS_EXCLUIDOS_TRANSFERENCIA = [
  "credit_card",
  "debit_card",
  "prepaid_card",
  "ticket",
  "atm",
  // "Cuotas sin tarjeta" (Mercado Crédito).
  "digital_currency",
] as const;

/** El único tipo de pago que vale para el descuento por transferencia. */
export const TIPO_DINERO_EN_CUENTA = "account_money";

export type PrecioTransferencia = {
  porcentaje: number;
  /** Los ítems a cobrar por transferencia. */
  items: ItemResuelto[];
  /** Los productos con todos los descuentos. */
  subtotal: number;
  /** Lo que descuenta la transferencia, aparte de la otra promoción. */
  ahorro: number;
};

/**
 * El 10% de la transferencia sobre los productos, ya con su mejor promoción.
 *
 * Se calcula sobre el total de los productos, como se haría a mano: dos pares
 * a $ 85.405 son $ 170.810, y por transferencia $ 153.729. Ese total se
 * reparte entre los renglones para que el pedido sume exacto; el redondeo, si
 * lo hay, lo absorbe el renglón más grande. El unitario puede quedar con
 * medio peso: a Mercado Pago se le manda partido en pesos enteros (ver
 * `unidadesParaCobrar`).
 */
export function aplicarTransferencia(
  items: ItemResuelto[],
  porcentaje: number = PORCENTAJE_TRANSFERENCIA
): PrecioTransferencia {
  const antes = items.reduce((total, i) => total + i.subtotal, 0);
  const subtotal = conDescuento(antes, porcentaje);

  const lineas = items.map((i) => conDescuento(i.subtotal, porcentaje));
  if (lineas.length > 0) {
    const mayor = items.reduce((m, i, n) => (i.subtotal > items[m].subtotal ? n : m), 0);
    lineas[mayor] += subtotal - lineas.reduce((total, l) => total + l, 0);
  }

  return {
    porcentaje,
    items: items.map((i, n) => ({
      ...i,
      descuentoTransferencia: porcentaje,
      precioUnitario: lineas[n] / i.cantidad,
      subtotal: lineas[n],
    })),
    subtotal,
    ahorro: antes - subtotal,
  };
}

/**
 * Un renglón en pesos enteros, como lo cobra Mercado Pago (precio × cantidad).
 * Si el importe no se divide justo por la cantidad, se parte en dos: dos
 * pares por $ 153.729 son uno a $ 76.864 y otro a $ 76.865. Un renglón que ya
 * es exacto queda igual.
 */
export function unidadesParaCobrar(item: { subtotal: number; cantidad: number }): { precio: number; cantidad: number }[] {
  const base = Math.floor(item.subtotal / item.cantidad);
  const conUnPesoMas = item.subtotal - base * item.cantidad;
  return [
    { precio: base, cantidad: item.cantidad - conUnPesoMas },
    { precio: base + 1, cantidad: conUnPesoMas },
  ].filter((u) => u.cantidad > 0);
}
