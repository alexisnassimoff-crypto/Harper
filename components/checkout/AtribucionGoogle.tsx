/**
 * La atribución que exige Google cuando se muestran datos de Places sin un
 * mapa: el logo "Google Maps" oficial (variante gris, para fondo claro), sin
 * modificar, entre 16 y 19 dp de alto, con su espacio libre alrededor.
 *
 * El archivo es el del paquete oficial de atribución de Google Maps Platform
 * (Google_Maps_Attribution_Assets.zip); si no cargara, queda el texto
 * "Google Maps", que la política acepta cuando no hay lugar para el logo.
 */
export default function AtribucionGoogle() {
  return (
    <span className="atribucion-google">
      <img src="/google-maps-atribucion.svg" alt="Google Maps" height={18} />
    </span>
  );
}
