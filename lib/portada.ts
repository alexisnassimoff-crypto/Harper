/**
 * Textos de la portada y de los metadatos del sitio.
 *
 * Todo lo que se afirma acá tiene que ser verificable en el catálogo o en la
 * operación: cuántos modelos hay, con qué se paga, cómo llega. Nada de
 * propiedades ópticas ni certificaciones: esas van en la ficha, cargadas por
 * Ale en Airtable, o no van.
 */

/** Descripción del sitio para buscadores y redes. Anteojos primero. */
export const DESCRIPCION_SITIO =
  "Anteojos Harper en varios modelos y colores. Comprá online y pagá con Mercado Pago. También estuches rígidos y paños de microfibra.";

export const TITULO_SITIO = "Harper — Anteojos";

const EN_LETRAS = ["", "un", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve"];

function enLetras(n: number) {
  return EN_LETRAS[n] ?? String(n);
}

/**
 * El subtítulo del hero cuando Config no trae uno.
 *
 * Se arma con lo que hay publicado, así nunca promete modelos o colores que no
 * están: si mañana se despublica uno, el texto cambia solo.
 */
export function subtituloPorDefecto(modelos: number, coloresMaximo: number): string {
  const cierre = "Comprá online, pagá con Mercado Pago y recibilos en tu casa.";

  if (modelos <= 0) return cierre;

  const cuantos = modelos === 1 ? "Un modelo" : `${capitalizar(enLetras(modelos))} modelos`;
  const colores =
    coloresMaximo > 1 ? ` y hasta ${enLetras(coloresMaximo)} colores` : "";

  return `${cuantos}${colores}. ${cierre}`;
}

function capitalizar(texto: string) {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}
