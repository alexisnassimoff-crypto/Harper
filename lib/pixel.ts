/**
 * El píxel de Meta, del lado del navegador.
 *
 * Un solo lugar que sabe cómo se llaman los eventos, qué llevan y cómo se
 * identifican los productos, para que ViewContent, AddToCart,
 * InitiateCheckout y Purchase hablen el mismo idioma (el que Meta cruza con
 * un catálogo): el SKU de la variante como `content_id`.
 *
 * Nada de acá manda datos personales: solo productos, cantidades y montos.
 */

import { aceptaPublicidad } from "./consentimiento";
import { CLAVE_ORIGEN, fbcDesdeClickId, origenVigente, type Origen } from "./origen";

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    _fbq?: unknown;
  }
}

export type ContenidoPixel = { id: string; quantity: number; item_price: number };

/** Un ítem como lo entiende Meta: SKU, cantidad y precio unitario real. */
export function contenido(item: { sku: string; cantidad: number; precioUnitario: number }): ContenidoPixel {
  return { id: item.sku, quantity: item.cantidad, item_price: item.precioUnitario };
}

/**
 * El identificador del evento de compra.
 *
 * Es determinístico a partir del número de pedido: el navegador (píxel) y el
 * servidor (Conversions API) mandan el mismo `event_id`, y Meta se queda con
 * uno solo. También hace que recargar /gracias no cuente una compra nueva.
 */
export function idEventoCompra(numeroPedido: string) {
  return `compra-${numeroPedido}`;
}

/** Datos de un carrito o pedido en el formato de Meta. */
export function datosDeCompra(datos: {
  items: { sku: string; cantidad: number; precioUnitario: number }[];
  /** Valor sin envío: es lo que vale la venta para el negocio. */
  valor: number;
}) {
  const contents = datos.items.map(contenido);

  return {
    value: datos.valor,
    currency: "ARS",
    content_type: "product",
    content_ids: contents.map((c) => c.id),
    contents,
    num_items: contents.reduce((n, c) => n + c.quantity, 0),
  };
}

/**
 * Dispara un evento, solo si la persona aceptó las cookies de medición y
 * publicidad. Si el píxel no está (sin variable, sin consentimiento,
 * bloqueado) no pasa nada.
 */
export function trackPixel(
  evento: string,
  data: Record<string, unknown> = {},
  opciones: { eventID?: string } = {}
) {
  if (typeof window === "undefined" || !window.fbq || !aceptaPublicidad()) return false;

  if (opciones.eventID) window.fbq("track", evento, data, { eventID: opciones.eventID });
  else window.fbq("track", evento, data);

  return true;
}

/** AddToCart con una unidad de una variante. Se usa en ficha, grilla y sugerencias. */
export function trackAgregarAlCarrito(datos: {
  sku: string;
  nombre: string;
  precio: number;
  cantidad?: number;
}) {
  const cantidad = datos.cantidad ?? 1;

  return trackPixel("AddToCart", {
    ...datosDeCompra({
      items: [{ sku: datos.sku, cantidad, precioUnitario: datos.precio }],
      valor: datos.precio * cantidad,
    }),
    content_name: datos.nombre,
  });
}

/** AddToCart con varias variantes a la vez: un pack de la portada. */
export function trackAgregarVarios(datos: {
  items: { sku: string; cantidad: number; precioUnitario: number }[];
  nombre: string;
}) {
  if (datos.items.length === 0) return false;

  return trackPixel("AddToCart", {
    ...datosDeCompra({
      items: datos.items,
      valor: datos.items.reduce((total, i) => total + i.precioUnitario * i.cantidad, 0),
    }),
    content_name: datos.nombre,
  });
}

/** Lee una cookie por nombre. */
function cookie(nombre: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const trozo = document.cookie.split("; ").find((c) => c.startsWith(`${nombre}=`));
  return trozo ? decodeURIComponent(trozo.slice(nombre.length + 1)) : undefined;
}

/** La atribución guardada al entrar, o `null` si no hay o venció. */
export function leerOrigenGuardado(ahora = Date.now()): Origen | null {
  try {
    const crudo = window.localStorage.getItem(CLAVE_ORIGEN);
    if (!crudo) return null;
    const origen = JSON.parse(crudo) as Origen;
    return origenVigente(origen, ahora) ? origen : null;
  } catch {
    return null;
  }
}

/**
 * Lo que viaja con el pedido: la atribución guardada más las cookies del
 * píxel, que son lo que la Conversions API necesita para cruzar la venta con
 * el click en el anuncio, y la marca `publicidad: true` que habilita ese
 * aviso a Meta. Sin consentimiento de medición y publicidad no viaja nada:
 * el pedido no lleva atribución y Meta no se entera de la compra.
 */
export function origenParaElPedido(ahora = Date.now()): Origen | null {
  if (!aceptaPublicidad()) return null;

  const guardado = leerOrigenGuardado(ahora) ?? {};
  const fbp = cookie("_fbp");
  const fbc = cookie("_fbc") ?? fbcDesdeClickId(guardado.fbclid, guardado.ts ?? ahora);

  return { ...guardado, ...(fbp ? { fbp } : {}), ...(fbc ? { fbc } : {}), publicidad: true };
}
