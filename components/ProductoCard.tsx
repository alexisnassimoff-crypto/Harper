"use client";

import Link from "next/link";
import { useState } from "react";
import FotoCruzada from "./FotoCruzada";
import { useDeslizar } from "./useDeslizar";
import { useCarrito } from "./carrito/CarritoContexto";
import { precio as formatearPrecio } from "@/lib/formato";
import type { Producto } from "@/lib/tipos";

export default function ProductoCard({
  producto,
  prioridad = false,
  inicial = 0,
}: {
  producto: Producto;
  /** Solo para las primeras tarjetas visibles: precarga la imagen. */
  prioridad?: boolean;
  /** Color con el que abre la ficha; lo reparte la grilla para no repetir. */
  inicial?: number;
}) {
  const { agregar } = useCarrito();
  const [indice, setIndice] = useState(inicial);
  const [indiceFoto, setIndiceFoto] = useState(0);
  const [agregado, setAgregado] = useState(false);

  const variante = producto.variantes[indice];
  const fotos = variante?.fotos.length ? variante.fotos : [];
  const foto = fotos[indiceFoto] ?? fotos[0] ?? producto.fotoPrincipal;

  const deslizar = useDeslizar({
    alSiguiente: () => pasarFoto(1),
    alAnterior: () => pasarFoto(-1),
  });

  function pasarFoto(paso: number) {
    if (fotos.length < 2) return;
    setIndiceFoto((n) => (n + paso + fotos.length) % fotos.length);
  }

  function elegirColor(i: number) {
    setIndice(i);
    setIndiceFoto(0);
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
    <article className="ficha">
      <Link
        href={`/producto/${producto.slug}`}
        className="ficha__foto"
        aria-label={producto.nombre}
        {...deslizar}
      >
        {foto ? (
          <FotoCruzada
            src={foto}
            alt={producto.nombre}
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            prioridad={prioridad}
          />
        ) : (
          <span className="label ficha__sinfoto">Sin foto</span>
        )}

        {producto.agotado ? <span className="ficha__cinta">Agotado</span> : null}

        {fotos.length > 1 ? (
          <span className="ficha__puntos" aria-hidden="true">
            {fotos.map((f, i) => (
              <span
                key={f}
                className="ficha__punto"
                data-activo={i === indiceFoto || undefined}
              />
            ))}
          </span>
        ) : null}
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
