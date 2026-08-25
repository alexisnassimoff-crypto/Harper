import { listRecords, TABLAS } from "./airtable";
import { aNumero } from "./formato";

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
  plazoEntrega: string;
  /** Código postal desde el que se despacha. Correo Argentino cotiza desde acá. */
  cpOrigen: string;
  /** Centímetros que suma el embalaje a cada lado del bulto. */
  embalajeMargenCm: number;
  /** Gramos que suman el sobre o la caja, el relleno y la etiqueta. */
  embalajePesoG: number;
};

/** Valores usados si Airtable no responde. La tienda nunca se cae por esto. */
const POR_DEFECTO: ConfigTienda = {
  costoEnvio: 8000,
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
};

type FilaConfig = { Clave?: string; Valor?: string };

export async function getConfig(): Promise<ConfigTienda> {
  let filas;

  try {
    filas = await listRecords<FilaConfig>(TABLAS.config, { revalidate: 60 });
  } catch (error) {
    console.error("No se pudo leer Config de Airtable:", error);
    return POR_DEFECTO;
  }

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
