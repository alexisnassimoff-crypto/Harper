import { esMembresia } from "./categorias";
import { conDescuento } from "./descuentos";
import type { ItemResuelto } from "./tipos";

/**
 * "Dinero en Mercado Pago · 10% OFF adicional": se paga en Mercado Pago solo
 * con el saldo de la cuenta del comprador. No es una transferencia bancaria.
 *
 *  - 10% más sobre los productos, nunca sobre el envío.
 *  - Se suma a la mejor promoción del pedido (el cupón HARPER10 o el
 *    descuento por cantidad, la que convenga): primero esa, después el 10%
 *    sobre el importe ya descontado. $ 89.900 con HARPER10 es $ 80.910, y con
 *    dinero en Mercado Pago $ 72.819.
 *  - El envío se calcula como siempre: este descuento no cambia quién tiene
 *    envío gratis.
 *  - Mercado Pago solo ofrece el dinero de la cuenta del comprador
 *    (lib/mercadopago.ts). El pedido se confirma como cualquier otro: con el
 *    webhook, en el momento.
 *
 * Este archivo lo usan el checkout y el servidor: sin nada de servidor.
 */

export const PORCENTAJE_DINERO_MP = 10;

export type MedioPago = "mercadopago" | "dineroMP";

/** Cualquier cosa que no sea "dineroMP" es Tarjeta / Mercado Pago, como siempre. */
export function leerMedioPago(crudo: unknown): MedioPago {
  return crudo === "dineroMP" ? "dineroMP" : "mercadopago";
}

/** Lo que queda en el pedido de Airtable (campo Medio_pago, o una línea de Notas). */
export const MEDIO_DINERO_MP = "Dinero en Mercado Pago";
export const NOTA_DINERO_MP = `Medio de pago: ${MEDIO_DINERO_MP}`;

/** Verdadero si el pedido de Airtable se pidió con el descuento por dinero en Mercado Pago. */
export function esPedidoConDineroMP(fila: { Medio_pago?: unknown; Notas?: unknown }): boolean {
  if (fila.Medio_pago === MEDIO_DINERO_MP) return true;
  return typeof fila.Notas === "string" && fila.Notas.split("\n").some((l) => l.trim() === NOTA_DINERO_MP);
}

/**
 * Los tipos de pago que Mercado Pago NO ofrece cuando se paga con dinero en
 * Mercado Pago: queda solo el dinero en cuenta (`account_money`), que
 * además no se puede excluir. Son los tipos de Argentina según Mercado Pago;
 * `atm` no existe acá, pero el checkout de siempre ya lo excluye.
 */
export const TIPOS_EXCLUIDOS_DINERO_MP = [
  "credit_card",
  "debit_card",
  "prepaid_card",
  "ticket",
  "atm",
  // "Cuotas sin tarjeta" (Mercado Crédito).
  "digital_currency",
] as const;

/** El único tipo de pago que vale para el descuento por dinero en Mercado Pago. */
export const TIPO_DINERO_EN_CUENTA = "account_money";

export type PrecioDineroMP = {
  porcentaje: number;
  /** Los ítems a cobrar con dinero en Mercado Pago. */
  items: ItemResuelto[];
  /** Los productos con todos los descuentos. */
  subtotal: number;
  /** Lo que descuenta este 10%, aparte de la otra promoción. */
  ahorro: number;
};

/**
 * El 10% por dinero en Mercado Pago sobre los productos, ya con su mejor promoción.
 *
 * Se calcula sobre el total de los productos, como se haría a mano: dos pares
 * a $ 85.405 son $ 170.810, y con dinero en Mercado Pago $ 153.729. Ese total se
 * reparte entre los renglones para que el pedido sume exacto; el redondeo, si
 * lo hay, lo absorbe el renglón más grande. El unitario puede quedar con
 * medio peso: a Mercado Pago se le manda partido en pesos enteros (ver
 * `unidadesParaCobrar`).
 */
export function aplicarDineroMP(
  items: ItemResuelto[],
  porcentaje: number = PORCENTAJE_DINERO_MP
): PrecioDineroMP {
  // La membresía tiene precio fijo: el 10% no la toca (lib/socios.ts).
  const conDescuentoMP = (i: ItemResuelto) => !esMembresia(i.categoria) && i.subtotal > 0;
  const antes = items.reduce((total, i) => total + i.subtotal, 0);
  const base = items.filter(conDescuentoMP).reduce((total, i) => total + i.subtotal, 0);
  const baseConDescuento = conDescuento(base, porcentaje);
  const subtotal = antes - base + baseConDescuento;

  const lineas = items.map((i) => (conDescuentoMP(i) ? conDescuento(i.subtotal, porcentaje) : i.subtotal));
  const elegibles = items.map((i, n) => n).filter((n) => conDescuentoMP(items[n]));
  if (elegibles.length > 0) {
    const mayor = elegibles.reduce((m, n) => (items[n].subtotal > items[m].subtotal ? n : m), elegibles[0]);
    lineas[mayor] += subtotal - lineas.reduce((total, l) => total + l, 0);
  }

  return {
    porcentaje,
    items: items.map((i, n) =>
      conDescuentoMP(i)
        ? {
            ...i,
            descuentoDineroMP: porcentaje,
            precioUnitario: lineas[n] / i.cantidad,
            subtotal: lineas[n],
          }
        : { ...i }
    ),
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
  // Con centavos (un precio de lista cargado así) no hay pesos enteros que repartir.
  if (!Number.isInteger(item.subtotal)) return [{ precio: item.subtotal / item.cantidad, cantidad: item.cantidad }];
  const base = Math.floor(item.subtotal / item.cantidad);
  const conUnPesoMas = item.subtotal - base * item.cantidad;
  return [
    { precio: base, cantidad: item.cantidad - conUnPesoMas },
    { precio: base + 1, cantidad: conUnPesoMas },
  ].filter((u) => u.cantidad > 0);
}
