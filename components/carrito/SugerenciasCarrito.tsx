"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { precio as formatearPrecio } from "@/lib/formato";
import type { Sugerencia } from "@/lib/sugerencias";
import { useCarrito } from "./CarritoContexto";

/**
 * Lo que le falta al carrito.
 *
 * Se agrega sin salir del carrito: un toque y la tarjeta confirma. Sacar al
 * comprador de la página para que vuelva es donde se pierden estas ventas.
 */
export default function SugerenciasCarrito({
  sugerencias,
}: {
  sugerencias: Sugerencia[];
}) {
  const { agregar } = useCarrito();
  const [agregados, setAgregados] = useState<Set<string>>(new Set());

  if (sugerencias.length === 0) return null;

  function sumar(s: Sugerencia) {
    agregar({ productoSlug: s.slug, varianteId: s.varianteId, cantidad: 1 });
    setAgregados((previos) => new Set(previos).add(s.varianteId));
  }

  return (
    <section className="sugerencias" aria-label="Completá tu compra">
      <h2 className="label">Completá tu compra</h2>

      <ul className="sugerencias__lista">
        {sugerencias.map((s) => (
          <li key={s.varianteId} className="sugerencia">
            <Link href={`/producto/${s.slug}`} className="sugerencia__foto">
              {s.foto ? (
                <Image
                  src={s.foto}
                  alt={s.nombre}
                  fill
                  sizes="80px"
                  style={{ objectFit: "contain", padding: "8px" }}
                />
              ) : null}
            </Link>

            <div className="sugerencia__datos">
              <span className="sugerencia__motivo">{s.motivo}</span>
              <Link href={`/producto/${s.slug}`} className="sugerencia__nombre">
                {s.nombre}
              </Link>
              <span className="sugerencia__precio">{formatearPrecio(s.precio)}</span>
            </div>

            <button
              type="button"
              className="boton boton--fantasma boton--chico"
              onClick={() => sumar(s)}
              disabled={agregados.has(s.varianteId)}
            >
              {agregados.has(s.varianteId) ? "Agregado" : "Agregar"}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
