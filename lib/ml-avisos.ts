import { precio } from "./formato";
import { diaAnterior, fechaArgentina } from "./ml-metricas";

/**
 * Los avisos por mail que salen de las métricas de Mercado Libre: la alerta
 * de stock (todos los días, solo si hay algo para avisar) y el resumen de la
 * semana (los lunes). Acá no hay red: se arman con lo que ya está en las
 * tablas y en las órdenes (ver lib/ml-avisos-servidor.ts).
 */

// ---------------------------------------------------------------------------
// Alerta de stock
// ---------------------------------------------------------------------------

export type FilaStock = {
  id: string;
  titulo: string;
  estado: string;
  stock: number | null;
  unidades30: number;
  permalink: string;
};

export type AlertaStock = {
  id: string;
  titulo: string;
  stock: number;
  porDia: number;
  /** Días que alcanza el stock al ritmo de los últimos 30. */
  dias: number;
  /** Cuánto mandar para cubrir `cubrirDias` desde hoy. */
  mandar: number;
  urgente: boolean;
  permalink: string;
};

export const UMBRAL_DIAS = 21;
export const CUBRIR_DIAS = 60;
export const URGENTE_DIAS = 7;

/**
 * Las publicaciones que se quedan sin stock antes de `umbral` días, de la más
 * urgente a la menos. Mercado Libre pausa sola la publicación que llega a
 * cero, así que una pausada sin stock que vendió en los últimos 30 días
 * también entra: es la venta que se está perdiendo.
 */
export function alertasDeStock(filas: FilaStock[], umbral = UMBRAL_DIAS, cubrir = CUBRIR_DIAS): AlertaStock[] {
  return filas
    .flatMap((f) => {
      const stock = f.stock ?? 0;
      const vendible = f.estado === "active" || (f.estado === "paused" && stock === 0);
      const porDia = f.unidades30 / 30;
      if (!vendible || porDia <= 0) return [];
      const dias = stock / porDia;
      if (dias >= umbral) return [];
      return [
        {
          id: f.id,
          titulo: f.titulo,
          stock,
          porDia,
          dias,
          mandar: Math.max(0, Math.ceil(porDia * cubrir - stock)),
          urgente: dias < URGENTE_DIAS,
          permalink: f.permalink,
        },
      ];
    })
    .sort((a, b) => a.dias - b.dias);
}

/**
 * Lo que cambia la alerta: qué publicaciones y si son urgentes. Si mañana es
 * igual, no se manda otro mail (salvo que haya pasado una semana).
 */
