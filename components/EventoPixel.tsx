"use client";

import { useEffect, useRef } from "react";

/**
 * Dispara un evento del píxel de Meta una sola vez al montarse la página.
 * Inofensivo si el píxel no está configurado o todavía no cargó: reintenta
 * un ratito y desiste en silencio.
 */
export default function EventoPixel({
  evento,
  data,
}: {
  evento: string;
  data?: Record<string, unknown>;
}) {
  const disparado = useRef(false);

  useEffect(() => {
    if (disparado.current) return;
    let intentos = 0;
    const timer = setInterval(() => {
      if (window.fbq) {
        if (!disparado.current) {
          disparado.current = true;
          window.fbq("track", evento, data ?? {});
        }
        clearInterval(timer);
      } else if (++intentos > 20) {
        clearInterval(timer);
      }
    }, 250);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
