"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useCarrito } from "./carrito/CarritoContexto";
import { precio as formatearPrecio } from "@/lib/formato";
import type { Producto } from "@/lib/tipos";

/** Cinco tintes de la paleta de marca. La grilla los rota para que no sea monótona. */
const TINTES = 5;

export default function ProductoCard({
  producto,
  prioridad = false,
  tinte = 0,
}: {
  producto: Producto;
  /** Solo para las primeras tarjetas visibles: precarga la imagen. */
  prioridad?: boolean;
  /** Índice del tinte de fondo; la grilla lo va rotando. */
  tinte?: number;
}) {
  const { agregar } = useCarrito();

  // Arranca en el primer color con stock; si están todos agotados, el primero.
  const inicial = Math.max(
    0,
    producto.variantes.findIndex((v) => !v.agotada)
  );
  const [indice, setIndice] = useState(inicial);
  const [agregado, setAgregado] = useState(false);

  const variante = producto.variantes[indice];
  const foto = variante?.fotos[0] ?? producto.fotoPrincipal;

  function elegirColor(i: number) {
    setIndice(i);
    setAgregado(false);
  }

  function agregarAlCarrito() {
    if (!variante || variante.agotada) return;
    agregar({
      productoSlug: producto.slug,
      varianteId: variante.id,
      cantidad: 1,
    });
    setAgregado(true);
  }

  return (
    <article className="ficha" data-tinte={tinte % TINTES}>
      <Link
        href={`/producto/${producto.slug}`}
        className="ficha__foto"
        aria-label={producto.nombre}
      >
        {foto ? (
          <Image
            src={foto}
            alt={producto.nombre}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            style={{ objectFit: "contain" }}
            priority={prioridad}
          />
        ) : (
          <span className="label ficha__sinfoto">Sin foto</span>
        )}

        {producto.agotado ? <span className="ficha__cinta">Agotado</span> : null}
      </Link>

      <div className="ficha__cuerpo">
        <Link href={`/producto/${producto.slug}`} className="ficha__titulo">
          {producto.nombre}
        </Link>

        <div className="ficha__precio">
          <span>{formatearPrecio(producto.precio)}</span>
          {producto.precioAnterior ? (
            <s className="apagado">{formatearPrecio(producto.precioAnterior)}</s>
          ) : null}
        </div>

        {producto.variantes.length > 1 ? (
          <div
            className="ficha__colores"
            role="radiogroup"
            aria-label={`Color de ${producto.nombre}`}
          >
            {producto.variantes.map((v, i) => (
              <button
                key={v.id}
                type="button"
                role="radio"
                aria-checked={i === indice}
                aria-label={v.color}
                title={v.color + (v.agotada ? " — agotado" : "")}
                className="ficha__swatch"
                data-elegido={i === indice ? "" : undefined}
                data-agotada={v.agotada ? "" : undefined}
                style={{ background: v.colorHex }}
                onClick={() => elegirColor(i)}
              />
            ))}
          </div>
        ) : null}

        <p className="ficha__color-nombre">
          {variante ? variante.color : " "}
        </p>

        <button
          type="button"
          className="boton boton--contorno boton--chico boton--bloque"
          onClick={agregarAlCarrito}
          disabled={!variante || variante.agotada}
        >
          {variante?.agotada ? "Sin stock" : agregado ? "Agregado ✓" : "Agregar"}
        </button>
      </div>
    </article>
  );
}
