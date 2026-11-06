import { canalDelOrigen, CANALES, NOMBRE_DEL_CANAL, type Canal } from "./canales";
import {
  baseDeLaVenta,
  costoDelCashback,
  costoEnvioNeto,
  costosDelCobro,
  PARAMETROS_REFERENCIA,
  type ParametrosContribucion,
} from "./contribucion";
import { esPedidoConDineroMP } from "./dinero-mp";
import { precio } from "./formato";
import type { EventoMedido } from "./medir";
import type { Origen } from "./origen";
import { beneficiosDeNotas, fechaArgentina, saldoDe, sumarDias, type MovimientoSaldo } from "./suscriptores";
import { ESTADOS_CONFIRMADOS } from "./webhook-decision";

/**
 * Las cuentas del panel privado (/panel), sin Airtable ni Redis: reciben las
 * filas ya leídas (lib/panel-servidor.ts) y devuelven lo que se muestra. Así
 * se prueban con números a mano.
 *
 * La regla del negocio manda (CLAUDE.md, «ganar plata»): además de cuánto se
 * vendió, cuánto dejó cada venta. «Cuánto dejó» (`margenDe`) usa el motor de
 * contribución (lib/contribucion.ts) con los montos reales de cada pedido y
 * separa tres cosas: lo que sale del pedido, lo estimado con las tasas de
 * referencia del motor y lo que falta conocer (eso no se resta).
 */

export const PERIODOS = [7, 30, 90] as const;
export type Periodo = (typeof PERIODOS)[number];

/** El rango más largo que se puede elegir: un año. Los contadores se guardan un poco más (lib/medir-servidor.ts). */
export const DIAS_MAXIMOS = 366;

export type Rango = {
  desde: string;
  hasta: string;
  /** Cuántos días tiene, incluidos los dos extremos. */
  dias: number;
  /** El período anterior, del mismo largo, para comparar. */
  anteriorDesde: string;
  anteriorHasta: string;
  /** El atajo elegido (7, 30 o 90 días hasta hoy), o null si son fechas a elección. */
  periodo: Periodo | null;
};

/** Cuántos días hay de una fecha a otra, incluidas las dos. */
export function diasDe(desde: string, hasta: string): number {
  const ms = (d: string) => {
    const [a, m, dia] = d.split("-").map(Number);
    return Date.UTC(a, m - 1, dia);
  };
  return Math.round((ms(hasta) - ms(desde)) / 86_400_000) + 1;
}

/** "2026-11-04" si es una fecha de verdad (no 2026-02-30); null si no. */
export function fechaValida(crudo: unknown): string | null {
  const texto = Array.isArray(crudo) ? crudo[0] : crudo;
  if (typeof texto !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(texto)) return null;
  const [a, m, d] = texto.split("-").map(Number);
  const fecha = new Date(Date.UTC(a, m - 1, d));
  return a >= 2020 && fecha.toISOString().slice(0, 10) === texto ? texto : null;
}

/** El rango [desde, hasta] y el anterior del mismo largo. */
export function rangoEntre(desde: string, hasta: string, periodo: Periodo | null = null): Rango {
  const dias = diasDe(desde, hasta);
  return {
    desde,
    hasta,
    dias,
    anteriorDesde: sumarDias(desde, -dias),
    anteriorHasta: sumarDias(desde, -1),
    periodo,
  };
}

/** Los últimos `dias` días hasta hoy. */
export function rangoDe(hoy: string, dias: Periodo): Rango {
  return rangoEntre(sumarDias(hoy, -(dias - 1)), hoy, dias);
}

export function leerPeriodo(crudo: unknown): Periodo {
  const n = Number(Array.isArray(crudo) ? crudo[0] : crudo);
  return (PERIODOS as readonly number[]).includes(n) ? (n as Periodo) : 30;
}

/**
 * El rango que pidió la dirección del panel: `?desde=2026-10-01&hasta=2026-10-31`
 * (fechas a elección) o `?dias=7|30|90` (atajos). Las fechas se ordenan, no
 * pasan de hoy y no abarcan más de un año. Sin nada válido, los últimos 30 días.
 */
export function leerRango(params: { desde?: unknown; hasta?: unknown; dias?: unknown }, hoy: string): Rango {
  let desde = fechaValida(params.desde);
  let hasta = fechaValida(params.hasta);
  if (!desde && !hasta) return rangoDe(hoy, leerPeriodo(params.dias));
  desde ??= hasta!;
  hasta ??= hoy;
  if (desde > hasta) [desde, hasta] = [hasta, desde];
  if (hasta > hoy) hasta = hoy;
  if (desde > hasta) desde = hasta;
  if (diasDe(desde, hasta) > DIAS_MAXIMOS) desde = sumarDias(hasta, -(DIAS_MAXIMOS - 1));
  return rangoEntre(desde, hasta);
}

