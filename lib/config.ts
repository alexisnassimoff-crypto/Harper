import { listRecords, TABLAS } from "./airtable";
import { aNumero } from "./formato";
import { leerImpuestos, SIN_IMPUESTOS_CARGADOS, type ImpuestosNacionales } from "./impuestos";

/**
 * Ajustes de la tienda, editables desde la tabla Config de Airtable
 * sin necesidad de tocar código ni redeployar.
 */
export type ConfigTienda = {
  costoEnvio: number;
  envioGratisDesde: number;
  bannerTexto: string;
  whatsapp: string;
  emailContacto: string;
  emailPedidos: string;
  razonSocial: string;
  cuit: string;
  domicilio: string;
  /**
   * Plazo de entrega. Se lee pero NO se le muestra al comprador en ningún
   * lado: hasta que haya un operador logístico contratado y confirmado no se
   * publica un plazo concreto. Cuando lo haya, se vuelve a mostrar desde acá.
   */
  plazoEntrega: string;
  /** Código postal desde el que se despacha. Correo Argentino cotiza desde acá. */
  cpOrigen: string;
  /** Centímetros que suma el embalaje a cada lado del bulto. */
  embalajeMargenCm: number;
  /** Gramos que suman el sobre o la caja, el relleno y la etiqueta. */
  embalajePesoG: number;
  /**
   * Textos e imagen de la portada. Vacíos = la portada usa los suyos, armados
   * con datos del catálogo. Están en Config para cambiar el mensaje de una
   * campaña sin tocar código.
   */
  portadaTitulo: string;
  portadaSubtitulo: string;
  /**
   * Ruta o URL de una foto editorial aprobada para el hero. Vacío = la
   * portada muestra una foto del catálogo (el primer anteojo publicado).
   */
  portadaImagen: string;
  /**
   * El código del Formulario 960/D (Data Fiscal) tal como lo entrega ARCA,
   * clave `data_fiscal`. Vacío = no se muestra. Ver lib/data-fiscal.ts.
   */
  dataFiscal: string;
  /**
   * Para el "Precio sin impuestos nacionales" (Res. SIyC 4/2025). Sin dato
   * cargado no se muestra. Ver lib/impuestos.ts.
   */
  impuestosNacionales: ImpuestosNacionales;
};

/**
 * Valores usados si Airtable no responde. La tienda nunca se cae por esto.
 *
 * Solo para MOSTRAR: al cobrar se usa `getConfigParaCobrar`, que no degrada.
 * El costo de envío de respaldo es el mismo que está cargado en Airtable, para
 * que una caída momentánea no muestre un número distinto del que se cobra.
 */
const POR_DEFECTO: ConfigTienda = {
  costoEnvio: 10100,
  envioGratisDesde: 80000,
  bannerTexto: "",
  whatsapp: "",
  emailContacto: "hola@harper.ar",
  emailPedidos: "hola@harper.ar",
  razonSocial: "HARPER",
  cuit: "30-71802316-1",
  domicilio: "",
  plazoEntrega: "3 a 7 días hábiles",
  cpOrigen: "1429",
  // Valores de sobre de burbuja. Con caja serían 2 y 80.
  embalajeMargenCm: 1,
  embalajePesoG: 30,
  portadaTitulo: "",
  portadaSubtitulo: "",
  portadaImagen: "",
  dataFiscal: "",
  impuestosNacionales: SIN_IMPUESTOS_CARGADOS,
};

type FilaConfig = { Clave?: string; Valor?: string };

export async function getConfig(): Promise<ConfigTienda> {
  try {
    return armarConfig(await listRecords<FilaConfig>(TABLAS.config, { revalidate: 60 }));
  } catch (error) {
    console.error("No se pudo leer Config de Airtable:", error);
    return POR_DEFECTO;
  }
}

/**
 * La config para cobrar: sin cache y sin valores de respaldo.
 *
 * Si Airtable no responde en el momento de pagar, esto explota a propósito:
 * cobrar un envío "por defecto" distinto del que el comprador vio es peor que
 * pedirle que reintente en un minuto.
 */
export async function getConfigParaCobrar(): Promise<ConfigTienda> {
  return armarConfig(await listRecords<FilaConfig>(TABLAS.config, { revalidate: 0 }));
}

function armarConfig(filas: { fields: FilaConfig }[]): ConfigTienda {
  const mapa = new Map<string, string>();
  for (const fila of filas) {
    const clave = fila.fields.Clave?.trim();
    if (clave) mapa.set(clave, fila.fields.Valor?.trim() ?? "");
  }

  const texto = (clave: string, porDefecto: string) =>
    mapa.get(clave) || porDefecto;

  return {
    costoEnvio: aNumero(mapa.get("costo_envio"), POR_DEFECTO.costoEnvio),
    envioGratisDesde: aNumero(
      mapa.get("envio_gratis_desde"),
      POR_DEFECTO.envioGratisDesde
    ),
    bannerTexto: texto("banner_texto", POR_DEFECTO.bannerTexto),
    whatsapp: texto("whatsapp", POR_DEFECTO.whatsapp).replace(/\D/g, ""),
    emailContacto: texto("email_contacto", POR_DEFECTO.emailContacto),
    emailPedidos: texto("email_pedidos", POR_DEFECTO.emailPedidos),
    razonSocial: texto("razon_social", POR_DEFECTO.razonSocial),
    cuit: texto("cuit", POR_DEFECTO.cuit),
    domicilio: texto("domicilio", POR_DEFECTO.domicilio),
    plazoEntrega: texto("plazo_entrega", POR_DEFECTO.plazoEntrega),
    cpOrigen: texto("cp_origen", POR_DEFECTO.cpOrigen).replace(/\D/g, ""),
    embalajeMargenCm: aNumero(
      mapa.get("embalaje_margen_cm"),
      POR_DEFECTO.embalajeMargenCm
    ),
    embalajePesoG: aNumero(mapa.get("embalaje_peso_g"), POR_DEFECTO.embalajePesoG),
    portadaTitulo: texto("portada_titulo", POR_DEFECTO.portadaTitulo),
    portadaSubtitulo: texto("portada_subtitulo", POR_DEFECTO.portadaSubtitulo),
    portadaImagen: texto("portada_imagen", POR_DEFECTO.portadaImagen),
    dataFiscal: texto("data_fiscal", POR_DEFECTO.dataFiscal),
    impuestosNacionales: leerImpuestos(mapa),
  };
}

/**
 * Costo de envío de respaldo, plano.
 *
 * Es lo que se cobra cuando Correo Argentino no puede cotizar: sin credenciales,
 * con la API caída, o con un pedido que excede sus límites. Nunca deja a la
 * tienda sin poder vender.
 */
export function calcularEnvio(subtotal: number, config: ConfigTienda) {
  if (envioBonificado(subtotal, config)) return 0;
  return config.costoEnvio;
}

/**
 * Verdadero si el pedido llega al mínimo para envío gratis.
 *
 * Es una promoción, no un cálculo: cuando aplica, Harper se hace cargo del costo
 * real que cobre Correo Argentino.
 */
export function envioBonificado(subtotal: number, config: ConfigTienda) {
  return config.envioGratisDesde > 0 && subtotal >= config.envioGratisDesde;
}
