import crypto from "node:crypto";
import type { ItemResuelto, DatosCliente } from "./tipos";

const API = "https://api.mercadopago.com";

function token() {
  const valor = process.env.MP_ACCESS_TOKEN;
  if (!valor) throw new Error("Falta la variable de entorno MP_ACCESS_TOKEN");
  return valor;
}

export function mercadoPagoConfigurado() {
  return Boolean(process.env.MP_ACCESS_TOKEN);
}

export type Preferencia = {
  id: string;
  init_point: string;
  sandbox_init_point?: string;
};

/**
 * Crea la preferencia de pago de Checkout Pro.
 *
 * Los precios se toman de `items`, que ya vienen resueltos contra Airtable:
 * en ningún momento se usa un monto que haya mandado el navegador.
 */
export async function crearPreferencia(opciones: {
  numeroPedido: string;
  pedidoId: string;
  items: ItemResuelto[];
  envio: number;
  cliente: DatosCliente;
  sitio: string;
}): Promise<Preferencia> {
  const items = opciones.items.map((i) => ({
    id: i.sku,
    title: `${i.nombre} — ${i.color}`,
    quantity: i.cantidad,
    unit_price: i.precioUnitario,
    currency_id: "ARS",
    picture_url: i.foto ?? undefined,
  }));

  const cuerpo = {
    items,
    payer: {
      name: opciones.cliente.nombre,
      email: opciones.cliente.email,
      phone: { number: opciones.cliente.telefono },
      identification: { type: "DNI", number: opciones.cliente.dni },
      address: {
        street_name: opciones.cliente.direccion,
        zip_code: opciones.cliente.cp,
      },
    },
    // El envío viaja aparte para que Mercado Pago lo muestre discriminado.
    shipments: {
      cost: opciones.envio,
      mode: "not_specified",
      receiver_address: {
        zip_code: opciones.cliente.cp,
        street_name: opciones.cliente.direccion,
        city_name: opciones.cliente.ciudad,
        state_name: opciones.cliente.provincia,
      },
    },
    // Es la llave con la que el webhook encuentra el pedido en Airtable.
    external_reference: opciones.pedidoId,
    back_urls: {
      success: `${opciones.sitio}/gracias?pedido=${encodeURIComponent(opciones.numeroPedido)}`,
      pending: `${opciones.sitio}/gracias?pedido=${encodeURIComponent(opciones.numeroPedido)}`,
      failure: `${opciones.sitio}/checkout?error=pago`,
    },
    auto_return: "approved",
    notification_url: `${opciones.sitio}/api/mercadopago/webhook`,
    statement_descriptor: "HARPER",
    metadata: { numero_pedido: opciones.numeroPedido },
  };

  const respuesta = await fetch(`${API}/checkout/preferences`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(cuerpo),
    cache: "no-store",
  });

  if (!respuesta.ok) {
    const detalle = await respuesta.text();
    throw new Error(`Mercado Pago ${respuesta.status}: ${detalle}`);
  }

  return respuesta.json() as Promise<Preferencia>;
}

export type PagoMP = {
  id: number;
  status: string;
  status_detail?: string;
  external_reference?: string;
  transaction_amount?: number;
  payer?: { email?: string };
};

/**
 * Consulta el pago directamente contra la API de Mercado Pago.
 *
 * El webhook solo trae un ID: el estado real SIEMPRE se pregunta acá.
 * Confiar en el cuerpo de la notificación permitiría falsificar una venta.
 */
export async function obtenerPago(pagoId: string): Promise<PagoMP> {
  const respuesta = await fetch(`${API}/v1/payments/${pagoId}`, {
    headers: { Authorization: `Bearer ${token()}` },
    cache: "no-store",
  });

  if (!respuesta.ok) {
    const detalle = await respuesta.text();
    throw new Error(`Mercado Pago ${respuesta.status} al leer el pago: ${detalle}`);
  }

  return respuesta.json() as Promise<PagoMP>;
}

/**
 * Valida la firma del webhook.
 *
 * Mercado Pago manda `x-signature: ts=...,v1=...`. El manifiesto que se firma es
 * `id:{dataId};request-id:{requestId};ts:{ts};` con HMAC-SHA256 y el secreto
 * del panel. Si no hay secreto configurado, devuelve false: preferimos rechazar
 * antes que aceptar notificaciones sin verificar.
 */
export function firmaValida(opciones: {
  signature: string | null;
  requestId: string | null;
  dataId: string;
}): boolean {
  const secreto = process.env.MP_WEBHOOK_SECRET;

  if (!secreto || !opciones.signature) return false;

  const partes = new Map<string, string>();
  for (const trozo of opciones.signature.split(",")) {
    const [clave, valor] = trozo.split("=", 2);
    if (clave && valor) partes.set(clave.trim(), valor.trim());
  }

  const ts = partes.get("ts");
  const v1 = partes.get("v1");
  if (!ts || !v1) return false;

  const manifiesto = `id:${opciones.dataId};request-id:${opciones.requestId ?? ""};ts:${ts};`;

  const esperada = crypto
    .createHmac("sha256", secreto)
    .update(manifiesto)
    .digest("hex");

  const a = Buffer.from(esperada, "utf8");
  const b = Buffer.from(v1, "utf8");

  // Comparación en tiempo constante: evita filtrar la firma por temporización.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
