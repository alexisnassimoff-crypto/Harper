import { listRecords, TABLAS } from "./airtable";
import { puedeCotizar } from "./envia";
import { aNumero, aPesos } from "./formato";
import { leerImpuestos, SIN_IMPUESTOS_CARGADOS, type ImpuestosNacionales } from "./impuestos";
import { codigoEnviaDeProvincia } from "./provincias-envia";
import { leerTarifasRueddo, RECARGO_AMBA_POR_DEFECTO, TARIFAS_RUEDDO_POR_DEFECTO, type TarifasRueddo } from "./rueddo";
import type { OrigenEnvio } from "./tipos";

/**
 * Ajustes de la tienda, editables desde la tabla Config de Airtable
 * sin necesidad de tocar código ni redeployar.
 */
export type ConfigTienda = {
  costoEnvio: number;
  envioGratisDesde: number;
  /**
   * Envío gratis en AMBA (donde llega el reparto de 24 h) desde este
   * subtotal, más bajo que el de todo el país. 0 = sin regla para AMBA.
   * También 0 si no se puede cotizar con Envia (sin token, origen o
   * transportistas): sin cotizar no se sabe qué dirección es AMBA, así que
   * ni se anuncia ni se aplica, y todo queda como antes.
   */
  envioGratisAmbaDesde: number;
  /**
   * La tarifa directa del reparto de AMBA (Rueddo) por zona, SIN IVA, clave
   * `envio_amba_tarifas` ("CABA 3709 · GBA 1 5370 · GBA 2 7500 · GBA 3
   * 7500"). Rueddo la ajusta cada tres meses. Ver lib/rueddo.ts.
   */
  envioAmbaTarifas: TarifasRueddo;
  /** Lo que se le suma a esa tarifa con IVA, en %, clave `envio_amba_recargo` (hoy 20). */
  envioAmbaRecargo: number;
  /** Lo que se le suma a lo que cotiza Envia fuera de AMBA, en %, clave `envio_resto_recargo` (hoy 10). */
  envioRestoRecargo: number;
  bannerTexto: string;
  whatsapp: string;
  /** El Instagram de Harper, como URL completa; vacío = no se muestra el acceso en el pie. */
  instagram: string;
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
   * Desde dónde se despacha, para cotizar con Envia (claves envio_origen_*).
   * Null si falta algún dato obligatorio: sin origen no se cotiza y se cobra
   * la tarifa plana. No tiene valores por defecto a propósito.
   */
  envioOrigen: OrigenEnvio | null;
  /**
   * Peso mínimo del paquete en kg, clave `envio_peso_kg` (Ale, 28/10/2026:
   * 0,5 kg). Se cotiza con este peso o con el calculado, el mayor. 0 = solo
   * el calculado.
   */
  envioPesoMinimoKg: number;
  /**
   * Transportistas que se cotizan con Envia, como los nombra Envia, clave
   * `envio_transportistas` ("rueddo, andreani, correoArgentino"). Vacío = no
   * se cotiza.
   */
  envioTransportistas: string[];
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
   * El modelo que protagoniza la portada (su slug), clave `portada_producto`.
   * Vacío = el Citrino; "ninguno" = la portada de catálogo. Ver lib/portada.ts.
   */
  portadaProducto: string;
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
  /**
   * La condición de Harper frente al IVA, clave `condicion_iva` ("Responsable
   * Inscripto", "Monotributo" o "Exento"). Decide la clase de cada factura
   * junto con la del receptor. Vacío = la clase queda "A confirmar". Ver
   * lib/facturacion.ts.
   */
  condicionIva: string;
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
  envioGratisAmbaDesde: 0,
  envioAmbaTarifas: TARIFAS_RUEDDO_POR_DEFECTO,
  envioAmbaRecargo: RECARGO_AMBA_POR_DEFECTO,
  envioRestoRecargo: 10,
  bannerTexto: "",
  whatsapp: "",
  instagram: "",
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
  envioOrigen: null,
  envioPesoMinimoKg: 0,
  envioTransportistas: [],
  portadaTitulo: "",
  portadaSubtitulo: "",
  portadaImagen: "",
  portadaProducto: "",
  dataFiscal: "",
  impuestosNacionales: SIN_IMPUESTOS_CARGADOS,
  condicionIva: "",
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

  const envioOrigen = leerOrigenEnvio(mapa);
  const envioTransportistas = (mapa.get("envio_transportistas") ?? "")
    .split(/[\s,;]+/)
    .map((t) => t.trim())
    .filter((t) => /^[A-Za-z][A-Za-z0-9_]{1,40}$/.test(t));

  return {
    costoEnvio: aPesos(mapa.get("costo_envio"), POR_DEFECTO.costoEnvio),
    envioGratisDesde: aPesos(mapa.get("envio_gratis_desde"), POR_DEFECTO.envioGratisDesde),
    envioGratisAmbaDesde: puedeCotizar({ envioOrigen, envioTransportistas })
      ? aPesos(mapa.get("envio_gratis_amba_desde"), POR_DEFECTO.envioGratisAmbaDesde)
      : 0,
    envioAmbaTarifas: leerTarifasRueddo(mapa.get("envio_amba_tarifas")),
    envioAmbaRecargo: porcentaje(mapa.get("envio_amba_recargo"), POR_DEFECTO.envioAmbaRecargo),
    envioRestoRecargo: porcentaje(mapa.get("envio_resto_recargo"), POR_DEFECTO.envioRestoRecargo),
    bannerTexto: texto("banner_texto", POR_DEFECTO.bannerTexto),
    whatsapp: texto("whatsapp", POR_DEFECTO.whatsapp).replace(/\D/g, ""),
    instagram: urlDeInstagram(mapa.get("instagram")),
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
    envioOrigen,
    envioPesoMinimoKg: kilos(mapa.get("envio_peso_kg")),
    envioTransportistas,
    portadaTitulo: texto("portada_titulo", POR_DEFECTO.portadaTitulo),
    portadaSubtitulo: texto("portada_subtitulo", POR_DEFECTO.portadaSubtitulo),
    portadaImagen: texto("portada_imagen", POR_DEFECTO.portadaImagen),
    portadaProducto: texto("portada_producto", POR_DEFECTO.portadaProducto),
    dataFiscal: texto("data_fiscal", POR_DEFECTO.dataFiscal),
    impuestosNacionales: leerImpuestos(mapa),
    condicionIva: texto("condicion_iva", POR_DEFECTO.condicionIva),
  };
}

