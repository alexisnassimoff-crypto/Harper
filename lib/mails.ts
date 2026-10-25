import type { ConfigTienda } from "./config";
import { precio as formatearPrecio } from "./formato";
import type { DatosCliente, ItemResuelto } from "./tipos";
import { caracteristicasDe } from "./caracteristicas";
import { enlaceWhatsApp, mensajeGraduadosPedido, TEXTO_GRADUADOS_PEDIDO } from "./whatsapp";
import { pedidoParaMostrar, TEXTO_PROXIMO_PASO, type SolicitudArrepentimiento } from "./arrepentimiento";

// Se puede apuntar a un Resend simulado para las pruebas de punta a punta.
const API_RESEND = process.env.RESEND_API_URL ?? "https://api.resend.com/emails";

/**
 * Remitente. Tiene que ser una dirección del dominio verificado en Resend,
 * si no la API rechaza el envío.
 */
const DE = process.env.RESEND_FROM ?? "Harper <pedidos@harper.ar>";

export function mailsConfigurados() {
  return Boolean(process.env.RESEND_API_KEY);
}

type Envio = {
  para: string;
  asunto: string;
  html: string;
  texto: string;
  responderA?: string;
};

/**
 * Envía un mail. Nunca lanza: un fallo de mail no puede tumbar una venta
 * ya cobrada. Si falla, queda registrado en los logs de Vercel.
 */
export async function enviarMail(envio: Envio): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.warn("[mails] RESEND_API_KEY sin configurar, no se envía nada");
    return false;
  }

  try {
    const respuesta = await fetch(API_RESEND, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: DE,
        to: [envio.para],
        subject: envio.asunto,
        html: envio.html,
        // La versión de texto plano mejora bastante la entregabilidad.
        text: envio.texto,
        ...(envio.responderA ? { reply_to: envio.responderA } : {}),
      }),
    });

    if (!respuesta.ok) {
      console.error("[mails] Resend rechazó el envío:", await respuesta.text());
      return false;
    }

    return true;
  } catch (error) {
    console.error("[mails] error de red al enviar:", error);
    return false;
  }
}

/* ==========================================================================
   Plantillas
   Los clientes de mail no soportan flexbox ni grid: todo va con tablas y CSS
   inline. Raleway tampoco carga en Gmail ni Outlook, por eso la familia
   degrada a Helvetica y Arial.
   ========================================================================== */

const FUENTE = "Raleway, Helvetica, Arial, sans-serif";