/** Atajos de meses para el panel: este mes (hasta hoy) y el anterior entero. */
export function atajosDeMes(hoy: string): { nombre: string; desde: string; hasta: string }[] {
  const inicio = `${hoy.slice(0, 8)}01`;
  const anteriorFin = sumarDias(inicio, -1);
  const anteriorInicio = `${anteriorFin.slice(0, 8)}01`;
  return [
    { nombre: "Este mes", desde: inicio, hasta: hoy },
    { nombre: "Mes pasado", desde: anteriorInicio, hasta: anteriorFin },
  ];
}

/** Todos los días entre dos fechas, incluidas. */
export function diasEntre(desde: string, hasta: string): string[] {
  const dias: string[] = [];
  for (let d = desde; d <= hasta && dias.length < 400; d = sumarDias(d, 1)) dias.push(d);
  return dias;
}

// ---------------------------------------------------------------------------
// Pedidos
// ---------------------------------------------------------------------------

/** Una fila de Pedidos, con lo que mira el panel. */
export type FilaPedidoPanel = {
  Numero?: string;
  Estado?: string;
  Items?: string;
  Subtotal?: number;
  Envio?: number;
  Total?: number;
  Provincia?: string;
  Fecha?: string;
  Origen?: string;
  Notas?: string;
  Cupon?: string;
  Medio_pago?: string;
  Envio_costo_real?: number;
  Envio_bonificado?: boolean;
};

export type ItemDelPanel = {
  varianteId: string;
  nombre: string;
  color: string;
  categoria: string;
  cantidad: number;
  subtotal: number;
};

export type PedidoPanel = {
  numero: string;
  estado: string;
  /** El día de la compra en Buenos Aires: "2026-11-04". */
  dia: string;
  total: number;
  envio: number;
  items: ItemDelPanel[];
  /** El canal, con lo que guardó de su campaña (solo con el sí a las cookies). */
  canal: Canal;
  /** El detalle de la campaña, en palabras. */
  origen: string;
  provincia: string;
  cupon: number;
  saldoUsado: number;
  cashback: number;
  suscriptor: boolean;
  dineroMP: boolean;
  envioCostoReal: number | null;
  envioBonificado: boolean;
};

const numero = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const texto = (v: unknown, max = 80) => (typeof v === "string" ? v.trim().slice(0, max) : "");

function leerItems(crudo: unknown): ItemDelPanel[] {
  if (typeof crudo !== "string") return [];
  try {
    const lista = JSON.parse(crudo) as unknown;
    if (!Array.isArray(lista)) return [];
    return lista.flatMap((i) => {
      if (!i || typeof i !== "object") return [];
      const item = i as Record<string, unknown>;
      const cantidad = numero(item.cantidad);
      if (cantidad <= 0) return [];
      return [
        {
          varianteId: texto(item.varianteId, 30),
          nombre: texto(item.nombre) || "Sin nombre",
          color: texto(item.color, 40),
          categoria: texto(item.categoria, 40),
          cantidad,
          subtotal: numero(item.subtotal),
        },
      ];
    });
  } catch {
    return [];
  }
}

function leerOrigen(crudo: unknown): Origen | null {
  if (typeof crudo !== "string" || !crudo.trim()) return null;
  try {
    const dato = JSON.parse(crudo) as unknown;
    return dato && typeof dato === "object" ? (dato as Origen) : null;
  } catch {
    return null;
  }
}

/**
 * De dónde llegó, en palabras: la campaña (utm_source / utm_medium), el
 * anuncio (fbclid, gclid) o el sitio que la mandó. La atribución se guarda
 * solo con el sí a las cookies de medición: sin eso, «Directo o sin dato».
 */
export function etiquetaDeOrigen(origen: Origen | null): string {
  const limpio = (v: unknown) => texto(v, 40).toLowerCase();
  if (!origen) return "Directo o sin dato";
  const fuente = limpio(origen.utm_source);
  if (fuente) {
    const medio = limpio(origen.utm_medium);
    const campana = limpio(origen.utm_campaign);
    return `${medio ? `${fuente} / ${medio}` : fuente}${campana ? ` · ${campana}` : ""}`;
  }
  if (texto(origen.fbclid)) return "Meta (anuncio)";
  if (texto(origen.gclid)) return "Google (anuncio)";
  if (texto(origen.ttclid)) return "TikTok (anuncio)";
  const referencia = texto(origen.referrer, 200);
  if (referencia) {
    try {
      const host = new URL(referencia).hostname.replace(/^www\./, "");
      if (host && !host.endsWith("harper.ar")) return host;
    } catch {
      // Una referencia ilegible no dice nada.
    }
  }
  return "Directo o sin dato";
}

