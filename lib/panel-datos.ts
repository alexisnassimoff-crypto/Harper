import { esPedidoConDineroMP } from "./dinero-mp";
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
 * vendió, cuánto dejó cada venta. El margen es una estimación y lo dice:
 * ventas y envío sin IVA (la tasa de Config `impuestos_nacionales`), costo de
 * la tabla Costos ML, el cashback que se le da al suscriptor, y SIN la
 * comisión de Mercado Pago, que no queda registrada en el pedido.
 */

export const PERIODOS = [7, 30, 90] as const;
export type Periodo = (typeof PERIODOS)[number];

export function leerPeriodo(crudo: unknown): Periodo {
  const n = Number(Array.isArray(crudo) ? crudo[0] : crudo);
  return (PERIODOS as readonly number[]).includes(n) ? (n as Periodo) : 30;
}

/** Los días [desde, hasta] del período que termina hoy, y los del anterior del mismo largo. */
export function rangoDe(hoy: string, dias: number) {
  return {
    desde: sumarDias(hoy, -(dias - 1)),
    hasta: hoy,
    anteriorDesde: sumarDias(hoy, -(2 * dias - 1)),
    anteriorHasta: sumarDias(hoy, -dias),
  };
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
    return medio ? `${fuente} / ${medio}` : fuente;
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
  return {
    numero: numeroPedido,
    estado: texto(fila.Estado, 20) || "pendiente",
    dia: Number.isNaN(fecha.getTime()) ? "" : fechaArgentina(fecha),
    total: numero(fila.Total),
    envio: numero(fila.Envio),
    items: leerItems(fila.Items),
    origen: etiquetaDeOrigen(leerOrigen(fila.Origen)),
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
  ventasNetas: number;
  productos: number;
  packaging: number;
  envios: number;
  cashback: number;
  contribucion: number;
  porPedido: number | null;
  /** Contribución sobre ventas netas, en %. */
  porcentaje: number | null;
};

/**
 * Cuánto dejaron los pedidos confirmados, antes de la comisión de Mercado
 * Pago. Null si falta la tasa de impuestos (sin ella, las ventas con IVA
 * contra costos sin IVA darían un margen inflado).
 */
export function margenDe(
  pedidos: PedidoPanel[],
  opciones: { tasa: number | null; costoDe: (varianteId: string) => CostoUnitario | null; envioPorDefecto: number }
): Margen | null {
  if (opciones.tasa === null) return null;
  const sinIva = (monto: number) => monto / (1 + opciones.tasa! / 100);
  const m: Margen = {
    pedidos: 0,
    sinCosto: 0,
    enviosEstimados: 0,
    ventasNetas: 0,
    productos: 0,
    packaging: 0,
    envios: 0,
    cashback: 0,
    contribucion: 0,
    porPedido: null,
    porcentaje: null,
  };

  for (const p of pedidos.filter(esConfirmado)) {
    const costos = p.items.map((i) => ({ item: i, costo: opciones.costoDe(i.varianteId) }));
    if (p.items.length === 0 || costos.some((c) => c.costo === null)) {
      m.sinCosto++;
      continue;
    }
    m.pedidos++;
    m.ventasNetas += sinIva(p.total);
    for (const { item, costo } of costos) {
      m.productos += costo!.costo * item.cantidad;
      m.packaging += costo!.packaging * item.cantidad;
    }
    // Harper le paga al transportista el costo real, lo haya pagado el comprador o no
    // (lo que pagó ya está en el total).
    if (p.envioCostoReal === null) m.enviosEstimados++;
    m.envios += sinIva(p.envioCostoReal ?? opciones.envioPorDefecto);
    m.cashback += p.cashback;
  }

  m.contribucion = m.ventasNetas - m.productos - m.packaging - m.envios - m.cashback;
  m.porPedido = m.pedidos > 0 ? m.contribucion / m.pedidos : null;
  m.porcentaje = m.ventasNetas > 0 ? (m.contribucion / m.ventasNetas) * 100 : null;
  return m;
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
  beneficios: { conCupon: number; cupones: number; saldoUsado: number; cashback: number; deSuscriptores: number; conDineroMP: number };
  porDia: { dia: string; pedidos: number; facturado: number }[];
  /** Pagados que todavía no salieron, de cualquier fecha: lo que hay que despachar. */
  paraDespachar: PedidoPanel[];
  /** Los últimos pedidos del período, de cualquier estado. */
  ultimos: PedidoPanel[];
};

export function resumirVentas(pedidos: PedidoPanel[], rango: ReturnType<typeof rangoDe>): ResumenVentas {
  const enRango = (p: PedidoPanel, desde: string, hasta: string) => p.dia >= desde && p.dia <= hasta;
  const delPeriodo = pedidos.filter((p) => enRango(p, rango.desde, rango.hasta));
  const confirmados = delPeriodo.filter(esConfirmado);
  const anteriores = pedidos.filter((p) => esConfirmado(p) && enRango(p, rango.anteriorDesde, rango.anteriorHasta));
  const facturado = confirmados.reduce((t, p) => t + p.total, 0);

  const estados: Record<string, number> = {};
  for (const p of delPeriodo) estados[p.estado] = (estados[p.estado] ?? 0) + 1;

  const modelos = new Map<string, { nombre: string; unidades: number; facturado: number }>();
  const origenes = new Map<string, { origen: string; pedidos: number; facturado: number }>();
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
