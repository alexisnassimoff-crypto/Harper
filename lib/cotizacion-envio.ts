import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { ZonaEnvio } from "./envio-gratis";
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
 * Va cifrado y autenticado (AES-256-GCM) con una clave que solo existe en el
 * servidor (ver `claveDeComprobantes` en lib/envia.ts). El navegador no lo
 * puede leer —adentro está con qué transportista se despacha, que el
 * comprador no ve— ni cambiar: cualquier cambio lo invalida, y entonces el
 * checkout cotiza de nuevo.
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
  /** "amba" si a ese destino llega el reparto de 24 h: decide el envío gratis desde el umbral de AMBA. */
  zona: ZonaEnvio;
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

/** La clave de AES-256: siempre 32 bytes, sea cual sea la que se reciba. */
function claveDeCifrado(clave: Buffer) {
  return createHash("sha256").update(clave).update("harper:comprobante-cifrado").digest();
}

export function firmarComprobante(datos: DatosComprobante, clave: Buffer): string {
  const iv = randomBytes(12);
  const cifrador = createCipheriv("aes-256-gcm", claveDeCifrado(clave), iv);
  const cifrado = Buffer.concat([cifrador.update(JSON.stringify(datos), "utf8"), cifrador.final()]);
  return [iv, cifrado, cifrador.getAuthTag()].map((b) => b.toString("base64url")).join(".");
}

/**
 * El comprobante, si es auténtico, no venció y es del mismo entorno; si no,
 * null. Nunca tira: un comprobante roto es como no tener ninguno.
 */
export function leerComprobante(
  token: unknown,
  clave: Buffer,
  esperado: { entorno: string; ahora?: number }
): DatosComprobante | null {
  if (typeof token !== "string" || token.length > 4_000) return null;
  const partes = token.split(".");
  if (partes.length !== 3 || partes.some((p) => !p)) return null;

  try {
    const [iv, cifrado, etiqueta] = partes.map((p) => Buffer.from(p, "base64url"));
    if (iv.length !== 12 || etiqueta.length !== 16) return null;
    const descifrador = createDecipheriv("aes-256-gcm", claveDeCifrado(clave), iv);
    descifrador.setAuthTag(etiqueta);
    const texto = Buffer.concat([descifrador.update(cifrado), descifrador.final()]).toString("utf8");
    const datos = JSON.parse(texto) as DatosComprobante;
    if (datos?.v !== 1 || typeof datos.exp !== "number" || typeof datos.bonificado !== "boolean") return null;
    if (datos.zona !== "amba" && datos.zona !== "resto") return null;
    if (datos.exp <= (esperado.ahora ?? Date.now())) return null;
    if (datos.entorno !== esperado.entorno) return null;
    const o = datos.opcion;
    if (!o || typeof o.id !== "string" || !(o.precio >= 0) || !(o.costo >= 0)) return null;
    return datos;
  } catch {
    // Firma que no coincide (cambiaron algo o es de otra clave) o basura.
    return null;
  }
}
