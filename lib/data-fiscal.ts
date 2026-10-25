/**
 * Data Fiscal (Formulario 960/D de ARCA).
 *
 * ARCA pide que quien vende por internet muestre en un lugar visible de su
 * página principal el logo del F. 960/D con su enlace. El código lo genera
 * ARCA para cada sitio (servicio "Formulario 960 D", opción para sitios web,
 * campo "Script"): se pega tal cual en Config, clave `data_fiscal`.
 *
 * De lo pegado se toman solo dos direcciones, y solo si son de ARCA: el
 * enlace al código QR del contribuyente y la imagen del logo. Nunca se
 * inserta el HTML pegado ni se arma un enlace propio: sin código de ARCA no se
 * muestra nada.
 */

export type DataFiscal = {
  /** El enlace que entrega ARCA (qr.afip.gob.ar o qr.arca.gob.ar, con ?qr=). */
  enlace: string;
  /** El logo que entrega ARCA, por https; null si el código no lo trae. */
  imagen: string | null;
};

const ENLACE = /https?:\/\/qr\.(?:afip|arca)\.gob\.ar\/?\?qr=[A-Za-z0-9_\-.,~%]+/i;
const IMAGEN = /https?:\/\/(?:www\.)?(?:afip|arca)\.gob\.ar\/[A-Za-z0-9_\-./%]+\.(?:jpe?g|png|gif|svg)/i;

export function leerDataFiscal(crudo: string | null | undefined): DataFiscal | null {
  const texto = (crudo ?? "").trim();
  if (!texto) return null;

  const enlace = texto.match(ENLACE)?.[0];
  if (!enlace) return null;

  const imagen = texto.match(IMAGEN)?.[0] ?? null;
  // La imagen va por https: en una página https, una imagen http se bloquea.
  return { enlace, imagen: imagen ? imagen.replace(/^http:/i, "https:") : null };
}
