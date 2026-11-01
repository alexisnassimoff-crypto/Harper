import { precio } from "./formato";
import { diaAnterior, fechaArgentina } from "./ml-metricas";

/**
 * Los avisos por mail que salen de las métricas de Mercado Libre: el plan de
 * envíos a Full (avisa cuando hay que armar el envío) y el resumen de la
 * semana con la ganancia real (los lunes). Acá no hay red: se arman con lo
 * que ya está en las tablas y en las órdenes (ver lib/ml-avisos-servidor.ts).
 */

// ---------------------------------------------------------------------------
// Plan de envíos a Full
// ---------------------------------------------------------------------------

export type FilaStock = {
  id: string;
  titulo: string;
  estado: string;
  stock: number | null;
  unidades30: number;
  permalink: string;
  logistica: string;
};

/** Lo que cuesta Full y cuánto tarda la reposición (tabla Config, claves full_*). */
export type ParametrosFull = {
  /** Lo que cobra cada colecta, con IVA. */
  costoColecta: number;
  /** Días que una unidad puede estar en Full sin pagar almacenamiento. */
  diasSinCargo: number;
  /** Por unidad y por mes pasados los días sin cargo. null = no se sabe. */
  almacenamientoUnidadMes: number | null;
  /** Desde que se decide mandar hasta que está a la venta en Full. */
  diasReposicion: number;
  /** Margen por si la reposición se atrasa o las ventas suben. */
  diasSeguridad: number;
};

export const PARAMETROS_FULL: ParametrosFull = {
  costoColecta: 30_000,
  diasSinCargo: 30,
  almacenamientoUnidadMes: null,
  diasReposicion: 10,
  diasSeguridad: 5,
};

/** El ciclo nunca baja de dos semanas: menos es pagar una colecta por semana. */
const CICLO_MINIMO = 14;
const CICLO_MAXIMO = 120;

/**
 * Cada cuántos días conviene mandar, con una sola colecta para todo.
 *
 * Por día, una colecta cada C días cuesta K / C. Lo que se manda se vende de
 * a poco: con un envío que dura C días, la parte que pasa de los F días sin
 * cargo suma D × (C − F)² / 2 unidades-día de almacenamiento por ciclo, o sea
 * h × D × (C − F)² / (2C) por día (h por unidad y por día, D unidades por
 * día). Se busca el C que minimiza la suma. Sin la tarifa de almacenamiento
 * no hay cuenta posible: el ciclo no se pasa de los días sin cargo.
 */
export function cicloOptimo(p: ParametrosFull, demandaDiaria: number): { ciclo: number; motivo: string; costoMensual: number } {
  const colectaPorDia = (c: number) => p.costoColecta / c;
  if (p.almacenamientoUnidadMes === null || demandaDiaria <= 0) {
    const ciclo = Math.max(CICLO_MINIMO, p.diasSinCargo);
    return {
      ciclo,
      motivo: `sin la tarifa de almacenamiento, el plan no se pasa de los ${p.diasSinCargo} días sin cargo`,
      costoMensual: Math.round(colectaPorDia(ciclo) * 30),
    };
  }
  const h = p.almacenamientoUnidadMes / 30;
  const costoPorDia = (c: number) => colectaPorDia(c) + (h * demandaDiaria * Math.max(0, c - p.diasSinCargo) ** 2) / (2 * c);
  let mejor = CICLO_MINIMO;
  for (let c = CICLO_MINIMO; c <= CICLO_MAXIMO; c += 1) if (costoPorDia(c) < costoPorDia(mejor)) mejor = c;
  return {
    ciclo: mejor,
    motivo: "el que hace más barata la suma de colectas y almacenamiento",
    costoMensual: Math.round(costoPorDia(mejor) * 30),
  };
}

export type ItemPlan = {
  id: string;
  titulo: string;
  stock: number;
  porDia: number;
  /** Días que alcanza el stock al ritmo de los últimos 30. */
  dias: number;
  /** Cuánto mandar para cubrir reposición + ciclo + seguridad desde hoy. */
  mandar: number;
  /** Se queda sin stock antes de que llegue un envío que se arme hoy. */
  seAgotaAntes: boolean;
  permalink: string;
};

export type StockLento = {
  id: string;
  titulo: string;
  stock: number;
  porDia: number;
  /** Unidades de más: las que no se venden en la cobertura que manda el plan. */
  excedente: number;
  permalink: string;
};

export type PlanDeEnvio = {
  ciclo: number;
  /** Días de venta que cubre cada envío: reposición + ciclo + seguridad. */
  cobertura: number;
  motivoCiclo: string;
  costoMensual: number;
  /** En cuántos días hay que armar el envío (0 = ya). */
  diasHastaEnvio: number | null;
  hayQueEnviar: boolean;
  items: ItemPlan[];
  lentos: StockLento[];
};

