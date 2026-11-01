import { createRecord, listRecords, updateRecords } from "./airtable";
import { tokenVigente } from "./ml-auth";
import { ErrorML, idDeLaCuenta, pedirML } from "./ml-cliente";
import {
  armarFilas,
  leerAnunciante,
  leerAnuncios,
  leerPublicaciones,
  METRICAS_ADS,
  sumarOrdenes,
  ventanas,
  type Anuncio,
  type FilaMetricas,
  type Ventanas,
} from "./ml-metricas";

/**
 * Trae de Mercado Libre las métricas de cada publicación y las escribe en la
 * tabla "Metricas ML" (ver lib/ml-metricas.ts para las cuentas). Lo corre el
 * cron diario de /api/ml/metricas.
 *
 * Product Ads es un agregado: si la cuenta no lo tiene habilitado o la
 * aplicación no tiene permiso, las columnas de anuncios quedan vacías y el
 * motivo va en Avisos. Las visitas y las ventas, en cambio, son la base: si
 * fallan, la corrida falla y no se pisa la tabla con datos a medias.
 */

export const TABLA_METRICAS_ML = "tblBsnFGfuDJdgzAO";

/** Hasta 500 publicaciones: de sobra para Harper. */
const MAXIMO_PUBLICACIONES = 500;
/** Pedidos simultáneos a Mercado Libre, para no chocar con su límite. */
const EN_PARALELO = 5;

/** Corre `tarea` sobre cada elemento, de a `n` a la vez, en orden. */
async function deA<T, R>(lista: T[], n: number, tarea: (x: T) => Promise<R>): Promise<R[]> {
  const resultados: R[] = new Array(lista.length);
  let siguiente = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, lista.length) }, async () => {
      while (siguiente < lista.length) {
        const i = siguiente++;
        resultados[i] = await tarea(lista[i]);
      }
    })
  );
  return resultados;
}

async function idsDePublicaciones(vendedor: number, token: string): Promise<string[]> {
  const ids: string[] = [];
  for (let desde = 0; desde < MAXIMO_PUBLICACIONES; desde += 100) {
    const pagina = await pedirML<{ results?: string[]; paging?: { total?: number } }>(
      `/users/${vendedor}/items/search?limit=100&offset=${desde}`,
      { token }
    );
    const lote = pagina?.results ?? [];
    ids.push(...lote);
    if (lote.length === 0 || desde + 100 >= (pagina?.paging?.total ?? 0)) break;
  }
  return [...new Set(ids)];
}

async function publicaciones(ids: string[], token: string) {
  const lotes: string[][] = [];
  for (let i = 0; i < ids.length; i += 20) lotes.push(ids.slice(i, i + 20));
  const atributos = "id,title,status,price,available_quantity,listing_type_id,permalink";
  const respuestas = await deA(lotes, EN_PARALELO, (lote) =>
    pedirML(`/items?ids=${lote.join(",")}&attributes=${atributos}`, { token })
  );
  return respuestas.flatMap(leerPublicaciones);
}

/**
 * Visitas de cada publicación en las dos ventanas. La API da una publicación
 * por pedido y toma `date_to` como el inicio del día (exclusivo), así que la
 * ventana va hasta el día siguiente al último.
 */
async function visitas(ids: string[], v: Ventanas, hoy: string, token: string) {
  const leer = async (id: string, desde: string, hasta: string): Promise<number | null> => {
    try {
      const r = await pedirML<{ total_visits?: number }>(
        `/items/visits?ids=${encodeURIComponent(id)}&date_from=${desde}&date_to=${hasta}`,
        { token }
      );
      return typeof r?.total_visits === "number" ? r.total_visits : null;
    } catch (error) {
      // Una publicación borrada no tiene visitas que leer; cualquier otra
      // falla corta la corrida.
      if (error instanceof ErrorML && error.status === 404) return null;
      throw error;
    }
  };

  const pares = await deA(ids, EN_PARALELO, async (id) => {
    const actual = await leer(id, v.desde, hoy);
    const previa = await leer(id, v.desdePrevia, v.desde);
    return [id, { actual, previa }] as const;
  });
  return new Map(pares);
}

async function ordenesPagadas(vendedor: number, v: Ventanas, token: string): Promise<unknown[]> {
  const ordenes: unknown[] = [];
  // Mercado Libre usa solo la hora de estos filtros; el día se recorta
  // después en hora de Argentina (lib/ml-metricas.ts).
  const desde = `${v.desdePrevia}T00:00:00.000-03:00`;
  const hasta = `${v.hasta}T23:59:59.000-03:00`;

  for (let offset = 0; offset < 10_000; offset += 50) {
    const pagina = await pedirML<{ results?: unknown[]; paging?: { total?: number } }>(
      `/orders/search?seller=${vendedor}&order.status=paid&order.date_created.from=${encodeURIComponent(desde)}` +
        `&order.date_created.to=${encodeURIComponent(hasta)}&sort=date_asc&limit=50&offset=${offset}`,
      { token }
    );
    const lote = pagina?.results ?? [];
    ordenes.push(...lote);
    if (lote.length === 0 || offset + 50 >= (pagina?.paging?.total ?? 0)) break;
  }
  return ordenes;
}

