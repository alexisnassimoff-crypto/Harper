"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Barra fija con el total y el botón de pagar, solo en celular.
 *
 * En el checkout el resumen y el botón "Pagar" quedan debajo de todos los
 * campos: una pantalla y media de scroll. La barra trae el total y el botón
 * a la vista mientras se completan los datos, y se esconde cuando el botón
 * real entra en pantalla. El botón envía el mismo formulario (`form=`), así
 * que pasa por la misma validación.
 */
export default function BarraPagar({
  visible,
  formulario,
  total,
  detalle,
  ocupado = false,
}: {
  visible: boolean;
  /** El id del <form> que envía. */
  formulario: string;
  total: string;
  detalle?: string;
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
    <div className="cta-fija" data-visible={visible || undefined} inert={!visible}>
      <div className="cta-fija__datos">
        <span className="cta-fija__nombre">{detalle ?? "Total a pagar"}</span>
        <span className="cta-fija__precio">{total}</span>
      </div>
      <button type="submit" form={formulario} className="boton boton--chico" disabled={ocupado}>
        {ocupado ? "Redirigiendo…" : "Pagar"}
      </button>
    </div>,
    document.body
  );
}