/** Stock lento: al menos estas unidades de más, y al menos esta parte del stock. */
const LENTO_MINIMO = 3;
const LENTO_PROPORCION = 0.25;

/** Se avisa cuando faltan estos días o menos para el punto de reposición, así hay tiempo de armarlo. */
export const AVISO_ANTICIPADO_DIAS = 3;

/**
 * El plan: un solo envío para todas las publicaciones de Full, cuando la
 * primera llega a su punto de reposición (le quedan los días de reposición
 * más los de seguridad). En ese envío va todo lo que hace falta para cubrir
 * el ciclo entero, así no hay que mandar cada vez que una se agota.
 *
 * Mercado Libre pausa sola la publicación que llega a cero, así que una
 * pausada sin stock que vendió en los últimos 30 días también entra.
 */
export function planDeEnvio(filas: FilaStock[], p: ParametrosFull): PlanDeEnvio {
  const deFull = filas.filter((f) => f.logistica === "fulfillment");
  const vendibles = deFull.flatMap((f) => {
    const stock = f.stock ?? 0;
    const porDia = f.unidades30 / 30;
    const vendible = f.estado === "active" || (f.estado === "paused" && stock === 0);
    return vendible && porDia > 0 ? [{ f, stock, porDia, dias: stock / porDia }] : [];
  });

  const { ciclo, motivo, costoMensual } = cicloOptimo(p, vendibles.reduce((t, v) => t + v.porDia, 0));
  const puntoDeReposicion = p.diasReposicion + p.diasSeguridad;
  const cubrir = p.diasReposicion + ciclo + p.diasSeguridad;

  const items: ItemPlan[] = vendibles
    .map(({ f, stock, porDia, dias }) => ({
      id: f.id,
      titulo: f.titulo,
      stock,
      porDia,
      dias,
      mandar: Math.max(0, Math.ceil(porDia * cubrir - stock)),
      seAgotaAntes: dias < p.diasReposicion,
      permalink: f.permalink,
    }))
    .filter((i) => i.mandar > 0)
    .sort((a, b) => a.dias - b.dias);

  const diasHastaEnvio = vendibles.length ? Math.max(0, Math.floor(Math.min(...vendibles.map((v) => v.dias)) - puntoDeReposicion)) : null;

  // Stock lento: más del que el plan mandaría nunca. Se queda en Full más
  // tiempo que el resto y es el que termina pagando almacenamiento.
  const lentos: StockLento[] = deFull
    .flatMap((f) => {
      const stock = f.stock ?? 0;
      const porDia = f.unidades30 / 30;
      const excedente = Math.floor(stock - porDia * cubrir);
      // Unas pocas unidades de más en un producto que vende no es stock lento.
      const importante = excedente >= LENTO_MINIMO && excedente >= stock * LENTO_PROPORCION;
      return importante ? [{ id: f.id, titulo: f.titulo, stock, porDia, excedente, permalink: f.permalink }] : [];
    })
    .sort((a, b) => b.excedente - a.excedente);

  return {
    ciclo,
    cobertura: cubrir,
    motivoCiclo: motivo,
    costoMensual,
    diasHastaEnvio,
    hayQueEnviar: diasHastaEnvio !== null && diasHastaEnvio <= AVISO_ANTICIPADO_DIAS,
    items,
    lentos,
  };
}

/** Lo que cambia el aviso: qué publicaciones van en el envío. */
export function firmaDelPlan(plan: PlanDeEnvio): string {
  return plan.items
    .map((i) => i.id)
    .sort()
    .join(",");
}

// ---------------------------------------------------------------------------
// Ganancia real
// ---------------------------------------------------------------------------

export type CostoProducto = { costo: number | null; packaging: number };

/** Impuestos sobre la venta (modelo de márgenes, hoja Parámetros). */
export const IVA = 0.21;
export const IIBB = 0.0182;
export const DEBITOS_CREDITOS = 0.012;

export type Ganancia = {
  /** Lo que pagaron los compradores (con IVA, después del cupón). */
  ventas: number;
  ventasSinIva: number;
  cupones: number;
  cargosML: number;
  envios: number;
  publicidad: number;
  impuestos: number;
  mercaderia: number;
  packaging: number;
  colectas: number;
  ganancia: number;
  /** Ganancia sobre ventas sin IVA. */
  margen: number | null;
  /** Ganancia por cada $100 que pagó el comprador. */
  deCada100: number | null;
  /** Ventas que no entran en la cuenta porque la publicación no tiene costo cargado. */
  ventasSinCosto: number;
  unidadesSinCosto: number;
};

