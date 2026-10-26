/**
 * El desglose que ve el comprador en el carrito y en el checkout.
 *
 * `subtotal` viene del servidor YA descontado (es lo que suma cada ítem a su
 * precio unitario real). Mostrarlo como "Subtotal" y debajo restar otra vez el
 * descuento hacía que las cifras no cerraran: parecía que se descontaba dos
 * veces. Acá se reconstruye el precio de lista para que la cuenta se lea de
 * arriba abajo: lista − descuento (− dinero en Mercado Pago) + envío = total.
 */
export type Desglose = {
  /** Suma de los ítems a precio de lista, antes de cualquier descuento. */
  lista: number;
  /** Lo que se descontó por cantidad o con el cupón. */
  descuento: number;
  /** El 10% adicional por pagar con dinero en Mercado Pago; 0 con Mercado Pago. */
  dineroMP: number;
  envio: number;
  total: number;
  /** Todo lo que se ahorró: la promoción más el 10% por dinero en Mercado Pago. */
  ahorroTotal: number;
};

export function desglosar(datos: {
  subtotal: number;
  ahorro: number;
  envio: number;
  /** Lo que descuenta el pago con dinero en Mercado Pago sobre `subtotal`, si se paga así. */
  ahorroDineroMP?: number;
}): Desglose {
  const descuento = Math.max(0, datos.ahorro);
  const dineroMP = Math.max(0, datos.ahorroDineroMP ?? 0);

  return {
    lista: datos.subtotal + descuento,
    descuento,
    dineroMP,
    envio: datos.envio,
    total: datos.subtotal - dineroMP + datos.envio,
    ahorroTotal: descuento + dineroMP,
  };
}
