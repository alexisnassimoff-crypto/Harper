import type { EleccionEnvio, ModoEnvio, ServicioEnvio } from "./tipos";

/**
 * Interpreta la elección de envío que manda el navegador.
 *
 * Acepta solo los códigos válidos de Correo Argentino y **descarta cualquier
 * precio** que venga en el cuerpo. Ese es el punto: el comprador elige entre
 * domicilio y sucursal, clásico y expreso, y el servidor cotiza cuánto sale.
 * Un `envio: { precio: 0 }` mandado a mano no tiene ningún efecto.
 */
export function leerEleccionEnvio(crudo: unknown): EleccionEnvio | undefined {
  if (typeof crudo !== "object" || crudo === null) return undefined;

  const datos = crudo as { modo?: unknown; servicio?: unknown; sucursal?: unknown };

  const modo = datos.modo === "D" || datos.modo === "S" ? (datos.modo as ModoEnvio) : null;
  const servicio =
    datos.servicio === "CP" || datos.servicio === "EP"
      ? (datos.servicio as ServicioEnvio)
      : null;

  if (!modo || !servicio) return undefined;

  const sucursal =
    modo === "S" && typeof datos.sucursal === "string"
      ? datos.sucursal.trim().slice(0, 120)
      : undefined;

  return { modo, servicio, ...(sucursal ? { sucursal } : {}) };
}

/** Cómo se guarda el modo en Airtable, en castellano. */
export function nombreModo(eleccion: EleccionEnvio | undefined) {
  if (!eleccion) return "Domicilio";
  return eleccion.modo === "S" ? "Sucursal" : "Domicilio";
}

/** Cómo se guarda el servicio en Airtable, en castellano. */
export function nombreServicio(eleccion: EleccionEnvio | undefined) {
  if (!eleccion) return "Clasico";
  return eleccion.servicio === "EP" ? "Expreso" : "Clasico";
}