type OrdenParaGanancia = {
  status?: string;
  date_created?: string;
  coupon?: { amount?: unknown } | null;
  shipping?: { id?: unknown } | null;
  order_items?: unknown[];
};

const sinIva = (n: number) => n / (1 + IVA);

/**
 * La ganancia de un rango, con los datos de cada orden: precio, cupón (lo
 * paga el vendedor: Mercado Libre cobra la comisión sobre el precio neto),
 * cargo por vender (ya incluye el costo fijo y las cuotas) y envío a cargo
 * del vendedor. Todo se lleva a sin IVA: el IVA de la venta va a ARCA y el de
 * los cargos de ML vuelve como crédito.
 *
 * Una orden con alguna publicación sin costo cargado no entra: su ganancia
 * no se puede saber. Se informa aparte. La publicidad y las colectas son del
 * rango entero y se restan completas.
 */
export function calcularGanancia(datos: {
  ordenes: unknown[];
  rango: Rango;
  costos: Map<string, CostoProducto>;
  /** Lo que pagó el vendedor por cada envío, con IVA (id de envío → costo). */
  envioDe: Map<string, number>;
  /** Gasto de Product Ads del rango (la API lo da sin IVA). */
  publicidad: number;
  /** Colectas de Full del rango, con IVA. */
  colectas: number;
}): Ganancia {
  let ventas = 0;
  let cupones = 0;
  let cargos = 0;
  let mercaderia = 0;
  let packaging = 0;
  let ventasSinCosto = 0;
  let unidadesSinCosto = 0;
  const envios = new Set<string>();

  for (const orden of datos.ordenes) {
    const o = orden as OrdenParaGanancia;
    if (o.status !== "paid" || !o.date_created) continue;
    const creada = Date.parse(o.date_created);
    if (Number.isNaN(creada)) continue;
    const dia = fechaArgentina(creada);
    if (dia < datos.rango.desde || dia > datos.rango.hasta) continue;

    const lineas = (o.order_items ?? []).map((l) => {
      const x = l as { item?: { id?: string }; quantity?: number; unit_price?: number; sale_fee?: number };
      const cantidad = typeof x.quantity === "number" ? x.quantity : 0;
      return {
        id: x.item?.id ?? "",
        cantidad,
        monto: cantidad * (typeof x.unit_price === "number" ? x.unit_price : 0),
        cargo: cantidad * (typeof x.sale_fee === "number" ? x.sale_fee : 0),
        costo: x.item?.id ? datos.costos.get(x.item.id) : undefined,
      };
    });
    const cupon = typeof o.coupon?.amount === "number" ? o.coupon.amount : 0;

    if (lineas.some((l) => l.costo?.costo == null)) {
      ventasSinCosto += lineas.reduce((t, l) => t + l.monto, 0) - cupon;
      unidadesSinCosto += lineas.reduce((t, l) => t + l.cantidad, 0);
      continue;
    }

    ventas += lineas.reduce((t, l) => t + l.monto, 0) - cupon;
    cupones += cupon;
    cargos += lineas.reduce((t, l) => t + l.cargo, 0);
    mercaderia += lineas.reduce((t, l) => t + l.cantidad * (l.costo?.costo ?? 0), 0);
    packaging += lineas.reduce((t, l) => t + l.cantidad * (l.costo?.packaging ?? 0), 0);
    const envioId = o.shipping?.id == null ? "" : String(o.shipping.id);
    if (envioId) envios.add(envioId);
  }

  // Un envío con varias órdenes (pack) se paga una sola vez.
  const enviosConIva = [...envios].reduce((t, id) => t + (datos.envioDe.get(id) ?? 0), 0);
  const ventasSinIva = sinIva(ventas);
  const impuestos = ventasSinIva * IIBB + Math.max(0, ventas - cargos - enviosConIva) * DEBITOS_CREDITOS;
  const ganancia =
    ventasSinIva - sinIva(cargos) - sinIva(enviosConIva) - datos.publicidad - impuestos - mercaderia - packaging - sinIva(datos.colectas);

  const redondo = (n: number) => Math.round(n);
  return {
    ventas: redondo(ventas),
    ventasSinIva: redondo(ventasSinIva),
    cupones: redondo(cupones),
    cargosML: redondo(sinIva(cargos)),
    envios: redondo(sinIva(enviosConIva)),
    publicidad: redondo(datos.publicidad),
    impuestos: redondo(impuestos),
    mercaderia: redondo(mercaderia),
    packaging: redondo(packaging),
    colectas: redondo(sinIva(datos.colectas)),
    ganancia: redondo(ganancia),
    margen: ventasSinIva ? Math.round((ganancia / ventasSinIva) * 1000) / 10 : null,
    deCada100: ventas ? Math.round((ganancia / ventas) * 1000) / 10 : null,
    ventasSinCosto: redondo(ventasSinCosto),
    unidadesSinCosto,
  };
}