/** Los grupos de Product Ads con sus métricas, o null con el motivo. */
async function anuncios(v: Ventanas, token: string): Promise<{ anuncios: Anuncio[] | null; aviso?: string }> {
  try {
    const anunciante = leerAnunciante(
      await pedirML("/advertising/advertisers?product_id=PADS", { token, headers: { "Api-Version": "1" } })
    );
    if (!anunciante) return { anuncios: null, aviso: "Product Ads: la cuenta no tiene anunciante" };

    const todos: Anuncio[] = [];
    for (let offset = 0; offset < 10_000; offset += 100) {
      const pagina = leerAnuncios(
        await pedirML(
          `/advertising/${anunciante.site}/advertisers/${anunciante.id}/product_ads/ad_groups/search` +
            `?date_from=${v.desde}&date_to=${v.hasta}&limit=100&offset=${offset}&metrics=${METRICAS_ADS}`,
          { token, headers: { "api-version": "2" } }
        )
      );
      todos.push(...pagina.anuncios);
      if (pagina.anuncios.length === 0 || offset + 100 >= pagina.total) break;
    }
    return { anuncios: todos };
  } catch (error) {
    // 404 "No permissions found": la cuenta no tiene Product Ads habilitado.
    // 403: la aplicación no tiene el permiso de publicidad. Ninguno se
    // arregla reintentando: se sigue sin anuncios y queda dicho por qué.
    if (error instanceof ErrorML && (error.status === 403 || error.status === 404)) {
      return { anuncios: null, aviso: `Product Ads sin datos: ${error.message}` };
    }
    throw error;
  }
}

type FilaGuardada = { ML_id?: string };

/** Escribe las filas: actualiza las que ya están por ML_id y crea las nuevas. */
async function guardar(filas: FilaMetricas[], ahora: number) {
  const existentes = await listRecords<FilaGuardada>(TABLA_METRICAS_ML, { revalidate: 0 });
  const registroDe = new Map(existentes.flatMap((r) => (r.fields.ML_id ? [[r.fields.ML_id, r.id] as const] : [])));
  const vistas = new Set(filas.map((f) => f.ML_id));

  const actualizar = filas.flatMap((f) => {
    const id = registroDe.get(f.ML_id);
    return id ? [{ id, fields: f }] : [];
  });
  const nuevas = filas.filter((f) => !registroDe.has(f.ML_id));

  // Una publicación que ya no está en la cuenta no se borra (se perdería su
  // historia), pero se marca para que nadie la lea como actual.
  const ausentes = existentes
    .filter((r) => r.fields.ML_id && !vistas.has(r.fields.ML_id))
    .map((r) => ({
      id: r.id,
      fields: {
        Estado: "no está en la cuenta",
        Avisos: `No apareció en la corrida del ${new Date(ahora).toISOString()}: las métricas de esta fila son viejas.`,
      } as Partial<FilaMetricas>,
    }));

  await updateRecords<FilaMetricas>(TABLA_METRICAS_ML, [...actualizar, ...ausentes]);
  for (const fila of nuevas) await createRecord<FilaMetricas>(TABLA_METRICAS_ML, fila);

  return { actualizadas: actualizar.length, nuevas: nuevas.length, ausentes: ausentes.length };
}

export async function actualizarMetricasML(ahora = Date.now()) {
  const token = await tokenVigente();
  const vendedor = await idDeLaCuenta(token);
  const v = ventanas(ahora);
  const hoy = new Date(Date.parse(`${v.hasta}T12:00:00Z`) + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const ids = await idsDePublicaciones(vendedor, token);
  const [pubs, vis, ordenes, ads] = await Promise.all([
    publicaciones(ids, token),
    visitas(ids, v, hoy, token),
    ordenesPagadas(vendedor, v, token),
    anuncios(v, token),
  ]);

  const filas = armarFilas({
    publicaciones: pubs,
    visitas: vis,
    ventas: sumarOrdenes(ordenes, v),
    anuncios: ads.anuncios,
    v,
    ahora,
    avisos: ads.aviso ? [ads.aviso] : [],
  });

  const escritura = await guardar(filas, ahora);

  return {
    ventana: `${v.desde} a ${v.hasta}`,
    publicaciones: pubs.length,
    ordenes: ordenes.length,
    gruposDeAnuncios: ads.anuncios?.length ?? null,
    ...escritura,
    avisos: ads.aviso ? [ads.aviso] : [],
  };
}