/** Una fila de Pedidos como la usa el panel. Null si no tiene número. */
export function pedidoDelPanel(fila: FilaPedidoPanel, creado?: string): PedidoPanel | null {
  const numeroPedido = texto(fila.Numero, 40);
  if (!numeroPedido) return null;
  const fecha = new Date(fila.Fecha ?? creado ?? "");
  const beneficios = beneficiosDeNotas(fila.Notas);
  const origen = leerOrigen(fila.Origen);
  return {
    numero: numeroPedido,
    estado: texto(fila.Estado, 20) || "pendiente",
    dia: Number.isNaN(fecha.getTime()) ? "" : fechaArgentina(fecha),
    total: numero(fila.Total),
    envio: numero(fila.Envio),
    items: leerItems(fila.Items),
    canal: canalDelOrigen(origen),
    origen: etiquetaDeOrigen(origen),
    provincia: texto(fila.Provincia, 60),
    cupon: beneficios?.cupon ?? 0,
    saldoUsado: beneficios?.saldoUsado ?? 0,
    cashback: beneficios?.cashback ?? 0,
    suscriptor: beneficios !== null,
    dineroMP: esPedidoConDineroMP(fila),
    envioCostoReal: typeof fila.Envio_costo_real === "number" && Number.isFinite(fila.Envio_costo_real) ? fila.Envio_costo_real : null,
    envioBonificado: fila.Envio_bonificado === true,
  };
}

export const esConfirmado = (p: { estado: string }) => ESTADOS_CONFIRMADOS.has(p.estado);

/** El costo de una unidad de una variante, sin IVA. */
export type CostoUnitario = { costo: number; packaging: number };

export type Margen = {
  /** Pedidos confirmados que entran en la cuenta (todos sus productos tienen costo). */
  pedidos: number;
  /** Pedidos confirmados que quedan afuera porque a algún producto le falta el costo. */
  sinCosto: number;
  /** Pedidos sin el costo real del envío: se usó la tarifa plana de Config. */
  enviosEstimados: number;
  /**
   * Ventas sin IVA, antes del saldo usado: ese crédito ya se contó como costo
   * en la compra que lo prometió (la regla del motor, `baseDeLaVenta`).
   */
  ventasNetas: number;

  // Del pedido.
  /** Costo de los productos, de Costos ML. */
  productos: number;
  /** Packaging, de Costos ML. */
  packaging: number;
  /** Envíos sin IVA: el cotizado del pedido o, si no hay, la tarifa plana (`enviosEstimados`). */
  envios: number;
  /** El crédito que prometió cada pedido, sin IVA (`costoDelCashback`). */
  cashback: number;
  /** Cuotas de los pedidos en que se sabe cuántas fueron: con dinero en Mercado Pago es un pago, sin costo. */
  cuotas: number;

  // Estimados con las tasas de referencia del motor (no los montos reales).
  /** Comisión de Mercado Pago sobre lo cobrado. */
  mercadoPago: number;
  /** Ingresos Brutos sobre lo facturado sin IVA. */
  iibb: number;
  /** Reserva por devoluciones sobre las ventas sin IVA. */
  devoluciones: number;

  /** Contribución estimada: ventas sin IVA menos todo lo anterior. No resta lo pendiente. */
  contribucion: number;
  porPedido: number | null;
  /** Contribución estimada sobre ventas netas, en %. */
  porcentaje: number | null;
  /**
   * Hay pedidos confirmados, pero a ninguno se le conocen los costos de los
   * productos: la contribución no se puede calcular (no es $ 0).
   */
  sinDatosSuficientes: boolean;

  /** Costos que existen pero no se conocen. No se restan. */
  pendientes: {
    /** Pedidos pagados con tarjeta: no se guarda cuántas cuotas eligió el comprador. */
    cuotasSinDato: number;
    /** Lo que costarían esas cuotas si todas fueran de 6 (el tope de hoy, el de los suscriptores). */
    cuotasHasta: number;
    /** La preparación (armar y despachar) que supone el motor por pedido: una hipótesis, no un dato. */
    preparacionDeReferencia: number;
    /** La publicidad por pedido que supone el motor: una hipótesis, no un dato. */
    publicidadDeReferencia: number;
  };
  /**
   * Lo que falta para la ganancia neta final, en palabras. Mientras haya algo,
   * no hay ganancia neta: solo la contribución estimada.
   */
  faltaParaLaGanancia: string[];
  /** Las tasas de referencia que se usaron, sobre 1 (0,0339 = 3,39 %). */
  tasas: { mercadoPago: number; iibb: number; devoluciones: number; seisCuotas: number };
};

