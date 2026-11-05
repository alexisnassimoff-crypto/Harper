"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export type SeccionCuenta = {
  /** El ancla de la sección: «mis-compras», «mis-favoritos», «movimientos». */
  id: string;
  titulo: string;
  /** Cuántos tiene (compras, favoritos); null no lo muestra. */
  cantidad?: number | null;
  contenido: ReactNode;
};

/**
 * Mi cuenta en pestañas (Ale, 05/11/2026): «una sección fácil de encontrar y
 * usar, no una pantalla interminable». Compras, favoritos y movimientos, uno
 * a la vez; todo sigue en la página (el servidor lo arma igual). El ancla de
 * la dirección elige la pestaña: «Ver mis favoritos» lleva a #mis-favoritos.
 */
export default function SeccionesCuenta({ secciones, inicial }: { secciones: SeccionCuenta[]; inicial: string }) {
  const [activa, setActiva] = useState(inicial);
  const lista = useRef<HTMLDivElement>(null);
  const botones = useRef<(HTMLButtonElement | null)[]>([]);

  // El ancla de la dirección manda: al llegar y cada vez que cambia.
  useEffect(() => {
    const desdeAncla = () => {
      const ancla = decodeURIComponent(window.location.hash.slice(1));
      if (!secciones.some((s) => s.id === ancla)) return;
      setActiva(ancla);
      window.requestAnimationFrame(() => lista.current?.scrollIntoView({ block: "start" }));
    };
    desdeAncla();
    window.addEventListener("hashchange", desdeAncla);
    return () => window.removeEventListener("hashchange", desdeAncla);
    // Las secciones son fijas mientras la página está abierta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function elegir(id: string) {
    setActiva(id);
    // La pestaña queda en la dirección (al recargar, vuelve a la misma) sin saltar.
    window.history.replaceState(window.history.state, "", `#${id}`);
  }

  // Flechas, Inicio y Fin entre pestañas, como cualquier lista de pestañas.
  function alTeclear(evento: KeyboardEvent<HTMLButtonElement>, i: number) {
    const ultimo = secciones.length - 1;
    const destino =
      evento.key === "ArrowRight" ? (i === ultimo ? 0 : i + 1) : evento.key === "ArrowLeft" ? (i === 0 ? ultimo : i - 1) : evento.key === "Home" ? 0 : evento.key === "End" ? ultimo : null;
    if (destino === null) return;
    evento.preventDefault();
    elegir(secciones[destino].id);
    botones.current[destino]?.focus();
  }

  return (
    <div className="secciones-cuenta">
      <div ref={lista} role="tablist" aria-label="Mi cuenta" className="secciones-cuenta__lista">
        {secciones.map((s, i) => (
          <button
            key={s.id}
            ref={(b) => {
              botones.current[i] = b;
            }}
            type="button"
            role="tab"
            id={`pestana-${s.id}`}
            aria-selected={activa === s.id}
            aria-controls={`panel-${s.id}`}
            tabIndex={activa === s.id ? 0 : -1}
            className="secciones-cuenta__pestana"
            onClick={() => elegir(s.id)}
            onKeyDown={(e) => alTeclear(e, i)}
          >
            {s.titulo}
            {s.cantidad ? <span className="secciones-cuenta__cantidad">{s.cantidad}</span> : null}
          </button>
        ))}
      </div>
      {secciones.map((s) => (
        <div key={s.id} role="tabpanel" id={`panel-${s.id}`} aria-labelledby={`pestana-${s.id}`} className="secciones-cuenta__panel" hidden={activa !== s.id}>
          {s.contenido}
        </div>
      ))}
    </div>
  );
}
