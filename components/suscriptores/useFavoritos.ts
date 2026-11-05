"use client";

import { useSyncExternalStore } from "react";
import { cambiarFavorito, normalizarSku } from "@/lib/favoritos";
import { actualizarFavoritos, esperarSuscriptor, refrescarSuscriptor, suscriptorActual, useSuscriptor } from "./useSuscriptor";

/**
 * El corazón de los anteojos (Ale, 05/11/2026), del lado del navegador. Los
 * favoritos viajan con la sesión del suscriptor (useSuscriptor): el corazón
 * se llena al toque y el pedido a /api/suscriptores/favoritos va detrás, uno
 * por vez y en orden, así dos toques rápidos no se pisan. Si el servidor no
 * lo guarda, se vuelve a leer la sesión y el corazón queda como está de
 * verdad. Sin sesión, el aviso invita a entrar a la cuenta.
 */

export type AvisoFavorito = {
  tipo: "entrar" | "guardado" | "quitado" | "error";
  sku: string;
  /** «CITRINO Carey». */
  que: string;
};

let aviso: AvisoFavorito | null = null;
const oyentes = new Set<() => void>();

export function mostrarAviso(nuevo: AvisoFavorito | null) {
  aviso = nuevo;
  for (const oyente of oyentes) oyente();
}

function escuchar(oyente: () => void) {
  oyentes.add(oyente);
  return () => oyentes.delete(oyente);
}

/** El aviso de abajo (components/suscriptores/AvisoFavoritos.tsx). */
export function useAvisoFavorito(): AvisoFavorito | null {
  return useSyncExternalStore(escuchar, () => aviso, () => null);
}

/** Si ese color está entre los favoritos de la sesión. */
export function useFavorito(sku: string): boolean {
  const { suscriptor } = useSuscriptor();
  const s = normalizarSku(sku);
  return Boolean(s && suscriptor?.favoritos?.includes(s));
}

let enCamino = 0;
let cola: Promise<void> = Promise.resolve();

/** Toca el corazón: `quiere` lo suma o lo saca. `que` es lo que dice el aviso. */
export async function alternarFavorito(sku: string, que: string, quiere: boolean, opciones: { conAviso?: boolean } = {}): Promise<void> {
  const s = normalizarSku(sku);
  if (!s) return;
  const conAviso = opciones.conAviso ?? true;

  await esperarSuscriptor();
  const cuenta = suscriptorActual().suscriptor;
  if (!cuenta) {
    mostrarAviso({ tipo: "entrar", sku: s, que });
    return;
  }

  actualizarFavoritos(cambiarFavorito(cuenta.favoritos ?? [], s, quiere));
  if (conAviso) mostrarAviso({ tipo: quiere ? "guardado" : "quitado", sku: s, que });

  enCamino += 1;
  cola = cola.then(async () => {
    try {
      const r = await fetch("/api/suscriptores/favoritos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku: s, favorito: quiere }),
      });
      if (r.status === 401) {
        // La sesión se cerró (venció o salió en otra pestaña): se invita a entrar.
        await refrescarSuscriptor();
        mostrarAviso({ tipo: "entrar", sku: s, que });
        return;
      }
      const cuerpo = (await r.json().catch(() => ({}))) as { favoritos?: unknown };
      if (!r.ok || !Array.isArray(cuerpo.favoritos)) throw new Error(`favoritos ${r.status}`);
      // Con otro toque esperando, la respuesta de este ya quedó vieja: manda la del último.
      if (enCamino === 1) actualizarFavoritos(cuerpo.favoritos.filter((x): x is string => typeof x === "string"));
    } catch {
      mostrarAviso({ tipo: "error", sku: s, que });
      await refrescarSuscriptor();
    } finally {
      enCamino -= 1;
    }
  });
  return cola;
}
