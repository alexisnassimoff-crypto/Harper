import Anthropic from "@anthropic-ai/sdk";
import { createRecord, escaparFormula, listRecords, updateRecord, type AirtableRecord } from "./airtable";
import { cerrojoDesdeEntorno, soltarSinFallar, tomarConEspera } from "./cerrojo";
import { getConfig } from "./config";
import { enviarMailConDetalle } from "./mails";
import { tokenVigente } from "./ml-auth";
import { ErrorML, idDeLaCuenta, pedirML } from "./ml-cliente";
import {
  ESQUEMA_DECISION,
  fichaDePublicacion,
  firmaDeAprobacion,
  INSTRUCCIONES,
  leerDecision,
  leerPregunta,
  mensajeParaElAgente,
  problemaDeRespuesta,
  type Decision,
  type Pregunta,
} from "./ml-preguntas";
import { RELOJ_REAL } from "./webhook-lock";

/**
 * El agente de preguntas de Mercado Libre, de punta a punta: lee la
 * pregunta, le pasa la ficha de la publicación a Claude y, según lo que
 * decida, publica la respuesta o manda el borrador al mail de pedidos.
 *
 * Cada pregunta queda en la tabla "Preguntas ML" con lo que se hizo y por
 * qué. Esa fila es también la marca de "ya procesada": Mercado Libre repite
 * notificaciones y avisa también cuando la pregunta se responde.
 */

export const TABLA_PREGUNTAS_ML = "tblnAnZxDI5VlWaQ3";

const MODELO = "claude-opus-5-5";
const TTL_PREGUNTA_MS = 90_000;

type FilaPregunta = {
  Pregunta?: string;
  Pregunta_id?: string;
  ML_id?: string;
  Publicacion?: string;
  Recibida?: string;
  Estado?: "procesando" | "respondida sola" | "borrador" | "aprobada" | "respondida a mano" | "error";
  Respuesta?: string;
  Motivo?: string;
  Respondida?: string;
  Errores?: string;
};

export function agenteConfigurado() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

async function filaDe(preguntaId: string): Promise<AirtableRecord<FilaPregunta> | null> {
  const filas = await listRecords<FilaPregunta>(TABLA_PREGUNTAS_ML, {
    filterByFormula: `{Pregunta_id} = '${escaparFormula(preguntaId)}'`,
    maxRecords: 1,
    revalidate: 0,
  });
  return filas[0] ?? null;
}

/** Una pregunta a la vez: dos notificaciones de la misma no trabajan juntas. */
async function conCerrojo<T>(preguntaId: string, trabajo: () => Promise<T>): Promise<T | null> {
  const cerrojo = cerrojoDesdeEntorno();
  if (!cerrojo) return trabajo();
  const clave = `harper:ml:pregunta:${preguntaId}`;
  const nonce = await tomarConEspera(cerrojo, clave, TTL_PREGUNTA_MS, { esperaMaxMs: 0, reloj: RELOJ_REAL });
  if (!nonce) return null; // otra instancia ya la está procesando
  try {
    return await trabajo();
  } finally {
    await soltarSinFallar(cerrojo, clave, nonce);
  }
}

async function leerFicha(itemId: string, token: string) {
  const id = encodeURIComponent(itemId);
  const [item, descripcion] = await Promise.all([
    pedirML(`/items/${id}`, { token }),
    pedirML(`/items/${id}/description`, { token }).catch((error) => {
      // Una publicación sin descripción contesta 404: se sigue sin ella.
      if (error instanceof ErrorML && error.status === 404) return null;
      throw error;
    }),
  ]);
  return fichaDePublicacion(item, descripcion);
}

/** Le pide la decisión a Claude. Nunca publica nada por su cuenta. */
async function decidir(ficha: string, pregunta: string): Promise<Decision> {
  const cliente = new Anthropic();

  const respuesta = await cliente.beta.messages.create({
    model: MODELO,
    max_tokens: 8_000,
    // Si un clasificador de seguridad rechaza el pedido, lo reintenta otro
    // modelo del lado de Anthropic en vez de devolver el rechazo.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: { type: "json_schema", schema: ESQUEMA_DECISION } },
    system: [{ type: "text", text: INSTRUCCIONES, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: mensajeParaElAgente(ficha, pregunta) }],
  });

  if (respuesta.stop_reason === "refusal") {
    return { accion: "derivar", respuesta: "", motivo: "El modelo no quiso responder esta pregunta: revisala a mano." };
  }

  const texto = respuesta.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  const decision = leerDecision(texto);
  if (!decision) {
    return { accion: "derivar", respuesta: "", motivo: `El agente devolvió algo ilegible (stop_reason ${respuesta.stop_reason}).` };
  }
  return decision;
}

