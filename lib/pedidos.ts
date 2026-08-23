import { getProductos } from "./catalogo";
import { calcularEnvio, getConfig, type ConfigTienda } from "./config";
import type { ItemCarrito, ItemResuelto } from "./tipos";

export type CarritoResuelto = {
  items: ItemResuelto[];
  /** Ítems que ya no existen o quedaron sin stock, para avisarle al comprador. */
  descartados: { varianteId: string; motivo: "no-existe" | "sin-stock" }[];
  subtotal: number;
  envio: number;
  total: number;
  config: ConfigTienda;
};

/** Tope por variante: evita que un bug o un curioso pida 9999 unidades. */
const MAX_POR_ITEM = 20;

/**
 * Convierte el carrito del navegador en un pedido con precios y stock reales.
 *
 * El cliente solo manda IDs y cantidades: los precios SIEMPRE salen de Airtable.
 * Nunca se confía en un precio que venga del navegador.
 */
export async function resolverCarrito(
  itemsCrudos: ItemCarrito[]
): Promise<CarritoResuelto> {
  const [productos, config] = await Promise.all([getProductos(), getConfig()]);

  const items: ItemResuelto[] = [];
  const descartados: CarritoResuelto["descartados"] = [];

  for (const crudo of itemsCrudos) {
    const producto = productos.find((p) =>
      p.variantes.some((v) => v.id === crudo.varianteId)
    );
    const variante = producto?.variantes.find((v) => v.id === crudo.varianteId);

    if (!producto || !variante) {
      descartados.push({ varianteId: crudo.varianteId, motivo: "no-existe" });
      continue;
    }

    if (variante.agotada) {
      descartados.push({ varianteId: crudo.varianteId, motivo: "sin-stock" });
      continue;
    }

    // La cantidad se recorta al stock real y al tope por ítem.
    const cantidad = Math.max(
      1,
      Math.min(
        Math.floor(crudo.cantidad) || 1,
        variante.stock,
        MAX_POR_ITEM
      )
    );

    items.push({
      productoId: producto.id,
      productoSlug: producto.slug,
      nombre: producto.nombre,
      varianteId: variante.id,
      sku: variante.sku,
      color: variante.color,
      foto: variante.fotos[0] ?? producto.fotoPrincipal,
      precioUnitario: producto.precio,
      cantidad,
      subtotal: producto.precio * cantidad,
      stockDisponible: variante.stock,
    });
  }

  const subtotal = items.reduce((total, i) => total + i.subtotal, 0);
  const envio = items.length > 0 ? calcularEnvio(subtotal, config) : 0;

  return { items, descartados, subtotal, envio, total: subtotal + envio, config };
}

/** Texto corto del pedido, para leerlo de un vistazo en Airtable y en los mails. */
export function resumirItems(items: ItemResuelto[]) {
  return items
    .map((i) => `${i.cantidad}× ${i.nombre} ${i.color}`)
    .join(" · ");
}

/**
 * Genera un número de pedido corto y legible.
 *
 * Combina el instante de creación con dos caracteres al azar: sin eso, dos
 * compras en el mismo segundo compartirían número. El identificador real del
 * pedido sigue siendo el record ID de Airtable; este número es el que ve
 * el cliente.
 */
export function numeroDePedido(fecha: Date) {
  const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sin I, O, 0, 1
  const base = (Math.floor(fecha.getTime() / 1000) % 100000)
    .toString()
    .padStart(5, "0");

  const sufijo = Array.from(
    { length: 2 },
    () => ALFABETO[Math.floor(Math.random() * ALFABETO.length)]
  ).join("");

  return `HARPER-${base}${sufijo}`;
}
