import { escaparFormula, listRecords, TABLAS } from "./airtable";
import { getProductos, getProductosParaCobrar } from "./catalogo";
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

/** Tope de líneas distintas por pedido. */
const MAX_ITEMS = 50;

/**
 * Deja pasar solo lo que tiene forma de ítem de carrito.
 *
 * El cuerpo de la request es texto de internet: sin este filtro, un
 * `items: [null]` reventaba con un TypeError dentro de `resolverCarrito` y el
 * cliente terminaba viendo un 500 en HTML.
 */
export function limpiarItems(crudos: unknown): ItemCarrito[] {
  if (!Array.isArray(crudos)) return [];

  return crudos
    .filter(
      (i): i is ItemCarrito =>
        typeof i === "object" &&
        i !== null &&
        typeof (i as ItemCarrito).varianteId === "string" &&
        (i as ItemCarrito).varianteId.length > 0
    )
    .slice(0, MAX_ITEMS);
}

/**
 * Convierte el carrito del navegador en un pedido con precios y stock reales.
 *
 * El cliente solo manda IDs y cantidades: los precios SIEMPRE salen de Airtable.
 * Nunca se confía en un precio que venga del navegador.
 */
export async function resolverCarrito(
  itemsCrudos: ItemCarrito[],
  opciones: { paraCobrar?: boolean } = {}
): Promise<CarritoResuelto> {
  const [productos, config] = await Promise.all([
    opciones.paraCobrar ? getProductosParaCobrar() : getProductos(),
    getConfig(),
  ]);

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

/** Lo poco que la página de gracias necesita saber de un pedido. */
export type PedidoPublico = {
  numero: string;
  estado: string;
  total: number;
};

/**
 * Busca un pedido por su número, para mostrarle al cliente el estado real.
 *
 * Antes la página de gracias felicitaba a cualquiera que abriera la URL, sin
 * consultar nada: un pago rechazado terminaba en un "Gracias por tu compra".
 *
 * Solo devuelve estado y total. El número es semiadivinable, así que acá no
 * puede salir ningún dato personal.
 */
export async function buscarPedido(numero: string): Promise<PedidoPublico | null> {
  type Fila = { Numero?: string; Estado?: string; Total?: number };

  try {
    const registros = await listRecords<Fila>(TABLAS.pedidos, {
      filterByFormula: `{Numero} = "${escaparFormula(numero)}"`,
      maxRecords: 1,
    });

    const fila = registros[0]?.fields;
    if (!fila) return null;

    return {
      numero: fila.Numero ?? numero,
      estado: fila.Estado ?? "pendiente",
      total: fila.Total ?? 0,
    };
  } catch (error) {
    // Airtable caído no puede romper la vuelta del cliente desde el pago.
    console.error("[pedidos] no se pudo leer el pedido", numero, error);
    return null;
  }
}