/** Los envíos de las órdenes de un rango (para pedir cuánto pagó el vendedor por cada uno). */
export function enviosDeOrdenes(ordenes: unknown[], rango: Rango): string[] {
  const ids = new Set<string>();
  for (const orden of ordenes) {
    const o = orden as OrdenParaGanancia;
    if (o.status !== "paid" || !o.date_created || o.shipping?.id == null) continue;
    const dia = fechaArgentina(Date.parse(o.date_created));
    if (dia >= rango.desde && dia <= rango.hasta) ids.add(String(o.shipping.id));
  }
  return [...ids];
}

/** Lo que pagó el vendedor por un envío, de /shipments/{id}/costs (senders[].cost). */
export function leerCostoDeEnvio(respuesta: unknown): number {
  const senders = (respuesta as { senders?: { cost?: unknown }[] } | null)?.senders ?? [];
  return senders.reduce((t, s) => t + (typeof s.cost === "number" ? s.cost : 0), 0);
}

// ---------------------------------------------------------------------------
// Semanas y ventas
// ---------------------------------------------------------------------------

export type Rango = { desde: string; hasta: string };

const DIA_MS = 24 * 60 * 60 * 1000;

/** El lunes de la semana de una fecha YYYY-MM-DD. */
function lunesDe(fecha: string): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  const desdeLunes = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - desdeLunes * DIA_MS).toISOString().slice(0, 10);
}

function sumarDias(fecha: string, dias: number): string {
  return new Date(Date.parse(`${fecha}T12:00:00Z`) + dias * DIA_MS).toISOString().slice(0, 10);
}

/** La última semana completa (lunes a domingo, hora de Argentina) y la anterior. */
export function semanas(ahora: number): { actual: Rango; anterior: Rango } {
  const hoy = fechaArgentina(ahora);
  const desde = sumarDias(lunesDe(hoy), -7);
  return {
    actual: { desde, hasta: sumarDias(desde, 6) },
    anterior: { desde: sumarDias(desde, -7), hasta: diaAnterior(desde) },
  };
}

/** Verdadero si es lunes en la Argentina. */
export function esLunes(ahora: number): boolean {
  return new Date(`${fechaArgentina(ahora)}T12:00:00Z`).getUTCDay() === 1;
}

export type Totales = { pedidos: number; unidades: number; facturado: number };
export type VentasDePublicacion = { id: string; titulo: string; actual: Totales; anterior: Totales };

const ceros = (): Totales => ({ pedidos: 0, unidades: 0, facturado: 0 });

/** Las órdenes pagadas de las dos semanas, en total y por publicación. */
export function resumenDeVentas(
  ordenes: unknown[],
  s: { actual: Rango; anterior: Rango }
): { actual: Totales; anterior: Totales; porPublicacion: VentasDePublicacion[] } {
  const actual = ceros();
  const anterior = ceros();
  const porId = new Map<string, VentasDePublicacion>();

  for (const orden of ordenes) {
    const o = orden as { status?: string; date_created?: string; order_items?: unknown[] };
    if (o.status !== "paid" || !o.date_created) continue;
    const creada = Date.parse(o.date_created);
    if (Number.isNaN(creada)) continue;
    const dia = fechaArgentina(creada);
    const cual = dia >= s.actual.desde && dia <= s.actual.hasta ? "actual" : dia >= s.anterior.desde && dia <= s.anterior.hasta ? "anterior" : null;
    if (!cual) continue;

    const total = cual === "actual" ? actual : anterior;
    total.pedidos += 1;
    for (const linea of o.order_items ?? []) {
      const l = linea as { item?: { id?: string; title?: string }; quantity?: number; unit_price?: number };
      const id = l.item?.id;
      if (!id) continue;
      const cantidad = typeof l.quantity === "number" ? l.quantity : 0;
      const monto = cantidad * (typeof l.unit_price === "number" ? l.unit_price : 0);
      total.unidades += cantidad;
      total.facturado += monto;
      const fila = porId.get(id) ?? { id, titulo: l.item?.title ?? id, actual: ceros(), anterior: ceros() };
      fila[cual].unidades += cantidad;
      fila[cual].facturado += monto;
      porId.set(id, fila);
    }
  }

  return { actual, anterior, porPublicacion: [...porId.values()] };
}

// ---------------------------------------------------------------------------
// Publicidad, decisiones y preguntas
// ---------------------------------------------------------------------------

export type ResumenAds = { costo: number; ventas: number; unidades: number; acos: number | null };

