/**
 * El desglose que ve el comprador en el carrito y en el checkout.
 *
 * `subtotal` viene del servidor YA descontado (es lo que suma cada ítem a su
 * precio unitario real). Mostrarlo como "Subtotal" y debajo restar otra vez el
 * descuento hacía que las cifras no cerraran: parecía que se descontaba dos
 * veces. Acá se reconstruye el precio de lista para que la cuenta se lea de
 * arriba abajo: lista − descuento + envío = total.
 */
export type Desglose = {
  /** Suma de los ítems a precio de lista, antes de cualquier descuento. */
  lista: number;
  /** Lo que se descontó por cantidad. */
  descuento: number;
  envio: number;
  total: number;
};

export function desglosar(datos: { subtotal: number; ahorro: number; envio: number }): Desglose {
  const descuento = Math.max(0, datos.ahorro);

  return {
    lista: datos.subtotal + descuento,
    descuento,
    envio: datos.envio,
    total: datos.subtotal + datos.envio,
  };
}
