import { createRecord, escaparFormula, listRecords, TABLAS, updateRecord } from "./airtable";
import { getConfig } from "./config";
import { enviarMailConDetalle } from "./mails";
import { tokenVigente } from "./ml-auth";
import {
  alertasDeStock,
  decisionesARevisar,
  esLunes,
  firmaDeAlertas,
  leerResumenAds,
  mailDeStock,
  mailSemanal,
  resumenDePreguntas,
  resumenDeVentas,
  semanas,
  type FilaStock,
  type Mail,
  type Rango,
  type ResumenAds,
} from "./ml-avisos";
import { idDeLaCuenta, pedirML } from "./ml-cliente";
import { fechaArgentina, leerAnunciante } from "./ml-metricas";
import { ordenesPagadasEntre, TABLA_METRICAS_ML } from "./ml-metricas-servidor";
import { TABLA_PREGUNTAS_ML } from "./ml-preguntas-servidor";

/**
 * Manda los avisos de Mercado Libre al mail de pedidos:
 *  - la alerta de stock, cuando una publicación baja de 21 días de stock.
 *    Si la alerta es igual a la del último mail, no se repite (salvo que
 *    haya pasado una semana);
 *  - el resumen de la semana, los lunes, una sola vez por semana.
 *
 * Los corre la actualización diaria de /api/ml/metricas. Para verlos o
 * mandarlos a mano está /api/ml/avisos.
 */

const TABLA_DECISIONES = "tbljuMCTM1vkBM16r";
const SEMANA_MS = 7 * 24 * 60 * 60 * 1000;

const CLAVE_FIRMA_STOCK = "ml_alertas_stock_firma";
const CLAVE_FECHA_STOCK = "ml_alertas_stock_enviado";
const CLAVE_SEMANA = "ml_resumen_semanal_enviado";

type FilaConfig = { Clave?: string; Valor?: string; Descripcion?: string };

async function leerClave(clave: string): Promise<string> {
  const filas = await listRecords<FilaConfig>(TABLAS.config, {
    filterByFormula: `{Clave} = '${escaparFormula(clave)}'`,
    maxRecords: 1,
    revalidate: 0,
  });
  return filas[0]?.fields.Valor?.trim() ?? "";
}

async function escribirClave(clave: string, valor: string) {
  const filas = await listRecords<FilaConfig>(TABLAS.config, {
    filterByFormula: `{Clave} = '${escaparFormula(clave)}'`,
    maxRecords: 1,
    revalidate: 0,
  });
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
  Permalink?: string;
};

/** El stock y las ventas de cada publicación, de la tabla Metricas ML. */
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
            permalink: f.Permalink ?? "",
          },
        ]
      : [];
  });
}

export type ResultadoAviso = { alertas?: number; enviado: boolean; motivo: string; mail?: Mail };

/**
 * La alerta de stock. `forzar` la manda aunque sea igual a la anterior;
 * sin `enviar` solo la arma (para verla).
 */
