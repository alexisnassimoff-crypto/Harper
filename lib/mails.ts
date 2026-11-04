import type { ConfigTienda } from "./config";
import { precio as formatearPrecio, precioConCentavos } from "./formato";
import { textoPorcentaje } from "./descuentos";
import { plazoParaComprador } from "./envio-gratis";
import type { DatosCliente, ItemResuelto } from "./tipos";
import { caracteristicasDe } from "./caracteristicas";
import { enlaceWhatsApp, mensajeGraduadosPedido, TEXTO_GRADUADOS_PEDIDO } from "./whatsapp";
import { pedidoParaMostrar, TEXTO_PROXIMO_PASO, type SolicitudArrepentimiento } from "./arrepentimiento";
import { lineasDeFacturacion, type FacturacionPedido } from "./facturacion";
import { NOMBRE_MARCAS, type CuotasVerificadas } from "./cuotas";
import {
  CASHBACK_PORCENTAJE,
  CUPON_BIENVENIDA,
  DIAS_PARA_USAR_CASHBACK,
  fechaLegible,
} from "./suscriptores";
import { TEXTOS } from "./textos";

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
  return (await enviarMailConDetalle(envio)).ok;
}

/** Lo mismo, pero si falla dice por qué: para dejar constancia del error. */
export async function enviarMailConDetalle(envio: Envio): Promise<{ ok: true } | { ok: false; error: string }> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.warn("[mails] RESEND_API_KEY sin configurar, no se envía nada");
    return { ok: false, error: "RESEND_API_KEY sin configurar" };
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
      const detalle = await respuesta.text();
      console.error("[mails] Resend rechazó el envío:", detalle);
      return { ok: false, error: `Resend ${respuesta.status}: ${detalle.slice(0, 300)}` };
    }

    return { ok: true };
  } catch (error) {
    console.error("[mails] error de red al enviar:", error);
    return { ok: false, error: `Error de red: ${error instanceof Error ? error.message : String(error)}` };
  }
}

/* ==========================================================================
   Plantillas
   Los clientes de mail no soportan flexbox ni grid: todo va con tablas y CSS
   inline. Raleway no carga en Gmail ni Outlook, por eso la familia
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

/**
 * "5% de descuento + 10% por dinero en Mercado Pago", "Cupón de bienvenida +
 * con tu saldo". Vacío si el ítem va a precio de lista.
 */
function textoDescuento(item: ItemResuelto) {
  return [
    item.descuento > 0 ? `${textoPorcentaje(item.descuento)}% de descuento` : null,
    item.cupon ? "Cupón de bienvenida" : null,
    item.saldo ? "con tu saldo" : null,
    item.descuentoDineroMP ? `${item.descuentoDineroMP}% por dinero en Mercado Pago` : null,
  ]
    .filter(Boolean)
    .join(" + ");
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
      textoDescuento(item)
        ? `<br><span style="color:#004226;">${textoDescuento(item)}</span>`
        : ""
    }
  </td>
  <td align="right" style="padding:10px 0;vertical-align:top;font-size:14px;white-space:nowrap;">
    ${
      textoDescuento(item)
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
  /** Para emitir la factura; `null` en pedidos anteriores a estos datos. */
  facturacion?: FacturacionPedido | null;
  /** Los mismos datos, ya escritos, cuando quedaron en Notas del pedido. */
  lineasFacturacion?: string[] | null;
  /** El cupón aplicado, por ejemplo "HARPER10 (−$ 8.990)"; null si no hubo. */
  cupon?: string | null;
  /** Verdadero si se pidió con el descuento por dinero en Mercado Pago. */
  conDineroMP?: boolean;
  /** Con qué se envía, cuánto cuesta de verdad y el plazo (ver lib/envio-pedido.ts). Null en pedidos anteriores. */
  envioDetalle?: {
    transportista: string;
    servicio: string;
    plazo: string;
    costoReal: number | null;
    bonificado: boolean;
  } | null;
  /** Algo que Harper tiene que revisar en esta venta, ya escrito. */
  alerta?: string | null;
  /** Si compró un suscriptor: sus beneficios en este pedido (lib/suscriptores.ts). */
  suscriptor?: BeneficiosEnElMail | null;
};

