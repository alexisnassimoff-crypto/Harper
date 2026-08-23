"use client";

import Image from "next/image";
import Link from "next/link";
import { precio as formatearPrecio } from "@/lib/formato";
import { useCarrito } from "./CarritoContexto";
import { useCarritoResuelto } from "./useCarritoResuelto";

export default function VistaCarrito() {
  const { cambiarCantidad, quitar } = useCarrito();
  const { datos, cargando, error } = useCarritoResuelto();

  if (cargando) {
    return <p className="apagado">Cargando el carrito…</p>;
  }

  if (error) {
    return (
      <p className="apagado">
        No pudimos cargar el carrito. Recargá la página e intentá de nuevo.
      </p>
    );
  }

  if (!datos || datos.items.length === 0) {
    return (
      <div className="pila" style={{ gap: "1.5rem", alignItems: "flex-start" }}>
        <p className="apagado">Tu carrito está vacío.</p>
        <Link href="/" className="boton">
          Ver productos
        </Link>
      </div>
    );
  }

  const faltaParaGratis = datos.envioGratisDesde - datos.subtotal;

  return (
    <div
      style={{
        display: "grid",
        gap: "3rem",
        gridTemplateColumns: "repeat(auto-fit, minmax(min(18rem, 100%), 1fr))",
        alignItems: "start",
      }}
    >
      <ul className="pila" style={{ gap: "1.5rem", listStyle: "none", margin: 0, padding: 0 }}>
        {datos.items.map((item) => (
          <li
            key={item.varianteId}
            style={{ display: "flex", gap: "1rem", alignItems: "flex-start" }}
          >
            <div
              className="tarjeta__marco"
              style={{ width: "5.5rem", aspectRatio: "1 / 1", flexShrink: 0 }}
            >
              {item.foto ? (
                <Image
                  src={item.foto}
                  alt={item.nombre}
                  fill
                  sizes="88px"
                  style={{ objectFit: "cover" }}
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
                <label className="solo-lectores" htmlFor={`cant-${item.varianteId}`}>
                  Cantidad de {item.nombre}
                </label>
                <select
                  id={`cant-${item.varianteId}`}
                  value={item.cantidad}
                  onChange={(e) =>
                    cambiarCantidad(item.varianteId, Number(e.target.value))
                  }
                  style={{
                    minHeight: "2.25rem",
                    padding: "0 0.75rem",
                    border: "1px solid var(--borde)",
                    borderRadius: "var(--radio-pill)",
                    background: "#fff",
                    font: "inherit",
                  }}
                >
                  {Array.from(
                    { length: Math.min(item.stockDisponible, 20) },
                    (_, i) => i + 1
                  ).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>

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

            <span style={{ fontSize: "0.9375rem" }}>
              {formatearPrecio(item.subtotal)}
            </span>
          </li>
        ))}
      </ul>

      <aside className="panel">
        <h2 className="label">Resumen</h2>

        <Fila etiqueta="Subtotal" valor={formatearPrecio(datos.subtotal)} />
        <Fila
          etiqueta="Envío por Correo Argentino"
          valor={datos.envio === 0 ? "Gratis" : formatearPrecio(datos.envio)}
        />

        {datos.envio > 0 && faltaParaGratis > 0 ? (
          <p className="apagado" style={{ fontSize: "0.8125rem" }}>
            Te faltan {formatearPrecio(faltaParaGratis)} para el envío gratis.
          </p>
        ) : null}

        <div className="fila fila--total">
          <span>Total</span>
          <strong style={{ fontWeight: 500 }}>{formatearPrecio(datos.total)}</strong>
        </div>

        <Link href="/checkout" className="boton boton--bloque">
          Finalizar compra
        </Link>

        <p className="apagado" style={{ fontSize: "0.75rem" }}>
          Entrega por Correo Argentino en {datos.plazoEntrega}.
        </p>
      </aside>
    </div>
  );
}

function Fila({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="fila">
      <span className="apagado">{etiqueta}</span>
      <span>{valor}</span>
    </div>
  );
}
