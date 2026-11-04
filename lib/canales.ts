/**
 * Por dónde llega la gente a la tienda (Ale, 04/11/2026: «ver por dónde
 * vienen los compradores: TikTok, Meta, Google, Mercado Libre o nativos»).
 *
 * El canal es una categoría, no un dato de nadie: sale de la dirección con la
 * que entra (utm_source, o el identificador de clic que agregan los anuncios)
 * o, si no trae nada, del sitio que la mandó. Lo usan los contadores sin
 * cookies (lib/medir.ts) y el panel, para los pedidos que guardaron su
 * campaña con el sí a las cookies (lib/panel-datos.ts).
 *
 * Para que Mercado Libre se vea, los enlaces o el QR que lleven de Mercado
 * Libre a la web tienen que tener `?utm_source=mercadolibre`: desde la app de
 * Mercado Libre casi nunca llega el sitio de origen.
 */

export const CANALES = ["meta", "google", "tiktok", "mercadolibre", "whatsapp", "mail", "otros", "directo", "sin_dato"] as const;
export type Canal = (typeof CANALES)[number];

export const NOMBRE_DEL_CANAL: Record<Canal, string> = {
  meta: "Meta (Instagram y Facebook)",
  google: "Google",
  tiktok: "TikTok",
  mercadolibre: "Mercado Libre",
  whatsapp: "WhatsApp",
  mail: "Mails",
  otros: "Otros sitios",
  directo: "Directo (escribieron harper.ar o un favorito)",
  sin_dato: "Sin dato",
};

export function esCanal(valor: unknown): valor is Canal {
  return typeof valor === "string" && (CANALES as readonly string[]).includes(valor);
}

/** El canal según el utm_source (y el utm_medium, para los mails). Null si no lo reconoce como ninguno. */
export function canalDeCampana(fuente: string | null | undefined, medio?: string | null): Canal | null {
  const f = (fuente ?? "").trim().toLowerCase();
  const m = (medio ?? "").trim().toLowerCase();
  if (!f && !m) return null;
  if (/tiktok|^tt$/.test(f)) return "tiktok";
  if (/facebook|instagram|messenger|threads|^(fb|ig|meta|an)$/.test(f)) return "meta";
  if (/google|youtube|^(gads|adwords|yt)$/.test(f)) return "google";
  if (/mercado.?libre|mercado.?livre|^(meli|ml)$/.test(f)) return "mercadolibre";
  if (/whats|^wa$/.test(f)) return "whatsapp";
  if (/mail|newsletter|correo|resend/.test(f) || /^e-?mail$/.test(m)) return "mail";
  return f ? "otros" : null;
}

/** El canal según el sitio que mandó a la persona. Null si es la misma tienda. */
export function canalDeReferencia(referencia: string | null | undefined, hostPropio = "harper.ar"): Canal | null {
  const crudo = (referencia ?? "").trim();
  if (!crudo) return "directo";
  let host: string;
  try {
    host = new URL(crudo).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "otros";
  }
  if (!host) return "directo";
  const propio = hostPropio.toLowerCase().replace(/^www\./, "");
  if (host === propio || host.endsWith(`.${propio}`) || host === "harper.ar" || host.endsWith(".harper.ar")) return null;
  // Las apps de Android mandan «android-app://com.paquete».
  if (/^com\.google\.android\.gm$/.test(host)) return "mail";
  if (/^com\.(instagram|facebook)\./.test(host)) return "meta";
  if (/^com\.(zhiliaoapp\.musically|ss\.android\.ugc)/.test(host)) return "tiktok";
  if (/^com\.google\.android\.(googlequicksearchbox|youtube)/.test(host)) return "google";
  if (/^com\.whatsapp/.test(host)) return "whatsapp";
  if (/^com\.mercadolibre/.test(host)) return "mercadolibre";
  if (/^com\.mercadopago/.test(host)) return "sin_dato";
  // Los webmails antes que Google: mail.google.com no es una búsqueda.
  if (/^(mail\.google\.com|outlook\.(live|office)\.com|mail\.yahoo\.com)$/.test(host)) return "mail";
  if (/(^|\.)(facebook|instagram|messenger)\.com$|(^|\.)fb\.(com|me)$|(^|\.)threads\.net$/.test(host)) return "meta";
  if (/(^|\.)tiktok\.com$/.test(host)) return "tiktok";
  if (/(^|\.)google\.[a-z.]+$|(^|\.)youtube\.com$|(^|\.)googleadservices\.com$|(^|\.)doubleclick\.net$/.test(host)) return "google";
  if (/(^|\.)mercadoli(b|v)re\.com(\.[a-z]{2})?$/.test(host)) return "mercadolibre";
  // Volver de pagar no dice de dónde había llegado.
  if (/(^|\.)mercadopago\.com(\.[a-z]{2})?$/.test(host)) return "sin_dato";
  if (/(^|\.)whatsapp\.com$|^wa\.me$/.test(host)) return "whatsapp";
  return "otros";
}

/**
 * El canal de una visita, al abrir la primera página de la pestaña.
 * `cuentaComoVisita` es falso cuando la pestaña sigue una visita (se abrió
 * desde la misma tienda) o vuelve de pagar: no es una visita nueva.
 */
export function canalDeLaVisita(datos: { search: string; referencia: string; hostPropio: string; ruta: string }): {
  canal: Canal;
  cuentaComoVisita: boolean;
} {
  const params = new URLSearchParams(datos.search);
  const deCampana = canalDeCampana(params.get("utm_source"), params.get("utm_medium"));
  if (deCampana) return { canal: deCampana, cuentaComoVisita: true };
  if (params.get("ttclid")) return { canal: "tiktok", cuentaComoVisita: true };
  if (params.get("fbclid")) return { canal: "meta", cuentaComoVisita: true };
  if (params.get("gclid") || params.get("gbraid") || params.get("wbraid") || params.get("dclid")) return { canal: "google", cuentaComoVisita: true };

  const vuelveDePagar = datos.ruta === "/gracias" || datos.ruta.startsWith("/gracias/");
  const deReferencia = canalDeReferencia(datos.referencia, datos.hostPropio);
  if (deReferencia === null || vuelveDePagar) return { canal: "sin_dato", cuentaComoVisita: false };
  return { canal: deReferencia, cuentaComoVisita: true };
}

/** El canal de un pedido, con lo que guardó de su campaña (solo con el sí a las cookies). */
export function canalDelOrigen(origen: {
  utm_source?: string;
  utm_medium?: string;
  fbclid?: string;
  gclid?: string;
  ttclid?: string;
  referrer?: string;
} | null): Canal {
  if (!origen) return "sin_dato";
  const deCampana = canalDeCampana(origen.utm_source, origen.utm_medium);
  if (deCampana) return deCampana;
  if (origen.ttclid) return "tiktok";
  if (origen.fbclid) return "meta";
  if (origen.gclid) return "google";
  if (origen.referrer) return canalDeReferencia(origen.referrer) ?? "sin_dato";
  return "sin_dato";
}
