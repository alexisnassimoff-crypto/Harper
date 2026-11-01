import { createRecord, listRecords, updateRecords } from "./airtable";
import { tokenVigente } from "./ml-auth";
import { pedirML } from "./ml-cliente";
import { TABLA_METRICAS_ML } from "./ml-metricas-servidor";
import { filasDePromociones, leerPromociones, type FilaPromocion, type FotoPromociones, type PublicacionConPromo } from "./ml-promociones";

/**
 * Las promociones de cada publicación activa, leídas de la Central de
 * promociones de Mercado Libre. Las publicaciones salen de Metricas ML. Cada
 * lectura queda en la tabla Promociones ML.
 */

export const TABLA_PROMOCIONES_ML = "tblC8MCMjIVqsp0YQ";

type FilaMetricas = { ML_id?: string; Titulo?: string; Estado?: string; Precio?: number };

const EN_PARALELO = 5;

export async function fotoDePromociones(ahora = Date.now()): Promise<FotoPromociones> {
  const token = await tokenVigente();
  const activas = (await listRecords<FilaMetricas>(TABLA_METRICAS_ML, { revalidate: 0 }))
    .map((r) => r.fields)
    .filter((f): f is FilaMetricas & { ML_id: string } => Boolean(f.ML_id) && f.Estado === "active");

  const publicaciones: PublicacionConPromo[] = [];
  const errores: FotoPromociones["errores"] = [];
  let siguiente = 0;
  await Promise.all(
    Array.from({ length: Math.min(EN_PARALELO, activas.length) }, async () => {
      while (siguiente < activas.length) {
        const f = activas[siguiente++];
        const titulo = f.Titulo ?? f.ML_id;
        try {
          const cuerpo = await pedirML(`/seller-promotions/items/${f.ML_id}?app_version=v2`, { token });
          publicaciones.push({ id: f.ML_id, titulo, precioLista: typeof f.Precio === "number" ? f.Precio : null, promociones: leerPromociones(cuerpo) });
        } catch (error) {
          errores.push({ id: f.ML_id, titulo, detalle: (error as Error).message.replace(/ en \/\S+/, "").slice(0, 300) });
        }
      }
    })
  );
  publicaciones.sort((a, b) => a.titulo.localeCompare(b.titulo, "es"));

  return {
    fecha: new Date(ahora).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "short", timeStyle: "short" }),
    publicaciones,
    errores,
  };
}

/**
 * Escribe la foto en Promociones ML: actualiza por Clave, crea las nuevas y
 * marca «ya no está» las que no aparecieron (no se borran: queda la historia).
 */
export async function guardarPromociones(foto: FotoPromociones, ahora = Date.now()) {
  const filas = filasDePromociones(foto.publicaciones, ahora);
  const existentes = await listRecords<{ Clave?: string; Estado?: string; ML_id?: string }>(TABLA_PROMOCIONES_ML, { revalidate: 0 });
  const registroDe = new Map(existentes.flatMap((r) => (r.fields.Clave ? [[r.fields.Clave, r.id] as const] : [])));
  const vistas = new Set(filas.map((f) => f.Clave));
  // Una publicación que no se pudo leer no marca sus promociones como terminadas.
  const sinLeer = new Set(foto.errores.map((e) => e.id));

  const actualizar = filas.flatMap((f) => {
    const id = registroDe.get(f.Clave);
    return id ? [{ id, fields: f }] : [];
  });
  const ausentes = existentes
    .filter((r) => r.fields.Clave && !vistas.has(r.fields.Clave) && r.fields.Estado !== "ya no está" && !sinLeer.has(r.fields.ML_id ?? ""))
    .map((r) => ({ id: r.id, fields: { Estado: "ya no está", Actualizado: new Date(ahora).toISOString() } as Partial<FilaPromocion> }));

  await updateRecords<Partial<FilaPromocion>>(TABLA_PROMOCIONES_ML, [...actualizar, ...ausentes]);
  const nuevas = filas.filter((f) => !registroDe.has(f.Clave));
  for (const fila of nuevas) await createRecord<FilaPromocion>(TABLA_PROMOCIONES_ML, fila);
  return { promociones: filas.length, nuevas: nuevas.length, yaNoEstan: ausentes.length };
}
