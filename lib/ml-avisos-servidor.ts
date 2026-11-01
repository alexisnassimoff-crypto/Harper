import { createRecord, escaparFormula, listRecords, TABLAS, updateRecord } from "./airtable";
import { getConfig } from "./config";
import { enviarMailConDetalle } from "./mails";
import { tokenVigente } from "./ml-auth";
import {
  calcularGanancia,
  decisionesARevisar,
  enviosDeOrdenes,
  esLunes,
  firmaDelPlan,
  leerCostoDeEnvio,
  leerResumenAds,
  mailDeEnvio,
  mailSemanal,
  PARAMETROS_FULL,
  pendientesDeAle,
  planDeEnvio,
  resumenDePreguntas,
  resumenDeVentas,
  semanas,
  type CostoProducto,
  type FilaStock,
  type Mail,
  type ParametrosFull,
  type PeriodoGanancia,
  type Rango,
  type ResumenAds,
  type Totales,
} from "./ml-avisos";
import { idDeLaCuenta, pedirML } from "./ml-cliente";
import { diaAnterior, fechaArgentina, leerAnunciante } from "./ml-metricas";
import { ordenesPagadasEntre, TABLA_METRICAS_ML } from "./ml-metricas-servidor";
import { TABLA_PREGUNTAS_ML } from "./ml-preguntas-servidor";

/**
 * Manda los avisos de Mercado Libre al mail de pedidos:
 *  - el plan de envíos a Full, cuando hay que armar el envío. Un solo envío
 *    para todo, cada tantos días como convenga según lo que cuestan la
 *    colecta y el almacenamiento (Config, claves full_*). Si el aviso es
 *    igual al último, no se repite (salvo que haya pasado una semana);
 *  - el resumen de la semana, los lunes, una sola vez por semana: ventas de
 *    la semana y del mes, y la ganancia real.
 *
 * Los corre la actualización diaria de /api/ml/metricas. Para verlos o
 * mandarlos a mano está /api/ml/avisos.
 */

const TABLA_DECISIONES = "tbljuMCTM1vkBM16r";
const TABLA_COSTOS = "tblEkjLXaXO1Fy0zd";
const TABLA_ENVIOS_FULL = "tblBHkTmGdlr3fdyj";
const TABLA_PENDIENTES = "tblAMt8vVWOBORCPo";
const SEMANA_MS = 7 * 24 * 60 * 60 * 1000;
const EN_PARALELO = 5;

const CLAVE_FIRMA_ENVIO = "ml_aviso_envio_firma";
const CLAVE_FECHA_ENVIO = "ml_aviso_envio_enviado";
const CLAVE_SEMANA = "ml_resumen_semanal_enviado";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

type FilaConfig = { Clave?: string; Valor?: string; Descripcion?: string };

async function filasDeConfig(formula: string) {
  return listRecords<FilaConfig>(TABLAS.config, { filterByFormula: formula, revalidate: 0 });
}

async function leerClave(clave: string): Promise<string> {
  const filas = await filasDeConfig(`{Clave} = '${escaparFormula(clave)}'`);
  return filas[0]?.fields.Valor?.trim() ?? "";
}

async function escribirClave(clave: string, valor: string) {
  const filas = await filasDeConfig(`{Clave} = '${escaparFormula(clave)}'`);
  if (filas[0]) {
    await updateRecord<FilaConfig>(TABLAS.config, filas[0].id, { Valor: valor });
    return;
  }
  await createRecord<FilaConfig>(TABLAS.config, {
    Clave: clave,
    Valor: valor,
    Descripcion: "NO EDITAR. Lo escriben los avisos de Mercado Libre para no repetir mails",
  });
}

/** Los parámetros de Full de la tabla Config. Lo que falte o no sea número usa el valor por defecto. */
async function parametrosFull(): Promise<ParametrosFull> {
  const filas = await filasDeConfig("FIND('full_', {Clave}) = 1");
  const valor = new Map(filas.map((f) => [f.fields.Clave ?? "", (f.fields.Valor ?? "").trim()]));
  const numero = (clave: string, porDefecto: number) => {
    const n = Number(valor.get(clave)?.replace(",", "."));
    return valor.get(clave) && Number.isFinite(n) && n >= 0 ? n : porDefecto;
  };
  const almacenamiento = Number(valor.get("full_almacenamiento_unidad_mes")?.replace(",", "."));
  return {
    costoColecta: numero("full_costo_colecta", PARAMETROS_FULL.costoColecta),
    diasSinCargo: numero("full_dias_sin_cargo", PARAMETROS_FULL.diasSinCargo),
    almacenamientoUnidadMes: valor.get("full_almacenamiento_unidad_mes") && Number.isFinite(almacenamiento) ? almacenamiento : null,
    diasReposicion: numero("full_dias_reposicion", PARAMETROS_FULL.diasReposicion),
    diasSeguridad: numero("full_dias_seguridad", PARAMETROS_FULL.diasSeguridad),
    avisoAnticipado: numero("full_aviso_anticipado_dias", PARAMETROS_FULL.avisoAnticipado),
  };
}

