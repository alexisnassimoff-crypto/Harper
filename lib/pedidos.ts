import { categoriaDesdeTexto } from "./categorias";
import { escaparFormula, listRecords, TABLAS } from "./airtable";
import { getProductos, getProductosParaCobrar } from "./catalogo";
import {
  calcularEnvio,
  getConfig,
  getConfigParaCobrar,
  type ConfigTienda,
} from "./config";
import { firmarComprobante, huella, leerComprobante, VIGENCIA_COMPROBANTE_MS } from "./cotizacion-envio";
import {
  claveDeComprobantes,
  cotizarEnvia,
  cuatroDigitos,
  entornoEnvia,
  esRepartoAmba,
  paqueteParaEnvia,
  puedeCotizar,
  REPARTO_AMBA,
  resumenDeConsulta,
  type TarifaEnvia,
} from "./envia";
import { esEnvioGratis, type ZonaEnvio } from "./envio-gratis";
import { codigoEnviaDeProvincia } from "./provincias-envia";
import { entraEnLaTarifa, IVA_ENVIO, PLAZO_REPARTO, precioDeRueddo, zonaDeRueddo, type ZonaRueddo } from "./rueddo";
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
  /**
   * Dónde cae el destino: "amba" si llega el reparto de 24 h, "resto" si no.
   * Null si todavía no se sabe (sin dirección, o sin cotizar fuera de la Ciudad).
   */
  envioZona: ZonaEnvio | null;
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

  const { envio, opcionesEnvio, envioCotizado, envioBonificado: bonificado, envioZona, envioDelPedido } = await resolverEnvio({
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
    envioZona,
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
 *  2. Sin destino completo: la tarifa plana (o gratis desde el mínimo).
 *  3. Con un comprobante válido (firma, vencimiento, mismo destino, mismo
 *     carrito y mismo caso de envío gratis): se cobra exactamente ese
 *     precio, sin volver a calcular.
 *  4. AMBA según el mapa del reparto (la Ciudad entera y los partidos del
 *     conurbano, ver lib/rueddo.ts): la tarifa directa del reparto con IVA y
 *     el recargo de Config, sin preguntarle a Envia.
 *  5. El resto se cotiza con Envia. Si el reparto cotiza un destino que no
 *     está en su mapa (una localidad que no reconocemos), también es AMBA,
 *     con la tarifa de la zona más cara. Sin respuesta útil: la tarifa plana.
 *
 * Se ofrece UNA opción, sin nombre de transportista para el comprador: en
 * AMBA el reparto; en el resto del país, la más barata. Es gratis desde
 * `envio_gratis_amba_desde` en AMBA y desde `envio_gratis_desde` en todo el
 * país, sobre el subtotal sin el cupón; con envío gratis el comprador ve el
 * precio tachado. El pedido guarda igual el transportista y el costo real:
 * es lo que paga Harper.
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
  envioZona: ZonaEnvio | null;
  envioDelPedido: EnvioDelPedido;
}> {
  const hayItems = datos.items.length > 0;
  const umbrales = { amba: datos.config.envioGratisAmbaDesde, nacional: datos.config.envioGratisDesde };
  const gratisEn = (zona: ZonaEnvio | null) => hayItems && esEnvioGratis(datos.subtotal, zona, umbrales);

  const destino = destinoCompleto(datos.destino);
  const paquete = paqueteParaEnvia(datos.paquete, datos.config.envioPesoMinimoKg);
  // La zona del reparto según su mapa; null fuera del mapa o si no se
  // reconoce. Solo si el checkout cotiza (Envia configurado, como la regla
  // de AMBA en Config): si no, muestra la tarifa plana y se cobra esa.
  const zonaReparto = destino && puedeCotizar(datos.config) ? zonaDeRueddo(destino) : null;
  const tarifaReparto = (zona: ZonaRueddo) => tarifaDelReparto(zona, paquete, datos.config);
  const repartoDelMapa = zonaReparto ? tarifaReparto(zonaReparto) : null;

  // Sin comprobante: en AMBA (por el mapa) la tarifa del reparto; si no, la
  // tarifa plana de Config. Gratis desde el mínimo de la zona, igual.
  const sinComprobante = (zona: ZonaEnvio | null) => {
    const bonificado = gratisEn(zona);
    const reparto = hayItems && zona === "amba" ? repartoDelMapa : null;
    const envio = !hayItems || bonificado ? 0 : reparto ? reparto.opcion.precio : calcularEnvio(datos.subtotal, datos.config);
    const envioDelPedido: EnvioDelPedido = reparto
      ? { origen: "tarifa", opcion: reparto.opcion, cobrado: envio, bonificado, cotizadoEn: null, cotizacion: { zona, opcion: reparto.detalle } }
      : { origen: "plano", opcion: null, cobrado: envio, bonificado, cotizadoEn: null, cotizacion: null };
    return { envio, opcionesEnvio: [] as OpcionEnvio[], envioCotizado: false, envioBonificado: bonificado, envioZona: zona, envioDelPedido };
  };

  if (!hayItems || !destino) return sinComprobante(null);

  // Sin cotizar se sabe igual si es AMBA: por el mapa del reparto.
  const zonaSinCotizar: ZonaEnvio | null = repartoDelMapa ? "amba" : null;
  const origen = datos.config.envioOrigen;
  const clave = claveDeComprobantes();
  const enviaListo = Boolean(paquete && origen && datos.config.envioTransportistas.length > 0);
  if (!clave || (!repartoDelMapa && !enviaListo)) return sinComprobante(zonaSinCotizar);

  const pedido = paquete && origen
    ? {
        origen,
        destino,
        paquete,
        // El valor de la mercadería, sin el cupón (como el envío gratis).
        valorDeclarado: datos.subtotal,
        transportistas: datos.config.envioTransportistas,
      }
    : null;
  const consulta = pedido ? resumenDeConsulta(pedido) : {};
  const entorno = entornoEnvia();
  const huellaDestino = huella([
    cuatroDigitos(destino.cp),
    codigoEnviaDeProvincia(destino.provincia),
    sinTildes(destino.ciudad),
    ...(destino.partido ? [sinTildes(destino.partido)] : []),
  ]);
  const huellaCarrito = huella([
    datos.items.map((i) => [i.varianteId, i.cantidad]).sort(),
    paquete,
    datos.subtotal,
    origen ? cuatroDigitos(origen.cp) : "",
    datos.config.envioTransportistas,
  ]);

  // Lo que ve el comprador, con el comprobante de ese precio para cobrarlo
  // sin volver a calcular. La hora es la de la cotización (si salió del
  // cache de Envia, la de esa consulta): vence media hora después de eso.
  const conComprobante = (zona: ZonaEnvio, elegida: TarifaEnvia, cotizadoEn: string) => {
    const bonificado = gratisEn(zona);
    const cobrado = bonificado ? 0 : elegida.opcion.precio;
    const opcionesEnvio: OpcionEnvio[] = [
      {
        ...elegida.opcion,
        comprobante: firmarComprobante(
          {
            v: 1,
            exp: Date.parse(cotizadoEn) + VIGENCIA_COMPROBANTE_MS,
            destino: huellaDestino,
            carrito: huellaCarrito,
            entorno,
            bonificado,
            zona,
            cotizadoEn,
            opcion: elegida.opcion,
            detalle: elegida.detalle,
          },
          clave
        ),
      },
    ];
    return {
      envio: cobrado,
      opcionesEnvio,
      envioCotizado: true,
      envioBonificado: bonificado,
      envioZona: zona,
      envioDelPedido: {
        origen: origenDeLaTarifa(elegida.detalle),
        opcion: elegida.opcion,
        cobrado,
        bonificado,
        cotizadoEn,
        cotizacion: { ...consulta, zona, opcion: elegida.detalle },
      } satisfies EnvioDelPedido,
    };
  };

  // 3. El comprobante de lo que el comprador vio: se cobra eso, si sigue
  // siendo para este destino, este carrito y el mismo caso de envío gratis
  // (la zona viene firmada: la sacó la cotización de ese destino).
  const comprobante = datos.eleccion?.comprobante
    ? leerComprobante(datos.eleccion.comprobante, clave, { entorno })
    : null;
  if (
    comprobante &&
    comprobante.destino === huellaDestino &&
    comprobante.carrito === huellaCarrito &&
    comprobante.bonificado === gratisEn(comprobante.zona)
  ) {
    const bonificado = comprobante.bonificado;
    const cobrado = bonificado ? 0 : comprobante.opcion.precio;
    return {
      envio: cobrado,
      opcionesEnvio: [],
      envioCotizado: true,
      envioBonificado: bonificado,
      envioZona: comprobante.zona,
      envioDelPedido: {
        origen: origenDeLaTarifa(comprobante.detalle),
        opcion: comprobante.opcion,
        cobrado,
        bonificado,
        cotizadoEn: comprobante.cotizadoEn,
        cotizacion: { ...consulta, zona: comprobante.zona, opcion: comprobante.detalle },
      },
    };
  }

  // 4. AMBA por el mapa del reparto: su tarifa, sin preguntarle a Envia.
  if (repartoDelMapa) return conComprobante("amba", repartoDelMapa, new Date().toISOString());

  // 5. Cotizar con Envia.
  const resultado = pedido ? await cotizarEnvia(pedido) : null;
  if (!resultado) return sinComprobante(zonaSinCotizar);

  // Si el reparto cotiza, es AMBA aunque la localidad no esté en el mapa:
  // con la tarifa de la zona más cara (o, si el paquete no entra en la
  // tarifa, con lo que cotizó). Si no, la más barata (vienen ordenadas).
  const reparto = resultado.tarifas.find((t) => esRepartoAmba(t.opcion.transportista));
  if (reparto) return conComprobante("amba", tarifaReparto("GBA 3") ?? reparto, resultado.cotizadoEn);
  return conComprobante("resto", conRecargo(resultado.tarifas[0], datos.config.envioRestoRecargo), resultado.cotizadoEn);
}

/**
 * Fuera de AMBA el comprador paga lo que cotiza Envia más el recargo de
 * Config (`envio_resto_recargo`, hoy 10 %), en pesos enteros y hacia arriba.
 * El costo que queda en el pedido sigue siendo el de Envia: lo que paga Harper.
 */
function conRecargo(tarifa: TarifaEnvia, recargo: number): TarifaEnvia {
  if (!(recargo > 0)) return tarifa;
  const precio = Math.ceil((Math.round(tarifa.opcion.costo * 100) * (100 + recargo)) / 10_000 - 1e-9);
  return { ...tarifa, opcion: { ...tarifa.opcion, precio }, detalle: { ...tarifa.detalle, recargoPorciento: recargo } };
}

/** "tarifa" si la opción es la tarifa directa del reparto de AMBA; si no, "envia". */
function origenDeLaTarifa(detalle: Record<string, unknown> | undefined): "tarifa" | "envia" {
  return detalle?.tarifaDirecta === true ? "tarifa" : "envia";
}

/**
 * La opción del reparto de AMBA con su tarifa directa para esa zona: lo que
 * paga el comprador es la tarifa con IVA más el recargo de Config; el costo,
 * la tarifa con IVA. Null si el paquete no entra en la tarifa plana o si la
 * zona no tiene tarifa.
 */
function tarifaDelReparto(
  zona: ZonaRueddo,
  paquete: { pesoKg: number; largoCm: number; anchoCm: number; altoCm: number } | null,
  config: ConfigTienda
): TarifaEnvia | null {
  if (!entraEnLaTarifa(paquete)) return null;
  const tarifa = precioDeRueddo(zona, config.envioAmbaTarifas, config.envioAmbaRecargo);
  if (!tarifa) return null;
  return {
    opcion: {
      id: `${REPARTO_AMBA}:tarifa`,
      transportista: REPARTO_AMBA,
      transportistaNombre: "Rueddo",
      servicio: "tarifa",
      servicioNombre: `Tarifa ${zona}`,
      costo: tarifa.costo,
      precio: tarifa.precio,
      plazo: PLAZO_REPARTO,
    },
    detalle: {
      tarifaDirecta: true,
      carrier: REPARTO_AMBA,
      zonaReparto: zona,
      tarifaSinIva: tarifa.tarifa,
      ivaPorciento: IVA_ENVIO,
      recargoPorciento: config.envioAmbaRecargo,
      deliveryEstimate: PLAZO_REPARTO,
      totalPrice: tarifa.costo,
      currency: "ARS",
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
    ...(t(d?.partido, 80) ? { partido: t(d?.partido, 80) } : {}),
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
