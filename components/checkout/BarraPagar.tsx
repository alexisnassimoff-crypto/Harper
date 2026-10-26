"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Barra fija con el botón de pagar, solo en celular y siempre a la vista:
 * candado, "Pago seguro" y el total a pagar.
 *
 * En el checkout el resumen queda debajo de todos los campos: una pantalla y
 * media de scroll. La barra trae el botón (con el total) mientras se completan
 * los datos. En celular reemplaza al botón del resumen, así que nunca hay dos.
 * El botón envía el mismo formulario (`form=`), así que pasa por la misma
 * validación.
 */
export default function BarraPagar({
  visible,
  formulario,
  total,
  ocupado = false,
}: {
  visible: boolean;
  /** El id del <form> que envía. */
  formulario: string;
  total: string;
  ocupado?: boolean;
}) {
  const [montado, setMontado] = useState(false);

  useEffect(() => {
    setMontado(true);
  }, []);

  useEffect(() => {
    if (!visible) return;

    document.body.dataset.ctaFija = "";
    return () => {
      delete document.body.dataset.ctaFija;
    };
  }, [visible]);

  if (!montado) return null;

  return createPortal(
    <div className="cta-fija cta-fija--pago" data-visible={visible || undefined} inert={!visible}>
      <button type="submit" form={formulario} className="boton boton--bloque" disabled={ocupado}>
        {ocupado ? "Redirigiendo…" : <TextoPagoSeguro total={total} />}
      </button>
    </div>,
    document.body
  );
}

/** "🔒 Pago seguro · $ 80.910": el candado a la izquierda, alineado con el texto. */
export function TextoPagoSeguro({ total }: { total: string }) {
  return (
    <span className="pago-seguro">
      <svg
        className="pago-seguro__candado"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="5" y="10.5" width="14" height="10" rx="2" />
        <path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3" />
      </svg>
      <span>
        Pago seguro · <span className="pago-seguro__total">{total}</span>
      </span>
    </span>
  );
}
