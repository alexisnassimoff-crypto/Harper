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
  /** Falso si se dio de baja: tiene sesión para usar su saldo, pero no beneficios nuevos. */
  activo?: boolean;
  /** Los SKU guardados con el corazón, el más reciente primero (lib/favoritos.ts). */
  favoritos?: string[];
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
let secuencia = 0;

export function refrescarSuscriptor(): Promise<void> {
  // Si se pregunta dos veces seguidas (entrar y guardar un favorito), vale la
  // última respuesta: una anterior que llegue tarde no la pisa.
  const esta = ++secuencia;
  const aplicar = (nuevo: Estado) => {
    if (esta === secuencia) cambiar(nuevo);
  };
  pedido = fetch("/api/suscriptores/sesion", { cache: "no-store" })
    .then((r) => (r.ok ? (r.json() as Promise<{ suscriptor?: SuscriptorEnSesion | null }>) : { suscriptor: null }))
    .then((d) => aplicar({ cargando: false, suscriptor: d.suscriptor ?? null }))
    // Sin respuesta, la página sigue como para cualquiera: con la invitación.
    .catch(() => aplicar({ cargando: false, suscriptor: null }));
  return pedido;
}

/**
 * Cambia los favoritos de la sesión en este navegador, sin preguntar al
 * servidor: el corazón se llena al toque (components/suscriptores/useFavoritos.ts).
 */
export function actualizarFavoritos(favoritos: string[]) {
  if (!estado.suscriptor) return;
  cambiar({ ...estado, suscriptor: { ...estado.suscriptor, favoritos } });
}

/** El estado actual, fuera de React (para la cola de los favoritos). */
export function suscriptorActual(): Estado {
  return estado;
}

/** Espera a saber quién está (si todavía no se preguntó, pregunta). */
export function esperarSuscriptor(): Promise<void> {
  return estado.cargando ? (pedido ?? refrescarSuscriptor()) : Promise.resolve();
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
