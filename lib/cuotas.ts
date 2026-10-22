/**
 * Cuotas sin interés.
 *
 * La tienda no decide si hay cuotas: lo decide la cuenta de Mercado Pago. Acá
 * solo se refleja lo que Ale activó allá, cargando `NEXT_PUBLIC_CUOTAS` con la
 * misma cantidad que figura en el panel de MP. Si la variable no está, no se
 * promete nada: anunciar cuotas que después el checkout no ofrece es la forma
 * más rápida de perder una venta y la confianza.
 */

/** Cantidad de cuotas activas, o `null` si no corresponde mostrarlas. */
export function cuotasActivas(): number | null {
  // La referencia tiene que ser literal para que Next la incruste en el bundle.
  const crudo = process.env.NEXT_PUBLIC_CUOTAS ?? "";
  const n = Number.parseInt(crudo, 10);

  if (!Number.isInteger(n) || n < 2) return null;
  return n;
}

/**
 * Lo que se paga por cuota, redondeado hacia arriba al peso.
 *
 * Hacia arriba a propósito: si Mercado Pago muestra un centavo menos, nadie se
 * queja; al revés, sí.
 */
export function importeCuota(precio: number, cuotas: number): number {
  if (cuotas < 1) return precio;
  return Math.ceil(precio / cuotas);
}
