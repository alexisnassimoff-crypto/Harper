/**
 * El Dúo en una línea, con el mismo estilo que la promoción por cantidad
 * (OfertaCantidad). Los textos salen de lib/promocion-anteojos.ts, con lo que
 * resolvió el servidor: acá no se calcula nada.
 */
export default function OfertaDuo({ lineas, detalle = null }: { lineas: (string | null)[]; detalle?: string | null }) {
  const textos = lineas.filter((l): l is string => Boolean(l));
  if (textos.length === 0) return null;
  return (
    <p className="oferta-cantidad">
      <strong>{textos[0]}</strong>
      {textos.slice(1).map((t) => ` ${t}`)}
      {detalle ? (
        <>
          {" "}
          <span className="oferta-cantidad__detalle">{detalle}</span>
        </>
      ) : null}
    </p>
  );
}
