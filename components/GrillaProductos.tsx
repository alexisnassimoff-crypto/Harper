import ProductoCard from "./ProductoCard";
import Revelar from "./Revelar";
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
        // El retraso se reinicia por fila para que la cascada no se alargue
        // en un listado largo.
        <Revelar key={p.id} retraso={(i % 4) * 80} className="revelar--celda">
          <ProductoCard producto={p} prioridad={i < 4} />
        </Revelar>
      ))}
    </div>
  );
}
