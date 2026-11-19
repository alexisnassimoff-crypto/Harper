import type { CuotasVerificadas } from "./cuotas";
import { precio } from "./formato";
import { TEXTOS } from "./textos";
import type { OpcionEnvio } from "./tipos";

/**
 * El envío gratis por zona y los textos del envío para el comprador. Sin
 * nada del servidor: lo usan el checkout, el carrito y el panel lateral.
 *
 * Dos mínimos, los dos de Config y medidos sobre la misma base que el
 * servidor (`subtotalSinCupon`: sin el cupón y, si quedó el Dúo, con los
 * anteojos a precio de lista, antes de su descuento):
 *  - AMBA, donde llega el reparto de 24 h: `envio_gratis_amba_desde`.
 *  - El resto del país: `envio_gratis_desde`.
 *
 * Ale, 18/11/2026: el envío se cobra igual con cuenta o sin cuenta (ya no hay
 * envío gratis por estar suscripto), y los textos dicen solo importes: nunca
 * «con tantos anteojos», porque el mínimo y los precios cambian.
 *
 * El comprador nunca ve con qué transportista se despacha: ve "Envío a
 * domicilio", el plazo y el precio (o "Envío gratis").
 */

/** "amba": llega el reparto de 24 h. "resto": el resto del país. */
export type ZonaEnvio = "amba" | "resto";

export type UmbralesEnvioGratis = {
  /** Subtotal desde el que es gratis en AMBA; 0 = sin regla para AMBA. */
  amba: number;
  /** Subtotal desde el que es gratis en todo el país; 0 = nunca. */
  nacional: number;
};

/** Si con este subtotal (sin cupón) el envío a esa zona es gratis. */
export function esEnvioGratis(subtotalSinCupon: number, zona: ZonaEnvio | null, u: UmbralesEnvioGratis): boolean {
  if (u.nacional > 0 && subtotalSinCupon >= u.nacional) return true;
  return zona === "amba" && u.amba > 0 && subtotalSinCupon >= u.amba;
}

/** El umbral que aplica a esa zona (el más bajo que corresponda), o 0 si no hay. */
export function umbralDeZona(zona: ZonaEnvio | null, u: UmbralesEnvioGratis): number {
  if (zona === "amba" && u.amba > 0) return u.nacional > 0 ? Math.min(u.amba, u.nacional) : u.amba;
  return u.nacional;
}

/** Cuánto le falta para el envío gratis en esa zona; 0 si ya lo tiene o si no hay umbral. */
export function faltaParaGratis(subtotalSinCupon: number, zona: ZonaEnvio | null, u: UmbralesEnvioGratis): number {
  if (esEnvioGratis(subtotalSinCupon, zona, u)) return 0;
  const umbral = umbralDeZona(zona, u);
  return umbral > 0 ? Math.max(0, Math.ceil(umbral - subtotalSinCupon)) : 0;
}

/**
 * El plazo de Envia dicho para el comprador: "Día siguiente" → "Llega en
 * 24 h hábiles"; "2-7 días" → "Llega en 2 a 7 días hábiles"; "24-48 hs" →
 * "Llega en 24 a 48 h hábiles". Solo lo que el transportista dice con su
 * unidad (horas o días): cualquier otra cosa (una fecha, "semanas",
 * "Consultar") es null, y no se promete nada.
 */
export function plazoParaComprador(plazo: string | null | undefined): string | null {
  const texto = (plazo ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!texto) return null;
  if (/^(mismo d[ií]a|en el d[ií]a|same ?day)\b/.test(texto)) return "Llega en el día";
  if (/^(d[ií]a (h[aá]bil )?siguiente|siguiente d[ií]a( h[aá]bil)?|next (business )?day)\b/.test(texto)) return "Llega en 24 h hábiles";

  const hasta = /^hasta /.test(texto) ? "hasta " : "";
  const resto = texto.replace(/^(hasta|entre) /, "");
  const SEP = "\\s*(?:-|–|a|y|to)\\s*";
  const rango = (unidad: string) => new RegExp(`^(\\d{1,3})(?:${SEP}(\\d{1,3}))?\\s*${unidad}$`);

  const horas = resto.match(rango("(?:h|hs|hrs?|horas?|hours?)( h[aá]bil(?:es)?)?"));
  if (horas) {
    const [desde, a] = [Number(horas[1]), horas[2] ? Number(horas[2]) : null];
    return a !== null && a !== desde ? `Llega en ${hasta}${desde} a ${a} h hábiles` : `Llega en ${hasta}${desde} h hábiles`;
  }
  const dias = resto.match(rango("(?:d[ií]as?|business days?|days?)( h[aá]bil(?:es)?)?"));
  if (dias) {
    const [desde, a] = [Number(dias[1]), dias[2] ? Number(dias[2]) : null];
    if (a !== null && a !== desde) return `Llega en ${hasta}${desde} a ${a} días hábiles`;
    return desde === 1 ? `Llega en ${hasta}1 día hábil` : `Llega en ${hasta}${desde} días hábiles`;
  }
  return null;
}

/**
 * La regla para cuando todavía no hay dirección, con las dos frases que usa
 * toda la tienda (TEXTOS.programa.envio, Ale, 18/11/2026) y los mínimos de
 * Config: «Envío gratis en AMBA desde $ X. Al resto del país, gratis desde
 * $ Y.»
 */
export function textoEnvioGratis(u: UmbralesEnvioGratis): string {
  const E = TEXTOS.programa.envio;
  const amba = u.amba > 0 && (u.nacional <= 0 || u.amba < u.nacional);
  if (amba && u.nacional > 0) return `${E.amba(precio(u.amba))}. ${E.resto(precio(u.nacional))}.`;
  if (amba) return `${E.amba(precio(u.amba))}.`;
  if (u.nacional > 0) return `Envío a domicilio. Gratis desde ${precio(u.nacional)}.`;
  return "Envío a domicilio.";
}

