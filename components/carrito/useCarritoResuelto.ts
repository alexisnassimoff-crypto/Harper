"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ItemResuelto } from "@/lib/tipos";
import type { Tramo } from "@/lib/descuentos";
import type { Sugerencia } from "@/lib/sugerencias";
import type { CuponResuelto } from "@/lib/cupones";
import type { CuotasVerificadas } from "@/lib/cuotas";
import { useCarrito } from "./CarritoContexto";

export type CarritoResueltoCliente = {
  items: ItemResuelto[];
  descartados: { varianteId: string; motivo: "no-existe" | "sin-stock" }[];
  subtotal: number;
  envio: number;
  total: number;
  envioGratisDesde: number;
  /** Falso cuando `envio` es la tarifa plana de respaldo, no una cotización. */
  envioCotizado: boolean;
  /** Lo que se ahorró: por volumen o con el cupón (nunca los dos). */
  ahorro: number;
  /** Qué pasó con el cupón aplicado; null si no hay. */
  cupon: CuponResuelto | null;
  /** El subtotal sin el cupón: la base del envío gratis. */
  subtotalSinCupon: number;
  /** Los productos pagados con dinero en Mercado Pago (10% más); null si no se ofrece. */
  dineroMP: { porcentaje: number; subtotal: number; ahorro: number } | null;
  /** Los tramos vigentes, para poder empujar al siguiente. */
  tramos: Tramo[];
  /** Lo que le falta al carrito, según lo que ya eligió. */
  sugerencias: Sugerencia[];
  /** Solo si se pidieron: las cuotas sin interés confirmadas para `monto` (el total con tarjeta). */
  cuotas?: (CuotasVerificadas & { monto: number }) | null;
};

/**
 * Las consultas en curso, compartidas: si dos partes de la página piden lo
 * mismo a la vez (la ficha y el carrito lateral, al agregar un producto), va
 * una sola al servidor y las dos usan la respuesta.
 */
const enCurso = new Map<string, Promise<CarritoResueltoCliente>>();

function resolver(cuerpo: string): Promise<CarritoResueltoCliente> {
  const existente = enCurso.get(cuerpo);
  if (existente) return existente;
  const promesa = fetch("/api/carrito/resolver", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: cuerpo,
  })
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json() as Promise<CarritoResueltoCliente>;
    })
    .finally(() => enCurso.delete(cuerpo));
  enCurso.set(cuerpo, promesa);
  return promesa;
}

/**
 * Resuelve el carrito guardado en el navegador contra el servidor.
 *
 * Los precios y el stock que se muestran salen siempre de acá, nunca de
 * localStorage: si cambió un precio o se acabó el stock, el carrito se corrige solo.
 *
 * Dos reglas que antes no se cumplían:
 *
 *  - Mientras se vuelve a consultar (un toque en +/−), la vista anterior se
 *    mantiene: `actualizando` avisa, pero nada se desmonta.
 *  - Si el servidor falla, el carrito del comprador queda intacto. Un fallo
 *    transitorio de Airtable no puede borrarle nada ni decirle que no tiene
 *    nada para comprar: se muestra lo último que se sabía y un botón para
 *    reintentar.
 */
export function useCarritoResuelto({ cuotas = false }: { cuotas?: boolean } = {}) {
  const { items, listo, quitar, cupon } = useCarrito();
  const [datos, setDatos] = useState<CarritoResueltoCliente | null>(null);
  const [cargando, setCargando] = useState(true);
  const [actualizando, setActualizando] = useState(false);
  const [error, setError] = useState(false);
  const [intento, setIntento] = useState(0);

  // Para distinguir "primera carga" de "actualización" sin meter `datos` en
  // las dependencias del efecto (volvería a disparar la consulta).
  const tieneDatos = useRef(false);
  tieneDatos.current = datos !== null;

  const recargar = useCallback(() => setIntento((n) => n + 1), []);

  useEffect(() => {
    if (!listo) return;

    if (items.length === 0) {
      setDatos(null);
      setCargando(false);
      setActualizando(false);
      setError(false);
      return;
    }

    // Si el carrito cambia antes de que llegue la respuesta, esa respuesta ya
    // no sirve: no toca nada (ni siquiera "ya cargó", que haría parpadear un
    // carrito vacío mientras llega la nueva).
    let vigente = true;
    if (tieneDatos.current) setActualizando(true);
    else setCargando(true);

    resolver(JSON.stringify({ items, cupon, ...(cuotas ? { cuotas: true } : {}) }))
      .then((resuelto) => {
        if (!vigente) return;
        setDatos(resuelto);
        setError(false);
        // Limpia del carrito lo que ya no se puede comprar. Solo con respuesta
        // buena: un error del servidor no es "este producto no existe".
        for (const d of resuelto.descartados) quitar(d.varianteId);
      })
      .catch(() => {
        if (vigente) setError(true);
      })
      .finally(() => {
        if (!vigente) return;
        setCargando(false);
        setActualizando(false);
      });

    return () => {
      vigente = false;
    };
    // `quitar` es estable (useCallback) y `items` cambia por contenido.
  }, [items, listo, quitar, intento, cupon, cuotas]);

  return { datos, cargando: cargando || !listo, actualizando, error, recargar };
}
