"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Píxel de Meta para la pauta de Harper.
 *
 * Se activa solo si NEXT_PUBLIC_META_PIXEL_ID está configurada (sin la
 * variable, el sitio ni lo menciona). El script base se inyecta una vez y
 * cada cambio de ruta dispara un PageView; los eventos de valor
 * (ViewContent, InitiateCheckout, Purchase) los disparan las páginas con
 * <EventoPixel/>. Con esos cuatro eventos, las campañas Advantage+ tienen
 * todo lo que necesitan para optimizar a compra.
 */
const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID ?? "";

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    _fbq?: unknown;
  }
}

export default function MetaPixel() {
  const pathname = usePathname();

  useEffect(() => {
    if (!PIXEL_ID || typeof window === "undefined") return;
    if (!window.fbq) {
      const n: any = (window.fbq = function (...args: unknown[]) {
        n.callMethod ? n.callMethod.apply(n, args) : n.queue.push(args);
      });
      if (!window._fbq) window._fbq = n;
      n.push = n;
      n.loaded = true;
      n.version = "2.0";
      n.queue = [];
      const s = document.createElement("script");
      s.async = true;
      s.src = "https://connect.facebook.net/en_US/fbevents.js";
      document.head.appendChild(s);
      window.fbq("init", PIXEL_ID);
    }
    window.fbq("track", "PageView");
  }, [pathname]);

  return null;
}