export function firmaDeAlertas(alertas: AlertaStock[]): string {
  return alertas
    .map((a) => `${a.id}:${a.urgente ? "urgente" : "pronto"}`)
    .sort()
    .join(",");
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

const fechaCorta = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`;
const dias = (d: number) => (d < 1 ? "menos de 1 día" : `${Math.floor(d)} días`);

function tablaStock(alertas: AlertaStock[]): { html: string; texto: string } {
  const filas = alertas
    .map(
      (a) => `<tr>
<td style="${CELDA}">${a.urgente ? "🔴" : "🟡"} <a href="${escapar(a.permalink)}" style="color:#16150f">${escapar(a.titulo)}</a></td>
<td style="${CELDA};text-align:right">${a.stock}</td>
<td style="${CELDA};text-align:right">${a.stock === 0 ? "sin stock" : dias(a.dias)}</td>
<td style="${CELDA};text-align:right"><strong>${a.mandar}</strong></td>
</tr>`
    )
    .join("");
  return {
    html: `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%">
<tr><th style="${CELDA};text-align:left">Publicación</th><th style="${CELDA};text-align:right">Stock</th><th style="${CELDA};text-align:right">Alcanza</th><th style="${CELDA};text-align:right">Mandar</th></tr>
${filas}</table>`,
    texto: alertas
      .map((a) => `- ${a.urgente ? "URGENTE " : ""}${a.titulo}: stock ${a.stock}, alcanza ${a.stock === 0 ? "sin stock" : dias(a.dias)}, mandar ${a.mandar}`)
      .join("\n"),
  };
}

const NOTA_STOCK = `«Mandar» cubre ${CUBRIR_DIAS} días al ritmo de los últimos 30. Lo que ya está en camino a Full no figura en el stock hasta que se acredita.`;

export function mailDeStock(alertas: AlertaStock[]): Mail {
  const urgentes = alertas.filter((a) => a.urgente).length;
  const tabla = tablaStock(alertas);
  return {
    asunto: urgentes
      ? `Stock: ${urgentes} ${urgentes === 1 ? "publicación se queda" : "publicaciones se quedan"} sin stock esta semana`
      : `Stock: ${alertas.length} ${alertas.length === 1 ? "publicación" : "publicaciones"} con menos de ${UMBRAL_DIAS} días`,
    html: `<div style="${ESTILO}">
<p style="font-size:17px;margin:0 0 12px"><strong>Publicaciones que se quedan sin stock</strong></p>
${tabla.html}
<p style="${GRIS}">${escapar(NOTA_STOCK)}</p>
</div>`,
    texto: `Publicaciones que se quedan sin stock\n\n${tabla.texto}\n\n${NOTA_STOCK}`,
  };
}

function variacion(actual: number, anterior: number): string {
  if (!anterior) return actual ? "nuevo" : "—";
  const v = Math.round((actual / anterior - 1) * 100);
  return `${v > 0 ? "+" : ""}${v}%`;
}

export type DatosSemana = {
  semanas: { actual: Rango; anterior: Rango };
  ventas: ReturnType<typeof resumenDeVentas>;
  ads: { actual: ResumenAds | null; anterior: ResumenAds | null };
  alertas: AlertaStock[];
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

  const fila = (etiqueta: string, a: string, b: string, v: string) =>
    `<tr><td style="${CELDA}">${etiqueta}</td><td style="${CELDA};text-align:right"><strong>${a}</strong></td><td style="${CELDA};text-align:right;color:#78756c">${b}</td><td style="${CELDA};text-align:right">${v}</td></tr>`;

  const ventasHtml = `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%">
<tr><th style="${CELDA};text-align:left"></th><th style="${CELDA};text-align:right">Esta semana</th><th style="${CELDA};text-align:right">Anterior</th><th style="${CELDA};text-align:right">Cambio</th></tr>
${fila("Ventas", precio(va.facturado), precio(vb.facturado), variacion(va.facturado, vb.facturado))}
${fila("Pedidos", String(va.pedidos), String(vb.pedidos), variacion(va.pedidos, vb.pedidos))}
${fila("Unidades", String(va.unidades), String(vb.unidades), variacion(va.unidades, vb.unidades))}
</table>`;

  const lista = (items: string[]) => (items.length ? `<ul style="margin:4px 0 0;padding-left:18px">${items.map((i) => `<li style="font-size:14px">${i}</li>`).join("")}</ul>` : "");

  const topHtml = lista(top.map((p) => `${escapar(p.titulo)}: ${precio(p.actual.facturado)} (${p.actual.unidades} u., antes ${p.anterior.unidades})`));
  const caidasHtml = caidas.length
    ? `<p style="margin:16px 0 0"><strong>Las que más cayeron</strong></p>${lista(caidas.map((p) => `${escapar(p.titulo)}: ${p.actual.unidades} u. (antes ${p.anterior.unidades})`))}`
    : "";

  const adsHtml = d.ads.actual
    ? `<p style="margin:16px 0 0"><strong>Publicidad</strong></p>${lista([
        `Gasto: ${precio(d.ads.actual.costo)}${d.ads.anterior ? ` (antes ${precio(d.ads.anterior.costo)})` : ""}`,
        `Ventas por publicidad: ${precio(d.ads.actual.ventas)}, ${d.ads.actual.unidades} u.`,
        `ACOS: ${d.ads.actual.acos ?? "—"}%${d.ads.anterior?.acos != null ? ` (antes ${d.ads.anterior.acos}%)` : ""}`,
        `Publicidad sobre ventas totales: ${va.facturado ? Math.round((d.ads.actual.costo / va.facturado) * 1000) / 10 : "—"}%`,
      ])}`
    : `<p style="${GRIS}">Publicidad: sin datos esta semana.</p>`;

  const stockHtml = d.alertas.length
    ? `<p style="margin:16px 0 4px"><strong>Stock</strong></p>${tablaStock(d.alertas).html}<p style="${GRIS}">${escapar(NOTA_STOCK)}</p>`
    : `<p style="margin:16px 0 0"><strong>Stock</strong>: ninguna publicación baja de ${UMBRAL_DIAS} días.</p>`;

  const preguntasHtml = d.preguntas
    ? `<p style="margin:16px 0 0"><strong>Preguntas</strong>: ${d.preguntas.total} recibidas, ${d.preguntas.solas} respondidas solas, ${d.preguntas.borradores} pasaron por vos${d.preguntas.pendientes ? `, <strong>${d.preguntas.pendientes} sin responder</strong>` : ""}.</p>`
    : "";

  const decisionesHtml = d.decisiones.length
    ? `<p style="margin:16px 0 0"><strong>Decisiones para revisar</strong> (tabla Decisiones)</p>${lista(d.decisiones.map((x) => `${fechaCorta(x.revisar)}: ${escapar(x.decision)}`))}`
    : "";

  const texto = [
    `Semana del ${rango}`,
    `Ventas: ${precio(va.facturado)} (antes ${precio(vb.facturado)}, ${variacion(va.facturado, vb.facturado)})`,
    `Pedidos: ${va.pedidos} (antes ${vb.pedidos}) · Unidades: ${va.unidades} (antes ${vb.unidades})`,
    "",
    "Lo que más vendió:",
    ...top.map((p) => `- ${p.titulo}: ${precio(p.actual.facturado)} (${p.actual.unidades} u.)`),
    ...(caidas.length ? ["", "Las que más cayeron:", ...caidas.map((p) => `- ${p.titulo}: ${p.actual.unidades} u. (antes ${p.anterior.unidades})`)] : []),
    "",
    d.ads.actual ? `Publicidad: ${precio(d.ads.actual.costo)}, ACOS ${d.ads.actual.acos ?? "—"}%` : "Publicidad: sin datos",
    "",
    d.alertas.length ? `Stock:\n${tablaStock(d.alertas).texto}` : `Stock: ninguna publicación baja de ${UMBRAL_DIAS} días.`,
    ...(d.preguntas ? ["", `Preguntas: ${d.preguntas.total} recibidas, ${d.preguntas.solas} respondidas solas, ${d.preguntas.pendientes} sin responder.`] : []),
    ...(d.decisiones.length ? ["", "Decisiones para revisar:", ...d.decisiones.map((x) => `- ${fechaCorta(x.revisar)}: ${x.decision}`)] : []),
  ].join("\n");

  return {
    asunto: `Harper en Mercado Libre: semana del ${rango} · ${precio(va.facturado)} (${variacion(va.facturado, vb.facturado)})`,
    html: `<div style="${ESTILO}">
<p style="font-size:17px;margin:0 0 12px"><strong>Semana del ${rango}</strong></p>
${ventasHtml}
<p style="margin:16px 0 0"><strong>Lo que más vendió</strong></p>${topHtml}
${caidasHtml}
${adsHtml}
${stockHtml}
${preguntasHtml}
${decisionesHtml}
</div>`,
    texto,
  };
}
