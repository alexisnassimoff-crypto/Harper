import { categoriaDesdeTexto } from "./categorias";
import { escaparFormula, listRecords, TABLAS } from "./airtable";
import { getProductos, getProductosParaCobrar } from "./catalogo";
import {
  calcularEnvio,
  envioBonificado,
  getConfig,
  getConfigParaCobrar,
  type ConfigTienda,
} from "./config";
import { firmarComprobante, huella, leerComprobante, VIGENCIA_COMPROBANTE_MS } from "./cotizacion-envio";
import { claveDeComprobantes, cotizarEnvia, cuatroDigitos, entornoEnvia, paqueteParaEnvia, resumenDeConsulta } from "./envia";
import { codigoEnviaDeProvincia } from "./provincias-envia";
import { aplicarMejorPromocion, type CuponResuelto } from "./cupones";
import {
  conDescuento,
  getTramos,
  getTramosParaCobrar,
  porcentajeParaCantidad,
  type Tramo,
} from "./descuentos";
import { armarPaquete, type ItemAEmpacar } from "./paquete";
import { aplicarDineroMP, type PrecioDineroMP } from "./dinero-mp";
import type {
  Categoria,
  DestinoEnvio,
  EleccionEnvio,
  EnvioDelPedido,
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
  /**
   * Las opciones a domicilio cotizadas con Envia, cada una con su
   * comprobante firmado. Vacío si no se cotizó (sin destino, o se cobró la
   * tarifa plana) o si se cobró con un comprobante válido.
   */
  opcionesEnvio: OpcionEnvio[];
  /** Falso cuando `envio` es el precio plano de respaldo, no una cotización. */
  envioCotizado: boolean;
  /** El pedido llega al mínimo de envío gratis: el envío lo paga Harper. */
  envioBonificado: boolean;
  /** Lo que queda en el pedido: lo cobrado, el costo real y la copia de la cotización. */
  envioDelPedido: EnvioDelPedido;
  /** La caja a despachar. `null` si falta peso o medidas, o si no entra en un bulto. */
  paquete: Paquete | null;
  /**
   * Lo que se ahorró: por volumen o con el cupón, el que se haya aplicado
   * (nunca los dos). 0 si no hubo descuento.
   */
  ahorro: number;
  /** Los tramos vigentes, para poder empujar al siguiente desde el carrito. */
  tramos: Tramo[];
  /** Qué pasó con el cupón que mandó el navegador; null si no mandó ninguno. */
  cupon: CuponResuelto | null;
  /** El subtotal sin el cupón: la base del envío gratis, como siempre. */
  subtotalSinCupon: number;
  /**
   * El mismo pedido pagado con dinero en Mercado Pago: el 10% adicional sobre la
   * promoción que ya tiene. Va siempre junto al de Mercado Pago para que el
   * checkout cambie de uno a otro al instante. Null si el carrito está vacío.
   */
  dineroMP: PrecioDineroMP | null;
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
 * Con `destino` además cotiza el envío con Envia (lib/envia.ts). El precio
 * del envío se resuelve acá, en el servidor, exactamente igual que los
 * precios de los productos: del navegador viene QUÉ eligió el comprador (y el
 * comprobante firmado de esa cotización), nunca CUÁNTO sale.
 */
export async function resolverCarrito(
  itemsCrudos: ItemCarrito[],
  opciones: {
    paraCobrar?: boolean;
    destino?: Partial<DestinoEnvio>;
    eleccion?: EleccionEnvio;
    /** El código que escribió o aplicó el comprador (ver lib/cupones.ts). */
    cupon?: unknown;
  } = {}
): Promise<CarritoResuelto> {
  // Para cobrar, las tres lecturas van sin cache y sin red de contención: si
  // alguna falla, explota y el checkout pide reintentar. Antes, con la tabla
  // de descuentos caída, se cobraba el precio de lista sin avisar; con Config
  // caída, un envío de respaldo distinto del que el comprador había visto.
  const [productos, config, tramos] = await Promise.all([
    opciones.paraCobrar ? getProductosParaCobrar() : getProductos(),
    opciones.paraCobrar ? getConfigParaCobrar() : getConfig(),
    opciones.paraCobrar ? getTramosParaCobrar() : getTramos(),
  ]);

  let items: ItemResuelto[] = [];
  const descartados: CarritoResuelto["descartados"] = [];
  const aEmpacar: ItemAEmpacar[] = [];
  const porCategoria = new Map<Categoria, number>();

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
      categoria: producto.categoria,
      varianteId: variante.id,
      sku: variante.sku,
      color: variante.color,
      foto: variante.fotos[0] ?? producto.fotoPrincipal,
      precioLista: producto.precio,
      // Se completa abajo, cuando ya se sepa cuántas unidades hay por categoría.
      precioUnitario: producto.precio,
      descuento: 0,
      cantidad,
      subtotal: producto.precio * cantidad,
      stockDisponible: variante.stock,
    });

    aEmpacar.push({ envase: producto.envase, cantidad });
    porCategoria.set(
      producto.categoria,
      (porCategoria.get(producto.categoria) ?? 0) + cantidad
    );
  }

  // El descuento se calcula recién acá porque depende del TOTAL de unidades de
  // la categoría: tres estuches de modelos distintos suman tres. Contarlo por
  // línea mataría justo la venta variada que queremos.
  let ahorro = 0;

  for (const item of items) {
    const porcentaje = porcentajeParaCantidad(
      tramos,
      item.categoria,
      porCategoria.get(item.categoria) ?? 0
    );

    if (porcentaje <= 0) continue;

    item.descuento = porcentaje;
    item.precioUnitario = conDescuento(item.precioLista, porcentaje);
    item.subtotal = item.precioUnitario * item.cantidad;
    ahorro += (item.precioLista - item.precioUnitario) * item.cantidad;
  }

  // El envío se calcula como siempre, con el subtotal sin el cupón: el cupón
  // no cambia quién tiene envío gratis.
  const subtotalParaEnvio = items.reduce((total, i) => total + i.subtotal, 0);

  // El cupón y los descuentos por cantidad no se suman: queda el que le deje
  // al comprador el total más bajo.
  const promocion = aplicarMejorPromocion(items, opciones.cupon);
  items = promocion.items;
  if (promocion.cupon?.estado === "aplicado") ahorro = promocion.cupon.ahorro;

  const subtotal = items.reduce((total, i) => total + i.subtotal, 0);
  const paquete =
    items.length > 0
      ? armarPaquete(aEmpacar, {
          margenCm: config.embalajeMargenCm,
          pesoG: config.embalajePesoG,
        })
      : null;

  const { envio, opcionesEnvio, envioCotizado, envioBonificado: bonificado, envioDelPedido } = await resolverEnvio({
    items,
    subtotal: subtotalParaEnvio,
    config,
    paquete,
    destino: opciones.destino,
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
    envioBonificado: bonificado,
    envioDelPedido,
    paquete,
    ahorro,
    tramos,
    cupon: promocion.cupon,
    subtotalSinCupon: subtotalParaEnvio,
    dineroMP: items.length > 0 ? aplicarDineroMP(items) : null,
  };
}