function escaparHtml(texto: string) {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function envoltorio(contenido: string, config: ConfigTienda) {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Harper</title>
</head>
<body style="margin:0;padding:0;background:#f2f0ec;font-family:${FUENTE};color:#16150f;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f2f0ec;padding:32px 12px;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#faf9f6;border:1px solid #e3e0d8;">
  <tr>
    <td align="center" style="padding:32px 24px 8px;">
      <div style="font-size:17px;font-weight:500;letter-spacing:7px;text-transform:uppercase;">HARPER</div>
    </td>
  </tr>
  <tr><td style="padding:16px 32px 32px;">${contenido}</td></tr>
  <tr>
    <td style="padding:20px 32px;border-top:1px solid #e3e0d8;font-size:12px;color:#78756c;line-height:1.6;">
      ${escaparHtml(config.razonSocial)} — CUIT ${escaparHtml(config.cuit)}<br>
      ¿Dudas? Escribinos a
      <a href="mailto:${escaparHtml(config.emailContacto)}" style="color:#78756c;">${escaparHtml(config.emailContacto)}</a>
    </td>
  </tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

function filasDeItems(items: ItemResuelto[], sitio: string) {
  return items
    .map((item) => {
      // El catálogo usa WebP con transparencia, pero Outlook de escritorio no
      // renderiza WebP: en el mail se manda el JPEG equivalente, que siempre
      // existe al lado del WebP y trae el fondo blanco ya incorporado.
      const relativa = (item.foto ?? "").replace(/\.webp$/, ".jpg");
      // Las imágenes en mail necesitan URL absoluta; una relativa no carga.
      const foto = relativa.startsWith("http") ? relativa : `${sitio}${relativa}`;

      return `<tr>
  <td width="64" style="padding:10px 12px 10px 0;vertical-align:top;">
    ${item.foto ? `<img src="${escaparHtml(foto)}" width="64" height="64" alt="" style="display:block;width:64px;height:64px;object-fit:cover;border:1px solid #e3e0d8;">` : ""}
  </td>
  <td style="padding:10px 0;vertical-align:top;font-size:14px;line-height:1.5;">
    <strong style="font-weight:500;">${escaparHtml(item.nombre)}</strong><br>
    <span style="color:#78756c;">${escaparHtml(item.color)} · ${item.cantidad} ${item.cantidad === 1 ? "unidad" : "unidades"}</span>${
      item.descuento > 0
        ? `<br><span style="color:#004226;">${item.descuento}% de descuento</span>`
        : ""
    }
  </td>
  <td align="right" style="padding:10px 0;vertical-align:top;font-size:14px;white-space:nowrap;">
    ${
      item.descuento > 0
        ? `<span style="color:#78756c;text-decoration:line-through;font-size:12px;">${formatearPrecio(item.precioLista * item.cantidad)}</span><br>`
        : ""
    }${formatearPrecio(item.subtotal)}
  </td>
</tr>`;
    })
    .join("");
}

function totales(subtotal: number, envio: number, total: number) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:8px;border-top:1px solid #e3e0d8;">
  <tr>
    <td style="padding:10px 0 2px;font-size:14px;color:#78756c;">Subtotal</td>
    <td align="right" style="padding:10px 0 2px;font-size:14px;">${formatearPrecio(subtotal)}</td>
  </tr>
  <tr>
    <td style="padding:2px 0;font-size:14px;color:#78756c;">Envío</td>
    <td align="right" style="padding:2px 0;font-size:14px;">${envio === 0 ? "Gratis" : formatearPrecio(envio)}</td>
  </tr>
  <tr>
    <td style="padding:10px 0 0;font-size:16px;border-top:1px solid #e3e0d8;">Total</td>
    <td align="right" style="padding:10px 0 0;font-size:16px;border-top:1px solid #e3e0d8;">${formatearPrecio(total)}</td>
  </tr>
</table>`;
}

export type DatosMail = {
  numero: string;
  items: ItemResuelto[];
  subtotal: number;
  envio: number;
  total: number;
  cliente: DatosCliente;
  config: ConfigTienda;
  sitio: string;
};

/**
 * El enlace para consultar por cristales graduados, solo si el pedido lleva
 * algún armazón que los admite y hay WhatsApp configurado. El mensaje lleva
 * el número de pedido y nada más.
 */
export function enlaceGraduadosDelPedido(d: Pick<DatosMail, "numero" | "items" | "config">): string | null {
  const lleva = d.items.some((i) => caracteristicasDe({ slug: i.productoSlug, categoria: i.categoria }) !== null);
  return lleva ? enlaceWhatsApp(d.config.whatsapp, mensajeGraduadosPedido(d.numero)) : null;
}

/** 1 — Confirmación de compra para el cliente. */
export function mailConfirmacion(d: DatosMail): Envio {
  const graduados = enlaceGraduadosDelPedido(d);
  const direccion = `${d.cliente.direccion}, ${d.cliente.ciudad}, ${d.cliente.provincia} (CP ${d.cliente.cp})`;

  const html = envoltorio(
    `<h1 style="margin:0 0 8px;font-size:22px;font-weight:400;">Gracias por tu compra</h1>
<p style="margin:0 0 24px;font-size:14px;color:#78756c;line-height:1.6;">
  Recibimos tu pago. Tu pedido <strong style="color:#16150f;">${escaparHtml(d.numero)}</strong>
  ya está en preparación.
</p>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
  ${filasDeItems(d.items, d.sitio)}
</table>

${totales(d.subtotal, d.envio, d.total)}

<div style="margin-top:28px;padding-top:20px;border-top:1px solid #e3e0d8;">
  <div style="font-size:11px;letter-spacing:1.6px;text-transform:uppercase;color:#78756c;margin-bottom:6px;">Envío a</div>
  <div style="font-size:14px;line-height:1.6;">
    ${escaparHtml(d.cliente.nombre)}<br>${escaparHtml(direccion)}
  </div>
</div>${
      graduados
        ? `

<div style="margin-top:28px;padding:18px 20px;background:#f2f0ec;border:1px solid #e3e0d8;">
  <p style="margin:0 0 10px;font-size:14px;line-height:1.6;color:#16150f;">${escaparHtml(TEXTO_GRADUADOS_PEDIDO)}</p>
  <a href="${escaparHtml(graduados)}" style="font-size:13px;letter-spacing:0.5px;color:#004226;text-decoration:underline;">Consultar por WhatsApp</a>
</div>`
        : ""
    }`,
    d.config
  );

  const texto = `Gracias por tu compra.

Pedido ${d.numero}
${d.items.map((i) => `- ${i.cantidad}x ${i.nombre} ${i.color}: ${formatearPrecio(i.subtotal)}${i.descuento > 0 ? ` (${i.descuento}% off)` : ""}`).join("\n")}

Subtotal: ${formatearPrecio(d.subtotal)}
Envio: ${d.envio === 0 ? "Gratis" : formatearPrecio(d.envio)}
Total: ${formatearPrecio(d.total)}

Envio a: ${d.cliente.nombre}, ${direccion}
${graduados ? `\n${TEXTO_GRADUADOS_PEDIDO}\nWhatsApp: ${graduados}\n` : ""}
Consultas: ${d.config.emailContacto}`;

  return {
    para: d.cliente.email,
    asunto: `Tu pedido ${d.numero} está confirmado`,
    html,
    texto,
    responderA: d.config.emailContacto,
  };
}

/** 2 — Aviso interno para preparar y despachar el pedido. */
export function mailAvisoInterno(d: DatosMail & { pedidoUrl: string }): Envio {
  const html = envoltorio(
    `<h1 style="margin:0 0 8px;font-size:22px;font-weight:400;">Venta nueva — ${escaparHtml(d.numero)}</h1>
<p style="margin:0 0 24px;font-size:14px;color:#78756c;">${formatearPrecio(d.total)} · ${escaparHtml(d.cliente.provincia)}</p>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
  ${filasDeItems(d.items, d.sitio)}
</table>

${totales(d.subtotal, d.envio, d.total)}

<div style="margin-top:28px;padding-top:20px;border-top:1px solid #e3e0d8;font-size:14px;line-height:1.7;">
  <div style="font-size:11px;letter-spacing:1.6px;text-transform:uppercase;color:#78756c;margin-bottom:6px;">Datos de envío</div>
  ${escaparHtml(d.cliente.nombre)}<br>
  ${escaparHtml(d.cliente.direccion)}<br>
  ${escaparHtml(d.cliente.ciudad)}, ${escaparHtml(d.cliente.provincia)} — CP ${escaparHtml(d.cliente.cp)}<br>
  ${d.cliente.dni ? `DNI ${escaparHtml(d.cliente.dni)} · ` : ""}Tel ${escaparHtml(d.cliente.telefono)}<br>
  ${escaparHtml(d.cliente.email)}
</div>

<p style="margin:24px 0 0;">
  <a href="${escaparHtml(d.pedidoUrl)}" style="display:inline-block;background:#16150f;color:#faf9f6;text-decoration:none;padding:14px 24px;font-size:12px;letter-spacing:1.6px;text-transform:uppercase;">Abrir en Airtable</a>
</p>`,
    d.config
  );

  const texto = `VENTA NUEVA ${d.numero} — ${formatearPrecio(d.total)}

${d.items.map((i) => `- ${i.cantidad}x ${i.nombre} ${i.color} (${i.sku})`).join("\n")}

${d.cliente.nombre}
${d.cliente.direccion}, ${d.cliente.ciudad}, ${d.cliente.provincia} - CP ${d.cliente.cp}
${d.cliente.dni ? `DNI ${d.cliente.dni} - ` : ""}Tel ${d.cliente.telefono} - ${d.cliente.email}

Airtable: ${d.pedidoUrl}`;

  return {
    para: d.config.emailPedidos,
    asunto: `Venta ${d.numero} — ${formatearPrecio(d.total)}`,
    html,
    texto,
    responderA: d.cliente.email,
  };
}

/** 3 — El pago no se pudo procesar. */
export function mailPagoRechazado(d: DatosMail): Envio {
  const html = envoltorio(
    `<h1 style="margin:0 0 8px;font-size:22px;font-weight:400;">No pudimos procesar tu pago</h1>
<p style="margin:0 0 24px;font-size:14px;color:#78756c;line-height:1.6;">
  El pago del pedido ${escaparHtml(d.numero)} fue rechazado y no te cobramos nada.
  Podés volver a la tienda e intentar con otro medio de pago.
</p>
<p style="margin:0;">
  <a href="${escaparHtml(d.sitio)}/checkout" style="display:inline-block;background:#16150f;color:#faf9f6;text-decoration:none;padding:14px 24px;font-size:12px;letter-spacing:1.6px;text-transform:uppercase;">Reintentar el pago</a>
</p>`,
    d.config
  );

  return {
    para: d.cliente.email,
    asunto: `No pudimos procesar el pago de tu pedido ${d.numero}`,
    html,
    texto: `No pudimos procesar el pago del pedido ${d.numero}. No te cobramos nada.\n\nReintentar: ${d.sitio}/checkout\n\nConsultas: ${d.config.emailContacto}`,
    responderA: d.config.emailContacto,
  };
}

/** 4 — El pedido salió, con el número de seguimiento. */
export function mailEnviado(
  d: DatosMail & { tracking: string }
): Envio {
  const html = envoltorio(
    `<h1 style="margin:0 0 8px;font-size:22px;font-weight:400;">Tu pedido está en camino</h1>
<p style="margin:0 0 24px;font-size:14px;color:#78756c;line-height:1.6;">
  Despachamos el pedido ${escaparHtml(d.numero)}. Podés seguirlo con este código:
</p>
<div style="font-size:20px;letter-spacing:2px;padding:16px;background:#f2f0ec;border:1px solid #e3e0d8;text-align:center;">
  ${escaparHtml(d.tracking)}
</div>`,
    d.config
  );

  return {
    para: d.cliente.email,
    asunto: `Tu pedido ${d.numero} está en camino`,
    html,
    texto: `Despachamos tu pedido ${d.numero}.\n\nSeguimiento: ${d.tracking}\n\nConsultas: ${d.config.emailContacto}`,
    responderA: d.config.emailContacto,
  };
}

type DatosArrepentimiento = {
  codigo: string;
  /** Fecha y hora de recepción, ya escrita (ver fechaDeRecepcion). */
  recibida: string;
  solicitud: SolicitudArrepentimiento;
  config: ConfigTienda;
};

/**
 * 5 — Botón de arrepentimiento: el código de recepción, al comprador. Lleva
 * solo datos del sistema (y el número de pedido si tiene forma de número de
 * pedido): nunca texto libre del formulario, que podría escribir cualquiera.
 */
export function mailArrepentimientoComprador(d: DatosArrepentimiento): Envio {
  const pedido = pedidoParaMostrar(d.solicitud.pedido);
  const html = envoltorio(
    `<h1 style="margin:0 0 8px;font-size:22px;font-weight:400;">Recibimos tu solicitud de arrepentimiento</h1>
<p style="margin:0 0 16px;font-size:14px;color:#78756c;line-height:1.6;">
  Este es el código de recepción de tu solicitud. Guardalo: la identifica.
</p>
<div style="font-size:20px;letter-spacing:2px;padding:16px;background:#f2f0ec;border:1px solid #e3e0d8;text-align:center;">
  ${escaparHtml(d.codigo)}
</div>
<p style="margin:16px 0 0;font-size:14px;line-height:1.6;">
  La recibimos el ${escaparHtml(d.recibida)}.${pedido ? ` Pedido ${escaparHtml(pedido)}.` : ""}
</p>
<p style="margin:16px 0 0;font-size:14px;line-height:1.6;">${escaparHtml(TEXTO_PROXIMO_PASO)}</p>`,
    d.config
  );

  return {
    para: d.solicitud.email,
    asunto: `Recibimos tu solicitud de arrepentimiento — ${d.codigo}`,
    html,
    texto: `Recibimos tu solicitud de arrepentimiento.

Código de recepción: ${d.codigo}
Recibida el ${d.recibida}.${pedido ? ` Pedido ${pedido}.` : ""}

${TEXTO_PROXIMO_PASO}

Consultas: ${d.config.emailContacto}`,
    responderA: d.config.emailContacto,
  };
}

function filasArrepentimiento(d: DatosArrepentimiento): [string, string][] {
  const s = d.solicitud;
  return [
    ["Código", d.codigo],
    ["Recibida", d.recibida],
    ["Nombre", s.nombre],
    ["Email", s.email],
    ["Pedido", s.pedido || "No lo indicó"],
    ["Productos", s.producto || "No lo indicó (todo el pedido)"],
    ["Motivo", s.motivo || "No lo indicó"],
  ];
}

/** 6 — Botón de arrepentimiento: el aviso a Harper, que es el registro de la solicitud. */
export function mailArrepentimientoInterno(d: DatosArrepentimiento): Envio {
  const filas = filasArrepentimiento(d);
  const html = envoltorio(
    `<h1 style="margin:0 0 8px;font-size:22px;font-weight:400;">Solicitud de arrepentimiento — ${escaparHtml(d.codigo)}</h1>
<p style="margin:0 0 20px;font-size:14px;color:#78756c;line-height:1.6;">
  Al comprador se le mostró este código en pantalla y se le envía por email. Si ese email falla, te llega otro aviso.
  Contactalo el siguiente día hábil para coordinar el retiro sin cargo y el reintegro. Respondiendo este mail le escribís a él.
</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size:14px;line-height:1.6;">
  ${filas
    .map(
      ([clave, valor]) => `<tr>
    <td width="96" style="padding:6px 12px 6px 0;vertical-align:top;color:#78756c;">${clave}</td>
    <td style="padding:6px 0;vertical-align:top;white-space:pre-wrap;">${escaparHtml(valor)}</td>
  </tr>`
    )
    .join("")}
</table>`,
    d.config
  );

  return {
    para: d.config.emailPedidos,
    asunto: `Arrepentimiento ${d.codigo} — ${d.solicitud.nombre}`,
    html,
    texto: `SOLICITUD DE ARREPENTIMIENTO ${d.codigo}

${filas.map(([clave, valor]) => `${clave}: ${valor}`).join("\n")}

Al comprador se le mostró el código en pantalla y se le envía por email. Si ese email falla, te llega otro aviso.
Contactalo el siguiente día hábil para coordinar el retiro sin cargo y el reintegro.`,
    responderA: d.solicitud.email,
  };
}

/** 7 — El código no le llegó por email al comprador: que se lo mande Harper. */
export function mailArrepentimientoSinCodigo(d: DatosArrepentimiento): Envio {
  const texto = `No se pudo mandar por email el código ${d.codigo} a ${d.solicitud.email}. Se le mostró en pantalla, pero mandáselo vos respondiendo este mail.`;
  return {
    para: d.config.emailPedidos,
    asunto: `REVISAR arrepentimiento ${d.codigo} — el código no le llegó al comprador`,
    html: envoltorio(`<p style="margin:0;font-size:14px;line-height:1.6;">${escaparHtml(texto)}</p>`, d.config),
    texto,
    responderA: d.solicitud.email,
  };
}
