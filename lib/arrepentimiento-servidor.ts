import { createRecord, escaparFormula, getRecord, listRecords, TABLAS, updateRecord } from "./airtable";
import type { ConfigTienda } from "./config";
import { fechaDeRecepcion, generarCodigo, pedidoParaMostrar, type SolicitudArrepentimiento } from "./arrepentimiento";
import { precio as formatearPrecio } from "./formato";
import { beneficiosDeNotas } from "./suscriptores";
import { anularCashbackPendiente } from "./suscriptores-cuenta";
import { incidenciaPorArrepentimiento } from "./credito-incidencias";
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
    /** El cashback pendiente del pedido (ver `anularCashbackDelPedido`): devuelve la nota para Harper. */
    cashback?: (solicitud: SolicitudArrepentimiento, codigo: string, ahora: Date) => Promise<string | null>;
    /** El Crédito Harper del pedido (paso 5, lib/credito-incidencias.ts): abre la incidencia y devuelve la nota. */
    credito?: (solicitud: SolicitudArrepentimiento, codigo: string) => Promise<string | null>;
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

  // El cashback de Suscriptores Harper de ese pedido, si todavía no se puede
  // usar, se anula. Lo mejor posible: si falla, queda en los logs y Harper lo
  // ve en el aviso.
  let notaSaldo: string | null = null;
  try {
    notaSaldo = await (deps.cashback ?? anularCashbackDelPedido)(solicitud, codigo, deps.ahora);
  } catch (error) {
    console.error(`[arrepentimiento] ${codigo}: no se pudo revisar el cashback del pedido:`, mensaje(error));
    notaSaldo = "No se pudo revisar si el pedido tiene cashback de suscriptor: si lo tiene, marcá Anulado en Saldos.";
  }

  // El Crédito Harper del pedido (paso 5, solo con HARPER_CREDITO_ACTIVO=1):
  // la incidencia lo retiene si el pedido se verifica. Apagado devuelve null
  // y el aviso es el de siempre. Nunca frena el arrepentimiento.
  let notaCredito: string | null = null;
  try {
    notaCredito = await (deps.credito ?? incidenciaPorArrepentimiento)(solicitud, codigo);
  } catch (error) {
    console.error(`[arrepentimiento] ${codigo}: no se pudo revisar el Crédito Harper del pedido:`, mensaje(error));
    notaCredito = "No se pudo revisar el Crédito Harper del pedido: si lo tiene, marcá Incidencia_abierta en Créditos.";
  }

  // 2. El aviso a Harper.
  const aviso = mailArrepentimientoInterno({ ...datos, errorRegistro, notaSaldo: [notaSaldo, notaCredito].filter(Boolean).join(" ") || null });
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

type FilaPedidoArrepentimiento = { Numero?: string; Notas?: string; Cliente?: string[] };

/**
 * El cashback y el saldo de un pedido que se arrepiente (Ale, 03/11/2026: el
 * cashback es de las compras que se quedan). Si el pedido es de un
 * suscriptor, su cashback queda Anulado en Saldos, aunque ya se pueda usar (el
 * plazo para arrepentirse corre desde que le llega el pedido, y el cashback se
 * libera a los 30 días del pago). Solo si quien escribe usa el mail del
 * suscriptor o el del pedido: el formulario no pide más que un mail, y nadie
 * tiene que poder anularle el saldo a otro con un número de pedido. Si no
 * coincide, no se toca nada y el aviso a Harper lo dice. Si usó saldo en ese
 * pedido, el aviso le recuerda a Harper devolvérselo cuando se concrete
 * (las condiciones lo prometen). Devuelve esa nota, o null si el pedido no
 * tiene cashback ni saldo usado.
 */
export async function anularCashbackDelPedido(solicitud: SolicitudArrepentimiento, codigo: string, ahora: Date): Promise<string | null> {
  const numero = pedidoParaMostrar(solicitud.pedido);
  if (!numero) return null;

  const pedidos = await listRecords<FilaPedidoArrepentimiento>(TABLAS.pedidos, {
    filterByFormula: `{Numero} = '${escaparFormula(numero)}'`,
    maxRecords: 1,
    revalidate: 0,
  });
  const pedido = pedidos[0];
  const beneficios = pedido ? beneficiosDeNotas(pedido.fields.Notas) : null;
  if (!pedido || !beneficios || (beneficios.cashback <= 0 && beneficios.saldoUsado <= 0 && beneficios.cupon <= 0)) return null;

  const email = solicitud.email.trim().toLowerCase();
  let esSuyo = email === beneficios.email.toLowerCase();
  const clienteId = pedido.fields.Cliente?.[0];
  if (!esSuyo && clienteId) {
    const cliente = await getRecord<{ Email?: string }>(TABLAS.clientes, clienteId).catch(() => null);
    esSuyo = (cliente?.fields.Email ?? "").trim().toLowerCase() === email;
  }
  // El saldo que usó en ese pedido vuelve cuando se concreta la devolución: lo hace Harper.
  // El cupón de bienvenida: arrepentirse no le puede costar nada, así que se lo
  // devuelve Harper (las condiciones ya no dicen que no se repone).
  const notaSaldo =
    [
      beneficios.saldoUsado > 0
        ? `Usó ${formatearPrecio(beneficios.saldoUsado)} de saldo en el pedido ${numero}: cuando se concrete la devolución, marcá Anulado el Uso de ese pedido en Saldos para devolvérselo.`
        : null,
      beneficios.cupon > 0
        ? `Usó el cupón de bienvenida en el pedido ${numero}: si el arrepentimiento sigue, devolvéselo: en Suscriptores, Cupon en Disponible (y vaciá Cupon_pedido); en Clientes, borrá Primera_compra de ese mail si no tiene otra compra.`
        : null,
    ]
      .filter(Boolean)
      .join(" ") || null;

  if (!esSuyo) {
    return [
      `El pedido ${numero} es de un suscriptor, pero el mail de la solicitud no es el del pedido: no se tocó. Si corresponde, marcá Anulado el cashback en Saldos.`,
      notaSaldo,
    ]
      .filter(Boolean)
      .join(" ");
  }

  const nota = await (async () => {
    if (beneficios.cashback <= 0) return null;
    const r = await anularCashbackPendiente(numero, `Anulado por el arrepentimiento ${codigo} (${ahora.toISOString().slice(0, 10)}).`, ahora, {
      aunqueDisponible: true,
    });
    switch (r.estado) {
      case "anulado":
        console.info(`[arrepentimiento] ${codigo}: cashback del pedido ${numero} anulado`);
        return `El cashback de ${formatearPrecio(r.monto)} del pedido ${numero} quedó Anulado en Saldos. Si el arrepentimiento no sigue, destildá Anulado.`;
      case "anulado-disponible":
        console.info(`[arrepentimiento] ${codigo}: cashback ya disponible del pedido ${numero} anulado`);
        return `El cashback de ${formatearPrecio(r.monto)} del pedido ${numero} ya se podía usar y quedó Anulado en Saldos: si ya lo había usado, su saldo queda en negativo hasta el próximo cashback. Si el arrepentimiento no sigue, destildá Anulado.`;
      case "disponible":
        return `El cashback de ${formatearPrecio(r.monto)} del pedido ${numero} ya se puede usar: no se tocó. Si corresponde, marcá Anulado en Saldos.`;
      case "ya-anulado":
        return `El cashback del pedido ${numero} ya estaba Anulado en Saldos.`;
      case "sin-cashback":
        return null;
    }
  })();
  return [nota, notaSaldo].filter(Boolean).join(" ") || null;
}
