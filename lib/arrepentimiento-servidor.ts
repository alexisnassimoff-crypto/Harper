import { createRecord, TABLAS, updateRecord } from "./airtable";
import type { ConfigTienda } from "./config";
import { fechaDeRecepcion, generarCodigo, type SolicitudArrepentimiento } from "./arrepentimiento";
import {
  enviarMailConDetalle,
  mailArrepentimientoComprador,
  mailArrepentimientoInterno,
  mailArrepentimientoSinCodigo,
} from "./mails";

type Envio = Parameters<typeof enviarMailConDetalle>[0];
type ResultadoEnvio = Awaited<ReturnType<typeof enviarMailConDetalle>>;

/** Una fila de la tabla Arrepentimientos de Airtable. */
export type FilaArrepentimiento = {
  Codigo: string;
  Recibida: string;
  Nombre: string;
  Email: string;
  Pedido: string;
  Productos: string;
  Motivo: string;
  Mail_Harper: "Enviado" | "Falló";
  Mail_comprador: "Enviado" | "Falló";
  Errores: string;
};

export type ResultadoArrepentimiento =
  | { ok: true; codigo: string; recibida: string; mailEnviado: boolean }
  | { ok: false };

function mensaje(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Registra una solicitud de arrepentimiento ya validada y da el código.
 *
 * 1. Se guarda en Airtable (tabla Arrepentimientos): ese es el registro.
 * 2. Se avisa al mail de pedidos (con un reintento).
 * 3. Se manda el código al comprador por email.
 *
 * La solicitud queda registrada si se guardó en Airtable o, si Airtable
 * falló, si salió el aviso a Harper. Registrada, el comprador recibe el
 * código en pantalla aunque fallen los mails: un error de correo no impide
 * el arrepentimiento. Solo si no quedó constancia en ningún lado no se da
 * código, y el comprador ve cómo escribirnos directamente.
 *
 * Cada mail que falla queda en el registro (Mail_Harper, Mail_comprador y
 * Errores) y en los logs de Vercel. Si el código no le llegó al comprador,
 * a Harper le llega además un aviso para mandárselo.
 */
export async function registrarArrepentimiento(
  solicitud: SolicitudArrepentimiento,
  deps: {
    config: ConfigTienda;
    ahora: Date;
    azar: Uint8Array;
    enviar?: (envio: Envio) => Promise<ResultadoEnvio>;
    crear?: (campos: Partial<FilaArrepentimiento>) => Promise<{ id: string }>;
    actualizar?: (id: string, campos: Partial<FilaArrepentimiento>) => Promise<unknown>;
  }
): Promise<ResultadoArrepentimiento> {
  const enviar = deps.enviar ?? enviarMailConDetalle;
  const crear = deps.crear ?? ((campos) => createRecord<FilaArrepentimiento>(TABLAS.arrepentimientos, campos));
  const actualizar = deps.actualizar ?? ((id, campos) => updateRecord<FilaArrepentimiento>(TABLAS.arrepentimientos, id, campos));

  const codigo = generarCodigo(deps.ahora, deps.azar);
  const datos = { codigo, recibida: fechaDeRecepcion(deps.ahora), solicitud, config: deps.config };
  const errores: string[] = [];

  // 1. El registro.
  let registroId: string | null = null;
  let errorRegistro: string | undefined;
  try {
    registroId = (
      await crear({
        Codigo: codigo,
        Recibida: deps.ahora.toISOString(),
        Nombre: solicitud.nombre,
        Email: solicitud.email,
        Pedido: solicitud.pedido,
        Productos: solicitud.producto,
        Motivo: solicitud.motivo,
      })
    ).id;
  } catch (error) {
    errorRegistro = mensaje(error).slice(0, 300);
    console.error(`[arrepentimiento] ${codigo}: no se pudo guardar en Airtable:`, errorRegistro);
  }

  // 2. El aviso a Harper.
  const aviso = mailArrepentimientoInterno({ ...datos, errorRegistro });
  let avisado = await enviar(aviso);
  if (!avisado.ok) avisado = await enviar(aviso);
  if (!avisado.ok) errores.push(`Aviso a Harper: ${avisado.error}`);

  if (!registroId && !avisado.ok) {
    console.error(`[arrepentimiento] ${codigo}: sin registro en Airtable ni aviso por mail; no se da código.`, errores);
    return { ok: false };
  }

  // 3. El código al comprador.
  const alComprador = await enviar(mailArrepentimientoComprador(datos));
  if (!alComprador.ok) {
    errores.push(`Mail al comprador: ${alComprador.error}`);
    if (avisado.ok) {
      const revisar = await enviar(mailArrepentimientoSinCodigo(datos));
      if (!revisar.ok) errores.push(`Aviso de código no enviado: ${revisar.error}`);
    }
  }

  if (errores.length > 0) console.error(`[arrepentimiento] ${codigo}: fallaron mails:`, errores);

  // La constancia en el registro.
  if (registroId) {
    try {
      await actualizar(registroId, {
        Mail_Harper: avisado.ok ? "Enviado" : "Falló",
        Mail_comprador: alComprador.ok ? "Enviado" : "Falló",
        Errores: errores.join("\n"),
      });
    } catch (error) {
      console.error(`[arrepentimiento] ${codigo}: no se pudo anotar el estado de los mails en Airtable:`, mensaje(error));
    }
  }

  return { ok: true, codigo, recibida: datos.recibida, mailEnviado: alComprador.ok };
}
