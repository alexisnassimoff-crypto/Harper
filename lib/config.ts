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
  };
}

/** Calcula el costo de envío para un subtotal dado. */
export function calcularEnvio(subtotal: number, config: ConfigTienda) {
  if (config.envioGratisDesde > 0 && subtotal >= config.envioGratisDesde) {
    return 0;
  }
  return config.costoEnvio;
}
