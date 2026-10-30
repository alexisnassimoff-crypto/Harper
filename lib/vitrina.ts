import type { OfertaDeEscala } from "./descuentos";
import { RECORTES_ANTEOJOS } from "./recortes-anteojos";
import type { Producto, Variante } from "./tipos";

/**
 * La portada vitrina (pedido de Ale, 30/10/2026): los cuatro modelos sobre
 * color, que pasan de claros a oscuros con un toque («Al sol | Adentro»), y
 * se suman al carrito sin salir de la portada. Acá, lo que no depende de
 * React: los tintes, las fotos de cada estado y el modo de la portada.
 *
 * Los tintes son un código de color por modelo, sin relato detrás (Ale no
 * quiere historia de las piedras). Son claros a propósito: las fotos son de
 * fondo blanco y se funden con `mix-blend-mode: multiply`.
 */

/** El tinte de cada modelo; los que no están acá toman uno de la lista, en orden. */
const TINTES: Record<string, string> = {
  citrino: "#f2e4bc",
  amatista: "#e4deec",
  obsidiana: "#dce5dd",
  cuarzo: "#efdcd3",
};
const TINTES_DE_RESERVA = ["#efe6d6", "#d6e6ea", "#f0d9a8", "#e7e2d8"];

export function tinteDe(slug: string, indice: number): string {
  return TINTES[slug] ?? TINTES_DE_RESERVA[indice % TINTES_DE_RESERVA.length];
}

/**
 * La forma de cada modelo, en una línea, para la vitrina. Se ve en las fotos;
 * no afirma materiales ni nada que no esté confirmado. Un modelo nuevo va sin
 * línea hasta que alguien la escriba.
 */
export const FORMAS: Record<string, string> = {
  citrino: "Cuadrado de bordes suaves, dos remaches al frente. Te lo ponés y ya estás.",
  amatista: "Geométrico, con un quiebre en las esquinas. Para que te miren dos veces.",
  obsidiana: "Rectangular, de esquinas redondeadas. No busca la mirada: la tiene.",
  cuarzo: "Cuadrado, con la línea de arriba recta. Llegás y ya dijiste algo.",
};

/** "/productos/anteojos/citrino-carey-1.webp" → "citrino-carey"; null si no es una foto de anteojos de la tienda. */
export function baseDeFoto(src: string | null | undefined): string | null {
  const m = /\/productos\/anteojos\/([a-z0-9-]+?)-(?:\d+|portada)\.(?:webp|jpe?g|png)$/i.exec(src ?? "");
  return m ? m[1].toLowerCase() : null;
}

export type FotosVitrina = {
  /** Con los cristales claros, de frente. */
  adentro: string;
  /** El mismo encuadre, oscurecido al sol. Null si no hay foto al sol. */
  alSol: string | null;
};

/**
 * Las dos fotos de un color para la vitrina. Con recortes generados
 * (scripts/recortes-anteojos.mjs), los dos tienen el mismo encuadre; sin
 * ellos, la primera foto del color y nada al sol (el interruptor deja ese
 * color como está, en vez de mostrar una foto que no corresponde).
 */
export function fotosDeVitrina(variante: Pick<Variante, "fotos" | "fotoPortada">, respaldo: string): FotosVitrina {
  const base = baseDeFoto(variante.fotos[0]) ?? baseDeFoto(variante.fotoPortada);
  if (base && RECORTES_ANTEOJOS.has(base)) {
    return { adentro: `/productos/anteojos/${base}-frente.webp`, alSol: `/productos/anteojos/${base}-sol.webp` };
  }
  return { adentro: variante.fotos[0] ?? respaldo, alSol: null };
}

/** El precio de todos los modelos si es el mismo; null si alguno cuesta distinto. */
export function precioUnico(modelos: Pick<Producto, "precio">[]): number | null {
  if (modelos.length === 0) return null;
  const precio = modelos[0].precio;
  return modelos.every((m) => m.precio === precio) ? precio : null;
}

/** Cuántos colores con stock hay entre todos los modelos. */
export function coloresConStock(modelos: Pick<Producto, "variantes">[]): number {
  return modelos.reduce((n, m) => n + m.variantes.filter((v) => !v.agotada).length, 0);
}

