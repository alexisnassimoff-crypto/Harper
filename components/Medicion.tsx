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
      {/* La versión gratis de Speed Insights junta hasta 10.000 datos cada 30 días y,
          si se pasa, deja de medir unos días (no cobra): con la mitad de las visitas alcanza. */}
      <SpeedInsights beforeSend={filtrarParaVercel} sampleRate={0.5} />
    </>
  );
}