/** Una tasa sobre 1, en %, sin ceros de más: 0,0339 → «3,39 %»; 0,03 → «3 %». */
const porcentajeAR = (x: number) => `${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 }).format(x * 100)} %`;
const pedidosEn = (n: number) => `${n} ${n === 1 ? "pedido" : "pedidos"}`;

/**
 * Cuánto dejaron los pedidos confirmados, con el motor de contribución
 * (lib/contribucion.ts) y los montos reales de cada pedido:
 *
 *  - del pedido: productos y packaging (Costos ML), envío cotizado, cashback
 *    prometido y las cuotas cuando se saben (dinero en Mercado Pago: un pago);
 *  - estimado con las tasas de referencia del motor: Mercado Pago, IIBB y la
 *    reserva por devoluciones;
 *  - pendiente, sin restar: las cuotas que no se saben, la preparación y la
 *    publicidad.
 *
 * Null si falta la tasa de impuestos (sin ella, las ventas con IVA contra
 * costos sin IVA darían un margen inflado).
 */
export function margenDe(
  pedidos: PedidoPanel[],
  opciones: { tasa: number | null; costoDe: (varianteId: string) => CostoUnitario | null; envioPorDefecto: number }
): Margen | null {
  if (opciones.tasa === null) return null;
  const parametros: ParametrosContribucion = { ...PARAMETROS_REFERENCIA, alicuotaIva: opciones.tasa / 100, envioIncluyeIva: true };
  const m: Margen = {
    pedidos: 0,
    sinCosto: 0,
    enviosEstimados: 0,
    ventasNetas: 0,
    productos: 0,
    packaging: 0,
    envios: 0,
    cashback: 0,
    cuotas: 0,
    mercadoPago: 0,
    iibb: 0,
    devoluciones: 0,
    contribucion: 0,
    porPedido: null,
    porcentaje: null,
    sinDatosSuficientes: false,
    pendientes: {
      cuotasSinDato: 0,
      cuotasHasta: 0,
      preparacionDeReferencia: parametros.preparacionPorPedido,
      publicidadDeReferencia: parametros.cacPorPedido,
    },
    faltaParaLaGanancia: [],
    tasas: {
      mercadoPago: parametros.comisionMercadoPago,
      iibb: parametros.iibb,
      devoluciones: parametros.reservaDevoluciones,
      seisCuotas: parametros.financiacion[6],
    },
  };

  for (const p of pedidos.filter(esConfirmado)) {
    const costos = p.items.map((i) => ({ item: i, costo: opciones.costoDe(i.varianteId) }));
    if (p.items.length === 0 || costos.some((c) => c.costo === null)) {
      m.sinCosto++;
      continue;
    }
    m.pedidos++;
    // El total ya trae los descuentos, el cupón y el saldo restados: los
    // productos antes del saldo son total − envío + saldo.
    const base = baseDeLaVenta({ productos: p.total - p.envio + p.saldoUsado, envioCobrado: p.envio, saldoAplicado: p.saldoUsado }, parametros);
    m.ventasNetas += base.ventaNeta;
    for (const { item, costo } of costos) {
      m.productos += costo!.costo * item.cantidad;
      m.packaging += costo!.packaging * item.cantidad;
    }
    // Harper le paga al transportista el costo real, lo haya pagado el comprador o no
    // (lo que pagó ya está en el total).
    if (p.envioCostoReal === null) m.enviosEstimados++;
    m.envios += costoEnvioNeto(p.envioCostoReal ?? opciones.envioPorDefecto, parametros);
    m.cashback += costoDelCashback(p.cashback, 1, parametros);

    // Mercado Pago, IIBB y devoluciones no dependen de las cuotas.
    const cobro = costosDelCobro(base, 1, parametros);
    m.mercadoPago += cobro.mercadoPago;
    m.iibb += cobro.iibb;
    m.devoluciones += cobro.devoluciones;
    // Con dinero en Mercado Pago la preferencia sale en un solo pago (lib/mercadopago.ts): las cuotas no cuestan.
    if (p.dineroMP) m.cuotas += cobro.financiacion;
    else {
      m.pendientes.cuotasSinDato++;
      m.pendientes.cuotasHasta += costosDelCobro(base, 6, parametros).financiacion;
    }
  }

  m.contribucion = m.ventasNetas - m.productos - m.packaging - m.envios - m.cashback - m.cuotas - m.mercadoPago - m.iibb - m.devoluciones;
  m.porPedido = m.pedidos > 0 ? m.contribucion / m.pedidos : null;
  m.porcentaje = m.ventasNetas > 0 ? (m.contribucion / m.ventasNetas) * 100 : null;
  m.sinDatosSuficientes = m.pedidos === 0 && m.sinCosto > 0;

  const falta = m.faltaParaLaGanancia;
  falta.push("el gasto en publicidad de la tienda web del período (no está cargado en ninguna tabla)");
  falta.push("el costo de armar y despachar cada pedido (no está cargado)");
  if (m.pendientes.cuotasSinDato > 0) {
    falta.push(`las cuotas que eligió el comprador en ${pedidosEn(m.pendientes.cuotasSinDato)} con tarjeta (Mercado Pago lo sabe, el pedido no lo guarda)`);
  }
  if (m.pedidos > 0) {
    falta.push(`la comisión real de Mercado Pago de cada pago (se estimó con el ${porcentajeAR(m.tasas.mercadoPago)})`);
    falta.push(`la alícuota real de IIBB y las devoluciones reales (se estimaron con el ${porcentajeAR(m.tasas.iibb)} y el ${porcentajeAR(m.tasas.devoluciones)})`);
  }
  if (m.enviosEstimados > 0) falta.push(`el envío cotizado de ${pedidosEn(m.enviosEstimados)} (se usó la tarifa plana de Config)`);
  if (m.sinCosto > 0) {
    falta.push(`el costo en Costos ML de algún producto de ${pedidosEn(m.sinCosto)}, que ${m.sinCosto === 1 ? "queda" : "quedan"} afuera de la cuenta`);
  }
  return m;
}

