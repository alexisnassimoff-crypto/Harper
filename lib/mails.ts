import type { ConfigTienda } from "./config";
import { precio as formatearPrecio, precioConCentavos } from "./formato";
import { textoPorcentaje } from "./descuentos";
import { plazoParaComprador } from "./envio-gratis";
import type { DatosCliente, ItemResuelto } from "./tipos";
import { caracteristicasDe } from "./caracteristicas";
import { enlaceWhatsApp, mensajeGraduadosPedido, TEXTO_GRADUADOS_PEDIDO } from "./whatsapp";
import { pedidoParaMostrar, TEXTO_PROXIMO_PASO, type SolicitudArrepentimiento } from "./arrepentimiento";
import { lineasDeFacturacion, type FacturacionPedido } from "./facturacion";
import { textoDelRenglon } from "./promocion-anteojos";
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
 * El Dúo de un renglón para Harper, con los pesos que descontó: «Dúo · 25% OFF
 * en 1 de 2 (−$ 22.475)». Le sirve para resolver una devolución a mano. Null
 * si el renglón no lleva el Dúo.
 */
function duoParaHarper(item: ItemResuelto): string | null {
  const texto = textoDelRenglon(item);
  if (!texto) return null;
  const pesos = item.duo?.descuento;
  return typeof pesos === "number" && pesos > 0 ? `${texto} (−${formatearPrecio(pesos)})` : texto;
}

/**
 * Qué se descontó en el renglón, unido con « + »: «5% de descuento + 10% por
 * dinero en Mercado Pago». Vacío si el ítem va a precio de lista.
 *
 * Con el Dúo (Ale, 18/11/2026) dice lo mismo que el carrito, «Dúo · 25% OFF» o
 * «Dúo · 25% OFF en 1 de 2» (textoDelRenglon, lib/promocion-anteojos.ts), y no
 * el porcentaje promedio del renglón («12,5% de descuento»), que no es el de
 * ninguna promoción. El detalle `duo` lo guarda el servidor con el pedido solo
 * si el Dúo estaba prendido y quedó en ese carrito: sin él, el renglón dice lo
 * de siempre y el mail no nombra el Dúo. El porcentaje sale de ese detalle.
 *
 * «Cupón de bienvenida» y «con tu saldo» son de antes del 18/11/2026: un
 * pedido nuevo no lleva cupón (resolverCarrito ya no lo aplica) y lleva saldo
 * solo si la cuenta lo tenía de antes. Quedan porque el mail se arma con los
 * renglones guardados en el pedido, y uno creado antes de ese día se puede
 * confirmar después (un pago que se acredita tarde, o Mercado Pago que
 * reintenta el aviso): explican el precio de ese renglón.
 *
 * `paraHarper`: en el aviso interno, el Dúo va con los pesos que descontó.
 */
function textoDescuento(item: ItemResuelto, paraHarper = false) {
  const duo = paraHarper ? duoParaHarper(item) : textoDelRenglon(item);
  return [
    duo ?? (item.descuento > 0 ? `${textoPorcentaje(item.descuento)}% de descuento` : null),
    item.cupon ? "Cupón de bienvenida" : null,
    item.saldo ? "con tu saldo" : null,
    item.descuentoDineroMP ? `${item.descuentoDineroMP}% por dinero en Mercado Pago` : null,
  ]
    .filter(Boolean)
    .join(" + ");
}

