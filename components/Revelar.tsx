"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Revela su contenido cuando entra en pantalla.
 *
 * El estado oculto vive en el CSS (`.revelar`), no en JS, así no hay parpadeo
 * en la primera pintura. El observador solo agrega `data-visible` y se
 * desconecta: la animación corre una vez y no vuelve a ocultar nada al
 * scrollear para arriba.
 *
 * Si el visitante pidió menos movimiento, o el navegador no trae
 * IntersectionObserver, aparece de una y listo. Sin JavaScript lo resuelve el
 * `<noscript>` del layout.
 */
export default function Revelar({
  children,
  retraso = 0,
  className,
}: {
  children: React.ReactNode;
  /** Milisegundos de demora, para escalonar una grilla. */
  retraso?: number;
  className?: string;
}) {
  const referencia = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const nodo = referencia.current;
    if (!nodo || visible) return;

    const menosMovimiento =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (menosMovimiento || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }

    // Si ya está en pantalla al montar (por ejemplo, al recargar a mitad de
    // página), el observador dispara igual en el primer ciclo.
    const observador = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((e) => e.isIntersecting)) {
          setVisible(true);
          observador.disconnect();
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.06 }
    );

    observador.observe(nodo);
    return () => observador.disconnect();
  }, [visible]);

  return (
    <div
      ref={referencia}
      className={className ? `revelar ${className}` : "revelar"}
      data-visible={visible || undefined}
      style={retraso ? { transitionDelay: `${retraso}ms` } : undefined}
    >
      {children}
    </div>
  );
}