/** Lo que acompaña siempre a la contribución estimada, para que no se lea como ganancia. */
export const ACLARACION_CONTRIBUCION = "Todavía no descuenta cuotas desconocidas, preparación ni publicidad: no es la ganancia real.";

const pesosConSigno = (n: number) => `${n < 0 ? "−" : ""}${precio(Math.round(Math.abs(n)))}`;
const porcentajeConUnDecimal = (n: number | null) =>
  n === null ? "—" : `${new Intl.NumberFormat("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n)} %`;

/**
 * La cifra principal de «Contribución estimada» y su explicación: siempre con
 * la aclaración de que no es la ganancia real. Si hay pedidos confirmados pero
 * a ninguno se le conocen los costos, «Sin datos suficientes» (nunca $ 0) y
 * cuántos quedaron afuera.
 */
export function cifraDeContribucion(m: Margen): { valor: string; detalle: string } {
  if (m.sinDatosSuficientes) {
    return {
      valor: "Sin datos suficientes",
      detalle: `${pedidosEn(m.sinCosto)} ${m.sinCosto === 1 ? "confirmado quedó" : "confirmados quedaron"} afuera: a sus productos les falta el costo en Costos ML.`,
    };
  }
  const porPedido = m.porPedido === null ? "—" : precio(Math.round(m.porPedido));
  return {
    valor: pesosConSigno(m.contribucion),
    detalle: `${porPedido} por pedido · ${porcentajeConUnDecimal(m.porcentaje)} de las ventas sin IVA. ${ACLARACION_CONTRIBUCION}`,
  };
}

export type ResumenVentas = {
  pedidos: number;
  facturado: number;
  ticket: number | null;
  unidades: number;
  anterior: { pedidos: number; facturado: number };
  /** Todos los pedidos del período, por estado. */
  estados: Record<string, number>;
  porModelo: { nombre: string; unidades: number; facturado: number }[];
  porOrigen: { origen: string; pedidos: number; facturado: number }[];
  /** Los pedidos pagados por canal, con lo que guardaron de su campaña. */
  porCanal: { canal: Canal; nombre: string; pedidos: number; facturado: number }[];
  beneficios: { conCupon: number; cupones: number; saldoUsado: number; cashback: number; deSuscriptores: number; conDineroMP: number };
  porDia: { dia: string; pedidos: number; facturado: number }[];
  /** Pagados que todavía no salieron, de cualquier fecha: lo que hay que despachar. */
  paraDespachar: PedidoPanel[];
  /** Los últimos pedidos del período, de cualquier estado. */
  ultimos: PedidoPanel[];
};

