/**
 * Textos de la portada y de los metadatos del sitio.
 *
 * Todo lo que se afirma acá tiene que ser verificable. Las características de
 * los anteojos (filtro de luz azul, fotocromáticos) las confirmó Ale el
 * 25/10/2026 para los cuatro modelos publicados; ver lib/caracteristicas.ts.
 * Nada de certificaciones: no se publican sin documentación que las respalde.
 */

/** Descripción del sitio para buscadores y redes. Anteojos primero. */
export const DESCRIPCION_SITIO =
  "Anteojos Harper en varios modelos y colores. Comprá online y pagá con Mercado Pago. También estuches rígidos y paños de microfibra.";

export const TITULO_SITIO = "Harper — Anteojos";

/**
 * El subtítulo del hero cuando Config.portada_subtitulo está vacío: qué
 * vendemos, en una frase. Texto aprobado por Ale el 25/10/2026.
 */
export const SUBTITULO_PORTADA =
  "Anteojos con filtro de luz azul y cristales fotocromáticos. Diseño para todos los días.";

/**
 * El subtítulo que va en el hero. Config.portada_subtitulo manda si se cargó.
 * Si no, la frase aprobada, que afirma filtro azul y fotocromáticos: solo
 * mientras todos los anteojos publicados tengan esas características
 * confirmadas. Si se publica uno que no (por ejemplo, unos de sol), el hero
 * queda sin subtítulo hasta definir uno nuevo, en vez de afirmar algo falso.
 */
export function subtituloDeLaPortada(
  delConfig: string,
  anteojosPublicados: { confirmado: boolean }[]
): string {
  if (delConfig.trim()) return delConfig.trim();
  const todos = anteojosPublicados.length > 0 && anteojosPublicados.every((a) => a.confirmado);
  return todos ? SUBTITULO_PORTADA : "";
}