/** "20", "20 %" o "20,5": un porcentaje entre 0 y 100. Cualquier otra cosa, el de siempre. */
export function porcentaje(valor: string | undefined, porDefecto: number): number {
  const m = (valor ?? "").trim().match(/^(\d{1,3}(?:[.,]\d{1,2})?)\s*%?$/);
  const n = m ? Number(m[1].replace(",", ".")) : Number.NaN;
  return n >= 0 && n <= 100 ? n : porDefecto;
}

/**
 * El Instagram de Config (clave `instagram`), como venga: "@harper",
 * "harper" o la URL. Siempre una URL de instagram.com, o vacío si no tiene
 * forma de usuario.
 */
export function urlDeInstagram(valor: string | undefined): string {
  const texto = (valor ?? "").trim();
  const usuario = (texto.match(/instagram\.com\/([A-Za-z0-9._]{1,30})/i)?.[1] ?? texto.replace(/^@/, "")).replace(/\/$/, "");
  return /^[A-Za-z0-9._]{1,30}$/.test(usuario) ? `https://www.instagram.com/${usuario}/` : "";
}

/** Para avisar una sola vez por instancia de una provincia de origen mal escrita. */
let provinciaAvisada = "";

/**
 * El origen de los envíos. Todos los datos que pide Envia son obligatorios
 * (el piso no): si falta uno, null, y se cobra la tarifa plana en vez de
 * cotizar con un origen a medias.
 */
function leerOrigenEnvio(mapa: Map<string, string>): OrigenEnvio | null {
  const dato = (clave: string) => (mapa.get(`envio_origen_${clave}`) ?? "").trim();
  const origen: OrigenEnvio = {
    nombre: dato("nombre"),
    telefono: dato("telefono").replace(/[^\d+]/g, ""),
    calle: dato("calle"),
    numero: dato("numero"),
    piso: dato("piso"),
    ciudad: dato("ciudad"),
    provincia: dato("provincia"),
    cp: (dato("cp").match(/\d{4}/) ?? [""])[0],
  };
  // La provincia tiene que ser una de las 24 (con el nombre del checkout): si
  // no, Envia no puede cotizar y /api/health avisa que falta el origen.
  if (origen.provincia && !codigoEnviaDeProvincia(origen.provincia) && provinciaAvisada !== origen.provincia) {
    provinciaAvisada = origen.provincia;
    console.warn(`[config] envio_origen_provincia "${origen.provincia.slice(0, 60)}" no es una de las 24 provincias: se cobra la tarifa plana`);
  }
  const completo =
    origen.nombre &&
    origen.telefono.replace(/\D/g, "").length >= 8 &&
    origen.calle &&
    origen.numero &&
    origen.ciudad &&
    codigoEnviaDeProvincia(origen.provincia) &&
    origen.cp;
  return completo ? origen : null;
}

/** "0,5" o "0.5" kg; vacío o inválido = 0. */
function kilos(valor: string | undefined): number {
  const n = Number.parseFloat((valor ?? "").replace(",", ".").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 && n <= 50 ? n : 0;
}

/**
 * Costo de envío de respaldo, plano.
 *
 * Es lo que se cobra cuando Envia no puede cotizar: sin token u origen, con la
 * API caída, sin transportistas para ese destino, o con un pedido sin peso y
 * medidas. Nunca deja a la tienda sin poder vender.
 */
export function calcularEnvio(subtotal: number, config: ConfigTienda) {
  if (envioBonificado(subtotal, config)) return 0;
  return config.costoEnvio;
}

/**
 * Verdadero si el pedido llega al mínimo para envío gratis.
 *
 * Es una promoción, no un cálculo: cuando aplica, Harper se hace cargo del costo
 * real que cobre el transportista, y ese costo igual queda en el pedido.
 */
export function envioBonificado(subtotal: number, config: ConfigTienda) {
  return config.envioGratisDesde > 0 && subtotal >= config.envioGratisDesde;
}
