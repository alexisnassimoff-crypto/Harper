import { listRecords } from "./airtable";
import { tokenVigente } from "./ml-auth";
import { pedirML } from "./ml-cliente";
import { atributosQueMencionan, estadoDelCambio, QUE_SE_PUEDE_SACAR, quitarLineas, type Cambio, type QueSacar } from "./ml-descripciones";
import { TABLA_METRICAS_ML } from "./ml-metricas-servidor";

/**
 * Revisa las descripciones de las publicaciones activas (de Metricas ML) y saca
 * las líneas que mencionan algo que no es cierto. Sin `aplicar` solo muestra
 * qué cambiaría; con `aplicar` lo cambia en Mercado Libre. Las características
 * (atributos) que lo mencionan solo se informan: se corrigen a mano.
 */

const EN_PARALELO = 5;

type FilaMetricas = { ML_id?: string; Titulo?: string; Estado?: string };

export async function corregirDescripciones(que: QueSacar, aplicar: boolean): Promise<Cambio[]> {
  const { patron } = QUE_SE_PUEDE_SACAR[que];
  const token = await tokenVigente();
  const activas = (await listRecords<FilaMetricas>(TABLA_METRICAS_ML, { revalidate: 0 }))
    .map((r) => r.fields)
    .filter((f): f is FilaMetricas & { ML_id: string } => Boolean(f.ML_id) && f.Estado === "active");

  const cambios: Cambio[] = [];
  let siguiente = 0;
  await Promise.all(
    Array.from({ length: Math.min(EN_PARALELO, activas.length) }, async () => {
      while (siguiente < activas.length) {
        const f = activas[siguiente++];
        const titulo = f.Titulo ?? f.ML_id;
        try {
          const [descripcion, item] = await Promise.all([
            pedirML<{ plain_text?: unknown }>(`/items/${f.ML_id}/description`, { token }),
            pedirML(`/items/${f.ML_id}?attributes=id,title,attributes`, { token }),
          ]);
          const texto = typeof descripcion?.plain_text === "string" ? descripcion.plain_text : "";
          const { nuevo, quitadas } = quitarLineas(texto, patron);
          const estado = estadoDelCambio(quitadas, aplicar);
          if (estado === "aplicado") {
            await pedirML(`/items/${f.ML_id}/description?api_version=2`, { metodo: "PUT", cuerpo: { plain_text: nuevo }, token });
          }
          cambios.push({
            id: f.ML_id,
            titulo,
            quitadas,
            atributos: atributosQueMencionan(item, patron),
            estado,
            detalle: estado === "demasiadas líneas" ? `${quitadas.length} líneas; se deja como está para revisarla a mano` : undefined,
          });
        } catch (error) {
          cambios.push({ id: f.ML_id, titulo, quitadas: [], atributos: [], estado: "error", detalle: (error as Error).message.slice(0, 200) });
        }
      }
    })
  );
  return cambios.sort((a, b) => a.titulo.localeCompare(b.titulo, "es"));
}
