/**
 * URL pública del sitio.
 *
 * Importa más de lo que parece: es la base de las `back_urls` y del
 * `notification_url` que se le mandan a Mercado Pago. Con `auto_return`
 * activado, MP EXIGE que `back_urls.success` sea una URL pública válida y
 * rechaza la preferencia entera si no lo es. Caer al origin del request
 * significaba mandarle a MP la URL de un preview de Vercel —o
 * `http://localhost:3000` en local— y comerse el rechazo.
 *
 * Orden de preferencia:
 *   1. NEXT_PUBLIC_SITE_URL   -> lo que Ale carga en Vercel. Manda siempre.
 *   2. VERCEL_PROJECT_PRODUCTION_URL -> el dominio de producción del proyecto,
 *      que Vercel inyecta solo. Sirve de red si la variable de arriba falta.
 *   3. El origin del request   -> último recurso para que en local algo funcione.
 */
export function urlDelSitio(request?: Request) {
  const declarada = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (declarada) return sinBarraFinal(declarada);

  const produccion = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (produccion) return `https://${sinBarraFinal(produccion)}`;

  if (request) return sinBarraFinal(new URL(request.url).origin);

  return "https://harper.ar";
}

/** Verdadero si la URL sirve para que Mercado Pago vuelva al sitio. */
export function esUrlPublica(sitio: string) {
  return sitio.startsWith("https://") && !sitio.includes("localhost");
}

function sinBarraFinal(valor: string) {
  return valor.replace(/\/+$/, "");
}
