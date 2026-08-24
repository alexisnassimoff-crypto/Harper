"use client";

import { useEffect, useState } from "react";
import { useCarrito } from "@/components/carrito/CarritoContexto";
import type { OpcionEnvio } from "@/lib/tipos";
import type { Sucursal } from "@/lib/correo";

/** Lo que contesta /api/envio/cotizar. */
export type Cotizacion = {
  opciones: OpcionEnvio[];
  /** Falso cuando `envio` es el precio plano de respaldo. */
  cotizado: boolean;
  envio: number;
  subtotal: number;
  total: number;
  /** El pedido llega al mínimo y el envío lo paga Harper. */
  bonificado: boolean;
};

/** Espera antes de cotizar, para no pegarle a Correo Argentino en cada tecla. */
const ESPERA_MS = 700;

/**
 * Cotiza el envío contra Correo Argentino a medida que el comprador escribe su
 * código postal.
 *
 * Nunca falla hacia afuera: si algo sale mal devuelve `null` y el checkout
 * sigue mostrando el precio plano que ya venía del carrito.
 */
export function useCotizacionEnvio(cp: string) {
  const { items } = useCarrito();
  const [cotizacion, setCotizacion] = useState<Cotizacion | null>(null);
  const [cargando, setCargando] = useState(false);

  const limpio = cp.replace(/\D/g, "");

  useEffect(() => {
    if (limpio.length < 4 || items.length === 0) {
      setCotizacion(null);
      return;
    }

    const controlador = new AbortController();
    setCargando(true);

    const id = window.setTimeout(() => {
      fetch("/api/envio/cotizar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cp: limpio, items }),
        signal: controlador.signal,
      })
        .then((r) => (r.ok ? (r.json() as Promise<Cotizacion>) : null))
        .then((datos) => {
          if (datos) setCotizacion(datos);
        })
        .catch(() => {
          // Sin cotización se sigue con el precio plano. No es un error visible.
        })
        .finally(() => setCargando(false));
    }, ESPERA_MS);

    return () => {
      window.clearTimeout(id);
      controlador.abort();
      setCargando(false);
    };
    // `items` cambia por contenido, no por identidad.
  }, [limpio, items]);

  return { cotizacion, cargando };
}

/**
 * Sucursales donde retirar, para la provincia elegida.
 *
 * Solo se piden cuando hacen falta. Si Correo Argentino no contesta, la lista
 * queda vacía y el checkout esconde la opción de retiro en sucursal.
 */
export function useSucursales(provincia: string, activo: boolean) {
  const [lista, setLista] = useState<Sucursal[]>([]);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    if (!activo || !provincia) {
      setLista([]);
      return;
    }

    const controlador = new AbortController();
    setCargando(true);

    fetch(`/api/envio/sucursales?provincia=${encodeURIComponent(provincia)}`, {
      signal: controlador.signal,
    })
      .then((r) => (r.ok ? (r.json() as Promise<{ sucursales: Sucursal[] }>) : null))
      .then((datos) => setLista(datos?.sucursales ?? []))
      .catch(() => setLista([]))
      .finally(() => setCargando(false));

    return () => controlador.abort();
  }, [provincia, activo]);

  return { sucursales: lista, cargando };
}