/**
 * Con el Dúo aplicado y sin llegar todavía al mínimo, la aclaración que va
 * junto a «Te faltan…», «gratis desde…» y «Agregá $ X más…» (Ale,
 * 18/11/2026). El servidor mide el mínimo antes del descuento del Dúo
 * (lib/pedidos.ts): sin decirlo, el comprador hace la cuenta con el total que
 * ve y no le cierra.
 *
 * Null si ningún renglón trae el Dúo. Ese detalle lo manda solo el servidor y
 * solo con el Dúo prendido: apagado, acá nunca se lo nombra.
 */
export function aclaracionDelMinimoConDuo(items: readonly { duo?: unknown }[]): string | null {
  return items.some((i) => Boolean(i.duo)) ? TEXTOS.checkout.minimoAntesDelDuo : null;
}

/**
 * El envío en el carrito y en el panel lateral, que todavía no tienen
 * dirección: qué dice la fila, la nota de abajo y cómo se llama el total.
 * `envio` es el del carrito sin destino: 0 si ya es gratis en todo el país.
 *
 * Con `items` (los renglones del carrito), si alguno trae el Dúo y la nota
 * nombra un mínimo que todavía no se alcanzó, la nota aclara que ese mínimo
 * se cuenta antes del descuento del Dúo. Sin `items`, la nota de siempre.
 */
export function envioEnElCarrito(
  subtotalSinCupon: number,
  envio: number,
  u: UmbralesEnvioGratis,
  items: readonly { duo?: unknown }[] = []
): { valor: string; nota: string | null; total: "Total" | "Total sin envío" } {
  if (envio === 0) return { valor: "Gratis", nota: null, total: "Total" };
  const aclaracion = aclaracionDelMinimoConDuo(items);
  const conAclaracion = (nota: string) => (aclaracion ? `${nota} ${aclaracion}` : nota);
  const hayAmba = u.amba > 0 && (u.nacional <= 0 || u.amba < u.nacional);
  if (hayAmba && esEnvioGratis(subtotalSinCupon, "amba", u)) {
    return {
      valor: "Gratis en AMBA",
      nota: u.nacional > 0 ? conAclaracion(`${TEXTOS.programa.envio.resto(precio(u.nacional))}.`) : "Al resto del país se calcula en el checkout.",
      // Todavía no se sabe si la dirección es de AMBA: como en el checkout.
      total: "Total sin envío",
    };
  }
  const falta = faltaParaGratis(subtotalSinCupon, hayAmba ? "amba" : "resto", u);
  return {
    valor: "Se calcula en el checkout",
    nota: falta > 0 ? conAclaracion(`Te faltan ${precio(falta)} para el envío gratis${hayAmba ? " en AMBA" : ""}.`) : null,
    total: "Total sin envío",
  };
}

/** El id de la única opción que ve el comprador. */
export const ID_ENVIO_DOMICILIO = "domicilio";

/** La opción de envío tal como la ve el navegador: sin transportista ni costo real. */
export type EnvioOfrecido = {
  id: typeof ID_ENVIO_DOMICILIO;
  /** Lo que pagaría sin envío gratis (con envío gratis, se muestra tachado). */
  precio: number;
  /** "Llega en 24 h hábiles"; null si no hay un plazo que se pueda prometer. */
  plazo: string | null;
  /** El comprobante cifrado de la cotización (ver lib/cotizacion-envio.ts). */
  comprobante: string;
};

/** Lo que contesta /api/envio/cotizar (y el 409 del checkout con un total distinto). */
export type CotizacionEnvio = {
  /** La opción a domicilio cotizada, con su comprobante. Vacío si no se cotizó. */
  opciones: EnvioOfrecido[];
  /** Falso cuando `envio` es la tarifa plana de respaldo. */
  cotizado: boolean;
  envio: number;
  /** El pedido llega al mínimo de su zona y el envío lo paga Harper. */
  bonificado: boolean;
  /** Dónde cae la dirección; null si no se sabe (sin cotizar, fuera de la Ciudad). */
  zona: ZonaEnvio | null;
  /** El mínimo de envío gratis para esa zona; 0 si no hay. */
  gratisDesde: number;
  /** Lo que le falta al carrito para el envío gratis en esa zona; 0 si ya lo tiene. */
  falta: number;
  /** Las cuotas sin interés verificadas para el total con este envío (`monto`); null si no hay. */
  cuotas: (CuotasVerificadas & { monto: number }) | null;
};

/**
 * Lo que el servidor le cuenta al navegador del envío resuelto: la opción con
 * el plazo dicho para el comprador, sin nombre de transportista.
 */
export function cotizacionParaComprador(
  carrito: {
    opcionesEnvio: OpcionEnvio[];
    envioCotizado: boolean;
    envio: number;
    envioBonificado: boolean;
    envioZona: ZonaEnvio | null;
    subtotalSinCupon: number;
  },
  umbrales: UmbralesEnvioGratis
): Omit<CotizacionEnvio, "cuotas"> {
  return {
    opciones: carrito.opcionesEnvio.map((o) => ({
      id: ID_ENVIO_DOMICILIO,
      precio: o.precio,
      plazo: plazoParaComprador(o.plazo),
      comprobante: o.comprobante,
    })),
    cotizado: carrito.envioCotizado,
    envio: carrito.envio,
    bonificado: carrito.envioBonificado,
    zona: carrito.envioZona,
    gratisDesde: umbralDeZona(carrito.envioZona, umbrales),
    falta: carrito.envioBonificado ? 0 : faltaParaGratis(carrito.subtotalSinCupon, carrito.envioZona, umbrales),
  };
}