/**
 * Decide cuánto sale el envío.
 *
 * El orden importa:
 *  1. Sin ítems no hay envío.
 *  2. Sin destino completo, sin paquete (falta peso o medidas en Airtable),
 *     sin token de Envia, sin origen o sin transportistas en Config: la
 *     tarifa plana (o gratis desde el mínimo), como siempre.
 *  3. Con un comprobante válido (firma, vencimiento, mismo destino y mismo
 *     carrito): se cobra exactamente ese precio, sin volver a cotizar.
 *  4. Si no, se cotiza con Envia. Sin respuesta útil: la tarifa plana.
 *
 * Con envío gratis se ofrece solo la opción más barata, y el pedido guarda
 * igual su costo real: es lo que paga Harper.
 */
async function resolverEnvio(datos: {
  items: ItemResuelto[];
  subtotal: number;
  config: ConfigTienda;
  paquete: Paquete | null;
  destino?: Partial<DestinoEnvio>;
  eleccion?: EleccionEnvio;
}): Promise<{
  envio: number;
  opcionesEnvio: OpcionEnvio[];
  envioCotizado: boolean;
  envioBonificado: boolean;
  envioDelPedido: EnvioDelPedido;
}> {
  const hayItems = datos.items.length > 0;
  const bonificado = hayItems && envioBonificado(datos.subtotal, datos.config);

  const plano = () => {
    const envio = hayItems ? calcularEnvio(datos.subtotal, datos.config) : 0;
    return {
      envio,
      opcionesEnvio: [] as OpcionEnvio[],
      envioCotizado: false,
      envioBonificado: bonificado,
      envioDelPedido: { origen: "plano" as const, opcion: null, cobrado: envio, bonificado, cotizadoEn: null, cotizacion: null },
    };
  };

  if (!hayItems) return plano();

  const destino = destinoCompleto(datos.destino);
  const paquete = paqueteParaEnvia(datos.paquete, datos.config.envioPesoMinimoKg);
  const origen = datos.config.envioOrigen;
  const clave = claveDeComprobantes();
  if (!destino || !paquete || !origen || !clave || datos.config.envioTransportistas.length === 0) return plano();

  const pedido = {
    origen,
    destino,
    paquete,
    // El valor de la mercadería, sin el cupón (como el envío gratis).
    valorDeclarado: datos.subtotal,
    transportistas: datos.config.envioTransportistas,
  };
  const entorno = entornoEnvia();
  const huellaDestino = huella([cuatroDigitos(destino.cp), codigoEnviaDeProvincia(destino.provincia), sinTildes(destino.ciudad)]);
  const huellaCarrito = huella([
    datos.items.map((i) => [i.varianteId, i.cantidad]).sort(),
    paquete,
    datos.subtotal,
    cuatroDigitos(origen.cp),
    datos.config.envioTransportistas,
  ]);

  // 3. El comprobante de lo que el comprador vio: se cobra eso, si sigue
  // siendo para este destino, este carrito y el mismo caso de envío gratis.
  const comprobante = datos.eleccion?.comprobante
    ? leerComprobante(datos.eleccion.comprobante, clave, { entorno })
    : null;
  if (
    comprobante &&
    comprobante.destino === huellaDestino &&
    comprobante.carrito === huellaCarrito &&
    comprobante.bonificado === bonificado
  ) {
    const cobrado = bonificado ? 0 : comprobante.opcion.precio;
    return {
      envio: cobrado,
      opcionesEnvio: [],
      envioCotizado: true,
      envioBonificado: bonificado,
      envioDelPedido: {
        origen: "envia",
        opcion: comprobante.opcion,
        cobrado,
        bonificado,
        cotizadoEn: comprobante.cotizadoEn,
        cotizacion: { ...resumenDeConsulta(pedido), opcion: comprobante.detalle },
      },
    };
  }

  // 4. Cotizar ahora.
  const resultado = await cotizarEnvia(pedido);
  if (!resultado) return plano();

  // La hora en que contestó Envia (si salió del cache, la de esa consulta):
  // el comprobante vence media hora después de eso, no de ahora.
  const cotizadoEn = resultado.cotizadoEn;
  const vence = Date.parse(cotizadoEn) + VIGENCIA_COMPROBANTE_MS;
  // Con envío gratis, la más barata: Harper paga ese envío.
  const tarifas = bonificado ? resultado.tarifas.slice(0, 1) : resultado.tarifas;
  const opcionesEnvio: OpcionEnvio[] = tarifas.map((t) => ({
    ...t.opcion,
    comprobante: firmarComprobante(
      { v: 1, exp: vence, destino: huellaDestino, carrito: huellaCarrito, entorno, bonificado, cotizadoEn, opcion: t.opcion, detalle: t.detalle },
      clave
    ),
  }));

  // La que eligió, si sigue en la cotización; si no, la más barata. El
  // precio sale siempre de acá, nunca del navegador.
  const elegida = tarifas.find((t) => t.opcion.id === datos.eleccion?.id) ?? tarifas[0];
  const cobrado = bonificado ? 0 : elegida.opcion.precio;

  return {
    envio: cobrado,
    opcionesEnvio,
    envioCotizado: true,
    envioBonificado: bonificado,
    envioDelPedido: {
      origen: "envia",
      opcion: elegida.opcion,
      cobrado,
      bonificado,
      cotizadoEn,
      cotizacion: { ...resultado.consulta, opcion: elegida.detalle },
    },
  };
}

