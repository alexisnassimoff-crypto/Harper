import Image from "next/image";
import Link from "next/link";
import { precio as formatearPrecio } from "@/lib/formato";
import type { Producto } from "@/lib/tipos";

export default function ProductoCard({
  producto,
  prioridad = false,
}: {
  producto: Producto;
  /** Solo para las primeras tarjetas visibles: precarga la imagen. */
  prioridad?: boolean;
}) {
  const colores = producto.variantes.length;

  return (
    <Link
      href={`/producto/${producto.slug}`}
      className="pila tarjeta"
      style={{ gap: "0.85rem" }}
    >
      <div className="tarjeta__marco" style={{ aspectRatio: "4 / 5" }}>
        {producto.fotoPrincipal ? (
          <Image
            src={producto.fotoPrincipal}
            alt={producto.nombre}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            style={{ objectFit: "cover" }}
            priority={prioridad}
          />
        ) : (
          <div
            className="label"
            style={{ display: "grid", placeItems: "center", height: "100%" }}
          >
            Sin foto
          </div>
        )}

        {producto.agotado ? (
          <span
            className="label"
            style={{
              position: "absolute",
              top: "0.75rem",
              left: "0.75rem",
              background: "var(--fondo)",
              color: "var(--texto)",
              padding: "0.3rem 0.6rem",
            }}
          >
            Agotado
          </span>
        ) : null}
      </div>

      <div className="pila" style={{ gap: "0.15rem" }}>
        <h3 className="tarjeta__nombre" style={{ fontSize: "1rem", letterSpacing: "0.06em" }}>
          {producto.nombre}
        </h3>

        <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem" }}>
          <span style={{ fontSize: "0.9375rem" }}>
            {formatearPrecio(producto.precio)}
          </span>
          {producto.precioAnterior ? (
            <span
              className="apagado"
              style={{ fontSize: "0.8125rem", textDecoration: "line-through" }}
            >
              {formatearPrecio(producto.precioAnterior)}
            </span>
          ) : null}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.6rem",
            minHeight: "1.1rem",
          }}
        >
          <span className="apagado" style={{ fontSize: "0.75rem" }}>
            {colores === 1 ? "1 color" : `${colores} colores`}
          </span>

          <span className="tarjeta__colores" aria-hidden="true">
            {producto.variantes.slice(0, 5).map((v) => (
              <span
                key={v.id}
                style={{
                  width: "0.5rem",
                  height: "0.5rem",
                  borderRadius: "50%",
                  background: v.colorHex,
                  border: "1px solid color-mix(in srgb, var(--texto) 18%, transparent)",
                }}
              />
            ))}
          </span>
        </div>
      </div>
    </Link>
  );
}
