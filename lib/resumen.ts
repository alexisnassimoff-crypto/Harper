/**
 * El desglose que ve el comprador en el carrito y en el checkout.
 *
 * `subtotal` viene del servidor YA descontado (es lo que suma cada ítem a su
 * precio unitario real). Mostrarlo como "Subtotal" y debajo restar otra vez el
 * descuento hacía que las cifras no cerraran: parecía que se descontaba dos
 * veces. Acá se reconstruye el precio de lista para que la cuenta se lea de
 * arriba abajo: lista − descuento − saldo (− dinero en Mercado Pago) + envío
 * = total.
 *
 * Ale, 18/11/2026: los beneficios en plata de la suscripción terminaron
 * (lib/suscriptores.ts). El cupón de bienvenida ya no existe y no tiene
 * renglón propio: el servidor manda 0. Si alguna vez llegara un importe en ese
 * campo, se suma al descuento (que sí tiene renglón) para que la cuenta siga
 * cerrando. El saldo que alguien tuviera de antes sigue en su renglón, y no
 * cuenta como ahorro: es plata del comprador.
 *
 * Lo que falta (queda para la etapa del Crédito Harper): el crédito usado
 * también viene ya descontado de `subtotal` y acá no tiene renglón, así que
 * con crédito «Subtotal» muestra la lista menos el crédito. La cuenta cierra,
 * pero el crédito solo se nombra en su caja del checkout.
 */
export type Desglose = {
  /** Suma de los ítems a precio de lista, antes de cualquier descuento. */
  lista: number;
  /** Lo que se descontó por cantidad, con el Dúo o con un cupón. */
  descuento: number;
  /**
   * Siempre 0 desde el 18/11/2026: el cupón de bienvenida terminó y no tiene
   * renglón. Queda hasta la limpieza, con la prueba que lo lee.
   */
  cupon: number;
  /** Lo que se paga con el saldo a favor de antes del 18/11/2026; 0 si no se usa. */
  saldo: number;
  /** El 10% adicional por pagar con dinero en Mercado Pago; 0 con Mercado Pago. */
  dineroMP: number;
  envio: number;
  total: number;
  /** Todo lo que se ahorró: los descuentos y el 10% por dinero en Mercado Pago. */
  ahorroTotal: number;
};

export function desglosar(datos: {
  subtotal: number;
  ahorro: number;
  envio: number;
  /** Lo que descuenta el pago con dinero en Mercado Pago sobre `subtotal`, si se paga así. */
  ahorroDineroMP?: number;
  /**
   * Lo de la cuenta que ya está descontado de `subtotal`: el saldo usado y,
   * por si llegara, el cupón de antes del 18/11/2026 (hoy el servidor manda 0).
   */
  suscriptor?: { saldoUsado: number; cupon?: number } | null;
}): Desglose {
  // El cupón de antes va con los descuentos: no tiene renglón propio.
  const descuento = Math.max(0, datos.ahorro) + Math.max(0, datos.suscriptor?.cupon ?? 0);
  const dineroMP = Math.max(0, datos.ahorroDineroMP ?? 0);
  const saldo = Math.max(0, datos.suscriptor?.saldoUsado ?? 0);

  return {
    lista: datos.subtotal + descuento + saldo,
    descuento,
    cupon: 0,
    saldo,
    dineroMP,
    envio: datos.envio,
    total: datos.subtotal - dineroMP + datos.envio,
    ahorroTotal: descuento + dineroMP,
  };
}