async function enviar(mail: Mail) {
  const config = await getConfig();
  return enviarMailConDetalle({ para: config.emailPedidos, asunto: mail.asunto, html: mail.html, texto: mail.texto });
}

type FilaMetricasGuardada = {
  Titulo?: string;
  ML_id?: string;
  Estado?: string;
  Stock?: number;
  Unidades_30d?: number;
  Unidades_7d?: number;
  Permalink?: string;
  Logistica?: string;
};

/** El stock, las ventas y la logística de cada publicación, de la tabla Metricas ML. */
async function filasDeStock(): Promise<FilaStock[]> {
  const filas = await listRecords<FilaMetricasGuardada>(TABLA_METRICAS_ML, { revalidate: 0 });
  return filas.flatMap((r) => {
    const f = r.fields;
    return f.ML_id
      ? [
          {
            id: f.ML_id,
            titulo: f.Titulo ?? f.ML_id,
            estado: f.Estado ?? "",
            stock: typeof f.Stock === "number" ? f.Stock : null,
            unidades30: typeof f.Unidades_30d === "number" ? f.Unidades_30d : 0,
            unidades7: typeof f.Unidades_7d === "number" ? f.Unidades_7d : 0,
            permalink: f.Permalink ?? "",
            logistica: f.Logistica ?? "",
          },
        ]
      : [];
  });
}

export type ResultadoAviso = { enviado: boolean; motivo: string; mail?: Mail; [dato: string]: unknown };

/**
 * El aviso del envío a Full. Sale solo cuando falta poco para el punto de
 * reposición. `forzar` lo manda aunque sea igual al anterior o falte para el
 * envío; sin `enviar` solo lo arma (para verlo).
 */
export async function avisoDeEnvio(opciones: { enviar: boolean; forzar?: boolean; ahora?: number }): Promise<ResultadoAviso> {
  const ahora = opciones.ahora ?? Date.now();
  const parametros = await parametrosFull();
  const plan = planDeEnvio(await filasDeStock(), parametros, fechaArgentina(ahora));
  const datos = {
    ciclo: plan.ciclo,
    diasHastaEnvio: plan.diasHastaEnvio,
    fechaLimite: plan.fechaLimite,
    publicaciones: plan.items.length,
    unidades: plan.items.reduce((t, i) => t + i.mandar, 0),
    lentos: plan.lentos.length,
  };
  const mail = plan.items.length ? mailDeEnvio(plan, parametros) : undefined;

  if (!opciones.enviar) return { ...datos, enviado: false, motivo: "vista previa", mail };

  if (!plan.hayQueEnviar && !opciones.forzar) {
    await escribirClave(CLAVE_FIRMA_ENVIO, "");
    return { ...datos, enviado: false, motivo: plan.diasHastaEnvio === null ? "no hay publicaciones de Full con ventas" : `el próximo envío es en ${plan.diasHastaEnvio} días` };
  }
  if (!mail) return { ...datos, enviado: false, motivo: "no hay nada para mandar" };

  const firma = firmaDelPlan(plan);
  const [firmaAnterior, enviadoAntes] = await Promise.all([leerClave(CLAVE_FIRMA_ENVIO), leerClave(CLAVE_FECHA_ENVIO)]);
  const reciente = ahora - (Number(enviadoAntes) || 0) < SEMANA_MS;
  if (!opciones.forzar && firma === firmaAnterior && reciente) {
    return { ...datos, enviado: false, motivo: "es el mismo aviso que ya se mandó esta semana" };
  }

  const resultado = await enviar(mail);
  if (!resultado.ok) return { ...datos, enviado: false, motivo: `no salió el mail: ${resultado.error}` };
  await escribirClave(CLAVE_FIRMA_ENVIO, firma);
  await escribirClave(CLAVE_FECHA_ENVIO, String(ahora));
  return { ...datos, enviado: true, motivo: "mandado" };
}

