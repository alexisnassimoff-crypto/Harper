"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { normalizarCodigo } from "@/lib/cupones";
import type { ItemCarrito } from "@/lib/tipos";

const CLAVE = "harper.carrito.v1";
/** El cupón aplicado (por ejemplo desde la ficha), hasta el pago. */
const CLAVE_CUPON = "harper.cupon.v1";

type ContextoCarrito = {
  items: ItemCarrito[];
  /** Cantidad total de unidades, para el contador del header. */
  unidades: number;
  /** Verdadero recién cuando se leyó localStorage (evita parpadeos en SSR). */
  listo: boolean;
  agregar: (item: ItemCarrito) => void;
  cambiarCantidad: (varianteId: string, cantidad: number) => void;
  quitar: (varianteId: string) => void;
  vaciar: () => void;
  /** El código aplicado, o null. Cuánto descuenta lo decide el servidor. */
  cupon: string | null;
  aplicarCupon: (codigo: string) => void;
  quitarCupon: () => void;
};

const Carrito = createContext<ContextoCarrito | null>(null);

function leerGuardado(): ItemCarrito[] {
  if (typeof window === "undefined") return [];

  try {
    const crudo = window.localStorage.getItem(CLAVE);
    if (!crudo) return [];

    const parseado: unknown = JSON.parse(crudo);
    if (!Array.isArray(parseado)) return [];

    // Se valida cada ítem: un localStorage corrupto no puede romper la tienda.
    return parseado.filter(
      (i): i is ItemCarrito =>
        typeof i === "object" &&
        i !== null &&
        typeof (i as ItemCarrito).varianteId === "string" &&
        typeof (i as ItemCarrito).productoSlug === "string" &&
        Number.isFinite((i as ItemCarrito).cantidad)
    );
  } catch {
    return [];
  }
}

export function ProveedorCarrito({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ItemCarrito[]>([]);
  const [cupon, setCupon] = useState<string | null>(null);
  const [listo, setListo] = useState(false);

  // Carga inicial desde localStorage, después de hidratar.
  useEffect(() => {
    setItems(leerGuardado());
    try {
      setCupon(normalizarCodigo(window.localStorage.getItem(CLAVE_CUPON)) || null);
    } catch {
      // Sin almacenamiento, sin cupón guardado.
    }
    setListo(true);
  }, []);

  useEffect(() => {
    if (!listo) return;
    try {
      if (cupon) window.localStorage.setItem(CLAVE_CUPON, cupon);
      else window.localStorage.removeItem(CLAVE_CUPON);
    } catch {
      // El cupón sigue aplicado en memoria.
    }
  }, [cupon, listo]);

  // Persiste en cada cambio, pero recién cuando ya se leyó lo guardado:
  // si no, el primer render pisaría el carrito con un array vacío.
  useEffect(() => {
    if (!listo) return;

    try {
      window.localStorage.setItem(CLAVE, JSON.stringify(items));
    } catch {
      // Modo incógnito o almacenamiento lleno: el carrito sigue vivo en memoria.
    }
  }, [items, listo]);

  const agregar = useCallback((nuevo: ItemCarrito) => {
    setItems((previos) => {
      const existente = previos.find((i) => i.varianteId === nuevo.varianteId);

      if (!existente) return [...previos, nuevo];

      return previos.map((i) =>
        i.varianteId === nuevo.varianteId
          ? { ...i, cantidad: i.cantidad + nuevo.cantidad }
          : i
      );
    });
  }, []);

  const cambiarCantidad = useCallback((varianteId: string, cantidad: number) => {
    setItems((previos) =>
      cantidad <= 0
        ? previos.filter((i) => i.varianteId !== varianteId)
        : previos.map((i) =>
            i.varianteId === varianteId ? { ...i, cantidad } : i
          )
    );
  }, []);

  const quitar = useCallback((varianteId: string) => {
    setItems((previos) => previos.filter((i) => i.varianteId !== varianteId));
  }, []);

  const vaciar = useCallback(() => setItems([]), []);

  const aplicarCupon = useCallback((codigo: string) => setCupon(normalizarCodigo(codigo) || null), []);
  const quitarCupon = useCallback(() => setCupon(null), []);

  const valor = useMemo<ContextoCarrito>(
    () => ({
      items,
      unidades: items.reduce((total, i) => total + i.cantidad, 0),
      listo,
      agregar,
      cambiarCantidad,
      quitar,
      vaciar,
      cupon,
      aplicarCupon,
      quitarCupon,
    }),
    [items, listo, agregar, cambiarCantidad, quitar, vaciar, cupon, aplicarCupon, quitarCupon]
  );

  return <Carrito.Provider value={valor}>{children}</Carrito.Provider>;
}

export function useCarrito() {
  const contexto = useContext(Carrito);

  if (!contexto) {
    throw new Error("useCarrito tiene que usarse dentro de <ProveedorCarrito>");
  }

  return contexto;
}
