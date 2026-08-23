import ProductoCard from "./ProductoCard";
import type { Producto } from "@/lib/tipos";

export default function GrillaProductos({
  productos,
}: {
  productos: Producto[];
}) {
  if (productos.length === 0) {
    return (
      <p className="apagado" style={{ paddingBlock: "3rem" }}>
        Todavía no hay productos publicados en esta sección.
      </p>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gap: "2rem 1.25rem",
        gridTemplateColumns: "repeat(auto-fill, minmax(min(15rem, 100%), 1fr))",
      }}
    >
      {productos.map((p, i) => (
        <ProductoCard key={p.id} producto={p} prioridad={i < 4} />
      ))}
    </div>
  );
}