/** El metrics_summary de /product_ads/ad_groups/search. */
export function leerResumenAds(respuesta: unknown): ResumenAds | null {
  const m = (respuesta as { metrics_summary?: Record<string, unknown> } | null)?.metrics_summary;
  if (!m) return null;
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  return { costo: n(m.cost), ventas: n(m.total_amount), unidades: n(m.units_quantity), acos: typeof m.acos === "number" ? m.acos : null };
}

export type DecisionARevisar = { decision: string; revisar: string; estado: string };

const CERRADAS = new Set(["Hecha", "Funcionó", "No funcionó", "Descartada", "Regla vigente"]);

/** Las decisiones abiertas con revisión vencida o en los próximos 7 días. */
export function decisionesARevisar(
  filas: { Decision?: unknown; Revisar_el?: unknown; Estado?: unknown }[],
  hoy: string
): DecisionARevisar[] {
  const limite = sumarDias(hoy, 7);
  return filas
    .flatMap((f) => {
      const revisar = typeof f.Revisar_el === "string" ? f.Revisar_el : "";
      const estado = typeof f.Estado === "string" ? f.Estado : "";
      const decision = typeof f.Decision === "string" ? f.Decision : "";
      return revisar && decision && revisar <= limite && !CERRADAS.has(estado) ? [{ decision, revisar, estado }] : [];
    })
    .sort((a, b) => a.revisar.localeCompare(b.revisar));
}

export type ResumenPreguntas = { total: number; solas: number; borradores: number; pendientes: number };

/** Las preguntas recibidas en la semana y qué hizo el agente. */
export function resumenDePreguntas(filas: { Recibida?: unknown; Estado?: unknown }[], s: Rango): ResumenPreguntas {
  const r: ResumenPreguntas = { total: 0, solas: 0, borradores: 0, pendientes: 0 };
  for (const f of filas) {
    if (typeof f.Recibida !== "string") continue;
    const dia = fechaArgentina(Date.parse(f.Recibida));
    if (dia < s.desde || dia > s.hasta) continue;
    r.total += 1;
    if (f.Estado === "respondida sola") r.solas += 1;
    else r.borradores += 1;
    if (f.Estado === "borrador" || f.Estado === "error") r.pendientes += 1;
  }
  return r;
}

// ---------------------------------------------------------------------------
// Mails
// ---------------------------------------------------------------------------

export type Mail = { asunto: string; html: string; texto: string };

