import type { CuotasVerificadas } from "./cuotas";
import { precio } from "./formato";
import type { OpcionEnvio } from "./tipos";

/**
 * El envío gratis por zona y los textos del envío para el comprador. Sin
 * nada del servidor: lo usan el checkout, el carrito y el panel lateral.
 *
 * Dos umbrales, sobre el subtotal sin el cupón (como siempre):
 *  - AMBA, donde llega el reparto de 24 h: `envio_gratis_amba_desde` (hoy
 *    $ 60.000, o sea: con cualquier anteojo).
 *  - El resto del país: `envio_gratis_desde` (hoy $ 150.000).
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
 * 24 h hábiles"; "2-7 días" → "Llega en 2 a 7 días hábiles". Null si no hay
 * un plazo que se pueda decir con certeza.
 */
export function plazoParaComprador(plazo: string | null | undefined): string | null {
  const texto = (plazo ?? "").trim();
  if (!texto) return null;
  if (/mismo d[ií]a|same ?day/i.test(texto)) return "Llega en el día";
  if (/d[ií]a siguiente|next ?day|24\s*h/i.test(texto)) return "Llega en 24 h hábiles";
  const rango = texto.match(/(\d+)\s*(?:-|a|–)\s*(\d+)/);
  if (rango) return `Llega en ${rango[1]} a ${rango[2]} días hábiles`;
  const uno = texto.match(/(\d+)/);
  if (uno) return Number(uno[1]) === 1 ? "Llega en 1 día hábil" : `Llega en ${uno[1]} días hábiles`;
  return null;
}

/**
 * La regla en una frase, para cuando todavía no hay dirección: "Envío gratis
 * en AMBA desde $ 60.000 y a todo el país desde $ 150.000."
 */
export function textoEnvioGratis(u: UmbralesEnvioGratis): string {
  const amba = u.amba > 0 && (u.nacional <= 0 || u.amba < u.nacional);
  if (amba && u.nacional > 0) return `Envío gratis en AMBA desde ${precio(u.amba)} y a todo el país desde ${precio(u.nacional)}.`;
  if (amba) return `Envío gratis en AMBA desde ${precio(u.amba)}.`;
  if (u.nacional > 0) return `Envío a domicilio. Gratis desde ${precio(u.nacional)}.`;
  return "Envío a domicilio.";
}

/**
 * El envío en el carrito y en el panel lateral, que todavía no tienen
 * dirección: qué dice la fila, la nota de abajo y cómo se llama el total.
 * `envio` es el del carrito sin destino: 0 si ya es gratis en todo el país.
 */
export function envioEnElCarrito(
  subtotalSinCupon: number,
  envio: number,
  u: UmbralesEnvioGratis
): { valor: string; nota: string | null; total: "Total" | "Total sin envío" } {
  if (envio === 0) return { valor: "Gratis", nota: null, total: "Total" };
  const hayAmba = u.amba > 0 && (u.nacional <= 0 || u.amba < u.nacional);
  if (hayAmba && esEnvioGratis(subtotalSinCupon, "amba", u)) {
    return {
      valor: "Gratis en AMBA",
      nota: u.nacional > 0 ? `Al resto del país, gratis desde ${precio(u.nacional)}.` : "Al resto del país se calcula en el checkout.",
      total: "Total",
    };
  }
  const falta = faltaParaGratis(subtotalSinCupon, hayAmba ? "amba" : "resto", u);
  return {
    valor: "Se calcula en el checkout",
    nota: falta > 0 ? `Te faltan ${precio(falta)} para el envío gratis${hayAmba ? " en AMBA" : ""}.` : null,
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
  /** Cuotas sin interés verificadas para el total con cada opción. */
  cuotas: Record<string, (CuotasVerificadas & { monto: number }) | null>;
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
