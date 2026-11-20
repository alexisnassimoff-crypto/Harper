/**
 * La etiqueta del Dúo junto al precio de un anteojo (Ale, 18/11/2026):
 * «Dúo: llevá dos y uno tiene 25% OFF», en las tarjetas de las grillas y de la portada.
 *
 * El texto llega armado del servidor, que es el único que sabe si el Dúo está
 * prendido (HARPER_DUO_ACTIVO no se ve desde el navegador): sin texto, no se
 * dibuja nada. Usa el sello de las opciones de pares (.opcion-pares__sello),
 * que ya está en la hoja de estilos.
 */
export default function EtiquetaDuo({ texto }: { texto: string | null | undefined }) {
  if (!texto) return null;
  return (
    <p className="etiqueta-duo">
      {/* En bloque: si la tarjeta es angosta, el texto corta adentro del sello. */}
      <span className="opcion-pares__sello" style={{ display: "inline-block" }}>
        {texto}
      </span>
    </p>
  );
}
