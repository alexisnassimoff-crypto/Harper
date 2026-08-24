import crypto from "node:crypto";
import type { ItemResuelto, DatosCliente } from "./tipos";
import { esUrlPublica } from "./sitio";

const API = "https://api.mercadopago.com";

/** Horas que sigue viva una preferencia antes de vencer. */
const HORAS_DE_VIDA = 24;

/** Tolerancia antes de avisar que una notificación llegó vieja. */
const SEGUNDOS_SOSPECHOSOS = 15 * 60;

function token() {
  const valor = process.env.MP_ACCESS_TOKEN;
  if (!valor) throw new Error("Falta la variable de entorno MP_ACCESS_TOKEN");
  return valor;
}

export function mercadoPagoConfigurado() {
  return Boolean(process.env.MP_ACCESS_TOKEN);
}

/**
 * Verdadero solo si el cobro puede funcionar de punta a punta.
 *
 * Con el token pero sin el secreto se cobra la plata y el webhook rechaza
 * TODAS las notificaciones con 401: ningún pedido pasa a "pagado", ningún
 * mail sale y ningún stock baja. Es el modo de fallar más caro que tiene
 * esta tienda, así que `/api/health` mira las dos variables, no una.
 */
export function mercadoPagoListo() {
  return Boolean(process.env.MP_ACCESS_TOKEN && process.env.MP_WEBHOOK_SECRET);
}

export type Preferencia = {
  id: string;
  init_point: string;
  sandbox_init_point?: string;
};

/**
 * Mercado Pago pide las fechas como yyyy-MM-dd'T'HH:mm:ss.SSS con offset
 * explícito; un `Z` de `toISOString()` no le sirve. Argentina no tiene
 * horario de verano, así que -03:00 es constante.
 */
function fechaMP(fecha: Date) {
  const enHoraLocal = new Date(fecha.getTime() - 3 * 60 * 60 * 1000);
  return `${enHoraLocal.toISOString().slice(0, 23)}-03:00`;
}

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

  const ahora = new Date();
  const publica = esUrlPublica(opciones.sitio);

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
    // Mercado Pago rechaza la preferencia entera si pedimos `auto_return` con
    // una `back_url` que no sea pública. En un preview o en local se omite.
    ...(publica ? { auto_return: "approved" } : {}),
    // Solo tarjeta y dinero en cuenta: el pago se aprueba o se rechaza en el
    // momento y nunca queda un pedido esperando días una acreditación.
    binary_mode: true,
    payment_methods: {
      excluded_payment_types: [{ id: "ticket" }, { id: "atm" }],
      installments: 12,
    },
    // Sin esto la preferencia vive para siempre y un link viejo sigue cobrando
    // un precio que ya cambió. Se manda solo la fecha de fin: un
    // `expiration_date_from` clavado en "ahora" corre el riesgo de que Mercado
    // Pago lo lea como "todavía no válida" si los relojes no coinciden.
    expires: true,
    expiration_date_to: fechaMP(new Date(ahora.getTime() + HORAS_DE_VIDA * 3600_000)),
    notification_url: `${opciones.sitio}/api/mercadopago/webhook`,
    statement_descriptor: "HARPER",
    metadata: { numero_pedido: opciones.numeroPedido },
  };

  const respuesta = await fetch(`${API}/checkout/preferences`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
      // Un doble click no puede generar dos preferencias para el mismo pedido.
      "X-Idempotency-Key": opciones.pedidoId,
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
 * Mercado Pago manda `x-signature: ts=...,v1=...`. El manifiesto que se firma
 * es `id:{dataId};request-id:{requestId};ts:{ts};` con HMAC-SHA256 y el secreto
 * del panel. Si no hay secreto configurado, devuelve false: preferimos rechazar
 * antes que aceptar notificaciones sin verificar.
 *
 * Dos detalles que Mercado Pago documenta y son fáciles de pasar por alto:
 *
 *  - Un valor ausente se QUITA del template, no se deja vacío. Armar siempre
 *    `request-id:;` hacía que la firma no validara nunca cuando la
 *    notificación llegaba sin ese header, y el webhook devolvía 401 para
 *    siempre sobre una venta ya cobrada.
 *  - El `id` que se firma es el del query string, en minúsculas.
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

  const segmentos = [`id:${opciones.dataId.toLowerCase()};`];
  if (opciones.requestId) segmentos.push(`request-id:${opciones.requestId};`);
  segmentos.push(`ts:${ts};`);

  const esperada = crypto
    .createHmac("sha256", secreto)
    .update(segmentos.join(""))
    .digest("hex");

  const a = Buffer.from(esperada, "utf8");
  const b = Buffer.from(v1, "utf8");

  // Comparación en tiempo constante: evita filtrar la firma por temporización.
  const coincide = a.length === b.length && crypto.timingSafeEqual(a, b);

  // La antigüedad se avisa pero no se rechaza. Un reenvío no puede inventar una
  // venta —el pago se re-consulta a Mercado Pago y la idempotencia frena el
  // duplicado—, mientras que rechazar por un reloj desfasado sí perdería una
  // venta real.
  if (coincide) {
    // El `ts` llega unas veces en segundos y otras en milisegundos.
    const crudo = Number(ts);
    const enSegundos = crudo > 1e12 ? crudo / 1000 : crudo;
    const edad = Math.abs(Date.now() / 1000 - enSegundos);
    if (Number.isFinite(edad) && edad > SEGUNDOS_SOSPECHOSOS) {
      console.warn(`[mercadopago] notificación firmada hace ${Math.round(edad)}s`);
    }
  }

  return coincide;
}
