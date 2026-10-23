import ProductoCard from "./ProductoCard";
import Revelar from "./Revelar";
import type { Producto } from "@/lib/tipos";

/**
 * La grilla de productos.
 *
 * En celular va a dos columnas: con una sola, cada ficha medía ~500px y el
 * visitante veía un producto por pantalla. A dos, los cuatro anteojos entran
 * en una pantalla y media, con nombre, colores y precio a la vista.
 *
 *  - `compacta`: para las secciones secundarias (estuches y paños en la
 *    portada, "otros modelos" en la ficha). Celdas más chicas y más por fila.
 *  - `animar`: envuelve cada celda en <Revelar>. Apagado por defecto, porque
 *    el contenido principal tiene que verse aunque el JavaScript tarde.
 *  - `precargar`: cuántas fotos se piden con prioridad. Solo las que quedan
 *    arriba del fold; el resto compite con ellas y las demora.
 */
export default function GrillaProductos({
  productos,
  compacta = false,
  animar = false,
  precargar = 0,
}: {
  productos: Producto[];
  compacta?: boolean;
  animar?: boolean;
  precargar?: number;
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
    <div className={compacta ? "grilla grilla--compacta" : "grilla"}>
      {productos.map((p, i) => {
        const tarjeta = (
          <ProductoCard producto={p} prioridad={i < precargar} inicial={iniciales[i]} />
        );

        // El retraso se reinicia por fila para que la cascada no se alargue
        // en un listado largo.
        return animar ? (
          <Revelar key={p.id} retraso={(i % 4) * 80} className="revelar--celda">
            {tarjeta}
          </Revelar>
        ) : (
          <div key={p.id} className="grilla__celda">
            {tarjeta}
          </div>
        );
      })}
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
