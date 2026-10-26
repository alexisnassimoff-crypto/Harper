import crypto from "node:crypto";
import { normalizarOrigen, type Origen } from "./origen";
import { datosDeCompra, idEventoCompra } from "./pixel";
import type { DatosCliente, ItemResuelto } from "./tipos";
import type { VentaConfirmada } from "./webhook-proceso";

/**
 * Conversions API de Meta: la compra confirmada, mandada desde el servidor.
 *
 * El píxel del navegador solo ve la compra si el comprador vuelve a /gracias
 * y el script cargó. El webhook de Mercado Pago, en cambio, sabe con certeza
 * cuándo se cobró: desde ahí se manda el evento Purchase con el mismo
 * `event_id` que usa el píxel, y Meta se queda con uno solo.
 *
 * Variables (en Vercel, nunca en el repo):
 *   NEXT_PUBLIC_META_PIXEL_ID  el píxel (ya existe)
 *   META_CAPI_TOKEN            token de la Conversions API, del Events Manager
 *   META_TEST_EVENT_CODE       opcional: código de "Probar eventos" para ver
 *                              los envíos en el panel sin que cuenten
 *
 * Sin token, no se manda nada y no falla nada.
 */

const VERSION_API = "v21.0";

export function metaCapiConfigurada() {
  return Boolean(process.env.NEXT_PUBLIC_META_PIXEL_ID && process.env.META_CAPI_TOKEN);
}

/** SHA-256 en hexadecimal, como lo pide Meta. */
export function hash(valor: string) {
  return crypto.createHash("sha256").update(valor).digest("hex");
}

function limpio(valor: string | undefined) {
  return (valor ?? "").trim().toLowerCase();
}

/** Quita tildes y símbolos: Meta quiere "ciudad autonoma de buenos aires", no "Ciudad Autónoma…". */
function sinTildes(valor: string) {
  return valor.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, "");
}

/**
 * Teléfono en formato internacional sin símbolos. Un número argentino de 10
 * dígitos (área + número) recibe el 54 adelante; uno que ya lo trae, queda.
 */
export function telefonoParaMeta(valor: string | undefined) {
  const digitos = (valor ?? "").replace(/\D/g, "");
  if (!digitos) return undefined;
  if (digitos.startsWith("54")) return digitos;
  if (digitos.length <= 11) return `54${digitos}`;
  return digitos;
}

/** Nombre y apellido: lo primero y lo último de lo que escribió. */
function partirNombre(nombre: string | undefined) {
  const partes = limpio(nombre).split(/\s+/).filter(Boolean);
  if (partes.length === 0) return { fn: undefined, ln: undefined };
  if (partes.length === 1) return { fn: partes[0], ln: undefined };
  return { fn: partes[0], ln: partes[partes.length - 1] };
}

export type EventoMeta = {
  event_name: string;
  event_time: number;
  event_id: string;
  action_source: "website";
  event_source_url: string;
  user_data: Record<string, string | string[]>;
  custom_data: Record<string, unknown>;
};

/**
 * El evento Purchase, armado a partir del pedido confirmado.
 *
 * Los datos de la persona van hasheados (SHA-256), como exige Meta; `fbp` y
 * `fbc` van tal cual, porque son identificadores del navegador y no de la
 * persona. El valor es el subtotal de productos, sin envío.
 */
