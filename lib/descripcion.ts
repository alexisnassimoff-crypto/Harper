/**
 * La descripción de un producto (campo Descripcion de Airtable) en párrafos.
 *
 * En Airtable se escribe como texto largo: cada renglón es un párrafo, deje o
 * no un renglón en blanco en el medio. La ficha y la portada la muestran así,
 * y los buscadores reciben solo el primer párrafo, recortado.
 */

/** Los párrafos, sin renglones vacíos ni espacios de más. */
export function parrafosDe(texto: string | null | undefined): string[] {
  return (texto ?? "")
    .split(/\r?\n/)
    .map((renglon) => renglon.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/**
 * El primer párrafo, para la descripción de Google y de las redes. Si pasa
 * de `maximo` caracteres se corta en la última palabra entera y lleva "…".
 */
export function resumenDe(texto: string | null | undefined, maximo = 160): string {
  const primero = parrafosDe(texto)[0] ?? "";
  if (primero.length <= maximo) return primero;
  const corte = primero.slice(0, maximo - 1);
  const espacio = corte.lastIndexOf(" ");
  return `${(espacio > maximo / 2 ? corte.slice(0, espacio) : corte).replace(/[\s,;:.\-–—]+$/, "")}…`;
}
