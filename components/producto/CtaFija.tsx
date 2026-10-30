"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Barra de compra fija al pie de la pantalla, solo en celular.
 *
 * En la ficha el botón principal queda a una pantalla y media de scroll. Esta
 * barra lo trae a la vista mientras el visitante mira las fotos, y se esconde
 * cuando el botón real entra en pantalla, para que no haya dos.
 *
 * Se monta con un portal en <body>: la columna de datos lleva una animación
 * con `transform`, y un `position: fixed` adentro de un transform deja de ser
 * fijo. Mientras está visible marca <body data-cta-fija>, que es lo que corre
 * el botón de WhatsApp hacia arriba y le da aire al pie.
 */
export default function CtaFija({
  visible,
  nombre,
  precio,
  detalle,
  ocupado = false,
  alComprar,
  textoBoton = "Comprar ahora",
}: {
  visible: boolean;
  nombre: string;
  precio: string;
  /** Renglón chico debajo del precio, por ejemplo la cuota. */
  detalle?: string | null;
  ocupado?: boolean;
  alComprar: () => void;
  /** "Elegir mis 3" con un pack elegido; "Comprar ahora" si no. */
  textoBoton?: string;
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
        <span className="cta-fija__nombre">{nombre}</span>
        <span className="cta-fija__precio">
          {precio}
          {detalle ? <small> · {detalle}</small> : null}
        </span>
      </div>
      <button
        type="button"
        className="boton boton--chico"
        onClick={alComprar}
        disabled={ocupado}
      >
        {ocupado ? "Un momento…" : textoBoton}
      </button>
    </div>,
    document.body
  );
}