/** Gasto y ventas por publicidad de un rango, del resumen de Product Ads. */
async function adsDe(base: string, r: Rango, token: string): Promise<ResumenAds | null> {
  const respuesta = await pedirML(
    `${base}/ad_groups/search?date_from=${r.desde}&date_to=${r.hasta}&limit=1&offset=0` +
      `&metrics=cost,total_amount,units_quantity,acos&metrics_summary=true`,
    { token, headers: { "api-version": "2" } }
  );
  return leerResumenAds(respuesta);
}

/** Lo que pagó el vendedor por cada envío. Uno que no se pudo leer queda afuera (y se avisa). */
async function costosDeEnvio(ids: string[], token: string): Promise<{ envioDe: Map<string, number>; fallidos: number }> {
  const envioDe = new Map<string, number>();
  let fallidos = 0;
  let siguiente = 0;
  await Promise.all(
    Array.from({ length: Math.min(EN_PARALELO, ids.length) }, async () => {
      while (siguiente < ids.length) {
        const id = ids[siguiente++];
        try {
          envioDe.set(id, leerCostoDeEnvio(await pedirML(`/shipments/${encodeURIComponent(id)}/costs`, { token })));
        } catch {
          fallidos += 1;
        }
      }
    })
  );
  return { envioDe, fallidos };
}

const totalesEntre = (ordenes: unknown[], rango: Rango): Totales =>
  resumenDeVentas(ordenes, { actual: rango, anterior: { desde: "0000-00-00", hasta: "0000-00-00" } }).actual;

