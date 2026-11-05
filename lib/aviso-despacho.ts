import crypto from "node:crypto";
import { getRecord, TABLAS, updateRecord } from "./airtable";
import { cerrojoDesdeEntorno, ErrorCerrojo, soltarSinFallar, type Cerrojo } from "./cerrojo";
import { getConfig } from "./config";
import { enviarMailConDetalle, mailEnviado, type DatosMail } from "./mails";
import type { DatosCliente, ItemResuelto } from "./tipos";

/**
 * El mail «Tu pedido está en camino» (Ale, 05/11/2026). Lo pide
 * POST /api/pedidos/notificar-envio, que dispara la automatización de Airtable
 * cuando un pedido queda en «enviado» y con Tracking.
 *
 *  - Sale solo con el pedido en «enviado» y con el número de seguimiento
 *    cargado. Crear la etiqueta (importar-envio deja el pedido en
 *    «preparando», a veces ya con Tracking) no avisa nada.
 *  - Sale una sola vez por pedido, aunque la automatización se dispare de
 *    nuevo (alguien pasa el pedido a «preparando» y otra vez a «enviado»,
 *    borra y vuelve a escribir el Tracking, o dos corridas a la vez). Dos
 *    marcas: una llave en Redis que se toma ANTES de mandar (dos corridas a
 *    la vez: manda una sola) y un renglón en Notas del pedido DESPUÉS de
 *    mandar, que queda para siempre y Ale puede ver.
 *  - No cambia el Estado: «enviado» lo pone quien despacha y «entregado»,
 *    quien sabe que llegó. Acá no se inventa ninguno.
 */

/** El renglón que deja en Notas. Con él, el pedido ya no vuelve a avisar. */
export const MARCA_AVISO = "Aviso de despacho enviado";

export const claveAviso = (pedidoId: string) => `harper:aviso-despacho:${pedidoId}`;

/**
 * Cuánto recuerda Redis que el aviso ya salió. Cubre que Airtable falle al
 * anotar en Notas justo después de mandar: si la automatización se dispara de
 * nuevo en esos 30 días, no sale otro mail. Después queda la marca de Notas.
 */
export const TTL_AVISO_MS = 30 * 24 * 60 * 60_000;

export type FilaPedidoAviso = {
  Numero?: string;
  Estado?: string;
  Cliente?: string[];
  Items?: string;
  Subtotal?: number;
  Envio?: number;
  Total?: number;
  Direccion?: string;
  Ciudad?: string;
  Provincia?: string;
  CP?: string;
  Tracking?: string;
  Notas?: string;
};

type FilaCliente = { Email?: string; Nombre?: string; Telefono?: string; DNI?: string };

/** ¿Ya hay en Notas un renglón del aviso? */
export function avisoYaEnviado(notas: unknown): boolean {
  return typeof notas === "string" && notas.split("\n").some((renglon) => renglon.trim().startsWith(MARCA_AVISO));
}

