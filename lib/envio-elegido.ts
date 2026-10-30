import type { EleccionEnvio } from "./tipos";

/**
 * Interpreta la elección de envío que manda el navegador: el id de la opción
 * ("domicilio") y el comprobante firmado de esa cotización.
 *
 * **Descarta cualquier precio** que venga en el cuerpo. Ese es el punto: el
 * comprador elige el envío y el servidor decide cuánto sale, con el
 * comprobante que él mismo firmó o cotizando de nuevo. Un
 * `envio: { precio: 0 }` mandado a mano no tiene ningún efecto, y un
 * comprobante tocado no pasa la firma (ver lib/cotizacion-envio.ts).
 */
export function leerEleccionEnvio(crudo: unknown): EleccionEnvio | undefined {
  if (typeof crudo !== "object" || crudo === null) return undefined;

  const datos = crudo as { id?: unknown; comprobante?: unknown };

  const id = typeof datos.id === "string" && /^[A-Za-z][A-Za-z0-9_]{0,40}(?::[A-Za-z0-9_\-]{1,60})?$/.test(datos.id) ? datos.id : undefined;
  const comprobante =
    typeof datos.comprobante === "string" && datos.comprobante.length <= 4_000 && /^[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+$/.test(datos.comprobante)
      ? datos.comprobante
      : undefined;

  if (!id && !comprobante) return undefined;
  return { ...(id ? { id } : {}), ...(comprobante ? { comprobante } : {}) };
}
