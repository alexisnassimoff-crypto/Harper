"use client";

import { TEXTOS } from "@/lib/textos";
import { alternarFavorito, useFavorito } from "./useFavoritos";

const T = TEXTOS.favoritos;

/**
 * El corazón de un anteojo en un color (Ale, 05/11/2026): lo guarda en los
 * favoritos de la cuenta Harper, o lo saca. Lleno, está guardado. Sin
 * sesión, el aviso de abajo invita a entrar (components/suscriptores/AvisoFavoritos.tsx).
 */
export default function BotonFavorito({
  sku,
  modelo,
  color,
  className = "",
}: {
  sku: string;
  modelo: string;
  color: string;
  className?: string;
}) {
  const guardado = useFavorito(sku);
  const que = `${modelo} ${color}`.trim();
  const etiqueta = guardado ? T.quitar(que) : T.guardar(que);

  return (
    <button
      type="button"
      className={`favorito ${className}`.trim()}
      aria-pressed={guardado}
      aria-label={etiqueta}
      title={etiqueta}
      data-guardado={guardado || undefined}
      onClick={() => void alternarFavorito(sku, que, !guardado)}
    >
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
        <path d="M12 20.3s-7.6-4.6-9.2-9.4C1.7 7.6 3.9 4.5 7.2 4.5c2 0 3.6 1.1 4.8 2.8 1.2-1.7 2.8-2.8 4.8-2.8 3.3 0 5.5 3.1 4.4 6.4-1.6 4.8-9.2 9.4-9.2 9.4z" />
      </svg>
    </button>
  );
}