/** "cuatro", "doce": los números chicos con letras, como en un texto. */
export function enLetras(n: number): string {
  const nombres = [
    "cero",
    "uno",
    "dos",
    "tres",
    "cuatro",
    "cinco",
    "seis",
    "siete",
    "ocho",
    "nueve",
    "diez",
    "once",
    "doce",
    "trece",
    "catorce",
    "quince",
  ];
  return nombres[n] ?? String(n);
}

/**
 * Qué portada se muestra, según Config `portada_producto`:
 *  - vacío: la vitrina (desde el 30/10/2026);
 *  - "ninguno" o "catalogo": la portada de catálogo de antes;
 *  - el slug de un anteojo: la portada de ese modelo en packs, la de antes.
 */
export type ModoPortada = { tipo: "vitrina" } | { tipo: "catalogo" } | { tipo: "estrella"; slug: string };

export function modoDePortada(delConfig: string): ModoPortada {
  const valor = delConfig.trim().toLowerCase();
  if (!valor || valor === "vitrina") return { tipo: "vitrina" };
  if (valor === "ninguno" || valor === "catalogo" || valor === "catálogo") return { tipo: "catalogo" };
  return { tipo: "estrella", slug: valor };
}

/**
 * La línea de arriba de la barra «Tus pares»: qué gana con el próximo par, o
 * qué ya tiene. Sale del carrito resuelto por el servidor (tramos, cupón,
 * envío gratis), nunca de una cuenta propia: si el cupón ya da más que el
 * próximo tramo, no se promete ese descuento (nunca se suman los dos).
 */
export function empujeDeLaBarra(datos: {
  pares: number;
  /** El % por cantidad que aplica hoy y el del próximo tramo (lib/descuentos.ts). */
  actual: number;
  proximo: { faltan: number; porcentaje: number } | null;
  /** El % del cupón si está aplicado; 0 si no. */
  cupon: number;
  subtotalSinCupon: number;
  precioPar: number;
  envioGratisDesde: number;
  /** Dónde está en la escala «llevá 3, pagá 2 · llevá 5, pagá 3»; null sin escala. */
  escala?: OfertaDeEscala | null;
}): string | null {
  const { pares, actual, proximo, cupon, subtotalSinCupon, precioPar, envioGratisDesde, escala = null } = datos;
  if (pares <= 0) return null;
  const gratisPais = envioGratisDesde > 0 && subtotalSinCupon >= envioGratisDesde;
  const gratisConUnoMas = envioGratisDesde > 0 && !gratisPais && subtotalSinCupon + precioPar >= envioGratisDesde;

  if (escala && cupon === 0) {
    const { actual: escalon, siguiente } = escala;
    const aplicado = escalon ? `Llevá ${escalon.lleva}, pagá ${escalon.paga} aplicado` : null;
    if (siguiente) {
      const gratis = siguiente.lleva - siguiente.paga;
      const premio =
        gratis === 1 ? (siguiente.faltan === 1 ? "te lo llevás gratis" : "uno te sale gratis") : `te llevás ${gratis} gratis`;
      const envio = siguiente.faltan === 1 && gratisConUnoMas ? " y el envío es gratis a todo el país" : "";
      const sumar = siguiente.faltan === 1 ? (pares === 1 ? "Sumá otro" : "Uno más") : `Sumá ${siguiente.faltan} más`;
      return `${aplicado ? `${aplicado}. ` : ""}${sumar} y ${premio}${envio}.`;
    }
    if (aplicado) return `${aplicado}${gratisPais ? " y envío gratis a todo el país" : ""}.`;
  }

  if (proximo && proximo.faltan === 1) {
    const ganancias = [
      proximo.porcentaje > cupon ? `${proximo.porcentaje} % OFF` : null,
      gratisConUnoMas ? "envío gratis a todo el país" : null,
    ].filter(Boolean);
    if (ganancias.length > 0) return `${pares === 1 ? "Sumá otro" : "Uno más"}: ${ganancias.join(" y ")}.`;
  }
  if (actual > 0 && actual >= cupon) return `${actual} % OFF aplicado${gratisPais ? " y envío gratis a todo el país" : ""}.`;
  if (gratisPais) return "Envío gratis a todo el país.";
  return null;
}