/** El resumen de la última semana completa contra la anterior, con el mes y la ganancia real. */
export async function resumenSemanal(opciones: { enviar: boolean; forzar?: boolean; ahora?: number }): Promise<ResultadoAviso> {
  const ahora = opciones.ahora ?? Date.now();
  const s = semanas(ahora);

  if (opciones.enviar && !opciones.forzar && (await leerClave(CLAVE_SEMANA)) === s.actual.desde) {
    return { enviado: false, motivo: "el resumen de esta semana ya se mandó" };
  }

  // El mes en curso va del 1 a ayer. La primera semana del mes, además, el mes anterior completo.
  const hoy = fechaArgentina(ahora);
  const ayer = diaAnterior(hoy);
  const mes: Rango = { desde: `${ayer.slice(0, 8)}01`, hasta: ayer };
  const nombreMes = (f: string) => MESES[Number(f.slice(5, 7)) - 1];
  const periodos: { titulo: string; rango: Rango }[] = [
    { titulo: "Semana", rango: s.actual },
    { titulo: `${nombreMes(mes.desde)} (1 al ${Number(ayer.slice(8, 10))})`, rango: mes },
  ];
  if (Number(hoy.slice(8, 10)) <= 7 && mes.desde !== s.actual.desde) {
    const finAnterior = diaAnterior(mes.desde);
    periodos.push({ titulo: `${nombreMes(finAnterior)} completo`, rango: { desde: `${finAnterior.slice(0, 8)}01`, hasta: finAnterior } });
  }

  const token = await tokenVigente();
  const vendedor = await idDeLaCuenta(token);
  const desde = [s.anterior.desde, ...periodos.map((p) => p.rango.desde)].sort()[0];
  const hasta = [s.actual.hasta, ...periodos.map((p) => p.rango.hasta)].sort().reverse()[0];

  // Publicidad, decisiones, preguntas, costos y colectas son agregados: si
  // fallan, el resumen sale igual con lo que haya.
  const conRespaldo = async <T>(nombre: string, f: () => Promise<T>, respaldo: T): Promise<T> => {
    try {
      return await f();
    } catch (error) {
      console.error(`[ml/avisos] ${nombre}:`, error);
      return respaldo;
    }
  };
  const tabla = <T>(id: string) => conRespaldo(id, async () => (await listRecords<T>(id, { revalidate: 0 })).map((r) => r.fields), [] as T[]);

  const anunciante = await conRespaldo(
    "anunciante",
    async () => leerAnunciante(await pedirML("/advertising/advertisers?product_id=PADS", { token, headers: { "Api-Version": "1" } })),
    null
  );
  const base = anunciante ? `/advertising/${anunciante.site}/advertisers/${anunciante.id}/product_ads` : null;
  const adsDelRango = (r: Rango) => (base ? conRespaldo("publicidad", () => adsDe(base, r, token), null) : Promise.resolve(null));

  const [ordenes, adsSemana, adsAnterior, adsPeriodos, filas, parametros, decisiones, preguntas, costosFilas, envios, pendientes] = await Promise.all([
    ordenesPagadasEntre(vendedor, desde, hasta, token),
    adsDelRango(s.actual),
    adsDelRango(s.anterior),
    Promise.all(periodos.map((p) => adsDelRango(p.rango))),
    filasDeStock(),
    parametrosFull(),
    tabla<{ Decision?: string; Revisar_el?: string; Estado?: string }>(TABLA_DECISIONES),
    tabla<{ Recibida?: string; Estado?: string }>(TABLA_PREGUNTAS_ML),
    tabla<{ ML_id?: string; Costo_unitario_sin_IVA?: number; Packaging?: number }>(TABLA_COSTOS),
    tabla<{ Fecha?: string; Costo_colecta?: number }>(TABLA_ENVIOS_FULL),
    tabla<{ Tarea?: string; Para?: string; Estado?: string; Desde?: string; Prioridad?: number }>(TABLA_PENDIENTES),
  ]);

  const costos = new Map<string, CostoProducto>(
    costosFilas.flatMap((c) =>
      c.ML_id
        ? [[c.ML_id, { costo: typeof c.Costo_unitario_sin_IVA === "number" ? c.Costo_unitario_sin_IVA : null, packaging: c.Packaging ?? 0 }] as const]
        : []
    )
  );
  const idsDeEnvio = [...new Set(periodos.flatMap((p) => enviosDeOrdenes(ordenes, p.rango)))];
  const { envioDe, fallidos } = await costosDeEnvio(idsDeEnvio, token);
  const colectasEntre = (r: Rango) =>
    envios.reduce((t, e) => t + (e.Fecha && e.Fecha >= r.desde && e.Fecha <= r.hasta ? e.Costo_colecta ?? 0 : 0), 0);

  const ganancias: PeriodoGanancia[] = periodos.map((p, i) => ({
    titulo: p.titulo,
    rango: p.rango,
    ganancia: calcularGanancia({
      ordenes,
      rango: p.rango,
      costos,
      envioDe,
      publicidad: adsPeriodos[i]?.costo ?? 0,
      colectas: colectasEntre(p.rango),
    }),
  }));

  const mail = mailSemanal({
    semanas: s,
    ventas: resumenDeVentas(ordenes, s),
    meses: periodos.slice(1).map((p) => ({ titulo: p.titulo, totales: totalesEntre(ordenes, p.rango) })),
    ganancias,
    ads: { actual: adsSemana, anterior: adsAnterior },
    plan: planDeEnvio(filas, parametros, hoy),
    parametros,
    decisiones: decisionesARevisar(decisiones, hoy),
    preguntas: resumenDePreguntas(preguntas, s.actual),
    pendientes: pendientesDeAle(pendientes),
  });

  const datos = { enviosSinCosto: fallidos, ganancias: ganancias.map((g) => ({ periodo: g.titulo, ganancia: g.ganancia.ganancia, margen: g.ganancia.margen })) };
  if (!opciones.enviar) return { ...datos, enviado: false, motivo: "vista previa", mail };

  const resultado = await enviar(mail);
  if (!resultado.ok) return { ...datos, enviado: false, motivo: `no salió el mail: ${resultado.error}` };
  await escribirClave(CLAVE_SEMANA, s.actual.desde);
  return { ...datos, enviado: true, motivo: "mandado" };
}

/**
 * Lo que corre después de la actualización diaria: el aviso de envío a Full
 * cuando haga falta y el resumen los lunes. Un fallo acá no hace fallar la
 * actualización: queda en la respuesta y en los logs.
 */
export async function correrAvisosDiarios(ahora = Date.now()) {
  const sinMail = (motivo: string): ResultadoAviso => ({ enviado: false, motivo });
  const sinVista = ({ mail: _mail, ...resto }: ResultadoAviso) => resto;

  const envioFull = await avisoDeEnvio({ enviar: true, ahora }).then(sinVista, (error: Error) => {
    console.error("[ml/avisos] envío a Full:", error);
    return sinMail(`falló: ${error.message}`);
  });

  const semanal = esLunes(ahora)
    ? await resumenSemanal({ enviar: true, ahora }).then(sinVista, (error: Error) => {
        console.error("[ml/avisos] resumen semanal:", error);
        return sinMail(`falló: ${error.message}`);
      })
    : sinMail("solo los lunes");

  return { envioFull, semanal };
}
