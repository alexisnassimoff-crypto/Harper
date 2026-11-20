"use client";

/**
 * «Llevá 3, pagá 2 · Llevá 5, pagá 3» en la ficha (Ale, 30/10/2026): las
 * opciones como en una tienda de un solo producto, con el total, el precio de
 * a uno tachado (un precio real: el de lista por la cantidad), lo que queda
 * cada par y la cuota verificada. Los montos vienen armados del servidor.
 */

export type OpcionPares = {
  cantidad: number;
  /** "1 par", "Llevá 3, pagá 2". */
  titulo: string;
  /** "Llevás uno gratis"; null en 1 par. */
  sello: string | null;
  total: string;
  /** El precio de a uno por la cantidad; null en 1 par. */
  tachado: string | null;
  /** "Cada par $ 59.933"; null en 1 par. */
  porPar: string | null;
  /** "3 cuotas sin interés de $ 59.933,33", verificada para ese total; null si no. */
  cuota: string | null;
};

export default function OpcionesPares({
  opciones,
  elegida,
  alElegir,
}: {
  opciones: OpcionPares[];
  elegida: number;
  alElegir: (cantidad: number) => void;
}) {
  return (
    <fieldset className="opciones-pares">
      <legend className="solo-lectores">Cuántos pares</legend>
      {/* Sin «Stock limitado» (Ale, 18/11/2026): era un aviso fijo, que nadie
          comprobaba contra el stock. Lo que queda de cada color lo dice la ficha. */}
      {opciones.map((o) => (
        <label key={o.cantidad} className="opcion-pares" data-elegida={o.cantidad === elegida || undefined}>
          <input
            type="radio"
            name="opcion-pares"
            className="opcion-pares__radio"
            value={o.cantidad}
            checked={o.cantidad === elegida}
            onChange={() => alElegir(o.cantidad)}
          />
          <span className="opcion-pares__datos">
            <span className="opcion-pares__titulo">
              {o.titulo}
              {o.sello ? <span className="opcion-pares__sello">{o.sello}</span> : null}
            </span>
            {o.porPar || o.cuota ? <span className="opcion-pares__detalle">{[o.porPar, o.cuota].filter(Boolean).join(" · ")}</span> : null}
          </span>
          <span className="opcion-pares__precio">
            {o.total}
            {o.tachado ? <s>{o.tachado}</s> : null}
          </span>
        </label>
      ))}
    </fieldset>
  );
}
