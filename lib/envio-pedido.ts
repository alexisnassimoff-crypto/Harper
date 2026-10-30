import { precio as formatearPrecio, precioConCentavos } from "./formato";
import type { DatosCliente, EnvioDelPedido } from "./tipos";

/**
 * Cómo queda el envío en la tabla Pedidos.
 *
 * `Envio` sigue siendo lo COBRADO (0 con envío gratis), así `Total =
 * Subtotal + Envio` vale siempre para los mails y el webhook. Los campos
 * nuevos guardan lo que hace falta para despachar y para la cuenta de Harper:
 * el transportista, el servicio, el costo real (aunque el comprador no lo
 * pague), el plazo y la copia de la cotización, sin datos personales, para
 * generar la etiqueta más adelante con exactamente lo mismo.
 */

/** Los campos nuevos de Pedidos. Si Airtable no tiene alguno, el checkout lo saca y el envío va también a Notas (ver `notaDeEnvio`). */
export const CAMPOS_ENVIO_NUEVOS = [
  "Envio_transportista",
  "Envio_servicio_codigo",
  "Envio_costo_real",
  "Envio_bonificado",
  "Envio_plazo",
  "Envio_cotizado_en",
  "Envio_cotizacion",
  "Direccion_calle",
  "Direccion_numero",
  "Direccion_piso",
] as const;

export function camposDeEnvio(envio: EnvioDelPedido, cliente: Pick<DatosCliente, "calle" | "numero" | "piso">) {
  const opcion = envio.opcion;
  return {
    Envio_transportista: opcion ? opcion.transportistaNombre : "Tarifa plana (sin cotizar)",
    Envio_servicio_codigo: opcion?.id ?? "",
    ...(opcion ? { Envio_costo_real: opcion.costo } : {}),
    Envio_bonificado: envio.bonificado,
    Envio_plazo: opcion?.plazo ?? "",
    ...(envio.cotizadoEn ? { Envio_cotizado_en: envio.cotizadoEn } : {}),
    Envio_cotizacion: envio.cotizacion ? JSON.stringify(envio.cotizacion, null, 2) : "",
    ...(cliente.calle ? { Direccion_calle: cliente.calle } : {}),
    ...(cliente.numero ? { Direccion_numero: cliente.numero } : {}),
    ...(cliente.piso ? { Direccion_piso: cliente.piso } : {}),
  };
}

/** Lo mismo en texto, para Notas, si a Pedidos le falta alguno de los campos. */
export function notaDeEnvio(envio: EnvioDelPedido): string {
  const opcion = envio.opcion;
  if (!opcion) return `Envío: tarifa plana ${envio.cobrado === 0 ? "(gratis)" : formatearPrecio(envio.cobrado)}, sin cotizar.`;
  return [
    `Envío: ${opcion.transportistaNombre} (${opcion.id})`,
    `Costo real: ${precioConCentavos(opcion.costo)}${envio.bonificado ? " · envío gratis: lo paga Harper" : ""}`,
    opcion.plazo ? `Plazo: ${opcion.plazo}` : null,
    envio.cotizadoEn ? `Cotizado: ${envio.cotizadoEn}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * El renglón del envío en la preferencia de Mercado Pago. Sin el
 * transportista: el comprador no sabe con quién despachamos.
 */
export const DESCRIPCION_ENVIO = "Envío a domicilio";