function escapar(texto: string) {
  return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const ESTILO = "font-family:Helvetica,Arial,sans-serif;color:#16150f;max-width:640px;line-height:1.5";
const CELDA = "padding:6px 8px;border-bottom:1px solid #e3e0d8;font-size:14px;vertical-align:top";
const GRIS = "font-size:13px;color:#78756c";
const TABLA = `role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%"`;

const fechaCorta = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`;
const dias = (d: number) => (d < 1 ? "menos de 1 día" : `${Math.floor(d)} días`);
const lista = (items: string[]) =>
  items.length ? `<ul style="margin:4px 0 0;padding-left:18px">${items.map((i) => `<li style="font-size:14px">${i}</li>`).join("")}</ul>` : "";

function tablaDeEnvio(plan: PlanDeEnvio): { html: string; texto: string } {
  const filas = plan.items
    .map(
      (i) => `<tr>
<td style="${CELDA}">${i.seAgotaAntes ? "🔴 " : ""}<a href="${escapar(i.permalink)}" style="color:#16150f">${escapar(i.titulo)}</a></td>
<td style="${CELDA};text-align:right">${i.stock}</td>
<td style="${CELDA};text-align:right">${i.stock === 0 ? "sin stock" : dias(i.dias)}</td>
<td style="${CELDA};text-align:right"><strong>${i.mandar}</strong></td>
</tr>`
    )
    .join("");
  const total = plan.items.reduce((t, i) => t + i.mandar, 0);
  return {
    html: `<table ${TABLA}>
<tr><th style="${CELDA};text-align:left">Publicación</th><th style="${CELDA};text-align:right">Stock</th><th style="${CELDA};text-align:right">Alcanza</th><th style="${CELDA};text-align:right">Mandar</th></tr>
${filas}
<tr><td style="${CELDA}"><strong>Total del envío</strong></td><td style="${CELDA}"></td><td style="${CELDA}"></td><td style="${CELDA};text-align:right"><strong>${total}</strong></td></tr>
</table>`,
    texto: [
      ...plan.items.map((i) => `- ${i.seAgotaAntes ? "SE AGOTA ANTES: " : ""}${i.titulo}: stock ${i.stock}, alcanza ${i.stock === 0 ? "sin stock" : dias(i.dias)}, mandar ${i.mandar}`),
      `Total del envío: ${total}`,
    ].join("\n"),
  };
}

function notaDelPlan(plan: PlanDeEnvio, p: ParametrosFull): string {
  return (
    `Un solo envío cada ${plan.ciclo} días (${plan.motivoCiclo}): ~${precio(plan.costoMensual)} por mes de Full. ` +
    `«Mandar» cubre ${p.diasReposicion} días de reposición + ${plan.ciclo} del ciclo + ${p.diasSeguridad} de seguridad, al ritmo de los últimos 30 días. ` +
    `Lo que está en camino a Full no figura en el stock hasta que se acredita.`
  );
}

function bloqueLentos(plan: PlanDeEnvio, p: ParametrosFull): { html: string; texto: string } {
  if (!plan.lentos.length) return { html: "", texto: "" };
  const linea = (l: StockLento) => `${l.titulo}: ${l.stock} en Full, ~${l.excedente} de más (no se venden en ${plan.cobertura} días al ritmo actual)`;
  return {
    html: `<p style="margin:16px 0 0"><strong>Stock lento en Full</strong>: queda más tiempo que el resto y es el que paga almacenamiento pasados los ${p.diasSinCargo} días. Conviene promoción, bajar el precio o no reponer.</p>${lista(plan.lentos.slice(0, 8).map((l) => escapar(linea(l))))}`,
    texto: ["", `Stock lento en Full (paga almacenamiento pasados los ${p.diasSinCargo} días):`, ...plan.lentos.slice(0, 8).map((l) => `- ${linea(l)}`)].join("\n"),
  };
}

/** El aviso de que hay que armar el envío a Full, con todo lo que va. */
export function mailDeEnvio(plan: PlanDeEnvio, p: ParametrosFull): Mail {
  const tabla = tablaDeEnvio(plan);
  const agotan = plan.items.filter((i) => i.seAgotaAntes).length;
  const cuando = plan.diasHastaEnvio ? `en ${plan.diasHastaEnvio} días` : "ya";
  const nota = notaDelPlan(plan, p);
  return {
    asunto: `Full: armá el envío ${cuando}${agotan ? ` (${agotan} se ${agotan === 1 ? "agota" : "agotan"} antes de que llegue)` : ""}`,
    html: `<div style="${ESTILO}">
<p style="font-size:17px;margin:0 0 12px"><strong>Hay que armar el envío a Full ${cuando}</strong></p>
${tabla.html}
<p style="${GRIS}">${escapar(nota)}${agotan ? " 🔴 = se queda sin stock antes de que llegue este envío." : ""}</p>
${bloqueLentos(plan, p).html}
</div>`,
    texto: `Hay que armar el envío a Full ${cuando}\n\n${tabla.texto}\n\n${nota}${bloqueLentos(plan, p).texto}`,
  };
}

function variacion(actual: number, anterior: number): string {
  if (!anterior) return actual ? "nuevo" : "—";
  const v = Math.round((actual / anterior - 1) * 100);
  return `${v > 0 ? "+" : ""}${v}%`;
}

export type PeriodoGanancia = { titulo: string; rango: Rango; ganancia: Ganancia };

function tablaDeGanancia(periodos: PeriodoGanancia[]): { html: string; texto: string } {
  const filas: [string, (g: Ganancia) => string, boolean?][] = [
    ["Ventas sin IVA", (g) => precio(g.ventasSinIva), true],
    ["− Cargos de Mercado Libre", (g) => precio(g.cargosML)],
    ["− Envíos a tu cargo", (g) => precio(g.envios)],
    ["− Publicidad", (g) => precio(g.publicidad)],
    ["− IIBB e impuesto al cheque", (g) => precio(g.impuestos)],
    ["− Mercadería", (g) => precio(g.mercaderia)],
    ["− Packaging", (g) => precio(g.packaging)],
    ["− Colectas de Full", (g) => precio(g.colectas)],
    ["= Ganancia", (g) => precio(g.ganancia), true],
    ["Margen sobre ventas sin IVA", (g) => (g.margen === null ? "—" : `${g.margen}%`), true],
    ["De cada $100 que paga el comprador", (g) => (g.deCada100 === null ? "—" : precio(g.deCada100))],
  ];
  const cabecera = periodos.map((p) => `<th style="${CELDA};text-align:right">${escapar(p.titulo)}</th>`).join("");
  const cuerpo = filas
    .map(
      ([etiqueta, valor, fuerte]) =>
        `<tr><td style="${CELDA}">${fuerte ? `<strong>${etiqueta}</strong>` : etiqueta}</td>${periodos
          .map((p) => `<td style="${CELDA};text-align:right">${fuerte ? `<strong>${valor(p.ganancia)}</strong>` : valor(p.ganancia)}</td>`)
          .join("")}</tr>`
    )
    .join("");
  return {
    html: `<table ${TABLA}><tr><th style="${CELDA}"></th>${cabecera}</tr>${cuerpo}</table>`,
    texto: periodos
      .map((p) => `${p.titulo}: ganancia ${precio(p.ganancia.ganancia)} (${p.ganancia.margen ?? "—"}% sobre ventas sin IVA) de ${precio(p.ganancia.ventas)} de ventas`)
      .join("\n"),
  };
}

export type DatosSemana = {
  semanas: { actual: Rango; anterior: Rango };
  ventas: ReturnType<typeof resumenDeVentas>;
  /** Mes en curso (del 1 a ayer) y, la primera semana del mes, el mes anterior completo. */
  meses: { titulo: string; totales: Totales }[];
  ganancias: PeriodoGanancia[];
  ads: { actual: ResumenAds | null; anterior: ResumenAds | null };
  plan: PlanDeEnvio;
  parametros: ParametrosFull;
  decisiones: DecisionARevisar[];
  preguntas: ResumenPreguntas | null;
};

export function mailSemanal(d: DatosSemana): Mail {
  const { actual: va, anterior: vb } = d.ventas;
  const rango = `${fechaCorta(d.semanas.actual.desde)} al ${fechaCorta(d.semanas.actual.hasta)}`;
  const top = [...d.ventas.porPublicacion].sort((a, b) => b.actual.facturado - a.actual.facturado).slice(0, 5);
  const caidas = [...d.ventas.porPublicacion]
    .filter((p) => p.anterior.unidades > 0 && p.actual.unidades < p.anterior.unidades)
    .sort((a, b) => b.anterior.unidades - b.actual.unidades - (a.anterior.unidades - a.actual.unidades))
    .slice(0, 3);

  const fila = (etiqueta: string, valores: string[]) =>
    `<tr><td style="${CELDA}">${etiqueta}</td>${valores.map((v, i) => `<td style="${CELDA};text-align:right${i === 0 ? ";font-weight:bold" : ""}">${v}</td>`).join("")}</tr>`;
  const cabeceraMeses = d.meses.map((m) => `<th style="${CELDA};text-align:right">${escapar(m.titulo)}</th>`).join("");
  const ventasHtml = `<table ${TABLA}>
<tr><th style="${CELDA};text-align:left"></th><th style="${CELDA};text-align:right">Esta semana</th><th style="${CELDA};text-align:right">Anterior</th><th style="${CELDA};text-align:right">Cambio</th>${cabeceraMeses}</tr>
${fila("Ventas", [precio(va.facturado), precio(vb.facturado), variacion(va.facturado, vb.facturado), ...d.meses.map((m) => precio(m.totales.facturado))])}
${fila("Pedidos", [String(va.pedidos), String(vb.pedidos), variacion(va.pedidos, vb.pedidos), ...d.meses.map((m) => String(m.totales.pedidos))])}
${fila("Unidades", [String(va.unidades), String(vb.unidades), variacion(va.unidades, vb.unidades), ...d.meses.map((m) => String(m.totales.unidades))])}
</table>`;

  const ganancia = tablaDeGanancia(d.ganancias);
  const sinCosto = d.ganancias.find((g) => g.ganancia.unidadesSinCosto > 0);
  const notaGanancia =
    `La ganancia descuenta todo lo de la tabla. No incluye Ganancias, gastos fijos de la empresa ni devoluciones posteriores a la venta. ` +
    `La publicidad es el gasto de Product Ads del período.` +
    (sinCosto
      ? ` Quedan afuera ${sinCosto.ganancia.unidadesSinCosto} unidades (${precio(sinCosto.ganancia.ventasSinCosto)}) de publicaciones sin costo cargado en la tabla Costos ML.`
      : "");

  const topHtml = lista(top.map((p) => `${escapar(p.titulo)}: ${precio(p.actual.facturado)} (${p.actual.unidades} u., antes ${p.anterior.unidades})`));
  const caidasHtml = caidas.length
    ? `<p style="margin:16px 0 0"><strong>Las que más cayeron</strong></p>${lista(caidas.map((p) => `${escapar(p.titulo)}: ${p.actual.unidades} u. (antes ${p.anterior.unidades})`))}`
    : "";

  const adsHtml = d.ads.actual
    ? `<p style="margin:16px 0 0"><strong>Publicidad de la semana</strong></p>${lista([
        `Gasto: ${precio(d.ads.actual.costo)}${d.ads.anterior ? ` (antes ${precio(d.ads.anterior.costo)})` : ""}`,
        `Ventas por publicidad: ${precio(d.ads.actual.ventas)}, ${d.ads.actual.unidades} u.`,
        `ACOS: ${d.ads.actual.acos ?? "—"}%${d.ads.anterior?.acos != null ? ` (antes ${d.ads.anterior.acos}%)` : ""}`,
        `Publicidad sobre ventas totales: ${va.facturado ? Math.round((d.ads.actual.costo / va.facturado) * 1000) / 10 : "—"}%`,
      ])}`
    : `<p style="${GRIS}">Publicidad: sin datos esta semana.</p>`;

  const p = d.plan;
  const envio = tablaDeEnvio(p);
  const cuandoEnvio = p.diasHastaEnvio === null ? null : p.diasHastaEnvio === 0 ? "ya" : `en ${p.diasHastaEnvio} días`;
  const planHtml = cuandoEnvio
    ? `<p style="margin:16px 0 4px"><strong>Próximo envío a Full: ${cuandoEnvio}</strong></p>${p.items.length ? envio.html : ""}<p style="${GRIS}">${escapar(notaDelPlan(p, d.parametros))}</p>`
    : `<p style="margin:16px 0 0"><strong>Envío a Full</strong>: no hay publicaciones de Full con ventas.</p>`;
  const lentos = bloqueLentos(p, d.parametros);

  const preguntasHtml = d.preguntas
    ? `<p style="margin:16px 0 0"><strong>Preguntas</strong>: ${d.preguntas.total} recibidas, ${d.preguntas.solas} respondidas solas, ${d.preguntas.borradores} pasaron por vos${d.preguntas.pendientes ? `, <strong>${d.preguntas.pendientes} sin responder</strong>` : ""}.</p>`
    : "";

  const decisionesHtml = d.decisiones.length
    ? `<p style="margin:16px 0 0"><strong>Decisiones para revisar</strong> (tabla Decisiones)</p>${lista(d.decisiones.map((x) => `${fechaCorta(x.revisar)}: ${escapar(x.decision)}`))}`
    : "";

  const gananciaSemana = d.ganancias[0]?.ganancia;
  const texto = [
    `Semana del ${rango}`,
    `Ventas: ${precio(va.facturado)} (antes ${precio(vb.facturado)}, ${variacion(va.facturado, vb.facturado)})`,
    `Pedidos: ${va.pedidos} (antes ${vb.pedidos}) · Unidades: ${va.unidades} (antes ${vb.unidades})`,
    ...d.meses.map((m) => `${m.titulo}: ${precio(m.totales.facturado)}, ${m.totales.pedidos} pedidos, ${m.totales.unidades} unidades`),
    "",
    "Ganancia real:",
    ganancia.texto,
    notaGanancia,
    "",
    "Lo que más vendió:",
    ...top.map((x) => `- ${x.titulo}: ${precio(x.actual.facturado)} (${x.actual.unidades} u.)`),
    ...(caidas.length ? ["", "Las que más cayeron:", ...caidas.map((x) => `- ${x.titulo}: ${x.actual.unidades} u. (antes ${x.anterior.unidades})`)] : []),
    "",
    d.ads.actual ? `Publicidad de la semana: ${precio(d.ads.actual.costo)}, ACOS ${d.ads.actual.acos ?? "—"}%` : "Publicidad: sin datos",
    "",
    cuandoEnvio ? `Próximo envío a Full: ${cuandoEnvio}\n${p.items.length ? envio.texto : ""}\n${notaDelPlan(p, d.parametros)}` : "Envío a Full: no hay publicaciones de Full con ventas.",
    lentos.texto,
    ...(d.preguntas ? ["", `Preguntas: ${d.preguntas.total} recibidas, ${d.preguntas.solas} respondidas solas, ${d.preguntas.pendientes} sin responder.`] : []),
    ...(d.decisiones.length ? ["", "Decisiones para revisar:", ...d.decisiones.map((x) => `- ${fechaCorta(x.revisar)}: ${x.decision}`)] : []),
  ].join("\n");

  return {
    asunto:
      `Harper en ML, semana del ${rango}: ${precio(va.facturado)} (${variacion(va.facturado, vb.facturado)})` +
      (gananciaSemana && gananciaSemana.margen !== null ? ` · ganancia ${precio(gananciaSemana.ganancia)} (${gananciaSemana.margen}%)` : ""),
    html: `<div style="${ESTILO}">
<p style="font-size:17px;margin:0 0 12px"><strong>Semana del ${rango}</strong></p>
${ventasHtml}
<p style="margin:20px 0 4px"><strong>Ganancia real</strong></p>
${ganancia.html}
<p style="${GRIS}">${escapar(notaGanancia)}</p>
<p style="margin:16px 0 0"><strong>Lo que más vendió</strong></p>${topHtml}
${caidasHtml}
${adsHtml}
${planHtml}
${lentos.html}
${preguntasHtml}
${decisionesHtml}
</div>`,
    texto,
  };
}