/** El destino, si tiene lo que hace falta para cotizar: CP, provincia, localidad y calle. */
function destinoCompleto(d: Partial<DestinoEnvio> | undefined): DestinoEnvio | null {
  const t = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const destino: DestinoEnvio = {
    cp: cuatroDigitos(t(d?.cp, 12)),
    provincia: t(d?.provincia, 60),
    ciudad: t(d?.ciudad, 80),
    calle: t(d?.calle, 120),
    numero: t(d?.numero, 20),
  };
  if (!destino.cp || !codigoEnviaDeProvincia(destino.provincia) || destino.ciudad.length < 2 || destino.calle.length < 2) return null;
  return destino;
}

/** Sin tildes ni mayúsculas: "Córdoba" y "cordoba" son el mismo destino. */
function sinTildes(texto: string) {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
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
  /** Productos sin envío: el valor de la venta para el píxel. */
  subtotal: number;
  /**
   * SKU, cantidad y precio (lo que el píxel manda como `contents`), más el
   * modelo y la categoría para saber si el armazón admite cristales graduados.
   * Nada de datos de la persona.
   */
  items: {
    sku: string;
    cantidad: number;
    precioUnitario: number;
    productoSlug: string;
    categoria: Categoria | null;
  }[];
};

/**
 * Busca un pedido por su número, para mostrarle al cliente el estado real.
 *
 * Antes la página de gracias felicitaba a cualquiera que abriera la URL, sin
 * consultar nada: un pago rechazado terminaba en un "Gracias por tu compra".
 *
 * Solo devuelve estado, montos y productos. El número es semiadivinable, así
 * que acá no puede salir ningún dato personal.
 */
