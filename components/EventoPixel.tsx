"use client";

import { useEffect, useRef } from "react";
import { trackPixel } from "@/lib/pixel";

/**
 * Dispara un evento del píxel de Meta una sola vez al montarse la página.
 *
 * Inofensivo si el píxel no está configurado o todavía no cargó: reintenta
 * un ratito y desiste en silencio.
 *
 *  - `eventID`: el identificador que comparte con la Conversions API, para
 *    que Meta deduplique el evento del navegador y el del servidor.
 *  - `unaVez`: clave de localStorage que impide repetir el evento en esa
 *    pestaña o dispositivo (recargar /gracias no es otra compra).
 */
export default function EventoPixel({
  evento,
  data,
  eventID,
  unaVez,
}: {
  evento: string;
  data?: Record<string, unknown>;
  eventID?: string;
  unaVez?: string;
}) {
  const disparado = useRef(false);

  useEffect(() => {
    if (disparado.current) return;

    if (unaVez) {
      try {
        if (window.localStorage.getItem(unaVez)) {
          disparado.current = true;
          return;
        }
      } catch {
        // Sin almacenamiento, el eventID sigue deduplicando en Meta.
      }
    }

    let intentos = 0;
    const timer = setInterval(() => {
      if (disparado.current) {
        clearInterval(timer);
        return;
      }

      if (trackPixel(evento, data ?? {}, { eventID })) {
        disparado.current = true;
        clearInterval(timer);

        if (unaVez) {
          try {
            window.localStorage.setItem(unaVez, new Date().toISOString());
          } catch {
            // Igual que arriba.
          }
        }
      } else if (++intentos > 20) {
        clearInterval(timer);
      }
    }, 250);

    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
