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
  const { vaciar, listo, items } = useCarrito();

  useEffect(() => {
    if (listo && items.length > 0) vaciar();
  }, [listo, items.length, vaciar]);

  return null;
}
