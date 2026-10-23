import { getProductos } from "./catalogo";
import { getTramos, porcentajeParaCantidad, type Tramo } from "./descuentos";
import type { Categoria, ItemResuelto, Producto } from "./tipos";

/**
 * Qué ofrecerle a alguien que ya tiene el carrito armado.
 *
 * La venta cruzada acá no es "productos relacionados" al azar: el catálogo es
 * chico y todo se complementa de una forma concreta y honesta. Cada sugerencia
 * dice por qué aparece, porque una razón real convierte más que un "también te
 * puede interesar".
 *
 * La regla más valiosa es la del segundo par: quien lleva un anteojo ve otros
 * modelos con el descuento que se desbloquea al sumar dos. Al anteojo NO se le
 * ofrece un estuche: ya viene incluido, y ofrecérselo contradice la ficha.
 *
 * Es dinámico en dos sentidos: cambia según lo que ya hay en el carrito —así
 * nunca ofrece algo que el comprador ya tiene— y rota entre los candidatos
 * empatados, para que el que vuelve no se encuentre siempre la misma foto.
 */

export type Sugerencia = {
  productoId: string;
  slug: string;
  nombre: string;
  categoria: Categoria;
  color: string;
  varianteId: string;
  precio: number;
  foto: string | null;
  /** Por qué se la ofrecemos. Es lo que se muestra arriba de la tarjeta. */
  motivo: string;
};

/** Cuántas tarjetas se muestran como máximo. */
const MAXIMO = 3;

/**
 * Reglas de complemento, en orden de prioridad.
 *
 * `si` es lo que el comprador ya lleva y `entonces` lo que le falta. El orden
 * importa: la primera regla que aplique manda, porque es la más valiosa.
 * `mismaCategoria` marca las reglas que ofrecen más de lo mismo (otro modelo
 * de anteojo): no se saltean aunque la categoría ya esté en el carrito.
 */
type Regla = {
  si: Categoria;
  entonces: Categoria;
  motivo: (contexto: { porcentaje: number }) => string;
  mismaCategoria?: boolean;
};

const REGLAS: Regla[] = [
  {
    si: "Anteojos",
    entonces: "Anteojos",
    mismaCategoria: true,
    motivo: ({ porcentaje }) =>
      porcentaje > 0
        ? `Segundo par: ${porcentaje}% off en los dos`
        : "Sumá un segundo par",
  },
  {
    si: "Estuches",
    entonces: "Paños",
    motivo: () => "Sumale un paño de microfibra",
  },
  {
    si: "Paños",
    entonces: "Estuches",
    motivo: () => "Completá con un estuche rígido",
  },
];

/** Rota una lista según el día, para que las sugerencias no se estanquen. */
function rotar<T>(lista: T[], semilla: number): T[] {
  if (lista.length < 2) return lista;
  const corte = semilla % lista.length;
  return [...lista.slice(corte), ...lista.slice(0, corte)];
}

export async function sugerirParaCarrito(
  items: ItemResuelto[]
): Promise<Sugerencia[]> {
  if (items.length === 0) return [];

  const [productos, tramos] = await Promise.all([getProductos(), getTramos()]);

  // Cambia cada día: una misma persona que vuelve mañana ve otra cosa.
  return elegirSugerencias(items, productos, Math.floor(Date.now() / 86_400_000), tramos);
}

/** La decisión, sin Airtable de por medio, para poder probarla. */
export function elegirSugerencias(
  items: ItemResuelto[],
  productos: Producto[],
  semilla: number,
  tramos: Tramo[] = []
): Sugerencia[] {
  if (items.length === 0 || productos.length === 0) return [];

  const categoriasEnCarrito = new Set(items.map((i) => i.categoria));
  const productosEnCarrito = new Set(items.map((i) => i.productoId));

  const unidadesPorCategoria = new Map<Categoria, number>();
  for (const item of items) {
    unidadesPorCategoria.set(
      item.categoria,
      (unidadesPorCategoria.get(item.categoria) ?? 0) + item.cantidad
    );
  }

  const disponibles = productos.filter(
    (p) => !productosEnCarrito.has(p.id) && !p.agotado
  );

  const elegidas: Sugerencia[] = [];
  const yaElegidos = new Set<string>();

  function sumar(categoria: Categoria, motivo: string) {
    const candidatos = rotar(
      disponibles.filter((p) => p.categoria === categoria && !yaElegidos.has(p.id)),
      semilla
    );

    for (const producto of candidatos) {
      if (elegidas.length >= MAXIMO) return;

      const variante = producto.variantes.find((v) => !v.agotada);
      if (!variante) continue;

      yaElegidos.add(producto.id);
      elegidas.push({
        productoId: producto.id,
        slug: producto.slug,
        nombre: producto.nombre,
        categoria: producto.categoria,
        color: variante.color,
        varianteId: variante.id,
        precio: producto.precio,
        foto: variante.fotos[0] ?? producto.fotoPrincipal,
        motivo,
      });
    }
  }

  // 1. Lo que le falta para completar el uso de lo que ya eligió.
  for (const regla of REGLAS) {
    if (!categoriasEnCarrito.has(regla.si)) continue;
    if (!regla.mismaCategoria && categoriasEnCarrito.has(regla.entonces)) continue;

    // El porcentaje que se desbloquea con una unidad más de esa categoría.
    const unidades = unidadesPorCategoria.get(regla.entonces) ?? 0;
    const porcentaje = porcentajeParaCantidad(tramos, regla.entonces, unidades + 1);

    sumar(regla.entonces, regla.motivo({ porcentaje }));
  }

  // 2. Si ya tiene de todo, se le ofrece más de lo mismo: sumar unidades de la
  //    categoría que ya eligió es lo que dispara el descuento por cantidad.
  if (elegidas.length === 0) {
    for (const categoria of rotar([...categoriasEnCarrito], semilla)) {
      sumar(categoria, "Sumá otro y accedé a más descuento");
    }
  }

  return elegidas.slice(0, MAXIMO);
}