export function resumirVentas(pedidos: PedidoPanel[], rango: Rango): ResumenVentas {
  const enRango = (p: PedidoPanel, desde: string, hasta: string) => p.dia >= desde && p.dia <= hasta;
  const delPeriodo = pedidos.filter((p) => enRango(p, rango.desde, rango.hasta));
  const confirmados = delPeriodo.filter(esConfirmado);
  const anteriores = pedidos.filter((p) => esConfirmado(p) && enRango(p, rango.anteriorDesde, rango.anteriorHasta));
  const facturado = confirmados.reduce((t, p) => t + p.total, 0);

  const estados: Record<string, number> = {};
  for (const p of delPeriodo) estados[p.estado] = (estados[p.estado] ?? 0) + 1;

  const modelos = new Map<string, { nombre: string; unidades: number; facturado: number }>();
  const origenes = new Map<string, { origen: string; pedidos: number; facturado: number }>();
  const canales = new Map<Canal, { canal: Canal; nombre: string; pedidos: number; facturado: number }>();
  for (const p of confirmados) {
    for (const i of p.items) {
      const fila = modelos.get(i.nombre) ?? { nombre: i.nombre, unidades: 0, facturado: 0 };
      fila.unidades += i.cantidad;
      fila.facturado += i.subtotal;
      modelos.set(i.nombre, fila);
    }
    const fila = origenes.get(p.origen) ?? { origen: p.origen, pedidos: 0, facturado: 0 };
    fila.pedidos++;
    fila.facturado += p.total;
    origenes.set(p.origen, fila);
    const delCanal = canales.get(p.canal) ?? { canal: p.canal, nombre: NOMBRE_DEL_CANAL[p.canal], pedidos: 0, facturado: 0 };
    delCanal.pedidos++;
    delCanal.facturado += p.total;
    canales.set(p.canal, delCanal);
  }

  const porDia = diasEntre(rango.desde, rango.hasta).map((dia) => {
    const delDia = confirmados.filter((p) => p.dia === dia);
    return { dia, pedidos: delDia.length, facturado: delDia.reduce((t, p) => t + p.total, 0) };
  });

  const recientes = (a: PedidoPanel, b: PedidoPanel) => b.dia.localeCompare(a.dia) || b.numero.localeCompare(a.numero);

  return {
    pedidos: confirmados.length,
    facturado,
    ticket: confirmados.length > 0 ? facturado / confirmados.length : null,
    unidades: confirmados.reduce((t, p) => t + p.items.reduce((u, i) => u + i.cantidad, 0), 0),
    anterior: { pedidos: anteriores.length, facturado: anteriores.reduce((t, p) => t + p.total, 0) },
    estados,
    porModelo: [...modelos.values()].sort((a, b) => b.facturado - a.facturado),
    porOrigen: [...origenes.values()].sort((a, b) => b.facturado - a.facturado),
    porCanal: [...canales.values()].sort((a, b) => b.facturado - a.facturado),
    beneficios: {
      conCupon: confirmados.filter((p) => p.cupon > 0).length,
      cupones: confirmados.reduce((t, p) => t + p.cupon, 0),
      saldoUsado: confirmados.reduce((t, p) => t + p.saldoUsado, 0),
      cashback: confirmados.reduce((t, p) => t + p.cashback, 0),
      deSuscriptores: confirmados.filter((p) => p.suscriptor).length,
      conDineroMP: confirmados.filter((p) => p.dineroMP).length,
    },
    porDia,
    paraDespachar: pedidos.filter((p) => p.estado === "pagado" || p.estado === "preparando").sort((a, b) => a.dia.localeCompare(b.dia)),
    ultimos: [...delPeriodo].sort(recientes).slice(0, 12),
  };
}

// ---------------------------------------------------------------------------
// Embudo
// ---------------------------------------------------------------------------

export type PasoDelEmbudo = { nombre: string; valor: number; deLasVisitas: number | null };

export type Embudo = {
  /** El primer día con visitas contadas dentro del período (los contadores arrancaron con el panel). */
  desde: string | null;
  pasos: PasoDelEmbudo[];
};

/**
 * Visitas → ficha → carrito → checkout → pedido → pago, en los días que
 * tienen visitas contadas (antes de que existieran los contadores, el embudo
 * daría conversiones falsas).
 */
export function armarEmbudo(
  conteos: { porDia: Record<string, Record<EventoMedido, number>> } | null,
  pedidos: PedidoPanel[],
  rango: { desde: string; hasta: string }
): Embudo | null {
  if (!conteos) return null;
  const dias = Object.keys(conteos.porDia)
    .filter((d) => d >= rango.desde && d <= rango.hasta && conteos.porDia[d].visita > 0)
    .sort();
  const desde = dias[0] ?? null;
  const suma = (evento: EventoMedido) => dias.reduce((t, d) => t + (conteos.porDia[d][evento] ?? 0), 0);
  const delEmbudo = desde ? pedidos.filter((p) => p.dia >= desde && p.dia <= rango.hasta) : [];
  const visitas = suma("visita");
  const paso = (nombre: string, valor: number): PasoDelEmbudo => ({
    nombre,
    valor,
    deLasVisitas: visitas > 0 ? (valor / visitas) * 100 : null,
  });
  return {
    desde,
    pasos: [
      paso("Visitas", visitas),
      paso("Abrieron una ficha", suma("producto")),
      paso("Agregaron al carrito", suma("carrito")),
      paso("Empezaron el checkout", suma("checkout")),
      paso("Hicieron el pedido", delEmbudo.length),
      paso("Pagaron", delEmbudo.filter(esConfirmado).length),
    ],
  };
}

