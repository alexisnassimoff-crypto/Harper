"use client";

import Image from "next/image";
import Link from "next/link";
import { precio as formatearPrecio } from "@/lib/formato";
import type { FavoritoVista } from "@/lib/favoritos";
import { TEXTOS } from "@/lib/textos";
import { alternarFavorito } from "./useFavoritos";
import { useSuscriptor } from "./useSuscriptor";

const T = TEXTOS.suscriptores.cuenta.favoritos;

/**
 * «Mis favoritos» en Mi cuenta (Ale, 05/11/2026): los anteojos guardados con
 * el corazón, con foto, modelo, color, precio y el enlace a la ficha en ese
 * color. Llegan armados del servidor (lib/favoritos.ts, contra el catálogo);
 * al quitar uno se va al toque y el aviso de abajo deja deshacerlo.
 * `favoritos` null = no se pudo leer el catálogo.
 */
export default function MisFavoritos({ favoritos }: { favoritos: FavoritoVista[] | null }) {
  const { suscriptor } = useSuscriptor();
  // Con la sesión ya leída en el navegador, se muestran los que siguen guardados
  // (así quitar y deshacer se ven sin recargar la página).
  const guardados = suscriptor?.favoritos;
  const visibles = favoritos && guardados ? favoritos.filter((f) => guardados.includes(f.sku)) : favoritos;

  return (
    <section id="mis-favoritos" className="mis-favoritos" aria-labelledby="mis-favoritos-titulo">
      <h2 id="mis-favoritos-titulo" className="mis-favoritos__titulo">
        {T.titulo}
      </h2>
      <p className="mis-favoritos__bajada">{T.bajada}</p>

      {visibles === null ? (
        <p className="mis-compras__aviso" role="status">
          {T.error}
        </p>
      ) : visibles.length === 0 ? (
        <p className="mis-compras__aviso">{T.vacio}</p>
      ) : (
        <ul className="mis-favoritos__lista">
          {visibles.map((f) => (
            <li key={f.sku} className="favorito-guardado">
              <Link href={f.enlace} className="favorito-guardado__foto" style={{ background: f.tinte }} aria-label={`Ver ${f.modelo} ${f.color}`}>
                {f.foto ? <Image src={f.foto} alt="" fill sizes="(max-width: 768px) 50vw, 16rem" className="foto-multiplicada" /> : null}
                {f.agotada ? <span className="favorito-guardado__agotado">{T.agotado}</span> : null}
              </Link>
              <div className="favorito-guardado__cuerpo">
                <div className="favorito-guardado__encabezado">
                  <h3 className="favorito-guardado__modelo">
                    <Link href={f.enlace}>{f.modelo}</Link>
                  </h3>
                  <span className="favorito-guardado__precio">{formatearPrecio(f.precio)}</span>
                </div>
                <p className="favorito-guardado__color">{f.color}</p>
                <button
                  type="button"
                  className="favorito-guardado__quitar"
                  aria-label={TEXTOS.favoritos.quitar(`${f.modelo} ${f.color}`)}
                  onClick={() => void alternarFavorito(f.sku, `${f.modelo} ${f.color}`, false)}
                >
                  <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false">
                    <path d="M12 20.3s-7.6-4.6-9.2-9.4C1.7 7.6 3.9 4.5 7.2 4.5c2 0 3.6 1.1 4.8 2.8 1.2-1.7 2.8-2.8 4.8-2.8 3.3 0 5.5 3.1 4.4 6.4-1.6 4.8-9.2 9.4-9.2 9.4z" />
                  </svg>
                  {T.quitar}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
