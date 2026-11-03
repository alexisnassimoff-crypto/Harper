/**
 * El desglose que ve el comprador en el carrito y en el checkout.
 *
 * `subtotal` viene del servidor YA descontado (es lo que suma cada ítem a su
 * precio unitario real). Mostrarlo como "Subtotal" y debajo restar otra vez el
 * descuento hacía que las cifras no cerraran: parecía que se descontaba dos
 * veces. Acá se reconstruye el precio de lista para que la cuenta se lea de
 * arriba abajo: lista − descuento − cupón − saldo (− dinero en Mercado Pago)
 * + envío = total.
 *
 * El cupón de bienvenida y el saldo de un suscriptor (Ale, 03/11/2026,
 * lib/suscriptores.ts) van cada uno en su renglón: el servidor no los suma al
 * `ahorro` de las promociones. El saldo no cuenta como ahorro: es plata del
 * comprador.
 */
export type Desglose = {
  /** Suma de los ítems a precio de lista, antes de cualquier descuento. */
  lista: number;
  /** Lo que se descontó por cantidad o con el cupón. */
  descuento: number;
  /** El cupón de bienvenida del suscriptor; 0 si no se aplicó. */
  cupon: number;
  /** Lo que se paga con el saldo del suscriptor; 0 si no se usa. */
  saldo: number;
  /** El 10% adicional por pagar con dinero en Mercado Pago; 0 con Mercado Pago. */
  dineroMP: number;
  envio: number;
  total: number;
  /** Todo lo que se ahorró: la promoción, el cupón de bienvenida y el 10% por dinero en Mercado Pago. */
  ahorroTotal: number;
};

export function desglosar(datos: {
  subtotal: number;
  ahorro: number;
  envio: number;
  /** Lo que descuenta el pago con dinero en Mercado Pago sobre `subtotal`, si se paga así. */
  ahorroDineroMP?: number;
  /** Los beneficios del suscriptor que ya están descontados de `subtotal`. */
  suscriptor?: { cupon: number; saldoUsado: number } | null;
}): Desglose {
  const descuento = Math.max(0, datos.ahorro);
  const dineroMP = Math.max(0, datos.ahorroDineroMP ?? 0);
  const cupon = Math.max(0, datos.suscriptor?.cupon ?? 0);
  const saldo = Math.max(0, datos.suscriptor?.saldoUsado ?? 0);

  return {
    lista: datos.subtotal + descuento + cupon + saldo,
    descuento,
    cupon,
    saldo,
    dineroMP,
    envio: datos.envio,
    total: datos.subtotal - dineroMP + datos.envio,
    ahorroTotal: descuento + cupon + dineroMP,
  };
}
