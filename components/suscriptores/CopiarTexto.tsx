"use client";

import { useEffect, useState } from "react";

/**
 * Un botón chico para copiar un texto (el número de seguimiento, Ale,
 * 05/11/2026). Dice «Copiado» un momento; si el navegador no deja copiar, el
 * número sigue a la vista para seleccionarlo a mano.
 */
export default function CopiarTexto({ texto, etiqueta, listo, que }: { texto: string; etiqueta: string; listo: string; que: string }) {
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    if (!copiado) return;
    const reloj = window.setTimeout(() => setCopiado(false), 2000);
    return () => window.clearTimeout(reloj);
  }, [copiado]);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  }

  return (
    <button type="button" className="copiar" onClick={() => void copiar()} aria-label={`${etiqueta} ${que}`} data-copiado={copiado || undefined}>
      <span aria-live="polite">{copiado ? listo : etiqueta}</span>
    </button>
  );
}
