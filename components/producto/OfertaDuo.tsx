import type { CSSProperties } from "react";

/**
 * El Dúo en una línea, con el mismo estilo que la promoción por cantidad
 * (OfertaCantidad). Los textos salen de lib/promocion-anteojos.ts y de
 * TEXTOS.programa, con lo que resolvió el servidor: acá no se calcula nada.
 * Sin textos (el Dúo apagado, o nada que decir), no dibuja nada.
 */
export default function OfertaDuo({
  lineas,
  detalle = null,
  estilo,
}: {
  lineas: (string | null)[];
  detalle?: string | null;
  /** Para acomodarlo donde va (el aire de arriba junto al precio de la ficha). */
  estilo?: CSSProperties;
}) {
  const textos = lineas.filter((l): l is string => Boolean(l));
  if (textos.length === 0) return null;
  return (
    <p className="oferta-cantidad" style={estilo}>
      <strong>{textos[0]}</strong>
      {textos.slice(1).map((t) => ` ${t}`)}
      {detalle ? <span className="oferta-cantidad__detalle oferta-cantidad__detalle--bloque">{detalle}</span> : null}
    </p>
  );
}
