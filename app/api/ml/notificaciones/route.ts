import { after, NextResponse } from "next/server";
import { preguntaDeNotificacion } from "@/lib/ml-preguntas";
import { procesarPregunta } from "@/lib/ml-preguntas-servidor";

export const dynamic = "force-dynamic";
// La respuesta sale enseguida; esto es lo que puede durar el trabajo de después.
export const maxDuration = 60;

/**
 * Notificaciones de Mercado Libre (se configura como "URL de notificaciones"
 * de la aplicación, con el tópico questions).
 *
 * Mercado Libre exige un 200 en menos de 500 ms o desactiva el tópico: por
 * eso se contesta primero y la pregunta se procesa después con `after`. Las
 * notificaciones no vienen firmadas, así que nunca se confía en su contenido:
 * solo se usa el id para ir a buscar la pregunta a la API con nuestro token.
 */
export async function POST(request: Request) {
  const cuerpo = await request.json().catch(() => null);
  const preguntaId = preguntaDeNotificacion(cuerpo, (process.env.ML_APP_ID ?? "").trim().split(/\s+/)[0] ?? "");

  if (preguntaId) {
    const origen = new URL(request.url).origin;
    after(async () => {
      try {
        const resultado = await procesarPregunta(preguntaId, origen);
        console.log(`[ml/notificaciones] pregunta ${preguntaId}: ${resultado}`);
      } catch (error) {
        // Queda en la fila de la pregunta (Estado = error) y en los logs. Si
        // Mercado Libre repite la notificación, se vuelve a intentar.
        console.error(`[ml/notificaciones] pregunta ${preguntaId} falló:`, error);
      }
    });
  }

  return NextResponse.json({ ok: true });
}
