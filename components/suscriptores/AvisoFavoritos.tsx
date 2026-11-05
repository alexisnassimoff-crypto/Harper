"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { TEXTOS } from "@/lib/textos";
import { alternarFavorito, mostrarAviso, useAvisoFavorito } from "./useFavoritos";

const T = TEXTOS.favoritos;

/** Cuánto queda a la vista cada aviso que no pide nada (ms). */
const DURA = { guardado: 4000, quitado: 4500, error: 5000 } as const;

/**
 * El aviso de los corazones (Ale, 05/11/2026), uno solo para todo el sitio,
 * abajo: «Guardaste…» con el enlace a Mi cuenta, «Quitaste…» con deshacer,
 * el error, y sin sesión la invitación a entrar (que vuelve a guardar ese
 * color después de entrar: /suscriptores/mi-cuenta?guardar=SKU). Se va solo,
 * con Escape o al cambiar de página; el de entrar espera a que lo cierren.
 */
export default function AvisoFavoritos() {
  const aviso = useAvisoFavorito();
  const pathname = usePathname();

  // Al cambiar de página, el aviso de la anterior ya no corresponde.
  useEffect(() => {
    mostrarAviso(null);
  }, [pathname]);

  useEffect(() => {
    if (!aviso) return;
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") mostrarAviso(null);
    };
    window.addEventListener("keydown", alTeclear);
    const reloj = aviso.tipo === "entrar" ? null : window.setTimeout(() => mostrarAviso(null), DURA[aviso.tipo]);
    return () => {
      window.removeEventListener("keydown", alTeclear);
      if (reloj) window.clearTimeout(reloj);
    };
  }, [aviso]);

  return (
    <div className="aviso-favoritos" role="status" aria-live="polite">
      {aviso ? (
        <div className="aviso-favoritos__caja" data-tipo={aviso.tipo}>
          {aviso.tipo === "entrar" ? (
            <div className="aviso-favoritos__texto">
              <p className="aviso-favoritos__titulo">{T.entrarTitulo}</p>
              <p>{T.entrarTexto}</p>
              <Link
                href={`/suscriptores/mi-cuenta?guardar=${encodeURIComponent(aviso.sku)}`}
                className="boton boton--chico aviso-favoritos__boton"
              >
                {T.entrar}
              </Link>
            </div>
          ) : (
            <div className="aviso-favoritos__texto aviso-favoritos__texto--fila">
              <p>{aviso.tipo === "guardado" ? T.guardado(aviso.que) : aviso.tipo === "quitado" ? T.quitado(aviso.que) : T.error}</p>
              {aviso.tipo === "guardado" ? (
                <Link href="/suscriptores/mi-cuenta#mis-favoritos" className="aviso-favoritos__enlace">
                  {T.verMisFavoritos}
                </Link>
              ) : aviso.tipo === "quitado" ? (
                <button type="button" className="aviso-favoritos__enlace" onClick={() => void alternarFavorito(aviso.sku, aviso.que, true, { conAviso: false }).then(() => mostrarAviso(null))}>
                  Deshacer
                </button>
              ) : null}
            </div>
          )}
          <button type="button" className="aviso-favoritos__cerrar" aria-label={T.cerrar} onClick={() => mostrarAviso(null)}>
            ×
          </button>
        </div>
      ) : null}
    </div>
  );
}
