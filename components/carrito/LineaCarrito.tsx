"use client";

import Image from "next/image";
import Link from "next/link";
import { precio as formatearPrecio } from "@/lib/formato";
import type { ItemResuelto } from "@/lib/tipos";
import { useCarrito } from "./CarritoContexto";

/**
 * Un producto del carrito: foto, nombre, color, +/− para la cantidad,
 * «Quitar» y el precio (con el de lista tachado si tiene descuento). La usan
 * la página del carrito y el panel lateral (`compacta`: foto más chica).
 */
export default function LineaCarrito({
  item,
  actualizando,
  compacta = false,
}: {
  item: ItemResuelto;
  actualizando: boolean;
  compacta?: boolean;
}) {
  const { cambiarCantidad, quitar } = useCarrito();
  const lado = compacta ? "4.25rem" : "5.5rem";

  return (
    <li style={{ display: "flex", gap: compacta ? "0.875rem" : "1rem", alignItems: "flex-start" }}>
      <div className="tarjeta__marco" style={{ width: lado, aspectRatio: "1 / 1", flexShrink: 0 }}>
        {item.foto ? (
          <Image
            src={item.foto}
            alt={item.nombre}
            fill
            sizes={compacta ? "68px" : "88px"}
            style={{ objectFit: "contain", padding: compacta ? "4px" : "5px" }}
          />
        ) : null}
      </div>

      <div className="pila" style={{ gap: "0.35rem", flex: 1 }}>
        <Link href={`/producto/${item.productoSlug}`}>
          <strong style={{ fontWeight: 500 }}>{item.nombre}</strong>
        </Link>
        <span className="apagado" style={{ fontSize: "0.8125rem" }}>
          {item.color}
        </span>

        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          {/* Un +/− en vez del desplegable: sumar una unidad es un solo
              toque, y con el segundo par queremos que agrandar el
              pedido cueste lo menos posible. */}
          <div className="contador">
            <button
              type="button"
              className="contador__boton"
              onClick={() => cambiarCantidad(item.varianteId, item.cantidad - 1)}
              disabled={item.cantidad <= 1 || actualizando}
              aria-label={`Quitar una unidad de ${item.nombre}`}
            >
              −
            </button>
            <span className="contador__valor" aria-live="polite">
              <span className="solo-lectores">Cantidad de {item.nombre}: </span>
              {item.cantidad}
            </span>
            <button
              type="button"
              className="contador__boton"
              onClick={() => cambiarCantidad(item.varianteId, item.cantidad + 1)}
              disabled={item.cantidad >= Math.min(item.stockDisponible, 20) || actualizando}
              aria-label={`Sumar una unidad de ${item.nombre}`}
            >
              +
            </button>
          </div>

          <button
            type="button"
            onClick={() => quitar(item.varianteId)}
            className="enlace-suave"
            style={{
              background: "none",
              border: 0,
              padding: 0,
              fontSize: "0.8125rem",
              textDecoration: "underline",
            }}
          >
            Quitar
          </button>
        </div>
      </div>

      <div style={{ textAlign: "right", fontSize: "0.9375rem" }}>
        {item.descuento > 0 ? (
          <div className="apagado" style={{ fontSize: "0.8125rem", textDecoration: "line-through" }}>
            {formatearPrecio(item.precioLista * item.cantidad)}
          </div>
        ) : null}
        <span>{formatearPrecio(item.subtotal)}</span>
        {item.descuento > 0 ? (
          <div style={{ fontSize: "0.75rem", color: "var(--verde)" }}>−{item.descuento}%</div>
        ) : null}
      </div>
    </li>
  );
}