function filasDeItems(items: ItemResuelto[], sitio: string, paraHarper = false) {
  return items
    .map((item) => {
      // El catálogo usa WebP con transparencia, pero Outlook de escritorio no
      // renderiza WebP: en el mail se manda el JPEG equivalente, que siempre
      // existe al lado del WebP y trae el fondo blanco ya incorporado.
      const relativa = (item.foto ?? "").replace(/\.webp$/, ".jpg");
      // Las imágenes en mail necesitan URL absoluta; una relativa no carga.
      const foto = relativa.startsWith("http") ? relativa : `${sitio}${relativa}`;
      const descuento = textoDescuento(item, paraHarper);

      return `<tr>
  <td width="64" style="padding:10px 12px 10px 0;vertical-align:top;">
    ${item.foto ? `<img src="${escaparHtml(foto)}" width="64" height="64" alt="" style="display:block;width:64px;height:64px;object-fit:cover;border:1px solid #e3e0d8;">` : ""}
  </td>
  <td style="padding:10px 0;vertical-align:top;font-size:14px;line-height:1.5;">
    <strong style="font-weight:500;">${escaparHtml(item.nombre)}</strong><br>
    <span style="color:#78756c;">${escaparHtml(item.color)} · ${item.cantidad} ${item.cantidad === 1 ? "unidad" : "unidades"}</span>${
      descuento
        ? `<br><span style="color:#004226;">${escaparHtml(descuento)}</span>`
        : ""
    }
  </td>
  <td align="right" style="padding:10px 0;vertical-align:top;font-size:14px;white-space:nowrap;">
    ${
      descuento
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
  /**
   * Si el pedido lleva algo de la cuenta Harper con la que se compró
   * (lib/suscriptores.ts). De esto los mails cuentan solo el saldo que el
   * pedido usó de verdad.
   */
  suscriptor?: BeneficiosEnElMail | null;
};

/**
 * Lo que un pedido lleva de la cuenta, como lo arman el webhook
 * (lib/webhook-proceso.ts) y el pedido en $ 0 (lib/suscriptores-sin-pago.ts).
 *
 * Ale, 18/11/2026: el cupón de bienvenida, el saldo de vuelta (cashback) y el
 * envío gratis de la suscripción terminaron para todos. Un pedido nuevo trae
 * `cupon` y `cashback` en 0, y los mails ya no los nombran: esos campos siguen
 * en el tipo porque los pasan quienes llaman, con lo que dicen las Notas de un
 * pedido anterior. Lo único que se cuenta es `saldoUsado`: el saldo de antes
 * de ese día que el pedido usó (no había ninguno).
 */
export type BeneficiosEnElMail = {
  email: string;
  /** Pesos del cupón de bienvenida (pedidos anteriores al 18/11/2026); 0 si no lo usó. Los mails no lo leen. */
  cupon: number;
  /** Pesos pagados con el saldo que la cuenta tenía de antes. */
  saldoUsado: number;
  /** Pesos que le volvían como saldo (pedidos anteriores al 18/11/2026). Los mails no lo leen. */
  cashback: number;
  /** "2026-12-03": desde cuándo podía usar ese cashback. Los mails no lo leen. */
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

/** Cómo se nombra la cuenta en los mails de un pedido (Ale, 18/11/2026: ya no «Suscriptores Harper»). */
const TU_CUENTA = "Tu cuenta Harper";

/** Los pesos del pedido pagados con el saldo que la cuenta tenía de antes del 18/11/2026; 0 si no usó. */
function saldoUsadoEn(d: Pick<DatosMail, "suscriptor">): number {
  const usado = d.suscriptor?.saldoUsado ?? 0;
  return usado > 0 ? usado : 0;
}

/**
 * Lo que el mail del comprador dice de su cuenta: solo el saldo que este
 * pedido usó de verdad. Vacío si no usó (hoy, siempre: el 18/11/2026 no había
 * ningún saldo, y no se genera más).
 *
 * Ale, 18/11/2026: terminaron el cupón de bienvenida, el saldo de vuelta y el
 * envío gratis de la suscripción. El mail ya no dice «Usaste tu cupón de
 * bienvenida», «Te vuelven $ X de saldo» ni «Como suscriptor, el envío es
 * gratis.»: el servidor ya no hace nada de eso (y la última frase salía en
 * todo pedido con cuenta, aunque hubiera pagado el envío).
 */
function lineasDelSaldoUsado(d: Pick<DatosMail, "suscriptor">): string[] {
  const usado = saldoUsadoEn(d);
  return usado > 0 ? [`Pagaste ${formatearPrecio(usado)} con tu saldo a favor de compras anteriores.`] : [];
}

/** El bloque de la cuenta en el mail del comprador: solo si el pedido usó saldo. */
function bloqueSaldoUsado(d: DatosMail): string {
  const lineas = lineasDelSaldoUsado(d);
  if (lineas.length === 0) return "";
  return `
<div style="margin-top:28px;padding:20px;background:#004226;color:#ffffff;">
  <div style="font-size:11px;letter-spacing:1.6px;text-transform:uppercase;opacity:0.8;margin-bottom:6px;">${escaparHtml(TU_CUENTA)}</div>
  ${lineas.map((l) => `<p style="margin:0 0 6px;font-size:14px;line-height:1.6;">${escaparHtml(l)}</p>`).join("\n  ")}
  <a href="${escaparHtml(d.sitio)}/suscriptores/mi-cuenta" style="display:inline-block;margin-top:8px;font-size:13px;letter-spacing:0.5px;color:#ffffff;text-decoration:underline;">${escaparHtml(TEXTOS.suscriptores.verCuenta)}</a>
</div>`;
}

/**
 * Para Harper: con qué cuenta se usó saldo y cuánto. Null si el pedido no usó
 * saldo. Desde el 18/11/2026 (Ale) un pedido nuevo no lleva cupón de
 * bienvenida ni cashback: el aviso ya no los nombra, ni marca el pedido como
 * «de suscriptor».
 */
function lineaSaldoInterna(d: Pick<DatosMail, "suscriptor">): string | null {
  const usado = saldoUsadoEn(d);
  return usado > 0 && d.suscriptor ? `Cuenta Harper: ${d.suscriptor.email} · saldo usado −${formatearPrecio(usado)}` : null;
}

/** Lo que Harper tiene que hacer si se devuelve un pedido que usó saldo: devolvérselo a la cuenta. */
const AVISO_DEVOLUCION_SALDO = "Si se devuelve, marcá Anulado en Saldos el Uso de este pedido (así recupera el saldo que usó).";

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
${bloqueSaldoUsado(d)}
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
    // Lo mismo que el HTML (textoDescuento): con el Dúo, lo que dice el
    // carrito; sin él, el porcentaje de siempre. El cupón de bienvenida y el
    // saldo, solo en pedidos que los traen de antes del 18/11/2026.
    const descuento = [
      textoDelRenglon(i) ?? (i.descuento > 0 ? `${textoPorcentaje(i.descuento)}% off` : null),
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

${lineasDelSaldoUsado(d).length > 0 ? `${TU_CUENTA}\n${lineasDelSaldoUsado(d).join("\n")}\nTu cuenta: ${d.sitio}/suscriptores/mi-cuenta\n\n` : ""}Envio a: ${d.cliente.nombre}, ${direccion}${envioCliente(d) ? `\n${envioCliente(d)}` : ""}
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
  // El saldo de antes del 18/11/2026 que el pedido usó, si usó (ver lineaSaldoInterna).
  const saldo = lineaSaldoInterna(d);
  const html = envoltorio(
    `<h1 style="margin:0 0 8px;font-size:22px;font-weight:400;">Venta nueva — ${escaparHtml(d.numero)}</h1>
<p style="margin:0 0 24px;font-size:14px;color:#78756c;">${formatearPrecio(d.total)} · ${escaparHtml(d.cliente.provincia)}${
      d.conDineroMP ? " · dinero en Mercado Pago" : ""
    }</p>
${d.alerta ? `<p style="margin:0 0 24px;padding:12px 14px;border:1px solid #a1281b;color:#a1281b;font-size:14px;line-height:1.6;">${escaparHtml(d.alerta)}</p>` : ""}
${saldo ? `<p style="margin:0 0 24px;padding:12px 14px;background:#004226;color:#ffffff;font-size:14px;line-height:1.6;">${escaparHtml(saldo)}<br>${escaparHtml(AVISO_DEVOLUCION_SALDO)}</p>` : ""}

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
  ${filasDeItems(d.items, d.sitio, true)}
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
${d.alerta ? `\nREVISAR: ${d.alerta}\n` : ""}${saldo ? `\n${saldo}\n${AVISO_DEVOLUCION_SALDO}\n` : ""}
${d.items.map((i) => `- ${i.cantidad}x ${i.nombre} ${i.color} (${i.sku})${duoParaHarper(i) ? ` — ${duoParaHarper(i)}` : ""}`).join("\n")}
${d.cupon ? `Cupón ${d.cupon}\n` : ""}
${d.cliente.nombre}
${d.cliente.direccion}, ${d.cliente.ciudad}, ${d.cliente.provincia} - CP ${d.cliente.cp}
${d.cliente.dni ? `DNI ${d.cliente.dni} - ` : ""}Tel ${d.cliente.telefono} - ${d.cliente.email}
${envioInterno(d) ? `${envioInterno(d)}\n` : ""}${factura ? `\nDATOS DE FACTURACIÓN\n${factura.join("\n")}\n` : ""}
Airtable: ${d.pedidoUrl}`;

  return {
    para: d.config.emailPedidos,
    // « · pagada con saldo» y « · con saldo», solo si el pedido usó saldo de
    // verdad. Antes del 18/11/2026 todo pedido con cuenta salía « · suscriptor»
    // (o « · pagada con saldo» con el total en $ 0, aunque no hubiera usado).
    asunto: `${d.alerta ? "REVISAR " : ""}Venta ${d.numero} — ${formatearPrecio(d.total)}${saldo ? (d.total === 0 ? " · pagada con saldo" : " · con saldo") : ""}${d.conDineroMP ? " · dinero en Mercado Pago" : ""}${aCuit ? " · factura a CUIT" : ""}`,
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
 * El código para suscribirse a las novedades o entrar a la cuenta
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

/** El código para entrar al panel privado (/panel). Solo les llega a los mails autorizados. */
export function mailCodigoPanel(d: { email: string; codigo: string; config: ConfigTienda }): Envio {
  const html = envoltorio(
    `<h1 style="margin:0 0 8px;font-size:22px;font-weight:400;">Tu código para el panel</h1>
<p style="margin:0 0 24px;font-size:14px;color:#78756c;line-height:1.6;">
  Escribilo en harper.ar/panel para entrar. Vence en 10 minutos.
</p>
<div style="font-size:28px;letter-spacing:8px;padding:16px;background:#f2f0ec;border:1px solid #e3e0d8;text-align:center;">
  ${escaparHtml(d.codigo)}
</div>
<p style="margin:24px 0 0;font-size:12px;color:#78756c;line-height:1.6;">
  Si no lo pediste vos, alguien escribió tu mail en el panel: sin el código no puede entrar.
</p>`,
    d.config
  );

  return {
    para: d.email,
    asunto: `${d.codigo} es tu código para el panel de Harper`,
    html,
    texto: `Tu código para el panel de Harper: ${d.codigo}\n\nEscribilo en harper.ar/panel para entrar. Vence en 10 minutos.\n\nSi no lo pediste vos, alguien escribió tu mail en el panel: sin el código no puede entrar.`,
  };
}

/**
 * Lo que da la cuenta Harper, en el orden y con las palabras de la web
 * (TEXTOS.suscriptores.cuentaDa, lo mismo que muestra /suscriptores):
 * «Novedades por mail», «Tus compras», «Tus favoritos» y «Tus datos y
 * direcciones», cada uno con su detalle.
 *
 * Ale, 18/11/2026: reemplaza a la lista de beneficios en plata de la
 * bienvenida (cupón de bienvenida, saldo de vuelta, envío gratis siempre y
 * cuotas propias), que terminaron para todos.
 */
export function loQueDaLaCuenta(): { titulo: string; detalle: string }[] {
  return TEXTOS.suscriptores.cuentaDa.map(({ titulo, detalle }) => ({ titulo, detalle }));
}

/**
 * Los textos propios de la bienvenida. Lo que da la cuenta, el botón y la
 * frase de la baja son los de la web (TEXTOS.suscriptores), para decir lo
 * mismo en los dos lados.
 */
const BIENVENIDA = {
  asunto: "Tu cuenta Harper quedó abierta",
  titulo: "Tu cuenta Harper quedó abierta.",
  bajada: "Te suscribiste a las novedades de Harper. Con ese mismo mail entrás a tu cuenta. Esto es lo que tenés:",
  comoEntrar: "Para entrar, escribí tu mail en harper.ar y te mandamos un código. No hace falta contraseña.",
};

/**
 * La bienvenida de quien se acaba de suscribir (sale una sola vez, con el
 * alta nueva: app/api/suscriptores/confirmar).
 *
 * Ale, 18/11/2026: es la bienvenida a la cuenta Harper y a los mails de
 * novedades. Dice qué da la cuenta, cómo se entra, el enlace a Mi Cuenta y
 * que la baja es solo de los mails de novedades (la cuenta sigue igual). Ya
 * no promete cupón, saldo, envío gratis ni cuotas, que el servidor no da: por
 * eso tampoco recibe el cupón ni las cuotas verificadas con Mercado Pago.
 */
export function mailBienvenidaSuscriptor(d: {
  email: string;
  nombre: string;
  sitio: string;
  /** El enlace firmado para darse de baja de las novedades (lib/suscriptores-sesion.ts). */
  enlaceBaja: string | null;
  config: ConfigTienda;
}): Envio {
  const T = TEXTOS.suscriptores;
  const cuenta = `${d.sitio}/suscriptores/mi-cuenta`;
  const nombre = (d.nombre || "").trim().split(/\s+/)[0];
  const saludo = nombre ? `Hola, ${nombre}. ${BIENVENIDA.titulo}` : BIENVENIDA.titulo;
  const puntos = loQueDaLaCuenta();
  const html = envoltorio(
    `<h1 style="margin:0 0 8px;font-size:22px;font-weight:400;">${escaparHtml(saludo)}</h1>
<p style="margin:0 0 20px;font-size:14px;color:#78756c;line-height:1.6;">${escaparHtml(BIENVENIDA.bajada)}</p>
<ul style="margin:0 0 20px;padding-left:18px;font-size:14px;line-height:1.7;">
  ${puntos.map((p) => `<li><strong style="font-weight:500;">${escaparHtml(p.titulo)}.</strong> ${escaparHtml(p.detalle)}</li>`).join("\n  ")}
</ul>
<p style="margin:0 0 24px;font-size:14px;line-height:1.6;">${escaparHtml(BIENVENIDA.comoEntrar)}</p>
<p style="margin:0 0 24px;">
  <a href="${escaparHtml(cuenta)}" style="display:inline-block;background:#16150f;color:#faf9f6;text-decoration:none;padding:14px 24px;font-size:12px;letter-spacing:1.6px;text-transform:uppercase;">${escaparHtml(T.verCuenta)}</a>
</p>
<p style="margin:0;font-size:12px;color:#78756c;line-height:1.6;">
  ${escaparHtml(T.cuenta.bajaTexto)}
  ${
    d.enlaceBaja
      ? `<a href="${escaparHtml(d.enlaceBaja)}" style="color:#78756c;">${escaparHtml(T.cuenta.baja)}</a>`
      : `Para darte de baja, <a href="${escaparHtml(cuenta)}" style="color:#78756c;">entrá a tu cuenta</a>.`
  }
</p>`,
    d.config
  );

  return {
    para: d.email,
    asunto: BIENVENIDA.asunto,
    html,
    texto: `${saludo}

${BIENVENIDA.bajada}
${puntos.map((p) => `- ${p.titulo}. ${p.detalle}`).join("\n")}

${BIENVENIDA.comoEntrar}

Tu cuenta: ${cuenta}

${T.cuenta.bajaTexto}
${d.enlaceBaja ? `Para darte de baja: ${d.enlaceBaja}` : "Para darte de baja, entrá a tu cuenta."}

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
