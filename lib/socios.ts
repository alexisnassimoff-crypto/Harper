import { esMembresia, type Categoria } from "./categorias";
import { precio as formatearPrecio } from "./formato";
import type { ItemResuelto, Producto } from "./tipos";

/**
 * Socios Harper (Ale, 30/10/2026): una membresía de 12 meses que reemplaza al
 * «llevá 3, pagá 2». Ale no quiere que la marca parezca barata ni que regale
 * mercadería: en vez de bajar el precio, se gana por escasez y beneficios.
 *
 * Se paga una vez y trae:
 *  - Dos pares en el año: el primero se elige al hacerse socio (va incluido en
 *    el mismo pedido) y el segundo se pide después por WhatsApp.
 *  - Envío gratis.
 *  - Una reposición si se rompen o se pierden.
 *  - Precio congelado para los pares extra durante los 12 meses.
 *  - Acceso antes que nadie a cada lanzamiento.
 * Con el plan con aumento, además, los cristales oftálmicos de los dos pares.
 *
 * Hay 100 lugares, numerados. Se vende como cualquier producto de Airtable,
 * con la categoría «Membresía»:
 *  - «Socios Harper»: la membresía. El Stock de su variante son los lugares
 *    que quedan; el número de cada socio lo da el webhook (lib/socios-alta.ts).
 *  - «Cristales con aumento para socios»: se suma a la membresía para el plan
 *    con aumento. Solo se vende junto con ella.
 * Los precios, como siempre, salen de Airtable.
 */

export const SLUG_SOCIO = "socios-harper";
export const SLUG_AUMENTO = "socios-harper-aumento";
export const MESES_SOCIO = 12;
/** Los lugares de la primera temporada, si Config no dice otra cosa. */
export const CUPOS_POR_DEFECTO = 100;

/** Un plan, listo para sumar al carrito. */
export type ItemDePlan = {
  productoSlug: string;
  varianteId: string;
  sku: string;
  nombre: string;
  precio: number;
};

export type Planes = {
  /** La membresía sola. */
  socio: ItemDePlan & { precioTexto: string };
  /** La membresía con los cristales: lo que se suma y el total del plan. Null si no está publicada. */
  aumento: (ItemDePlan & { total: number; totalTexto: string }) | null;
  /** Cuántos lugares hay en la temporada y cuántos quedan. */
  cupos: number;
  quedan: number;
};

/** Los planes publicados, o null si la membresía no está a la venta. */
export function planesDeSocio(productos: Producto[], cupos: number = CUPOS_POR_DEFECTO): Planes | null {
  const plan = (slug: string): ItemDePlan | null => {
    const producto = productos.find((p) => p.slug === slug && esMembresia(p.categoria));
    const variante = producto?.variantes[0];
    if (!producto || !variante || producto.precio <= 0) return null;
    return { productoSlug: producto.slug, varianteId: variante.id, sku: variante.sku, nombre: producto.nombre, precio: producto.precio };
  };

  const socio = plan(SLUG_SOCIO);
  if (!socio) return null;
  const stock = productos.find((p) => p.slug === SLUG_SOCIO)?.variantes[0]?.stock ?? 0;
  const aumento = plan(SLUG_AUMENTO);

  return {
    socio: { ...socio, precioTexto: formatearPrecio(socio.precio) },
    aumento: aumento ? { ...aumento, total: socio.precio + aumento.precio, totalTexto: formatearPrecio(socio.precio + aumento.precio) } : null,
    cupos,
    quedan: Math.max(0, Math.min(stock, cupos)),
  };
}

export function esLineaDeSocio(item: Pick<ItemResuelto, "productoSlug" | "categoria">): boolean {
  return esMembresia(item.categoria) && item.productoSlug === SLUG_SOCIO;
}

export function conMembresia(items: Pick<ItemResuelto, "productoSlug" | "categoria">[]): boolean {
  return items.some(esLineaDeSocio);
}

/** El plan del pedido, para el socio y para Harper. */
export function planDelPedido(items: Pick<ItemResuelto, "productoSlug" | "categoria">[]): "Socio" | "Socio con aumento" | null {
  if (!conMembresia(items)) return null;
  return items.some((i) => esMembresia(i.categoria) && i.productoSlug === SLUG_AUMENTO) ? "Socio con aumento" : "Socio";
}

/**
 * Las reglas de la membresía sobre un carrito ya resuelto. Muta los ítems, como
 * el descuento por volumen, y devuelve lo que ahorra el par incluido.
 *
 *  - Una sola membresía por pedido, de a una unidad.
 *  - Los cristales con aumento solo van con la membresía: sin ella se sacan.
 *  - El primer par de anteojos va incluido. Vale hasta lo que cuesta un
 *    anteojo de la línea de siempre (`topePar`): si el elegido cuesta más,
 *    se paga la diferencia (Ale: las líneas nuevas pueden salir más caras).
 */
export function aplicarMembresia(
  items: ItemResuelto[],
  topePar: number,
  esDeAnteojos: (categoria: Categoria) => boolean
): { items: ItemResuelto[]; quitados: string[]; incluido: number } {
  const hay = conMembresia(items);
  const quitados: string[] = [];

  const quedan = items.filter((item) => {
    if (!esMembresia(item.categoria)) return true;
    if (item.productoSlug === SLUG_AUMENTO && !hay) {
      quitados.push(item.varianteId);
      return false;
    }
    item.cantidad = 1;
    item.subtotal = item.precioUnitario;
    return true;
  });

  if (!hay) return { items: quedan, quitados, incluido: 0 };
  return { items: quedan, quitados, incluido: incluirUnPar(quedan, topePar, esDeAnteojos)?.incluido ?? 0 };
}

/** Un par del primer renglón de anteojos que se paga, hasta `topePar`. Null si no hay. */
function incluirUnPar(items: ItemResuelto[], topePar: number, esDeAnteojos: (categoria: Categoria) => boolean) {
  const par = items.find((i) => esDeAnteojos(i.categoria) && i.subtotal > 0);
  if (!par) return null;

  const incluido = Math.round(Math.min(par.subtotal / par.cantidad, topePar > 0 ? topePar : Infinity));
  par.subtotal -= incluido;
  par.precioUnitario = par.subtotal / par.cantidad;
  par.incluido = incluido;
  return { par, incluido };
}

/** Lo que el carrito sabe del socio reconocido (lib/socios-cuenta.ts). */
export type SocioDelCarrito = {
  id: string;
  numero: number;
  plan: "Socio" | "Socio con aumento";
  /** Todavía no canjeó su segundo par. */
  canjePendiente: boolean;
};

/**
 * El segundo par de un socio reconocido (Ale, 30/10/2026: entra con su mail y
 * lo canjea). Con la misma regla que el primero: un par, hasta lo que cuesta
 * un anteojo de la línea de siempre; si el elegido cuesta más, se paga la
 * diferencia. No corre si el pedido trae otra membresía (ahí el incluido es
 * el primer par de esa) ni si ya lo canjeó. Devuelve lo que ahorra.
 */
export function aplicarCanje(
  items: ItemResuelto[],
  socio: SocioDelCarrito | null | undefined,
  topePar: number,
  esDeAnteojos: (categoria: Categoria) => boolean
): number {
  if (!socio?.canjePendiente || conMembresia(items)) return 0;
  const incluido = incluirUnPar(items, topePar, esDeAnteojos);
  if (!incluido) return 0;
  incluido.par.canje = { socioId: socio.id, numero: socio.numero };
  return incluido.incluido;
}
