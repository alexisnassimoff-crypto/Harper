import { listRecords } from "./airtable";
import { tokenVigente } from "./ml-auth";
import { pedirML } from "./ml-cliente";
import { TABLA_METRICAS_ML } from "./ml-metricas-servidor";
import { leerPromociones, type FotoPromociones, type PublicacionConPromo } from "./ml-promociones";

/**
 * Las promociones de cada publicación activa, leídas de la Central de
 * promociones de Mercado Libre. Las publicaciones salen de Metricas ML.
 */

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