async function publicarRespuesta(preguntaId: string, texto: string, token: string) {
  await pedirML("/answers", { metodo: "POST", token, cuerpo: { question_id: Number(preguntaId), text: texto } });
}

function escapar(texto: string) {
  return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** El mail con el borrador y el botón para aprobarlo. */
async function avisarBorrador(datos: {
  pregunta: Pregunta;
  titulo: string;
  permalink: string;
  decision: Decision;
  origen: string;
}) {
  const config = await getConfig();
  const secreto = process.env.SYNC_TOKEN ?? "";
  const { pregunta, titulo, permalink, decision } = datos;
  const enlace = `${datos.origen}/api/ml/preguntas/aprobar?id=${pregunta.id}&firma=${firmaDeAprobacion(pregunta.id, secreto)}`;
  const sePuedeAprobar = Boolean(secreto) && decision.respuesta && !problemaDeRespuesta(decision.respuesta);

  const html = `<div style="font-family:Helvetica,Arial,sans-serif;color:#16150f;max-width:600px;line-height:1.5">
<p style="font-size:13px;color:#78756c;margin:0 0 4px">Pregunta en <a href="${escapar(permalink)}" style="color:#78756c">${escapar(titulo)}</a></p>
<p style="font-size:17px;margin:0 0 20px"><strong>«${escapar(pregunta.texto)}»</strong></p>
<p style="font-size:13px;color:#78756c;margin:0 0 4px">Borrador del agente</p>
<p style="background:#f2f0ec;padding:12px 14px;margin:0 0 12px;white-space:pre-wrap">${escapar(decision.respuesta || "(sin borrador)")}</p>
<p style="font-size:13px;color:#78756c;margin:0 0 20px">Por qué no la respondió solo: ${escapar(decision.motivo)}</p>
${
  sePuedeAprobar
    ? `<p><a href="${enlace}" style="display:inline-block;background:#16150f;color:#faf9f6;padding:12px 20px;text-decoration:none">Revisar y publicar</a></p>
<p style="font-size:13px;color:#78756c">Si querés cambiarla, editá la columna Respuesta en la tabla Preguntas ML de Airtable antes de tocar el botón: se publica lo que diga ahí.</p>`
    : `<p style="font-size:13px;color:#78756c">Este borrador no se puede publicar tal cual (falta completar algo). Respondela desde Mercado Libre.</p>`
}
</div>`;

  const texto = [
    `Pregunta en ${titulo}: «${pregunta.texto}»`,
    "",
    `Borrador: ${decision.respuesta || "(sin borrador)"}`,
    `Por qué no la respondió solo: ${decision.motivo}`,
    "",
    sePuedeAprobar ? `Revisar y publicar: ${enlace}` : "Respondela desde Mercado Libre.",
  ].join("\n");

  return enviarMailConDetalle({
    para: config.emailPedidos,
    asunto: `Pregunta en Mercado Libre: ${pregunta.texto.slice(0, 60)}`,
    html,
    texto,
  });
}

/**
 * Procesa una pregunta a partir de su id. `origen` es la URL del sitio, para
 * armar el link de aprobación del mail.
 */
export async function procesarPregunta(preguntaId: string, origen: string): Promise<string> {
  const resultado = await conCerrojo(preguntaId, async () => {
    const token = await tokenVigente();
    const pregunta = leerPregunta(await pedirML(`/questions/${encodeURIComponent(preguntaId)}?api_version=4`, { token }));
    if (!pregunta) return "la pregunta no se pudo leer";

    const fila = await filaDe(pregunta.id);

    if (pregunta.estado !== "UNANSWERED") {
      // La notificación de "ya respondida": si había un borrador esperando y
      // se respondió desde Mercado Libre, queda registrado.
      if (fila && (fila.fields.Estado === "borrador" || fila.fields.Estado === "error")) {
        await updateRecord<FilaPregunta>(TABLA_PREGUNTAS_ML, fila.id, {
          Estado: "respondida a mano",
          Respuesta: pregunta.respuesta ?? fila.fields.Respuesta,
          Respondida: new Date().toISOString(),
        });
      }
      return `no está sin responder (${pregunta.estado})`;
    }

    // Ya procesada (por una notificación anterior): no se repite. Solo una
    // que terminó en error vuelve a intentarse.
    if (fila && fila.fields.Estado !== "error") return `ya procesada (${fila.fields.Estado})`;

    const vendedor = await idDeLaCuenta(token);
    if (pregunta.vendedor !== null && pregunta.vendedor !== vendedor) return "la pregunta es de otra cuenta";

    const { titulo, permalink, ficha } = await leerFicha(pregunta.itemId, token);
    const base: FilaPregunta = {
      Pregunta: pregunta.texto,
      Pregunta_id: pregunta.id,
      ML_id: pregunta.itemId,
      Publicacion: titulo,
      Recibida: pregunta.creada,
      Estado: "procesando",
      Errores: "",
    };
    const registro = fila
      ? await updateRecord<FilaPregunta>(TABLA_PREGUNTAS_ML, fila.id, base)
      : await createRecord<FilaPregunta>(TABLA_PREGUNTAS_ML, base);

    try {
      let decision: Decision = agenteConfigurado()
        ? await decidir(ficha, pregunta.texto)
        : { accion: "derivar", respuesta: "", motivo: "Falta ANTHROPIC_API_KEY: el agente no está activo." };

      // El modelo decide, pero el código tiene la última palabra.
      const problema = decision.accion === "responder" ? problemaDeRespuesta(decision.respuesta) : null;
      if (problema) {
        decision = { ...decision, accion: "derivar", motivo: `${decision.motivo} (No se publicó sola porque ${problema}.)` };
      }

      if (decision.accion === "responder") {
        await publicarRespuesta(pregunta.id, decision.respuesta, token);
        await updateRecord<FilaPregunta>(TABLA_PREGUNTAS_ML, registro.id, {
          Estado: "respondida sola",
          Respuesta: decision.respuesta,
          Motivo: decision.motivo,
          Respondida: new Date().toISOString(),
        });
        return "respondida sola";
      }

      await updateRecord<FilaPregunta>(TABLA_PREGUNTAS_ML, registro.id, {
        Estado: "borrador",
        Respuesta: decision.respuesta,
        Motivo: decision.motivo,
      });
      const mail = await avisarBorrador({ pregunta, titulo, permalink, decision, origen });
      if (!mail.ok) {
        await updateRecord<FilaPregunta>(TABLA_PREGUNTAS_ML, registro.id, { Errores: `No salió el mail: ${mail.error}` });
      }
      return "borrador";
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : String(error);
      await updateRecord<FilaPregunta>(TABLA_PREGUNTAS_ML, registro.id, { Estado: "error", Errores: mensaje });
      throw error;
    }
  });

  return resultado ?? "otra instancia la está procesando";
}

/**
 * Publica el borrador aprobado desde el mail. Publica lo que diga la columna
 * Respuesta en ese momento, así se puede corregir en Airtable antes.
 */
export async function aprobarBorrador(preguntaId: string): Promise<{ ok: boolean; mensaje: string }> {
  const resultado = await conCerrojo(preguntaId, async () => {
    const fila = await filaDe(preguntaId);
    if (!fila) return { ok: false, mensaje: "No encontré esa pregunta en la tabla Preguntas ML." };
    if (fila.fields.Estado !== "borrador" && fila.fields.Estado !== "error") {
      return { ok: false, mensaje: `Esta pregunta ya no espera aprobación (está «${fila.fields.Estado}»).` };
    }

    const texto = (fila.fields.Respuesta ?? "").trim();
    const problema = problemaDeRespuesta(texto);
    if (problema) return { ok: false, mensaje: `No se publicó porque ${problema}. Corregila en Airtable o respondela desde Mercado Libre.` };

    const token = await tokenVigente();
    const pregunta = leerPregunta(await pedirML(`/questions/${encodeURIComponent(preguntaId)}?api_version=4`, { token }));
    if (!pregunta) return { ok: false, mensaje: "Mercado Libre no devolvió la pregunta. Probá de nuevo en un rato." };
    if (pregunta.estado !== "UNANSWERED") {
      await updateRecord<FilaPregunta>(TABLA_PREGUNTAS_ML, fila.id, {
        Estado: "respondida a mano",
        Respuesta: pregunta.respuesta ?? texto,
      });
      return { ok: false, mensaje: "Esta pregunta ya estaba respondida en Mercado Libre." };
    }

    await publicarRespuesta(preguntaId, texto, token);
    await updateRecord<FilaPregunta>(TABLA_PREGUNTAS_ML, fila.id, {
      Estado: "aprobada",
      Respuesta: texto,
      Respondida: new Date().toISOString(),
      Errores: "",
    });
    return { ok: true, mensaje: "Listo, la respuesta quedó publicada en Mercado Libre." };
  });

  return resultado ?? { ok: false, mensaje: "La pregunta se está procesando en este momento. Probá de nuevo en un minuto." };
}

/** Para mostrar en la página de aprobación. */
export async function borradorDe(preguntaId: string) {
  const fila = await filaDe(preguntaId);
  return fila ? fila.fields : null;
}
