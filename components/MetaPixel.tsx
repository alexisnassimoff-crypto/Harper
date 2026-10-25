"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
// El tipo global de `window.fbq` vive en lib/pixel.ts, junto con los eventos.
import "@/lib/pixel";
import { CLAVE_ORIGEN } from "@/lib/origen";
import {
  aceptaPublicidad,
  alCambiarConsentimiento,
  borrarRastrosPublicitarios,
} from "@/lib/consentimiento";

/**
 * Píxel de Meta para la pauta de Harper.
 *
 * Se activa solo si NEXT_PUBLIC_META_PIXEL_ID está configurada Y la persona
 * aceptó las cookies de medición y publicidad. Sin ese "sí" el script de Meta
 * no se descarga, no se crean las cookies _fbp/_fbc y no sale ningún evento.
 * Si después rechaza (en esta pestaña o en otra), se revoca el consentimiento
 * en el píxel, se dejan de mandar eventos y se borran sus cookies.
 *
 * El script base se inyecta una vez y cada cambio de ruta dispara un PageView;
 * los eventos de valor los disparan las páginas con <EventoPixel/>.
 */
const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID ?? "";

/**
 * Si se encoló el `init` y todavía no se ejecutó. Un rechazo que llega antes
 * de que baje el script de Meta vacía la cola (si no, el `init` y el PageView
 * ya encolados saldrían igual al cargar) y obliga a un `init` nuevo si después
 * vuelve a aceptar.
 */
let iniciado = false;

/** Revoca el píxel. Si el script todavía no corrió, descarta lo encolado. */
function revocarPixel() {
  const fbq: any = window.fbq;
  if (!fbq) return;
  if (!fbq.callMethod && Array.isArray(fbq.queue)) {
    fbq.queue.length = 0;
    iniciado = false;
  }
  fbq("consent", "revoke");
}

function cargarPixel() {
  if (window.fbq) {
    // Primero el permiso: si quedó un "revoke" en la cola, el init va después.
    window.fbq("consent", "grant");
    if (!iniciado) {
      window.fbq("init", PIXEL_ID);
      iniciado = true;
    }
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
  iniciado = true;
}

export default function MetaPixel() {
  const pathname = usePathname();
  const [permitido, setPermitido] = useState(false);

  // La elección guardada al entrar y los cambios que haga después.
  useEffect(() => {
    const acepta = aceptaPublicidad();
    setPermitido(acepta);
    // Sin un "sí", no tiene que haber rastros publicitarios, tampoco los que
    // haya dejado una versión anterior de la tienda que no preguntaba.
    if (!acepta) borrarRastrosPublicitarios(CLAVE_ORIGEN);

    return alCambiarConsentimiento((dato) => {
      const si = dato?.publicidad === true;
      setPermitido(si);
      if (!si) {
        revocarPixel();
        borrarRastrosPublicitarios(CLAVE_ORIGEN);
      }
    });
  }, []);

  useEffect(() => {
    // Se vuelve a leer la elección: el estado puede haber quedado viejo.
    if (!PIXEL_ID || !permitido || !aceptaPublicidad()) return;
    cargarPixel();
    window.fbq?.("track", "PageView");
  }, [pathname, permitido]);

  return null;
}
