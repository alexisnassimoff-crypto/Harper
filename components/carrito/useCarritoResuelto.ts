"use client";

import { useEffect, useState } from "react";
import type { ItemResuelto } from "@/lib/tipos";
import { useCarrito } from "./CarritoContexto";

export type CarritoResueltoCliente = {
  items: ItemResuelto[];
  descartados: { varianteId: string; motivo: "no-existe" | "sin-stock" }[];
  subtotal: number;
  envio: number;
  total: number;
  envioGratisDesde: number;
  plazoEntrega: string;
};

/**
 * Resuelve el carrito guardado en el navegador contra el servidor.
 *
 * Los precios y el stock que se muestran salen siempre de acá, nunca de
 * localStorage: si cambió un precio o se acabó el stock, el carrito se corrige solo.
 */
export function useCarritoResuelto() {
  const { items, listo, quitar } = useCarrito();
  const [datos, setDatos] = useState<CarritoResueltoCliente | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!listo) return;

    if (items.length === 0) {
      setDatos(null);
      setCargando(false);
      return;
    }

    const controlador = new AbortController();
    setCargando(true);
    setError(false);

    fetch("/api/carrito/resolver", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
      signal: controlador.signal,
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<CarritoResueltoCliente>;
      })
      .then((resuelto) => {
        setDatos(resuelto);
        // Limpia del carrito lo que ya no se puede comprar.
        for (const d of resuelto.descartados) quitar(d.varianteId);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(true);
      })
      .finally(() => setCargando(false));

    return () => controlador.abort();
    // `quitar` es estable (useCallback) y `items` cambia por contenido.
  }, [items, listo, quitar]);

  return { datos, cargando: cargando || !listo, error };
}
