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

  const iniciales = coloresIniciales(productos);

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
          <ProductoCard producto={p} prioridad={i < 4} inicial={iniciales[i]} />
        </Revelar>
      ))}
    </div>
  );
}

/**
 * Con qué color abre cada ficha de la grilla.
 *
 * Casi todos los modelos tienen el negro primero, así que tomar siempre el
 * primero dejaba una fila entera de productos negros. Acá se recorre la grilla
 * con un cursor que va rotando el color de arranque y, si el elegido repite el
 * de la ficha anterior, salta al siguiente. Depende solo del orden del
 * catálogo, así que el servidor y el navegador llegan al mismo resultado.
 */
function coloresIniciales(productos: Producto[]): number[] {
  const elegidos: number[] = [];
  let anterior = "";
  let cursor = 1;

  for (const producto of productos) {
    const conStock = producto.variantes
      .map((variante, indice) => ({ variante, indice }))
      .filter(({ variante }) => !variante.agotada);

    const opciones =
      conStock.length > 0
        ? conStock
        : producto.variantes.map((variante, indice) => ({ variante, indice }));

    if (opciones.length === 0) {
      elegidos.push(0);
      continue;
    }

    let elegida = opciones[cursor % opciones.length];
    if (elegida.variante.color === anterior && opciones.length > 1) {
      elegida = opciones[(cursor + 1) % opciones.length];
    }

    elegidos.push(elegida.indice);
    anterior = elegida.variante.color;
    cursor += 1;
  }

  return elegidos;
}