/** Los beneficios de Suscriptores Harper en un pedido, para el comprador y para Harper. */
export type BeneficiosEnElMail = {
  email: string;
  /** Pesos del cupón de bienvenida; 0 si no lo usó. */
  cupon: number;
  /** Pesos pagados con saldo. */
  saldoUsado: number;
  /** Pesos que le vuelven como saldo. */
  cashback: number;
  /** "2026-12-03": desde cuándo puede usar ese cashback. */
  cashbackDesde: string | null;
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

/**
 * "Envío a domicilio · Llega en 24 h hábiles desde el despacho.", para el
 * comprador. Sin el transportista: eso lo sabe Harper (el mail interno).
 */
function envioCliente(d: Pick<DatosMail, "envioDetalle">): string | null {
  const e = d.envioDetalle;
  if (!e || e.transportista.startsWith("Tarifa plana")) return null;
  const plazo = plazoParaComprador(e.plazo);
  return plazo ? `Envío a domicilio · ${plazo} desde el despacho.` : null;
}

/** "Envío: Andreani (andreani:ground) · costo real $ 8.120,40 · cobrado $ 8.121", para Harper. */
function envioInterno(d: Pick<DatosMail, "envioDetalle" | "envio">): string | null {
  const e = d.envioDetalle;
  if (!e) return null;
  const costo = e.costoReal !== null ? ` · costo real ${precioConCentavos(e.costoReal)}` : "";
  const cobrado = e.bonificado ? " · envío gratis: lo paga Harper" : ` · cobrado ${formatearPrecio(d.envio)}`;
  return `Envío: ${e.transportista}${e.servicio ? ` (${e.servicio})` : ""}${costo}${cobrado}${e.plazo ? ` · plazo ${e.plazo}` : ""}`;
}

/** Los renglones del suscriptor en el mail del comprador: cupón, saldo y cashback. */
function lineasSuscriptor(d: Pick<DatosMail, "suscriptor">): string[] {
  const b = d.suscriptor;
  if (!b) return [];
  return [
    b.cupon > 0 ? `Usaste tu cupón de bienvenida: −${formatearPrecio(b.cupon)}.` : null,
    b.saldoUsado > 0 ? `Pagaste ${formatearPrecio(b.saldoUsado)} con tu saldo.` : null,
    b.cashback > 0
      ? `Te vuelven ${formatearPrecio(b.cashback)} de saldo${b.cashbackDesde ? `: los podés usar desde el ${fechaLegible(b.cashbackDesde)}` : ""}.`
      : null,
    "Como suscriptor, el envío es gratis.",
  ].filter((l): l is string => l !== null);
}

/** El bloque de Suscriptores Harper en el mail del comprador. */
function bloqueSuscriptor(d: DatosMail): string {
  const lineas = lineasSuscriptor(d);
  if (lineas.length === 0) return "";
  return `
<div style="margin-top:28px;padding:20px;background:#004226;color:#ffffff;">
  <div style="font-size:11px;letter-spacing:1.6px;text-transform:uppercase;opacity:0.8;margin-bottom:6px;">${escaparHtml(TEXTOS.suscriptores.etiqueta)}</div>
  ${lineas.map((l) => `<p style="margin:0 0 6px;font-size:14px;line-height:1.6;">${escaparHtml(l)}</p>`).join("\n  ")}
  <a href="${escaparHtml(d.sitio)}/suscriptores/mi-cuenta" style="display:inline-block;margin-top:8px;font-size:13px;letter-spacing:0.5px;color:#ffffff;text-decoration:underline;">Ver mi saldo</a>
</div>`;
}

/** Para Harper: qué beneficios usó y qué hay que acreditar. */
function lineaSuscriptorInterna(d: Pick<DatosMail, "suscriptor">): string | null {
  const b = d.suscriptor;
  if (!b) return null;
  return [
    `Suscriptor: ${b.email}`,
    b.cupon > 0 ? `cupón de bienvenida −${formatearPrecio(b.cupon)}` : null,
    b.saldoUsado > 0 ? `saldo usado −${formatearPrecio(b.saldoUsado)}` : null,
    b.cashback > 0 ? `cashback a acreditar ${formatearPrecio(b.cashback)}${b.cashbackDesde ? ` (se puede usar desde el ${fechaLegible(b.cashbackDesde)})` : ""}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Lo que Harper tiene que hacer si el pedido de un suscriptor se devuelve: anular el cashback y devolver el saldo usado. */
function avisoDevolucionSaldo(b: NonNullable<DatosMail["suscriptor"]>): string | null {
  const que = [
    b.cashback > 0 ? "el Cashback de este pedido (lo que le vuelve)" : null,
    b.saldoUsado > 0 ? "el Uso de este pedido (así recupera el saldo que usó)" : null,
  ].filter(Boolean);
  return que.length ? `Si se devuelve, marcá Anulado en Saldos ${que.join(" y ")}.` : null;
}

/** Un aviso corto para Harper, sin datos del comprador: qué pasó y qué hacer. */
export function mailAlertaInterna(d: { config: ConfigTienda; asunto: string; lineas: string[]; enlace?: string | null }): Envio {
  const html = envoltorio(
    `<h1 style="margin:0 0 16px;font-size:20px;font-weight:400;">${escaparHtml(d.asunto)}</h1>
${d.lineas.map((l) => `<p style="margin:0 0 12px;font-size:14px;line-height:1.6;">${escaparHtml(l)}</p>`).join("\n")}
${d.enlace ? `<p style="margin:16px 0 0;font-size:14px;"><a href="${escaparHtml(d.enlace)}" style="color:#004226;">Ver el pedido en Airtable</a></p>` : ""}`,
    d.config
  );
  return {
    para: d.config.emailPedidos,
    asunto: d.asunto,
    html,
    texto: [d.asunto, "", ...d.lineas, ...(d.enlace ? ["", d.enlace] : [])].join("\n"),
  };
}

/** 1 — Confirmación de compra para el cliente. */
export function mailConfirmacion(d: DatosMail): Envio {
  const graduados = enlaceGraduadosDelPedido(d);
  const sinPago = d.total === 0;
  const direccion = `${d.cliente.direccion}, ${d.cliente.ciudad}, ${d.cliente.provincia} (CP ${d.cliente.cp})`;

  const html = envoltorio(
    `<h1 style="margin:0 0 8px;font-size:22px;font-weight:400;">Gracias por tu compra</h1>
<p style="margin:0 0 24px;font-size:14px;color:#78756c;line-height:1.6;">
  ${sinPago ? "Tu" : "Recibimos tu pago. Tu"} pedido <strong style="color:#16150f;">${escaparHtml(d.numero)}</strong>
  ya está en preparación.
</p>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
  ${filasDeItems(d.items, d.sitio)}
</table>

${totales(d.subtotal, d.envio, d.total)}
${bloqueSuscriptor(d)}
<div style="margin-top:28px;padding-top:20px;border-top:1px solid #e3e0d8;">
  <div style="font-size:11px;letter-spacing:1.6px;text-transform:uppercase;color:#78756c;margin-bottom:6px;">Envío a</div>
  <div style="font-size:14px;line-height:1.6;">
    ${escaparHtml(d.cliente.nombre)}<br>${escaparHtml(direccion)}
  </div>${
    envioCliente(d)
      ? `
  <div style="margin-top:8px;font-size:13px;line-height:1.6;color:#78756c;">${escaparHtml(envioCliente(d)!)}</div>`
      : ""
  }
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
${d.items
  .map((i) => {
    const descuento = [
      i.descuento > 0 ? `${textoPorcentaje(i.descuento)}% off` : null,
      i.cupon ? "cupón de bienvenida" : null,
      i.saldo ? "con tu saldo" : null,
      i.descuentoDineroMP ? `${i.descuentoDineroMP}% por dinero en Mercado Pago` : null,
    ]
      .filter(Boolean)
      .join(" + ");
    return `- ${i.cantidad}x ${i.nombre} ${i.color}: ${formatearPrecio(i.subtotal)}${descuento ? ` (${descuento})` : ""}`;
  })
  .join("\n")}

Subtotal: ${formatearPrecio(d.subtotal)}
Envio: ${d.envio === 0 ? "Gratis" : formatearPrecio(d.envio)}
Total: ${formatearPrecio(d.total)}

${lineasSuscriptor(d).length > 0 ? `${TEXTOS.suscriptores.etiqueta}\n${lineasSuscriptor(d).join("\n")}\nTu saldo: ${d.sitio}/suscriptores/mi-cuenta\n\n` : ""}Envio a: ${d.cliente.nombre}, ${direccion}${envioCliente(d) ? `\n${envioCliente(d)}` : ""}
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
  // Los datos para la factura, aparte y a la vista: no son los del comprador
  // ni la dirección de entrega.
  const factura = d.facturacion ? lineasDeFacturacion(d.facturacion) : (d.lineasFacturacion ?? null);
  const aCuit = factura?.some((l) => l.startsWith("CUIT:")) ?? false;
  const html = envoltorio(
    `<h1 style="margin:0 0 8px;font-size:22px;font-weight:400;">Venta nueva — ${escaparHtml(d.numero)}</h1>
<p style="margin:0 0 24px;font-size:14px;color:#78756c;">${formatearPrecio(d.total)} · ${escaparHtml(d.cliente.provincia)}${
      d.conDineroMP ? " · dinero en Mercado Pago" : ""
    }</p>
${d.alerta ? `<p style="margin:0 0 24px;padding:12px 14px;border:1px solid #a1281b;color:#a1281b;font-size:14px;line-height:1.6;">${escaparHtml(d.alerta)}</p>` : ""}
${lineaSuscriptorInterna(d) ? `<p style="margin:0 0 24px;padding:12px 14px;background:#004226;color:#ffffff;font-size:14px;line-height:1.6;">${escaparHtml(lineaSuscriptorInterna(d)!)}${d.suscriptor && avisoDevolucionSaldo(d.suscriptor) ? `<br>${escaparHtml(avisoDevolucionSaldo(d.suscriptor)!)}` : ""}</p>` : ""}

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
  ${filasDeItems(d.items, d.sitio)}
</table>

${totales(d.subtotal, d.envio, d.total)}
${d.cupon ? `<p style="margin:8px 0 0;font-size:13px;color:#004226;">Cupón ${escaparHtml(d.cupon)}</p>` : ""}
${
  factura
    ? `
<div style="margin-top:28px;padding:16px;background:#f2f0ec;border:1px solid #e3e0d8;font-size:14px;line-height:1.7;">
  <div style="font-size:11px;letter-spacing:1.6px;text-transform:uppercase;color:#78756c;margin-bottom:6px;">Datos de facturación</div>
  <strong style="font-weight:600;">${escaparHtml(factura[0])}</strong>${factura
    .slice(1)
    .map((l) => `<br>${escaparHtml(l)}`)
    .join("")}
</div>`
    : ""
}

<div style="margin-top:28px;padding-top:20px;border-top:1px solid #e3e0d8;font-size:14px;line-height:1.7;">
  <div style="font-size:11px;letter-spacing:1.6px;text-transform:uppercase;color:#78756c;margin-bottom:6px;">Datos de envío</div>
  ${escaparHtml(d.cliente.nombre)}<br>
  ${escaparHtml(d.cliente.direccion)}<br>
  ${escaparHtml(d.cliente.ciudad)}, ${escaparHtml(d.cliente.provincia)} — CP ${escaparHtml(d.cliente.cp)}<br>
  ${d.cliente.dni ? `DNI ${escaparHtml(d.cliente.dni)} · ` : ""}Tel ${escaparHtml(d.cliente.telefono)}<br>
  ${escaparHtml(d.cliente.email)}${envioInterno(d) ? `<br><br><strong style="font-weight:600;">${escaparHtml(envioInterno(d)!)}</strong>` : ""}
</div>

<p style="margin:24px 0 0;">
  <a href="${escaparHtml(d.pedidoUrl)}" style="display:inline-block;background:#16150f;color:#faf9f6;text-decoration:none;padding:14px 24px;font-size:12px;letter-spacing:1.6px;text-transform:uppercase;">Abrir en Airtable</a>
</p>`,
    d.config
  );

  const texto = `VENTA NUEVA ${d.numero} — ${formatearPrecio(d.total)}${d.conDineroMP ? " (dinero en Mercado Pago)" : ""}
${d.alerta ? `\nREVISAR: ${d.alerta}\n` : ""}${lineaSuscriptorInterna(d) ? `\n${lineaSuscriptorInterna(d)}${d.suscriptor && avisoDevolucionSaldo(d.suscriptor) ? `\n${avisoDevolucionSaldo(d.suscriptor)}` : ""}\n` : ""}
${d.items.map((i) => `- ${i.cantidad}x ${i.nombre} ${i.color} (${i.sku})`).join("\n")}
${d.cupon ? `Cupón ${d.cupon}\n` : ""}
${d.cliente.nombre}
${d.cliente.direccion}, ${d.cliente.ciudad}, ${d.cliente.provincia} - CP ${d.cliente.cp}
${d.cliente.dni ? `DNI ${d.cliente.dni} - ` : ""}Tel ${d.cliente.telefono} - ${d.cliente.email}
${envioInterno(d) ? `${envioInterno(d)}\n` : ""}${factura ? `\nDATOS DE FACTURACIÓN\n${factura.join("\n")}\n` : ""}
Airtable: ${d.pedidoUrl}`;

  return {
    para: d.config.emailPedidos,
    asunto: `${d.alerta ? "REVISAR " : ""}Venta ${d.numero} — ${formatearPrecio(d.total)}${d.suscriptor ? (d.total === 0 ? " · pagada con saldo" : " · suscriptor") : ""}${d.conDineroMP ? " · dinero en Mercado Pago" : ""}${aCuit ? " · factura a CUIT" : ""}`,
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

/**
 * El código para completar los datos de una compra anterior en el checkout
 * (ver lib/reconocer-cliente.ts). Solo el código: ningún dato de la persona.
 */
export function mailCodigoDeAcceso(d: { email: string; codigo: string; config: ConfigTienda }): Envio {
  const html = envoltorio(
    `<h1 style="margin:0 0 8px;font-size:22px;font-weight:400;">Tu código para comprar más rápido</h1>
<p style="margin:0 0 24px;font-size:14px;color:#78756c;line-height:1.6;">
  Escribilo en el checkout de Harper y completamos tus datos de la última compra.
  Vence en 10 minutos.
</p>
<div style="font-size:28px;letter-spacing:8px;padding:16px;background:#f2f0ec;border:1px solid #e3e0d8;text-align:center;">
  ${escaparHtml(d.codigo)}
</div>
<p style="margin:24px 0 0;font-size:12px;color:#78756c;line-height:1.6;">
  Si no lo pediste, ignorá este mail: sin el código nadie ve tus datos.
</p>`,
    d.config
  );

  return {
    para: d.email,
    asunto: `${d.codigo} es tu código de Harper`,
    html,
    texto: `Tu código de Harper: ${d.codigo}\n\nEscribilo en el checkout y completamos tus datos de la última compra. Vence en 10 minutos.\n\nSi no lo pediste, ignorá este mail: sin el código nadie ve tus datos.`,
    responderA: d.config.emailContacto,
  };
}

/**
 * El código para suscribirse o entrar como suscriptor
 * (app/api/suscriptores/codigo). Solo el código: ningún dato de la persona.
 */
export function mailCodigoSuscriptor(d: { email: string; codigo: string; config: ConfigTienda }): Envio {
  const html = envoltorio(
    `<h1 style="margin:0 0 8px;font-size:22px;font-weight:400;">Tu código de Harper</h1>
<p style="margin:0 0 24px;font-size:14px;color:#78756c;line-height:1.6;">
  Escribilo en harper.ar para confirmar tu mail. Vence en 10 minutos.
</p>
<div style="font-size:28px;letter-spacing:8px;padding:16px;background:#f2f0ec;border:1px solid #e3e0d8;text-align:center;">
  ${escaparHtml(d.codigo)}
</div>
<p style="margin:24px 0 0;font-size:12px;color:#78756c;line-height:1.6;">
  Si no lo pediste, ignorá este mail: sin el código no pasa nada.
</p>`,
    d.config
  );

  return {
    para: d.email,
    asunto: `${d.codigo} es tu código de Harper`,
    html,
    texto: `Tu código de Harper: ${d.codigo}\n\nEscribilo en harper.ar para confirmar tu mail. Vence en 10 minutos.\n\nSi no lo pediste, ignorá este mail: sin el código no pasa nada.`,
    responderA: d.config.emailContacto,
  };
}

/** Los beneficios, en el orden y con las palabras de la web (TEXTOS.suscriptores). */
export function beneficiosDeSuscriptor(d: { cuponDisponible: boolean; cuotas: CuotasVerificadas | null }): string[] {
  const { beneficios } = TEXTOS.suscriptores;
  return [
    d.cuponDisponible ? beneficios.cupon(formatearPrecio(CUPON_BIENVENIDA)) : null,
    beneficios.cashback(CASHBACK_PORCENTAJE, DIAS_PARA_USAR_CASHBACK),
    beneficios.envio,
    // Las cuotas, solo si Mercado Pago las confirmó al mandar el mail.
    d.cuotas ? beneficios.cuotas(d.cuotas.cuotas, NOMBRE_MARCAS, d.cuotas.cftea) : null,
  ].filter((l): l is string => l !== null);
}

/**
 * La bienvenida de un suscriptor nuevo (Ale, 03/11/2026): los beneficios,
 * cómo se usan, el enlace a su cuenta y el de la baja.
 */
export function mailBienvenidaSuscriptor(d: {
  email: string;
  nombre: string;
  cuponDisponible: boolean;
  /** Las cuotas de suscriptor verificadas con Mercado Pago; null no las nombra. */
  cuotas: CuotasVerificadas | null;
  sitio: string;
  /** El enlace firmado para darse de baja (lib/suscriptores-sesion.ts). */
  enlaceBaja: string | null;
  config: ConfigTienda;
}): Envio {
  const beneficios = beneficiosDeSuscriptor(d);
  const cuenta = `${d.sitio}/suscriptores/mi-cuenta`;
  const saludo = d.nombre ? `Hola, ${d.nombre.split(" ")[0]}. Desbloqueaste tus beneficios de Harper.` : "Desbloqueaste tus beneficios de Harper.";
  const html = envoltorio(
    `<h1 style="margin:0 0 8px;font-size:22px;font-weight:400;">${escaparHtml(saludo)}</h1>
<p style="margin:0 0 20px;font-size:14px;color:#78756c;line-height:1.6;">Esto es lo que tenés:</p>
<ul style="margin:0 0 20px;padding-left:18px;font-size:14px;line-height:1.7;">
  ${beneficios.map((b) => `<li>${escaparHtml(b)}</li>`).join("\n  ")}
</ul>
<p style="margin:0 0 24px;font-size:14px;line-height:1.6;">${escaparHtml(TEXTOS.suscriptores.comoUsarlos)}</p>
<p style="margin:0 0 24px;">
  <a href="${escaparHtml(cuenta)}" style="display:inline-block;background:#16150f;color:#faf9f6;text-decoration:none;padding:14px 24px;font-size:12px;letter-spacing:1.6px;text-transform:uppercase;">Ver mi cuenta</a>
</p>${
      d.enlaceBaja
        ? `
<p style="margin:0;font-size:12px;color:#78756c;line-height:1.6;">
  Si no querés recibir más nuestros mails, <a href="${escaparHtml(d.enlaceBaja)}" style="color:#78756c;">date de baja acá</a>. También perdés los beneficios.
</p>`
        : ""
    }`,
    d.config
  );

  return {
    para: d.email,
    asunto: "Desbloqueaste tus beneficios de Harper",
    html,
    texto: `${saludo}

Esto es lo que tenés:
${beneficios.map((b) => `- ${b}`).join("\n")}

${TEXTOS.suscriptores.comoUsarlos}

Tu cuenta: ${cuenta}
${d.enlaceBaja ? `\nPara darte de baja (dejás de recibir mails y perdés los beneficios): ${d.enlaceBaja}\n` : ""}
Consultas: ${d.config.emailContacto}`,
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
  /** Por qué no se pudo guardar en Airtable, si no se pudo. */
  errorRegistro?: string;
  /** Qué pasó con el cashback de suscriptor del pedido (lib/arrepentimiento-servidor.ts), si tiene. */
  notaSaldo?: string | null;
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
  const registro = d.errorRegistro
    ? `ATENCIÓN: no se pudo guardar en Airtable (${d.errorRegistro}). Este mail es la constancia de la solicitud.`
    : "Quedó registrada en Airtable, en la tabla Arrepentimientos.";
  const html = envoltorio(
    `<h1 style="margin:0 0 8px;font-size:22px;font-weight:400;">Solicitud de arrepentimiento — ${escaparHtml(d.codigo)}</h1>
<p style="margin:0 0 20px;font-size:14px;color:#78756c;line-height:1.6;">
  Al comprador se le mostró este código en pantalla y se le envía por email. Si ese email falla, te llega otro aviso.
  Contactalo el siguiente día hábil para coordinar el retiro sin cargo y el reintegro. Respondiendo este mail le escribís a él.
</p>
<p style="margin:0 0 20px;font-size:14px;line-height:1.6;${d.errorRegistro ? "color:#a1281b;" : "color:#78756c;"}">${escaparHtml(registro)}</p>${
      d.notaSaldo ? `\n<p style="margin:0 0 20px;font-size:14px;line-height:1.6;">${escaparHtml(d.notaSaldo)}</p>` : ""
    }
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
    asunto: `${d.errorRegistro ? "REVISAR " : ""}Arrepentimiento ${d.codigo} — ${d.solicitud.nombre}`,
    html,
    texto: `SOLICITUD DE ARREPENTIMIENTO ${d.codigo}

${filas.map(([clave, valor]) => `${clave}: ${valor}`).join("\n")}

Al comprador se le mostró el código en pantalla y se le envía por email. Si ese email falla, te llega otro aviso.
Contactalo el siguiente día hábil para coordinar el retiro sin cargo y el reintegro.

${registro}${d.notaSaldo ? `\n\n${d.notaSaldo}` : ""}`,
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
