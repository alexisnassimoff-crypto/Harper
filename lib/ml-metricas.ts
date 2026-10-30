/**
 * Las métricas de cada publicación de Mercado Libre, armadas a partir de lo
 * que contesta la API (ver lib/ml-metricas-servidor.ts, que hace los
 * pedidos). Acá no hay red: todo se puede probar con respuestas guardadas.
 *
 * La ventana es la de los últimos 30 días completos (sin hoy, que está a
 * medias) y se compara con los 30 anteriores. Product Ads se lee solo para
 * los últimos 30: su API no da más de 90 días hacia atrás.
 */

export const DIAS = 30;

export type Ventanas = {
  /** Primer día de los 30 anteriores. */
  desdePrevia: string;
  /** Primer día de los últimos 30. */
  desde: string;
  /** Último día (ayer). */
  hasta: string;
};

const DIA_MS = 24 * 60 * 60 * 1000;

/** Fecha YYYY-MM-DD en hora de Argentina (UTC−3, sin horario de verano). */
export function fechaArgentina(instante: number): string {
  return new Date(instante - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function ventanas(ahora: number): Ventanas {
  const ayer = ahora - DIA_MS;
  return {
    desdePrevia: fechaArgentina(ayer - (2 * DIAS - 1) * DIA_MS),
    desde: fechaArgentina(ayer - (DIAS - 1) * DIA_MS),
    hasta: fechaArgentina(ayer),
  };
}

/** El día anterior a una fecha YYYY-MM-DD. */
export function diaAnterior(fecha: string): string {
  return new Date(Date.parse(`${fecha}T12:00:00Z`) - DIA_MS).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Publicaciones
// ---------------------------------------------------------------------------

export type Publicacion = {
  id: string;
  titulo: string;
  estado: string;
  precio: number | null;
  stock: number | null;
  tipo: string;
  permalink: string;
};

const numero = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const texto = (v: unknown) => (typeof v === "string" ? v : "");

/** La respuesta de /items?ids=…: una lista de { code, body }. */
export function leerPublicaciones(respuesta: unknown): Publicacion[] {
  if (!Array.isArray(respuesta)) return [];
  return respuesta.flatMap((fila) => {
    const f = fila as { code?: number; body?: Record<string, unknown> };
    if (f.code !== 200 || !f.body || typeof f.body.id !== "string") return [];
    const b = f.body;
    return [
      {
        id: b.id as string,
        titulo: texto(b.title),
        estado: texto(b.status),
        precio: numero(b.price),
        stock: numero(b.available_quantity),
        tipo: texto(b.listing_type_id),
        permalink: texto(b.permalink),
      },
    ];
  });
}

// ---------------------------------------------------------------------------
// Ventas
// ---------------------------------------------------------------------------

export type Ventas = { unidades: number; facturado: number; comision: number };
export type VentasPorPublicacion = Map<string, { actual: Ventas; previa: Ventas }>;

const vacias = (): Ventas => ({ unidades: 0, facturado: 0, comision: 0 });

/**
 * Suma las órdenes pagadas por publicación, separando la ventana actual de
 * la previa por la fecha de creación (en hora de Argentina).
 *
 * `sale_fee` es el cargo por vender de UNA unidad, por eso se multiplica por
 * la cantidad, igual que el precio.
 */
export function sumarOrdenes(ordenes: unknown[], v: Ventanas): VentasPorPublicacion {
  const total: VentasPorPublicacion = new Map();

  for (const orden of ordenes) {
    const o = orden as { status?: string; date_created?: string; order_items?: unknown[] };
    if (o.status !== "paid" || !o.date_created) continue;

    const creada = Date.parse(o.date_created);
    if (Number.isNaN(creada)) continue;
    const dia = fechaArgentina(creada);
    if (dia < v.desdePrevia || dia > v.hasta) continue;
    const ventana = dia >= v.desde ? "actual" : "previa";

    for (const linea of o.order_items ?? []) {
      const l = linea as { item?: { id?: string }; quantity?: number; unit_price?: number; sale_fee?: number };
      const id = l.item?.id;
      if (!id) continue;
      const cantidad = numero(l.quantity) ?? 0;

      const fila = total.get(id) ?? { actual: vacias(), previa: vacias() };
      fila[ventana].unidades += cantidad;
      fila[ventana].facturado += cantidad * (numero(l.unit_price) ?? 0);
      fila[ventana].comision += cantidad * (numero(l.sale_fee) ?? 0);
      total.set(id, fila);
    }
  }

  return total;
}

// ---------------------------------------------------------------------------
// Product Ads
// ---------------------------------------------------------------------------

export type Anuncio = {
  /** item_id si el grupo es de una publicación; id de familia o catálogo si no. */
  id: string;
  titulo: string;
  impresiones: number;
  clics: number;
  costo: number;
  ventas: number;
  unidades: number;
  acos: number | null;
};

/** Las métricas que se le piden a Product Ads. */
export const METRICAS_ADS = ["CLICKS", "PRINTS", "COST", "TOTAL_AMOUNT", "UNITS_QUANTITY", "ACOS"].join(",");

/** La respuesta de /advertising/{site}/advertisers/{id}/product_ads/ad_groups/search. */
export function leerAnuncios(respuesta: unknown): { anuncios: Anuncio[]; total: number } {
  const r = respuesta as { results?: unknown[]; paging?: { total?: number } } | null;
  const anuncios = (r?.results ?? []).flatMap((fila) => {
    const g = fila as { ad_group_external_id?: unknown; title?: unknown; metrics?: Record<string, unknown> };
    const id = g.ad_group_external_id == null ? "" : String(g.ad_group_external_id);
    if (!id) return [];
    const m = g.metrics ?? {};
    return [
      {
        id,
        titulo: texto(g.title),
        impresiones: numero(m.prints) ?? 0,
        clics: numero(m.clicks) ?? 0,
        costo: numero(m.cost) ?? 0,
        ventas: numero(m.total_amount) ?? 0,
        unidades: numero(m.units_quantity) ?? 0,
        acos: numero(m.acos),
      },
    ];
  });
  return { anuncios, total: numero(r?.paging?.total) ?? anuncios.length };
}

/** El anunciante de Product Ads de Argentina, de /advertising/advertisers?product_id=PADS. */
export function leerAnunciante(respuesta: unknown): { id: number; site: string } | null {
  const lista = (respuesta as { advertisers?: unknown[] } | null)?.advertisers ?? [];
  const todos = lista.flatMap((a) => {
    const x = a as { advertiser_id?: unknown; site_id?: unknown };
    return typeof x.advertiser_id === "number" && typeof x.site_id === "string"
      ? [{ id: x.advertiser_id, site: x.site_id }]
      : [];
  });
  return todos.find((a) => a.site === "MLA") ?? todos[0] ?? null;
}

// ---------------------------------------------------------------------------
// Filas de Airtable
// ---------------------------------------------------------------------------

export type FilaMetricas = {
  Titulo: string;
  ML_id: string;
  Estado: string;
  Precio: number | null;
  Stock: number | null;
  Tipo_publicacion: string;
  Permalink: string | null;
  Visitas_30d: number | null;
  Visitas_30d_previos: number | null;
  Unidades_30d: number;
  Unidades_30d_previos: number;
  Facturado_30d: number;
  Comision_ML_30d: number;
  Conversion_30d: number | null;
  Ads_impresiones: number | null;
  Ads_clics: number | null;
  Ads_costo: number | null;
  Ads_ventas: number | null;
  Ads_unidades: number | null;
  ACOS: number | null;
  Ventana: string;
  Actualizado: string;
  Avisos: string;
};

const redondear = (n: number) => Math.round(n * 100) / 100;

/**
 * Una fila por publicación, más una por cada grupo de anuncios que no sea de
 * una publicación propia (Product Ads agrupa por familia o catálogo).
 *
 * Una visita que no se pudo leer queda vacía, no en cero: un cero diría
 * "nadie la vio" y llevaría a una conclusión falsa.
 */
export function armarFilas(datos: {
  publicaciones: Publicacion[];
  visitas: Map<string, { actual: number | null; previa: number | null }>;
  ventas: VentasPorPublicacion;
  anuncios: Anuncio[] | null;
  v: Ventanas;
  ahora: number;
  avisos: string[];
}): FilaMetricas[] {
  const { publicaciones, visitas, ventas, anuncios, v } = datos;
  const ventana = `${v.desde} a ${v.hasta}`;
  const actualizado = new Date(datos.ahora).toISOString();
  const avisos = datos.avisos.join("\n");
  const anuncioDe = new Map((anuncios ?? []).map((a) => [a.id, a]));

  const columnasAds = (a: Anuncio | undefined) =>
    anuncios === null
      ? { Ads_impresiones: null, Ads_clics: null, Ads_costo: null, Ads_ventas: null, Ads_unidades: null, ACOS: null }
      : {
          Ads_impresiones: a?.impresiones ?? 0,
          Ads_clics: a?.clics ?? 0,
          Ads_costo: redondear(a?.costo ?? 0),
          Ads_ventas: redondear(a?.ventas ?? 0),
          Ads_unidades: a?.unidades ?? 0,
          ACOS: a?.acos ?? null,
        };

  const filas: FilaMetricas[] = publicaciones.map((p) => {
    const vis = visitas.get(p.id) ?? { actual: null, previa: null };
    const ven = ventas.get(p.id) ?? { actual: vacias(), previa: vacias() };
    return {
      Titulo: p.titulo,
      ML_id: p.id,
      Estado: p.estado,
      Precio: p.precio,
      Stock: p.stock,
      Tipo_publicacion: p.tipo,
      Permalink: p.permalink || null,
      Visitas_30d: vis.actual,
      Visitas_30d_previos: vis.previa,
      Unidades_30d: ven.actual.unidades,
      Unidades_30d_previos: ven.previa.unidades,
      Facturado_30d: redondear(ven.actual.facturado),
      Comision_ML_30d: redondear(ven.actual.comision),
      Conversion_30d: vis.actual ? Math.round((ven.actual.unidades / vis.actual) * 10_000) / 10_000 : null,
      ...columnasAds(anuncioDe.get(p.id)),
      Ventana: ventana,
      Actualizado: actualizado,
      Avisos: avisos,
    };
  });

  const propias = new Set(publicaciones.map((p) => p.id));
  for (const a of anuncios ?? []) {
    if (propias.has(a.id)) continue;
    filas.push({
      Titulo: a.titulo || `Grupo de anuncios ${a.id}`,
      ML_id: a.id,
      Estado: "solo anuncio",
      Precio: null,
      Stock: null,
      Tipo_publicacion: "",
      Permalink: null,
      Visitas_30d: null,
      Visitas_30d_previos: null,
      Unidades_30d: 0,
      Unidades_30d_previos: 0,
      Facturado_30d: 0,
      Comision_ML_30d: 0,
      Conversion_30d: null,
      ...columnasAds(a),
      Ventana: ventana,
      Actualizado: actualizado,
      Avisos: avisos,
    });
  }

  return filas;
}
