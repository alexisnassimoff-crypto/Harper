/**
 * Versión de los Términos y condiciones publicados.
 *
 * Es la fecha de la última modificación de app/legales/terminos/page.tsx, y
 * la página la muestra. Cada pedido guarda la versión que la persona aceptó
 * en el checkout y cuándo (Pedidos.Terminos_aceptados). Al publicar otra
 * versión de los Términos, se cambia esta fecha en el mismo commit.
 */
// 2026-11-18 (Ale): las condiciones de compra son las mismas para todos. Hasta
// 3 cuotas; el 10 % por dinero en Mercado Pago sin cupón ni saldo de por medio;
// la regla del envío gratis con los mínimos de Config, contados a precio de
// lista; la cláusula del Dúo, que se publica solo con HARPER_DUO_ACTIVO=1; y la
// sección de la cuenta y las novedades en lugar de la de Suscriptores Harper,
// cuyos beneficios en plata terminaron. Cada pedido guarda la versión aceptada:
// por eso la fecha cambia junto con el texto.
export const VERSION_TERMINOS = "2026-11-18";

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

/**
 * Versión de las condiciones de la cuenta Harper y de los mails de novedades
 * (app/legales/suscriptores/page.tsx; nacieron el 03/11/2026 como las de
 * Suscriptores Harper, y la constante conserva ese nombre porque la usan el
 * alta y los datos de prueba). Cada alta guarda la que aceptó en
 * Suscriptores.Version_condiciones. Al publicar otras condiciones, se cambia
 * esta fecha en el mismo commit.
 */
// 2026-11-18 (Ale): terminaron los beneficios en plata de la suscripción (cupón
// de bienvenida, saldo de vuelta, envío gratis siempre y cuotas propias). Las
// condiciones pasan a ser las de la cuenta (compras, favoritos, datos y
// direcciones) y las de los mails de novedades. El saldo ganado antes de ese
// día se puede seguir usando; no se genera saldo nuevo.
export const VERSION_CONDICIONES_SUSCRIPTORES = "2026-11-18";

/**
 * Versión de las condiciones del Crédito Harper: la sección «Crédito Harper»
 * (#credito) de app/legales/suscriptores/page.tsx, que se publica SOLO con
 * HARPER_CREDITO_ACTIVO=1 y muestra esta fecha. Va aparte de
 * VERSION_CONDICIONES_SUSCRIPTORES (la que guarda cada alta, que no cambia):
 * el texto publicado cambia cuando se prende el interruptor, no cuando alguien
 * abre su cuenta. Al cambiar esas condiciones, se cambia esta fecha en el
 * mismo commit.
 */
// 2026-11-20 (Ale, 18/11/2026): 5 % de lo pagado en dinero por los anteojos
// con un anteojo y 10 % con dos o más; pendiente hasta 30 días después de la
// entrega confirmada; vence a los 6 meses de quedar disponible y se usa primero
// el que vence antes; solo en anteojos, con la cuenta del mail de la compra.
// El mismo día (revisión de textos, 20/11/2026), antes de publicarse: para
// usarlo no hace falta abrir la cuenta ni aceptar las novedades; el aviso de
// vencimiento sale DIAS_AVISO_VENCIMIENTO días antes; y lo usado en una compra
// reembolsada entera vuelve a la cuenta con 6 meses nuevos (lib/credito-uso.ts).
export const VERSION_CONDICIONES_CREDITO = "2026-11-20";
