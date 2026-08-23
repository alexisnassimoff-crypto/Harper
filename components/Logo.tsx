/**
 * Marca denominativa de Harper.
 *
 * Es tipográfica a propósito: está construida con Raleway, la misma fuente
 * del manual de marca. Cuando esté el SVG vectorial del logo original,
 * se reemplaza el contenido de este componente y cambia en todo el sitio.
 */
export default function Logo({ alto = 20 }: { alto?: number }) {
  return (
    <span
      aria-label="Harper"
      style={{
        display: "inline-block",
        fontSize: `${alto}px`,
        fontWeight: 500,
        letterSpacing: "0.42em",
        // El tracking agrega aire a la derecha; esto vuelve a centrar la palabra.
        textIndent: "0.42em",
        lineHeight: 1,
        textTransform: "uppercase",
      }}
    >
      Harper
    </span>
  );
}
