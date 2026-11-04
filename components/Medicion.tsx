"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { filtrarParaVercel, medir } from "@/lib/medir";

/**
 * Vercel Web Analytics y Speed Insights (sin cookies), y la visita para el
 * embudo del panel (lib/medir.ts). Lo que viaja a Vercel pasa antes por
 * `filtrarParaVercel`: ni el panel, ni la baja, ni la parte de búsqueda de la
 * dirección salvo los utm_.
 */
export default function Medicion() {
  const ruta = usePathname();

  // Una visita por pestaña: la primera página que se mide la cuenta.
  useEffect(() => {
    medir("visita");
  }, [ruta]);

  return (
    <>
      <Analytics beforeSend={filtrarParaVercel} />
      <SpeedInsights beforeSend={filtrarParaVercel} />
    </>
  );
}