export async function avisoDeStock(opciones: { enviar: boolean; forzar?: boolean; ahora?: number }): Promise<ResultadoAviso> {
  const ahora = opciones.ahora ?? Date.now();
  const alertas = alertasDeStock(await filasDeStock());
  const firma = firmaDeAlertas(alertas);

  if (alertas.length === 0) {
    if (opciones.enviar) await escribirClave(CLAVE_FIRMA_STOCK, "");
    return { alertas: 0, enviado: false, motivo: "ninguna publicación baja de 21 días de stock" };
  }

  const mail = mailDeStock(alertas);
  if (!opciones.enviar) return { alertas: alertas.length, enviado: false, motivo: "vista previa", mail };

  const [firmaAnterior, enviadoAntes] = await Promise.all([leerClave(CLAVE_FIRMA_STOCK), leerClave(CLAVE_FECHA_STOCK)]);
  const reciente = ahora - (Number(enviadoAntes) || 0) < SEMANA_MS;
  if (!opciones.forzar && firma === firmaAnterior && reciente) {
    return { alertas: alertas.length, enviado: false, motivo: "es la misma alerta que ya se mandó esta semana" };
  }

  const resultado = await enviar(mail);
  if (!resultado.ok) return { alertas: alertas.length, enviado: false, motivo: `no salió el mail: ${resultado.error}` };
  await escribirClave(CLAVE_FIRMA_STOCK, firma);
  await escribirClave(CLAVE_FECHA_STOCK, String(ahora));
  return { alertas: alertas.length, enviado: true, motivo: "mandada" };
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

/** El resumen de la última semana completa contra la anterior. */
export async function resumenSemanal(opciones: { enviar: boolean; forzar?: boolean; ahora?: number }): Promise<ResultadoAviso> {
  const ahora = opciones.ahora ?? Date.now();
  const s = semanas(ahora);

  if (opciones.enviar && !opciones.forzar && (await leerClave(CLAVE_SEMANA)) === s.actual.desde) {
    return { enviado: false, motivo: "el resumen de esta semana ya se mandó" };
  }

  const token = await tokenVigente();
  const vendedor = await idDeLaCuenta(token);

  // La publicidad, las decisiones y las preguntas son agregados: si fallan,
  // el resumen sale igual con las ventas y el stock.
  const ads = async () => {
    try {
      const anunciante = leerAnunciante(
        await pedirML("/advertising/advertisers?product_id=PADS", { token, headers: { "Api-Version": "1" } })
      );
      if (!anunciante) return { actual: null, anterior: null };
      const base = `/advertising/${anunciante.site}/advertisers/${anunciante.id}/product_ads`;
      const [actual, anterior] = await Promise.all([adsDe(base, s.actual, token), adsDe(base, s.anterior, token)]);
      return { actual, anterior };
    } catch (error) {
      console.error("[ml/avisos] publicidad del resumen:", error);
      return { actual: null, anterior: null };
    }
  };
  const tabla = async <T>(id: string): Promise<T[]> => {
    try {
      return (await listRecords<T>(id, { revalidate: 0 })).map((r) => r.fields);
    } catch (error) {
      console.error(`[ml/avisos] no se pudo leer ${id}:`, error);
      return [];
    }
  };

  const [ordenes, publicidad, filas, decisiones, preguntas] = await Promise.all([
    ordenesPagadasEntre(vendedor, s.anterior.desde, s.actual.hasta, token),
    ads(),
    filasDeStock(),
    tabla<{ Decision?: string; Revisar_el?: string; Estado?: string }>(TABLA_DECISIONES),
    tabla<{ Recibida?: string; Estado?: string }>(TABLA_PREGUNTAS_ML),
  ]);

  const mail = mailSemanal({
    semanas: s,
    ventas: resumenDeVentas(ordenes, s),
    ads: publicidad,
    alertas: alertasDeStock(filas),
    decisiones: decisionesARevisar(decisiones, fechaArgentina(ahora)),
    preguntas: resumenDePreguntas(preguntas, s.actual),
  });

  if (!opciones.enviar) return { enviado: false, motivo: "vista previa", mail };

  const resultado = await enviar(mail);
  if (!resultado.ok) return { enviado: false, motivo: `no salió el mail: ${resultado.error}` };
  await escribirClave(CLAVE_SEMANA, s.actual.desde);
  return { enviado: true, motivo: "mandado" };
}

/**
 * Lo que corre después de la actualización diaria: la alerta de stock todos
 * los días y el resumen los lunes. Un fallo acá no hace fallar la
 * actualización: queda en la respuesta y en los logs.
 */
export async function correrAvisosDiarios(ahora = Date.now()) {
  const sinMail = (motivo: string): Omit<ResultadoAviso, "mail"> => ({ enviado: false, motivo });
  const sinVista = ({ mail: _mail, ...resto }: ResultadoAviso) => resto;

  const stock = await avisoDeStock({ enviar: true, ahora }).then(sinVista, (error: Error) => {
    console.error("[ml/avisos] alerta de stock:", error);
    return sinMail(`falló: ${error.message}`);
  });

  const semanal = esLunes(ahora)
    ? await resumenSemanal({ enviar: true, ahora }).then(sinVista, (error: Error) => {
        console.error("[ml/avisos] resumen semanal:", error);
        return sinMail(`falló: ${error.message}`);
      })
    : sinMail("solo los lunes");

  return { stock, semanal };
}
