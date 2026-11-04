import { listRecords, TABLAS, type AirtableRecord } from "./airtable";
import { getConfig } from "./config";
import { leerConteos } from "./medir-servidor";
import { TABLA_METRICAS_ML } from "./ml-metricas-servidor";
import { TABLA_IMPORTACION_ML } from "./ml-resenas";
import {
  armarEmbudo,
  diasEntre,
  margenDe,
  pedidoDelPanel,
  rangoDe,
  resumirML,
  resumirSaldos,
  resumirSuscriptores,
  resumirVentas,
  type CostoUnitario,
  type Embudo,
  type FilaMetricasPanel,
  type FilaPedidoPanel,
  type FilaSuscriptorPanel,
  type Margen,
  type Periodo,
  type ResumenML,
  type ResumenSaldos,
  type ResumenSuscriptores,
  type ResumenVentas,
} from "./panel-datos";
import { fechaArgentina, type MovimientoSaldo, type TipoMovimiento } from "./suscriptores";

/**
 * Lo que muestra el panel privado, leído en el momento (sin caché) de
 * Airtable y de los contadores de Redis. Cada fuente se lee aparte: si una
 * falla, su sección dice que no se pudo leer y el resto se ve igual.
 */

/** La tabla «Costos ML»: costo unitario sin IVA y packaging por publicación (la misma que usa el resumen semanal). */
const TABLA_COSTOS_ML = "tblEkjLXaXO1Fy0zd";

export type DatosDelPanel = {
  periodo: Periodo;
  hoy: string;
  desde: string;
  ventas: ResumenVentas | null;
  margen: Margen | null;
  /** Por qué no hay margen, si no lo hay. */
  sinMargen: string | null;
  embudo: Embudo | null;
  suscriptores: ResumenSuscriptores | null;
  saldos: ResumenSaldos | null;
  ml: ResumenML | null;
  /** Las fuentes que no se pudieron leer. */
  errores: string[];
};

export async function datosDelPanel(periodo: Periodo, ahora = new Date()): Promise<DatosDelPanel> {
  const hoy = fechaArgentina(ahora);
  const rango = rangoDe(hoy, periodo);
  const errores: string[] = [];

  const leer = async <T>(nombre: string, f: () => Promise<T>): Promise<T | null> => {
    try {
      return await f();
    } catch (error) {
      console.error(`[panel] no se pudo leer ${nombre}:`, error instanceof Error ? error.message : error);
      errores.push(nombre);
      return null;
    }
  };
  const tabla = <T>(id: string) => listRecords<T>(id, { revalidate: 0 });

  const [filasPedidos, costos, config, filasSuscriptores, filasSaldos, filasML, conteos] = await Promise.all([
    leer("los pedidos", () => tabla<FilaPedidoPanel>(TABLAS.pedidos)),
    leer("los costos", () => costosPorVariante()),
    getConfig(),
    leer("los suscriptores", () => tabla<FilaSuscriptorPanel>(TABLAS.suscriptores)),
    leer("los saldos", () => tabla<FilaSaldoPanel>(TABLAS.saldos)),
    leer("las métricas de Mercado Libre", () => tabla<FilaMetricasPanel>(TABLA_METRICAS_ML)),
    // Los días del período, para el embudo.
    leerConteos(diasEntre(rango.desde, rango.hasta)),
  ]);

  const pedidos = filasPedidos ? filasPedidos.flatMap((r) => pedidoDelPanel(r.fields, r.createdTime) ?? []) : null;
  const tasa = config.impuestosNacionales.general;
  const delPeriodo = pedidos?.filter((p) => p.dia >= rango.desde && p.dia <= rango.hasta) ?? [];
  const margen =
    pedidos && costos ? margenDe(delPeriodo, { tasa, costoDe: (id) => costos.get(id) ?? null, envioPorDefecto: config.costoEnvio }) : null;

  return {
    periodo,
    hoy,
    desde: rango.desde,
    ventas: pedidos ? resumirVentas(pedidos, rango) : null,
    margen,
    sinMargen: margen
      ? null
      : tasa === null
        ? "Falta el porcentaje de impuestos (Config, impuestos_nacionales)."
        : "No se pudieron leer los pedidos o los costos.",
    embudo: pedidos ? armarEmbudo(conteos, pedidos, rango) : null,
    suscriptores: filasSuscriptores ? resumirSuscriptores(filasSuscriptores.map((r) => r.fields), rango) : null,
    saldos: filasSaldos ? resumirSaldos(filasSaldos.map(movimientoDelPanel), rango, hoy) : null,
    ml: filasML ? resumirML(filasML.map((r) => r.fields)) : null,
    errores,
  };
}

type FilaSaldoPanel = {
  Suscriptor_id?: string;
  Tipo?: string;
  Monto?: number;
  Pedido?: string;
  Fecha?: string;
  Disponible_desde?: string | null;
  Anulado?: boolean;
};

function movimientoDelPanel(r: AirtableRecord<FilaSaldoPanel>): MovimientoSaldo & { suscriptorId: string } {
  const f = r.fields;
  const tipo: TipoMovimiento = f.Tipo === "Cashback" || f.Tipo === "Uso" ? f.Tipo : "Ajuste";
  return {
    id: r.id,
    suscriptorId: (f.Suscriptor_id ?? "").trim() || r.id,
    tipo,
    monto: typeof f.Monto === "number" ? f.Monto : Number(f.Monto ?? 0),
    pedido: (f.Pedido ?? "").trim(),
    fecha: f.Fecha ?? r.createdTime,
    disponibleDesde: f.Disponible_desde ? f.Disponible_desde.slice(0, 10) : null,
    anulado: f.Anulado === true,
  };
}

/**
 * El costo de cada variante de la web: la tabla Costos ML está por
 * publicación de Mercado Libre, y «Importacion ML» enlaza cada publicación
 * con su variante. Si una variante tiene varias publicaciones, vale la
 * primera con costo cargado.
 */
async function costosPorVariante(): Promise<Map<string, CostoUnitario>> {
  const [publicaciones, costos] = await Promise.all([
    listRecords<{ ML_id?: string; Variante?: string[] }>(TABLA_IMPORTACION_ML, { revalidate: 0 }),
    listRecords<{ ML_id?: string; Costo_unitario_sin_IVA?: number; Packaging?: number }>(TABLA_COSTOS_ML, { revalidate: 0 }),
  ]);
  const porPublicacion = new Map<string, CostoUnitario>();
  for (const { fields: c } of costos) {
    if (c.ML_id && typeof c.Costo_unitario_sin_IVA === "number" && Number.isFinite(c.Costo_unitario_sin_IVA)) {
      porPublicacion.set(c.ML_id, { costo: c.Costo_unitario_sin_IVA, packaging: typeof c.Packaging === "number" ? c.Packaging : 0 });
    }
  }
  const porVariante = new Map<string, CostoUnitario>();
  for (const { fields: p } of publicaciones) {
    const costo = p.ML_id ? porPublicacion.get(p.ML_id) : undefined;
    for (const variante of p.Variante ?? []) {
      if (costo && !porVariante.has(variante)) porVariante.set(variante, costo);
    }
  }
  return porVariante;
}
