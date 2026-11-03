"use client";

import { useEffect, useSyncExternalStore } from "react";

/**
 * El suscriptor reconocido en este navegador (app/api/suscriptores/sesion),
 * para las páginas con cache: la portada, la ficha y /suscriptores son
 * iguales para todos, y con esto la caja de suscripción le habla a quien ya
 * es suscriptor en vez de invitarlo. Una sola consulta por visita, compartida
 * por todas las cajas de la página; después de entrar o salir se vuelve a
 * preguntar con `refrescarSuscriptor`.
 */

export type SuscriptorEnSesion = {
  email: string;
  nombre: string;
  cupon: "Disponible" | "Usado";
  saldoDisponible: number;
};

type Estado = { cargando: boolean; suscriptor: SuscriptorEnSesion | null };

const EN_EL_SERVIDOR: Estado = { cargando: true, suscriptor: null };
let estado: Estado = EN_EL_SERVIDOR;
let pedido: Promise<void> | null = null;
const oyentes = new Set<() => void>();

function cambiar(nuevo: Estado) {
  estado = nuevo;
  for (const oyente of oyentes) oyente();
}

/** Vuelve a preguntar quién está (después de suscribirse, entrar, salir o darse de baja). */
export function refrescarSuscriptor(): Promise<void> {
  pedido = fetch("/api/suscriptores/sesion", { cache: "no-store" })
    .then((r) => (r.ok ? (r.json() as Promise<{ suscriptor?: SuscriptorEnSesion | null }>) : { suscriptor: null }))
    .then((d) => cambiar({ cargando: false, suscriptor: d.suscriptor ?? null }))
    // Sin respuesta, la página sigue como para cualquiera: con la invitación.
    .catch(() => cambiar({ cargando: false, suscriptor: null }));
  return pedido;
}

function escuchar(oyente: () => void) {
  oyentes.add(oyente);
  return () => oyentes.delete(oyente);
}

export function useSuscriptor(): Estado {
  const actual = useSyncExternalStore(escuchar, () => estado, () => EN_EL_SERVIDOR);
  useEffect(() => {
    if (!pedido) void refrescarSuscriptor();
  }, []);
  return actual;
}