export async function buscarPedido(numero: string): Promise<PedidoPublico | null> {
  type Fila = { Numero?: string; Estado?: string; Total?: number; Subtotal?: number; Items?: string };

  try {
    const registros = await listRecords<Fila>(TABLAS.pedidos, {
      filterByFormula: `{Numero} = "${escaparFormula(numero)}"`,
      maxRecords: 1,
    });

    const fila = registros[0]?.fields;
    if (!fila) return null;

    let items: PedidoPublico["items"] = [];
    try {
      const parseado: unknown = JSON.parse(fila.Items ?? "[]");
      if (Array.isArray(parseado)) {
        items = (parseado as ItemResuelto[])
          .filter((i) => typeof i?.sku === "string")
          .map((i) => ({
            sku: i.sku,
            cantidad: i.cantidad,
            precioUnitario: i.precioUnitario,
            // Para decidir si se invita a consultar por cristales graduados.
            productoSlug: typeof i.productoSlug === "string" ? i.productoSlug : "",
            categoria: categoriaDesdeTexto(i.categoria),
          }));
      }
    } catch {
      // Un Items ilegible no rompe la página: el evento sale sin detalle.
    }

    return {
      numero: fila.Numero ?? numero,
      estado: fila.Estado ?? "pendiente",
      total: fila.Total ?? 0,
      subtotal: fila.Subtotal ?? fila.Total ?? 0,
      items,
    };
  } catch (error) {
    // Airtable caído no puede romper la vuelta del cliente desde el pago.
    console.error("[pedidos] no se pudo leer el pedido", numero, error);
    return null;
  }
}
