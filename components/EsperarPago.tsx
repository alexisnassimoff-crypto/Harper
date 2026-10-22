"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/** Cada cuánto se vuelve a consultar el estado del pedido. */
const CADA_MS = 3000;

/** Cuántas veces, antes de dejar de insistir y remitir al mail. */
const INTENTOS = 20;

/**
 * Mientras el pedido figura "pendiente", vuelve a pedir la página cada pocos
 * segundos: el webhook de Mercado Pago suele confirmar el pago unos segundos
 * después de que el comprador vuelve a la tienda.
 *
 * La página se renderiza en el servidor leyendo Airtable, así que `refresh()`
 * trae el estado real sin recargar ni perder nada. Cuando el pedido pasa a
 * "pagado", la página deja de renderizar este componente y el ciclo termina.
 */
export default function EsperarPago() {
  const router = useRouter();
  const [intentos, setIntentos] = useState(0);

  useEffect(() => {
    if (intentos >= INTENTOS) return;

    const id = window.setTimeout(() => {
      setIntentos((n) => n + 1);
      router.refresh();
    }, CADA_MS);

    return () => window.clearTimeout(id);
  }, [intentos, router]);

  return (
    <p className="apagado" style={{ fontSize: "0.875rem" }} aria-live="polite">
      {intentos < INTENTOS
        ? "Esta página se actualiza sola apenas Mercado Pago nos confirme el pago."
        : "Mercado Pago todavía no nos confirmó el pago. Si pagaste, la confirmación te llega por mail apenas se acredite; no hace falta que vuelvas a pagar."}
    </p>
  );
}
