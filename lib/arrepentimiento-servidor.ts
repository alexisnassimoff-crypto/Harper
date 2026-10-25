import type { ConfigTienda } from "./config";
import { fechaDeRecepcion, generarCodigo, type SolicitudArrepentimiento } from "./arrepentimiento";
import {
  enviarMail,
  mailArrepentimientoComprador,
  mailArrepentimientoInterno,
  mailArrepentimientoSinCodigo,
} from "./mails";

type Envio = Parameters<typeof enviarMail>[0];

export type ResultadoArrepentimiento =
  | { ok: true; codigo: string; recibida: string; mailEnviado: boolean }
  | { ok: false };

/**
 * Registra una solicitud de arrepentimiento ya validada y da el código.
 *
 * 1. El aviso a Harper va primero: es el registro de la solicitud. Si no sale
 *    (con un reintento), no se da código y el comprador ve cómo escribirnos
 *    directamente, para no confirmarle algo que Harper no recibió.
 * 2. Después, el código al comprador por email. Si ese email falla, el código
 *    igual se le muestra en pantalla y a Harper le llega otro aviso para que
 *    se lo mande.
 */
export async function registrarArrepentimiento(
  solicitud: SolicitudArrepentimiento,
  deps: {
    config: ConfigTienda;
    ahora: Date;
    azar: Uint8Array;
    enviar?: (envio: Envio) => Promise<boolean>;
  }
): Promise<ResultadoArrepentimiento> {
  const enviar = deps.enviar ?? enviarMail;
  const datos = {
    codigo: generarCodigo(deps.ahora, deps.azar),
    recibida: fechaDeRecepcion(deps.ahora),
    solicitud,
    config: deps.config,
  };

  const aviso = mailArrepentimientoInterno(datos);
  const registrada = (await enviar(aviso)) || (await enviar(aviso));
  if (!registrada) return { ok: false };

  const mailEnviado = await enviar(mailArrepentimientoComprador(datos));
  if (!mailEnviado) await enviar(mailArrepentimientoSinCodigo(datos));

  return { ok: true, codigo: datos.codigo, recibida: datos.recibida, mailEnviado };
}