export function armarEventoCompra(datos: {
  numero: string;
  items: ItemResuelto[];
  subtotal: number;
  cliente: DatosCliente;
  clienteId?: string;
  origen: Origen | null;
  sitio: string;
  ahora: number;
}): EventoMeta {
  const { fn, ln } = partirNombre(datos.cliente.nombre);
  const telefono = telefonoParaMeta(datos.cliente.telefono);

  const user_data: Record<string, string | string[]> = {};
  const email = limpio(datos.cliente.email);
  if (email) user_data.em = [hash(email)];
  if (telefono) user_data.ph = [hash(telefono)];
  if (fn) user_data.fn = [hash(sinTildes(fn))];
  if (ln) user_data.ln = [hash(sinTildes(ln))];
  const ciudad = sinTildes(limpio(datos.cliente.ciudad)).replace(/\s+/g, "");
  if (ciudad) user_data.ct = [hash(ciudad)];
  const provincia = sinTildes(limpio(datos.cliente.provincia)).replace(/\s+/g, "");
  if (provincia) user_data.st = [hash(provincia)];
  const cp = limpio(datos.cliente.cp).replace(/\s+/g, "");
  if (cp) user_data.zp = [hash(cp)];
  user_data.country = [hash("ar")];
  if (datos.clienteId) user_data.external_id = [hash(datos.clienteId)];
  if (datos.origen?.fbp) user_data.fbp = datos.origen.fbp;
  if (datos.origen?.fbc) user_data.fbc = datos.origen.fbc;

  return {
    event_name: "Purchase",
    event_time: Math.floor(datos.ahora / 1000),
    event_id: idEventoCompra(datos.numero),
    action_source: "website",
    event_source_url: `${datos.sitio}/gracias?pedido=${encodeURIComponent(datos.numero)}`,
    user_data,
    custom_data: {
      ...datosDeCompra({ items: datos.items, valor: datos.subtotal }),
      order_id: datos.numero,
      ...(datos.origen?.utm_campaign ? { campaign: datos.origen.utm_campaign } : {}),
    },
  };
}

export type RespuestaCapi = { ok: boolean; status: number; cuerpo: string };

/**
 * Manda eventos a la Conversions API.
 *
 * Nunca tira: devuelve el resultado para que el webhook lo loguee. Un fallo
 * acá jamás puede afectar la confirmación de una venta ya cobrada.
 */
export async function enviarEventosAMeta(
  eventos: EventoMeta[],
  fetchImpl: typeof fetch = fetch
): Promise<RespuestaCapi> {
  const pixel = process.env.NEXT_PUBLIC_META_PIXEL_ID;
  const token = process.env.META_CAPI_TOKEN;

  if (!pixel || !token) return { ok: false, status: 0, cuerpo: "META_CAPI_TOKEN no configurado" };

  const cuerpo: Record<string, unknown> = { data: eventos };
  const codigoPrueba = process.env.META_TEST_EVENT_CODE?.trim();
  if (codigoPrueba) cuerpo.test_event_code = codigoPrueba;

  try {
    const respuesta = await fetchImpl(
      `https://graph.facebook.com/${VERSION_API}/${encodeURIComponent(pixel)}/events?access_token=${encodeURIComponent(token)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo),
        signal: AbortSignal.timeout(8000),
      }
    );

    return { ok: respuesta.ok, status: respuesta.status, cuerpo: await respuesta.text() };
  } catch (error) {
    return { ok: false, status: 0, cuerpo: (error as Error).message };
  }
}

/**
 * La compra confirmada, a Meta por la Conversions API: la usan el webhook de
 * Mercado Pago y la confirmación de una transferencia. Mismo event_id que el
 * píxel de /gracias: Meta se queda con uno. Si el webhook retoma un pedido
 * tras una caída y lo manda de nuevo, Meta también lo deduplica. Best-effort:
 * un fallo acá se loguea y no toca la venta.
 */
export async function avisarCompraAMeta(venta: VentaConfirmada) {
  if (!metaCapiConfigurada()) return;

  let origen = null;
  try {
    origen = venta.origenCrudo ? normalizarOrigen(JSON.parse(venta.origenCrudo)) : null;
  } catch {
    // Un Origen ilegible no impide mandar la compra.
  }

  // Solo si la persona aceptó las cookies de medición y publicidad al
  // comprar (lo marca el checkout en el Origen del pedido). Sin ese "sí",
  // Meta no se entera de la compra.
  if (origen?.publicidad !== true) return;

  const evento = armarEventoCompra({
    numero: venta.numero,
    items: venta.items,
    subtotal: venta.subtotal,
    cliente: venta.cliente,
    clienteId: venta.clienteId,
    origen,
    sitio: venta.sitio,
    ahora: Date.now(),
  });

  const respuesta = await enviarEventosAMeta([evento]);

  if (!respuesta.ok) {
    console.error(`[meta] no se pudo mandar la compra ${venta.numero}: ${respuesta.status} ${respuesta.cuerpo}`);
  }
}
