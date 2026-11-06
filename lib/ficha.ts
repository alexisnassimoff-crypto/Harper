import type { Confianza } from "./confianza";
import type { Medidas } from "./tipos";

/**
 * Lo que la ficha de producto muestra además de comprar (Plan Maestro, ficha,
 * 04/11/2026): medidas con su guía de talle y las condiciones de compra con
 * sus enlaces. Funciones puras, para probarlas sin la página.
 *
 * Nada se inventa: cada medida sale de Airtable (Productos: Calibre_mm,
 * Puente_mm, Patilla_mm, Frente_mm, Alto_mm) y se muestra solo si está
 * cargada. Los plazos salen de lib/confianza.ts, la fuente única que también
 * usan la portada y /legales.
 */

export type FilaDeMedida = {
  /** La letra del dibujo, si la medida está en él. */
  letra: string | null;
  nombre: string;
  valor: number;
  ayuda: string;
};

/** Las medidas cargadas, en el orden en que se leen en la patilla y después las del frente. */
export function medidasDeLaFicha(medidas: Medidas | null): FilaDeMedida[] {
  if (!medidas) return [];
  const filas: (FilaDeMedida | null)[] = [
    medidas.calibreMm ? { letra: "A", nombre: "Calibre", valor: medidas.calibreMm, ayuda: "Ancho de cada cristal" } : null,
    medidas.puenteMm ? { letra: "B", nombre: "Puente", valor: medidas.puenteMm, ayuda: "Espacio entre los cristales, sobre la nariz" } : null,
    medidas.patillaMm ? { letra: null, nombre: "Patilla", valor: medidas.patillaMm, ayuda: "Largo de la varilla hasta la oreja" } : null,
    medidas.altoMm ? { letra: "C", nombre: "Alto", valor: medidas.altoMm, ayuda: "Alto de cada cristal" } : null,
    medidas.frenteMm ? { letra: "D", nombre: "Frente", valor: medidas.frenteMm, ayuda: "Ancho total del anteojo" } : null,
  ];
  return filas.filter((f): f is FilaDeMedida => f !== null);
}

/** Los tres números de la patilla, separados por guiones (Ale, 06/11/2026): «52-18-140». Null si falta alguno. */
export function numerosDeLaPatilla(medidas: Medidas | null): string | null {
  if (!medidas?.calibreMm || !medidas.puenteMm || !medidas.patillaMm) return null;
  return `${medidas.calibreMm}-${medidas.puenteMm}-${medidas.patillaMm}`;
}

export type Talle = "Chico" | "Mediano" | "Grande";

/** La guía de talles, por el ancho total del frente. Orientativa: dos personas con la misma cara no eligen igual. */
export const TALLES: { talle: Talle; desde: number; hasta: number | null; texto: string }[] = [
  { talle: "Chico", desde: 0, hasta: 130, texto: "hasta 130 mm de frente" },
  { talle: "Mediano", desde: 131, hasta: 140, texto: "de 131 a 140 mm" },
  { talle: "Grande", desde: 141, hasta: null, texto: "más de 140 mm" },
];

/** El talle según el ancho del frente, o null si no está cargado. */
export function talleDe(medidas: Medidas | null): Talle | null {
  const frente = medidas?.frenteMm;
  if (!frente) return null;
  const redondo = Math.round(frente);
  return (TALLES.find((t) => redondo >= t.desde && (t.hasta === null || redondo <= t.hasta)) ?? TALLES[2]).talle;
}

export type Condicion = {
  clave: "envio" | "devolucion" | "cambios" | "garantia" | "pago";
  texto: string;
  detalle: string | null;
  href: string;
  enlace: string;
};

/**
 * Envío, devolución, cambios, garantía y pago, cada uno con su enlace
 * visible. El envío y el pago salen de los mensajes de confianza (Config y
 * Mercado Pago); los plazos, de lib/confianza.ts. Si devolver y cambiar
 * tienen el mismo plazo, van en un solo renglón.
 */
export function condicionesDeCompra(
  confianza: Confianza[],
  plazos: { diasArrepentimiento: number; diasCambio: number; mesesGarantia: number }
): Condicion[] {
  const envio = confianza.find((c) => c.clave === "envio");
  const pago = confianza.find((c) => c.clave === "pago");
  const mismoPlazo = plazos.diasArrepentimiento === plazos.diasCambio;

  const condiciones: (Condicion | null)[] = [
    envio
      ? {
          clave: "envio",
          texto: envio.texto,
          detalle: envio.detalle ?? null,
          href: "/legales/terminos#envios",
          enlace: "Cómo son los envíos",
        }
      : null,
    {
      clave: "devolucion",
      texto: mismoPlazo
        ? `Cambios y devoluciones hasta ${plazos.diasCambio} días`
        : `${plazos.diasArrepentimiento} días corridos para devolverlo sin costo`,
      detalle: "Desde que lo recibís",
      href: "/legales/devoluciones",
      enlace: "Ver la política de devoluciones",
    },
    mismoPlazo
      ? null
      : {
          clave: "cambios",
          texto: `Cambios de color o modelo hasta ${plazos.diasCambio} días`,
          detalle: null,
          href: "/legales/devoluciones",
          enlace: "Cómo cambiarlo",
        },
    {
      clave: "garantia",
      texto: `${plazos.mesesGarantia} meses de garantía por defectos de fabricación`,
      detalle: null,
      href: "/legales/devoluciones#garantia",
      enlace: "Qué cubre la garantía",
    },
    pago
      ? {
          clave: "pago",
          texto: pago.texto,
          detalle: pago.detalle ?? null,
          href: "/legales/terminos",
          enlace: "Términos de compra",
        }
      : null,
  ];
  return condiciones.filter((c): c is Condicion => c !== null);
}
