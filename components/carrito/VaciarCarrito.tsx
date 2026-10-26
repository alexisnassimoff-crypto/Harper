"use client";

import { useEffect } from "react";
import { useCarrito } from "./CarritoContexto";

/**
 * Vacía el carrito al llegar a la página de gracias.
 *
 * Se hace acá y no antes de ir a Mercado Pago: si el comprador vuelve atrás
 * sin pagar, su carrito tiene que seguir intacto.
 */
export default function VaciarCarrito() {
  const { vaciar, listo, items, cupon, quitarCupon } = useCarrito();

  useEffect(() => {
    if (listo && items.length > 0) vaciar();
    // El cupón de bienvenida ya se usó en esta compra.
    if (listo && cupon) quitarCupon();
  }, [listo, items.length, vaciar, cupon, quitarCupon]);

  return null;
}
