import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { OpcionEnvio } from "./tipos";

/**
 * El comprobante de una cotización de envío.
 *
 * Envia no da un número de cotización: cada consulta devuelve un precio y
 * listo. Para cobrar exactamente lo que el comprador vio, sin volver a
 * cotizar al pagar (otra consulta, otro precio posible y un "el total cambió"
 * de más), el servidor firma lo que mostró: la opción, el precio, el destino
 * y el carrito, con vencimiento. El checkout lo recibe de vuelta, lo verifica
 * y cobra eso.
 *
 * La firma es HMAC-SHA256 con una clave que solo existe en el servidor (ver
 * `claveDeComprobantes` en lib/envia.ts). El navegador puede leer el
 * comprobante pero no cambiarlo: cualquier cambio rompe la firma, y entonces
 * el checkout cotiza de nuevo.
 */

/** Media hora: lo que tarda alguien en completar el checkout con calma. */
export const VIGENCIA_COMPROBANTE_MS = 30 * 60_000;

export type DatosComprobante = {
  v: 1;
  /** Vencimiento, en ms desde 1970. */
  exp: number;
  /** Huella del destino (CP, provincia y localidad): si cambia, el precio puede cambiar. */
  destino: string;
  /** Huella del carrito (variantes, cantidades y paquete). */
  carrito: string;
  /** "produccion" o "prueba": un comprobante de prueba no sirve en producción. */
  entorno: string;
  /**
   * Si se cotizó con envío gratis (entonces se ofreció solo la más barata).
   * Si al pagar el pedido ya no está en el mismo caso, se cotiza de nuevo.
   */
  bonificado: boolean;
  /** Cuándo se cotizó (ISO). */
  cotizadoEn: string;
  opcion: Omit<OpcionEnvio, "comprobante">;
  /** Lo que devolvió Envia para esa opción, para la copia en el pedido. */
  detalle: Record<string, unknown>;
};

/** Una huella corta y estable de cualquier dato. */
export function huella(dato: unknown): string {
  return createHash("sha256").update(JSON.stringify(dato)).digest("base64url").slice(0, 22);
}

function base64url(texto: string) {
  return Buffer.from(texto, "utf8").toString("base64url");
}

function firma(contenido: string, clave: Buffer) {
  return createHmac("sha256", clave).update(contenido).digest("base64url");
}

export function firmarComprobante(datos: DatosComprobante, clave: Buffer): string {
  const contenido = base64url(JSON.stringify(datos));
  return `${contenido}.${firma(contenido, clave)}`;
}

/**
 * El comprobante, si la firma es válida, no venció y es del mismo entorno;
 * si no, null. Nunca tira: un comprobante roto es como no tener ninguno.
 */
export function leerComprobante(
  token: unknown,
  clave: Buffer,
  esperado: { entorno: string; ahora?: number }
): DatosComprobante | null {
  if (typeof token !== "string" || token.length > 4_000) return null;
  const [contenido, firmado, sobra] = token.split(".");
  if (!contenido || !firmado || sobra !== undefined) return null;

  const esperada = Buffer.from(firma(contenido, clave));
  const recibida = Buffer.from(firmado);
  if (esperada.length !== recibida.length || !timingSafeEqual(esperada, recibida)) return null;

  try {
    const datos = JSON.parse(Buffer.from(contenido, "base64url").toString("utf8")) as DatosComprobante;
    if (datos?.v !== 1 || typeof datos.exp !== "number" || typeof datos.bonificado !== "boolean") return null;
    if (datos.exp <= (esperado.ahora ?? Date.now())) return null;
    if (datos.entorno !== esperado.entorno) return null;
    const o = datos.opcion;
    if (!o || typeof o.id !== "string" || !(o.precio >= 0) || !(o.costo >= 0)) return null;
    return datos;
  } catch {
    return null;
  }
}