/** Las barras del facturado: por día hasta 2 meses, por semana hasta 6 meses y por mes en adelante. */
export type Tramo = { etiqueta: string; desde: string; hasta: string; pedidos: number; facturado: number };

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const corta = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;

export function agruparPorTramo(porDia: { dia: string; pedidos: number; facturado: number }[]): {
  unidad: "día" | "semana" | "mes";
  tramos: Tramo[];
} {
  const unidad = porDia.length <= 62 ? "día" : porDia.length <= 182 ? "semana" : "mes";
  const tramos: Tramo[] = [];
  porDia.forEach((d, i) => {
    const nuevo =
      tramos.length === 0 ||
      (unidad === "día" ? true : unidad === "semana" ? i % 7 === 0 : d.dia.slice(0, 7) !== tramos[tramos.length - 1].desde.slice(0, 7));
    if (nuevo) tramos.push({ etiqueta: "", desde: d.dia, hasta: d.dia, pedidos: 0, facturado: 0 });
    const t = tramos[tramos.length - 1];
    t.hasta = d.dia;
    t.pedidos += d.pedidos;
    t.facturado += d.facturado;
  });
  for (const t of tramos) {
    t.etiqueta =
      unidad === "día"
        ? `${corta(t.desde)}/${t.desde.slice(0, 4)}`
        : unidad === "semana"
          ? `Del ${corta(t.desde)} al ${corta(t.hasta)}`
          : `${MESES[Number(t.desde.slice(5, 7)) - 1]} ${t.desde.slice(0, 4)}`;
  }
  return { unidad, tramos };
}

export type FilaDeCanal = {
  canal: Canal;
  nombre: string;
  visitas: number;
  carrito: number;
  compras: number;
  /** Compras sobre visitas, en %. */
  conversion: number | null;
};

/** Visitas, carritos y compras por canal, de los contadores sin cookies. Sin los canales en cero. */
export function filasPorCanal(conteos: { porCanal: Record<Canal, Record<EventoMedido, number>> } | null): FilaDeCanal[] {
  if (!conteos) return [];
  return CANALES.map((canal) => {
    const c = conteos.porCanal[canal];
    return {
      canal,
      nombre: NOMBRE_DEL_CANAL[canal],
      visitas: c?.visita ?? 0,
      carrito: c?.carrito ?? 0,
      compras: c?.compra ?? 0,
      conversion: c && c.visita > 0 ? (c.compra / c.visita) * 100 : null,
    };
  })
    .filter((f) => f.visitas > 0 || f.carrito > 0 || f.compras > 0)
    .sort((a, b) => b.compras - a.compras || b.visitas - a.visitas);
}

// ---------------------------------------------------------------------------
// Suscriptores y saldos
// ---------------------------------------------------------------------------

export type FilaSuscriptorPanel = { Alta?: string; Baja?: string | null; Origen?: string; Cupon?: string };

export type ResumenSuscriptores = {
  activos: number;
  nuevos: number;
  bajas: number;
  porOrigen: { origen: string; nuevos: number }[];
  cuponesDisponibles: number;
  cuponesUsados: number;
};

const diaDe = (iso: string | null | undefined) => {
  const fecha = new Date(iso ?? "");
  return Number.isNaN(fecha.getTime()) ? null : fechaArgentina(fecha);
};

export function resumirSuscriptores(filas: FilaSuscriptorPanel[], rango: { desde: string; hasta: string }): ResumenSuscriptores {
  const enRango = (dia: string | null) => dia !== null && dia >= rango.desde && dia <= rango.hasta;
  const activos = filas.filter((f) => !f.Baja);
  const nuevos = filas.filter((f) => enRango(diaDe(f.Alta)));
  const origenes = new Map<string, number>();
  for (const f of nuevos) {
    const origen = texto(f.Origen, 30) || "Otro";
    origenes.set(origen, (origenes.get(origen) ?? 0) + 1);
  }
  return {
    activos: activos.length,
    nuevos: nuevos.length,
    bajas: filas.filter((f) => enRango(diaDe(f.Baja))).length,
    porOrigen: [...origenes].map(([origen, n]) => ({ origen, nuevos: n })).sort((a, b) => b.nuevos - a.nuevos),
    cuponesDisponibles: activos.filter((f) => f.Cupon === "Disponible").length,
    cuponesUsados: filas.filter((f) => f.Cupon === "Usado").length,
  };
}

