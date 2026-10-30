/**
 * Versión de los Términos y condiciones publicados.
 *
 * Es la fecha de la última modificación de app/legales/terminos/page.tsx, y
 * la página la muestra. Cada pedido guarda la versión que la persona aceptó
 * en el checkout y cuándo (Pedidos.Terminos_aceptados). Al publicar otra
 * versión de los Términos, se cambia esta fecha en el mismo commit.
 */
export const VERSION_TERMINOS = "2026-10-30";

/** "22 de octubre de 2026", para mostrar en la página. */
export function versionTerminosLegible(version = VERSION_TERMINOS): string {
  const [anio, mes, dia] = version.split("-").map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia, 12));
  return fecha.toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/**
 * Lo que se guarda en el pedido: la versión aceptada y el momento exacto de
 * la aceptación, en UTC. Ejemplo: "Versión 2026-10-22 · 2026-10-25T14:03:12.345Z".
 */
export function registroAceptacion(momento: Date, version = VERSION_TERMINOS): string {
  return `Versión ${version} · ${momento.toISOString()}`;
}
