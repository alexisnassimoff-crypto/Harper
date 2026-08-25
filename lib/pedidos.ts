import { escaparFormula, listRecords, TABLAS } from "./airtable";
import { getProductos, getProductosParaCobrar } from "./catalogo";
import { calcularEnvio, envioBonificado, getConfig, type ConfigTienda } from "./config";
import { buscarOpcion, correoConfigurado, cotizar } from "./correo";
import { armarPaquete, type ItemAEmpacar } from "./paquete";
import type {
  EleccionEnvio,
  ItemCarrito,
  ItemResuelto,
  OpcionEnvio,
  Paquete,
} from "./tipos";

export type CarritoResuelto = {
  items: ItemResuelto[];
  /** Ítems que ya no existen o quedaron sin stock, para avisarle al comprador. */
  descartados: { varianteId: string; motivo: "no-existe" | "sin-stock" }[];
  subtotal: number;
  envio: number;
  total: number;
  config: ConfigTienda;
  /** Opciones reales de Correo Argentino. Vacío si no se pudo cotizar. */
  opcionesEnvio: OpcionEnvio[];
  /** Falso cuando `envio` es el precio plano de respaldo, no una cotización. */
  envioCotizado: boolean;
  /** La caja a despachar. `null` si falta peso o medidas, o si no entra en un bulto. */
  paquete: Paquete | null;
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
 *
 * Con `cpDestino` además cotiza el envío contra Correo Argentino. El precio del
 * envío se resuelve acá, en el servidor, exactamente igual que los precios de
 * los productos: del navegador viene QUÉ eligió el comprador, nunca CUÁNTO sale.
 */
export async function resolverCarrito(
  itemsCrudos: ItemCarrito[],
  opciones: {
    paraCobrar?: boolean;
    cpDestino?: string;
    eleccion?: EleccionEnvio;
  } = {}
): Promise<CarritoResuelto> {
  const [productos, config] = await Promise.all([
    opciones.paraCobrar ? getProductosParaCobrar() : getProductos(),
    getConfig(),
  ]);

  const items: ItemResuelto[] = [];
  const descartados: CarritoResuelto["descartados"] = [];
  const aEmpacar: ItemAEmpacar[] = [];

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
      Math.min(Math.floor(crudo.cantidad) || 1, variante.stock, MAX_POR_ITEM)
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

    aEmpacar.push({ envase: producto.envase, cantidad });
  }

  const subtotal = items.reduce((total, i) => total + i.subtotal, 0);
  const paquete =
    items.length > 0
      ? armarPaquete(aEmpacar, {
          margenCm: config.embalajeMargenCm,
          pesoG: config.embalajePesoG,
        })
      : null;

  const { envio, opcionesEnvio, envioCotizado } = await resolverEnvio({
    items: items.length,
    subtotal,
    config,
    paquete,
    cpDestino: opciones.cpDestino,
    eleccion: opciones.eleccion,
  });

  return {
    items,
    descartados,
    subtotal,
    envio,
    total: subtotal + envio,
    config,
    opcionesEnvio,
    envioCotizado,
    paquete,
  };
}

/**
 * Decide cuánto sale el envío.
 *
 * El orden importa:
 *  1. Sin ítems no hay envío.
 *  2. La promoción de envío gratis gana sobre todo lo demás. Igual se cotiza,
 *     porque el comprador tiene que poder elegir entre domicilio y sucursal
 *     aunque no pague: de eso depende cómo se despacha.
 *  3. Con código postal, paquete y credenciales, manda Correo Argentino.
 *  4. Cualquier otra cosa —falta el peso en Airtable, no hay credenciales,
 *     la API no responde, el pedido no entra en un bulto— cae al precio plano.
 */
async function resolverEnvio(datos: {
  items: number;
  subtotal: number;
  config: ConfigTienda;
  paquete: Paquete | null;
  cpDestino?: string;
  eleccion?: EleccionEnvio;
}) {
  const vacio = { opcionesEnvio: [] as OpcionEnvio[], envioCotizado: false };

  if (datos.items === 0) return { envio: 0, ...vacio };

  const cp = datos.cpDestino?.replace(/\D/g, "") ?? "";
  const gratis = envioBonificado(datos.subtotal, datos.config);

  const puedeCotizar = cp.length >= 4 && datos.paquete !== null && correoConfigurado();

  if (!puedeCotizar) {
    return { envio: calcularEnvio(datos.subtotal, datos.config), ...vacio };
  }

  const cotizacion = await cotizar({
    cpOrigen: datos.config.cpOrigen,
    cpDestino: cp,
    paquete: datos.paquete!,
  });

  if (!cotizacion) {
    return { envio: calcularEnvio(datos.subtotal, datos.config), ...vacio };
  }

  if (gratis) {
    return { envio: 0, opcionesEnvio: cotizacion, envioCotizado: true };
  }

  const elegida = datos.eleccion
    ? buscarOpcion(cotizacion, datos.eleccion.modo, datos.eleccion.servicio)
    : null;

  // Si el navegador pidió una combinación que Correo Argentino no ofrece para
  // ese destino, se cobra la más barata: nunca de más, y nunca se frena la venta.
  const opcion = elegida ?? masBarata(cotizacion);

  return { envio: opcion.precio, opcionesEnvio: cotizacion, envioCotizado: true };
}

function masBarata(opciones: OpcionEnvio[]) {
  return opciones.reduce((a, b) => (b.precio < a.precio ? b : a));
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