export type ResumenSaldos = {
  /** Lo que los suscriptores ya pueden usar: una deuda de Harper. */
  disponible: number;
  /** Cashback que todavía no se puede usar. */
  enCamino: number;
  /** En el período. */
  emitido: number;
  usado: number;
  anulado: number;
};

export function resumirSaldos(
  movimientos: (MovimientoSaldo & { suscriptorId: string })[],
  rango: { desde: string; hasta: string },
  hoy: string
): ResumenSaldos {
  const porSuscriptor = new Map<string, MovimientoSaldo[]>();
  for (const m of movimientos) porSuscriptor.set(m.suscriptorId, [...(porSuscriptor.get(m.suscriptorId) ?? []), m]);
  let disponible = 0;
  let enCamino = 0;
  for (const lista of porSuscriptor.values()) {
    const saldo = saldoDe(lista, hoy);
    disponible += saldo.disponible;
    enCamino += saldo.enCamino;
  }
  const delPeriodo = movimientos.filter((m) => {
    const dia = diaDe(m.fecha);
    return dia !== null && dia >= rango.desde && dia <= rango.hasta;
  });
  return {
    disponible,
    enCamino,
    emitido: delPeriodo.filter((m) => m.tipo === "Cashback" && !m.anulado).reduce((t, m) => t + m.monto, 0),
    usado: -delPeriodo.filter((m) => m.tipo === "Uso" && !m.anulado).reduce((t, m) => t + m.monto, 0),
    anulado: delPeriodo.filter((m) => m.tipo === "Cashback" && m.anulado).reduce((t, m) => t + m.monto, 0),
  };
}

// ---------------------------------------------------------------------------
// Mercado Libre
// ---------------------------------------------------------------------------

export type FilaMetricasPanel = {
  Titulo?: string;
  Estado?: string;
  Visitas_30d?: number | null;
  Unidades_30d?: number;
  Unidades_7d?: number;
  Facturado_30d?: number;
  Comision_ML_30d?: number;
  Ads_costo?: number | null;
  Ads_ventas?: number | null;
  Actualizado?: string;
};

export type ResumenML = {
  visitas: number;
  unidades: number;
  unidades7d: number;
  facturado: number;
  comision: number;
  adsCosto: number;
  adsVentas: number;
  /** Ventas por publicidad sobre su costo. */
  roas: number | null;
  /** Unidades sobre visitas, en %. */
  conversion: number | null;
  actualizado: string | null;
  top: { titulo: string; unidades: number; facturado: number; roas: number | null }[];
};

/** Los últimos 30 días de Mercado Libre, según la tabla que llena la actualización diaria. Null si está vacía. */
export function resumirML(filas: FilaMetricasPanel[]): ResumenML | null {
  if (filas.length === 0) return null;
  const suma = (f: (fila: FilaMetricasPanel) => unknown) => filas.reduce((t, fila) => t + numero(f(fila)), 0);
  const visitas = suma((f) => f.Visitas_30d);
  const unidades = suma((f) => f.Unidades_30d);
  const adsCosto = suma((f) => f.Ads_costo);
  const adsVentas = suma((f) => f.Ads_ventas);
  const actualizado = filas.map((f) => texto(f.Actualizado, 40)).filter(Boolean).sort().at(-1) ?? null;
  return {
    visitas,
    unidades,
    unidades7d: suma((f) => f.Unidades_7d),
    facturado: suma((f) => f.Facturado_30d),
    comision: suma((f) => f.Comision_ML_30d),
    adsCosto,
    adsVentas,
    roas: adsCosto > 0 ? adsVentas / adsCosto : null,
    conversion: visitas > 0 ? (unidades / visitas) * 100 : null,
    actualizado,
    top: filas
      .filter((f) => numero(f.Facturado_30d) > 0)
      .sort((a, b) => numero(b.Facturado_30d) - numero(a.Facturado_30d))
      .slice(0, 6)
      .map((f) => ({
        titulo: texto(f.Titulo, 70) || "Sin título",
        unidades: numero(f.Unidades_30d),
        facturado: numero(f.Facturado_30d),
        roas: numero(f.Ads_costo) > 0 ? numero(f.Ads_ventas) / numero(f.Ads_costo) : null,
      })),
  };
}
