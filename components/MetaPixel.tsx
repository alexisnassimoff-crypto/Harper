"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
// El tipo global de `window.fbq` vive en lib/pixel.ts, junto con los eventos.
import "@/lib/pixel";
import { CLAVE_ORIGEN } from "@/lib/origen";
import {
  aceptaPublicidad,
  borrarRastrosPublicitarios,
  EVENTO_CONSENTIMIENTO,
  type Consentimiento,
} from "@/lib/consentimiento";

/**
 * Píxel de Meta para la pauta de Harper.
 *
 * Se activa solo si NEXT_PUBLIC_META_PIXEL_ID está configurada Y la persona
 * aceptó las cookies de medición y publicidad. Sin ese "sí" el script de Meta
 * no se descarga, no se crean las cookies _fbp/_fbc y no sale ningún evento.
 * Si después rechaza, se revoca el consentimiento en el píxel, se dejan de
 * mandar eventos y se borran sus cookies.
 *
 * El script base se inyecta una vez y cada cambio de ruta dispara un PageView;
 * los eventos de valor los disparan las páginas con <EventoPixel/>.
 */
const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID ?? "";

function cargarPixel() {
  if (window.fbq) {
    window.fbq("consent", "grant");
    return;
  }
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

export default function MetaPixel() {
  const pathname = usePathname();
  const [permitido, setPermitido] = useState(false);

  // La elección guardada al entrar y los cambios que haga después.
  useEffect(() => {
    setPermitido(aceptaPublicidad());

    function alCambiar(evento: Event) {
      const dato = (evento as CustomEvent<Consentimiento>).detail;
      setPermitido(dato?.publicidad === true);
      if (dato?.publicidad !== true) {
        if (window.fbq) window.fbq("consent", "revoke");
        borrarRastrosPublicitarios(CLAVE_ORIGEN);
      }
    }

    window.addEventListener(EVENTO_CONSENTIMIENTO, alCambiar);
    return () => window.removeEventListener(EVENTO_CONSENTIMIENTO, alCambiar);
  }, []);

  useEffect(() => {
    if (!PIXEL_ID || !permitido) return;
    cargarPixel();
    window.fbq?.("track", "PageView");
  }, [pathname, permitido]);

  return null;
}
