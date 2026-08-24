"use client";

import { useRef } from "react";

/**
 * Detecta el deslizamiento horizontal para pasar de foto.
 *
 * Solo actúa si el movimiento es más horizontal que vertical, así el scroll de
 * la página sigue funcionando con el dedo. Cuando hubo deslizamiento se anula
 * el clic que el navegador dispara después, para que arrastrar sobre una ficha
 * no termine navegando al producto.
 *
 * Hay que frenar el arrastre nativo: los enlaces y las imágenes son
 * arrastrables por defecto, y al empezar ese arrastre el navegador dispara
 * `pointercancel` y corta el gesto a mitad de camino.
 */
export function useDeslizar({
  alSiguiente,
  alAnterior,
  umbral = 40,
}: {
  alSiguiente: () => void;
  alAnterior: () => void;
  /** Distancia mínima en píxeles para que cuente. */
  umbral?: number;
}) {
  const inicio = useRef<{ x: number; y: number } | null>(null);
  const deslizando = useRef(false);
  const bloquearClic = useRef(false);

  return {
    // `pan-y` deja el scroll vertical al navegador y nos entrega el horizontal.
    style: { touchAction: "pan-y" as const },

    onPointerDown(e: React.PointerEvent) {
      if (!e.isPrimary) return;
      inicio.current = { x: e.clientX, y: e.clientY };
      deslizando.current = false;
    },

    onPointerMove(e: React.PointerEvent) {
      const desde = inicio.current;
      if (!desde) return;

      const dx = e.clientX - desde.x;
      const dy = e.clientY - desde.y;
      if (Math.abs(dx) > umbral && Math.abs(dx) > Math.abs(dy)) {
        deslizando.current = true;
      }
    },

    onPointerUp(e: React.PointerEvent) {
      const desde = inicio.current;
      inicio.current = null;
      if (!desde || !deslizando.current) return;

      bloquearClic.current = true;
      deslizando.current = false;

      if (e.clientX - desde.x < 0) alSiguiente();
      else alAnterior();
    },

    onPointerCancel() {
      inicio.current = null;
      deslizando.current = false;
    },

    onDragStart(e: React.DragEvent) {
      e.preventDefault();
    },

    // En captura, para llegar antes que el <Link> que envuelve la foto.
    onClickCapture(e: React.MouseEvent) {
      if (!bloquearClic.current) return;
      bloquearClic.current = false;
      e.preventDefault();
      e.stopPropagation();
    },
  };
}