const FECHA_AR = new Intl.DateTimeFormat("es-AR", {
  timeZone: "America/Argentina/Buenos_Aires",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** «Aviso de despacho enviado: 05/11/2026, 14:03 (seguimiento CA123456789AR)». */
export function renglonDeAviso(fecha: Date, tracking: string) {
  return `${MARCA_AVISO}: ${FECHA_AR.format(fecha)} (seguimiento ${tracking})`;
}

export type MotivoSinAviso =
  /** Todavía no está «enviado» (o ya está «entregado» o cancelado): no se avisa. */
  | "no-enviado"
  /** Está «enviado» pero falta el número de seguimiento: se avisa cuando se cargue. */
  | "sin-tracking"
  /** Notas ya dice que el aviso salió. */
  | "ya-avisado"
  /** Otra corrida tomó la llave: ya mandó el aviso o lo está mandando. */
  | "en-otra-corrida";

/** Por qué este pedido no lleva el aviso ahora, o null si lo lleva. */
export function porQueNoAvisar(fila: FilaPedidoAviso): MotivoSinAviso | null {
  if (avisoYaEnviado(fila.Notas)) return "ya-avisado";
  if (fila.Estado !== "enviado") return "no-enviado";
  if (!fila.Tracking?.trim()) return "sin-tracking";
  return null;
}

export type ResultadoAviso =
  | { estado: "enviado"; numero: string; para: string; tracking: string; anotado: boolean }
  | { estado: "omitido"; motivo: MotivoSinAviso }
  | { estado: "sin-mail" }
  | { estado: "fallo-mail"; error: string };

type MandarMail = (envio: ReturnType<typeof mailEnviado>) => Promise<{ ok: true } | { ok: false; error: string }>;

export type OpcionesAviso = {
  /** La URL del sitio, para los enlaces del mail. */
  sitio: string;
  /** El cerrojo de Redis. Sin pasarlo, el de las variables de Vercel; null = sin Redis (no se manda). */
  cerrojo?: Cerrojo | null;
  mandar?: MandarMail;
  ahora?: () => Date;
};

/**
 * Manda el aviso de despacho de ese pedido si corresponde, una sola vez.
 * Sin Redis (sin configurar o sin contestar) sube `ErrorCerrojo`: sin poder
 * asegurar que es la única corrida, no se manda (se reintenta después).
 */
export async function avisarDespacho(pedidoId: string, opciones: OpcionesAviso): Promise<ResultadoAviso> {
  const pedido = await getRecord<FilaPedidoAviso>(TABLAS.pedidos, pedidoId);
  const motivo = porQueNoAvisar(pedido.fields);
  if (motivo) return { estado: "omitido", motivo };

  const tracking = pedido.fields.Tracking!.trim();
  const numero = pedido.fields.Numero ?? pedidoId;
  const clienteId = pedido.fields.Cliente?.[0];
  const cliente = clienteId ? await getRecord<FilaCliente>(TABLAS.clientes, clienteId) : null;
  const email = cliente?.fields.Email?.trim();
  if (!email) return { estado: "sin-mail" };

  const cerrojo = opciones.cerrojo === undefined ? cerrojoDesdeEntorno() : opciones.cerrojo;
  const clave = claveAviso(pedidoId);
  const nonce = crypto.randomUUID();

  // Sin Redis no se puede asegurar que es la única corrida: no se manda, y el
  // error es transitorio (la ruta contesta 503 y se reintenta después).
  if (!cerrojo) throw new ErrorCerrojo("Redis sin configurar: no se manda el aviso sin la llave");

  // Se toma antes de mandar y, si el mail sale, no se suelta: vence sola.
  if (!(await cerrojo.tomar(clave, nonce, TTL_AVISO_MS))) return { estado: "omitido", motivo: "en-otra-corrida" };

  let envio: { ok: true } | { ok: false; error: string };

  try {
    const datos: DatosMail & { tracking: string } = {
      numero,
      items: itemsDe(pedido.fields.Items),
      subtotal: pedido.fields.Subtotal ?? 0,
      envio: pedido.fields.Envio ?? 0,
      total: pedido.fields.Total ?? 0,
      cliente: clienteDelMail(email, cliente!.fields, pedido.fields),
      config: await getConfig(),
      sitio: opciones.sitio,
      tracking,
    };
    envio = await (opciones.mandar ?? enviarMailConDetalle)(mailEnviado(datos));
  } catch (error) {
    envio = { ok: false, error: error instanceof Error ? error.message : String(error) };
  }

  if (!envio.ok) {
    // No salió: se suelta la llave para que el próximo intento pueda mandarlo.
    if (cerrojo) await soltarSinFallar(cerrojo, clave, nonce);
    return { estado: "fallo-mail", error: envio.error };
  }

  // La constancia en Notas, releída para no pisar lo que se haya escrito
  // mientras salía el mail. Si falla, el mail ya salió: la llave de Redis
  // sigue tomada y evita otro aviso.
  let anotado = true;
  try {
    const fresca = await getRecord<FilaPedidoAviso>(TABLAS.pedidos, pedidoId);
    const notas = [fresca.fields.Notas?.trim(), renglonDeAviso((opciones.ahora ?? (() => new Date()))(), tracking)].filter(Boolean).join("\n");
    await updateRecord<FilaPedidoAviso>(TABLAS.pedidos, pedidoId, { Notas: notas });
  } catch (error) {
    anotado = false;
    console.error(`[aviso-despacho] el mail de ${numero} salió pero no se pudo anotar en Notas:`, error);
  }

  return { estado: "enviado", numero, para: email, tracking, anotado };
}

function itemsDe(json: string | undefined): ItemResuelto[] {
  try {
    const items: unknown = JSON.parse(json ?? "[]");
    return Array.isArray(items) ? (items as ItemResuelto[]) : [];
  } catch {
    return [];
  }
}

function clienteDelMail(email: string, cliente: FilaCliente, pedido: FilaPedidoAviso): DatosCliente {
  return {
    email,
    nombre: cliente.Nombre ?? "",
    telefono: cliente.Telefono ?? "",
    dni: cliente.DNI ?? "",
    direccion: pedido.Direccion ?? "",
    ciudad: pedido.Ciudad ?? "",
    provincia: pedido.Provincia ?? "",
    cp: pedido.CP ?? "",
    aceptaPromos: false,
  };
}
