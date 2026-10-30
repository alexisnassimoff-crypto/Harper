/** Tipos de dominio de la tienda. */

import type { Categoria } from "./categorias";

// Las categorías viven en lib/categorias.ts (las actuales y las previstas).
export type { Categoria };

export type Variante = {
  id: string;
  sku: string;
  color: string;
  colorHex: string;
  stock: number;
  fotos: string[];
  /**
   * La foto de portada del color (Airtable, Variantes.Foto_portada): los
   * anteojos al sol y adentro, con el estuche y el paño. Es la que explica que
   * son fotocromáticos: va primera en la galería y en las tarjetas. Las
   * miniaturas chicas (carrito, checkout, mails) siguen con la primera de
   * `fotos`, que se lee a 64 px. Null si no tiene.
   */
  fotoPortada?: string | null;
  agotada: boolean;
};

/**
 * Peso y medidas de UNA unidad, con su packaging.
 *
 * Correo Argentino cotiza por peso y volumen, así que sin esto no hay
 * cotización posible y el envío cae al precio plano de Config.
 */
export type Envase = {
  /** Gramos. La API acepta de 1 a 25.000. */
  pesoG: number;
  /** Centímetros. La API acepta hasta 150 por lado. */
  largoCm: number;
  anchoCm: number;
  /** El lado que se apila cuando el pedido lleva varias unidades. */
  altoCm: number;
};

/**
 * Medidas del anteojo, en milímetros, tal como se leen en la patilla.
 *
 * Cada una es opcional: se muestra la que esté cargada y ninguna se inventa.
 */
export type Medidas = {
  frenteMm: number | null;
  puenteMm: number | null;
  patillaMm: number | null;
};

export type Producto = {
  id: string;
  nombre: string;
  slug: string;
  categoria: Categoria;
  descripcion: string;
  precio: number;
  precioAnterior: number | null;
  /** Los videos del producto, ya filtrados a los que el navegador reproduce. */
  videos: string[];
  variantes: Variante[];
  /** Primera foto disponible entre todas las variantes. */
  fotoPrincipal: string | null;
  /** Verdadero si ninguna variante tiene stock. */
  agotado: boolean;
  /** `null` mientras no estén cargados el peso y las medidas en Airtable. */
  envase: Envase | null;
  /**
   * Qué viene en la caja, un renglón por ítem ("Estuche rígido", "Paño").
   * Vacío si no está cargado: la ficha no muestra nada.
   */
  incluye: string[];
  /** `null` mientras no haya ninguna medida cargada. */
  medidas: Medidas | null;
  /** Material del armazón, si está cargado. */
  material: string | null;
  /** Tipo de lentes, si está cargado. */
  lentes: string | null;
};

/** Un ítem tal como vive en el carrito del navegador. */
export type ItemCarrito = {
  productoSlug: string;
  varianteId: string;
  cantidad: number;
};

/** Un ítem ya resuelto contra el catálogo, con precio y stock reales. */
export type ItemResuelto = {
  productoId: string;
  productoSlug: string;
  nombre: string;
  /** Para contar unidades por categoría al aplicar el descuento por volumen. */
  categoria: Categoria;
  varianteId: string;
  sku: string;
  color: string;
  foto: string | null;
  /** Precio de lista, sin descuento por volumen. */
  precioLista: number;
  /** Lo que realmente se cobra por unidad. Es lo que viaja a Mercado Pago. */
  precioUnitario: number;
  /** Porcentaje aplicado, 0 si no llegó a ningún tramo. */
  descuento: number;
  /** El 10% adicional por dinero en Mercado Pago, sobre el precio ya descontado (ver lib/dinero-mp.ts). */
  descuentoDineroMP?: number;
  /** Los pesos que no se cobran porque el par va incluido en la membresía (lib/socios.ts). */
  incluido?: number;
  /** Si el par incluido es el segundo par de un socio: de qué fila de Socios (lo pone el servidor). */
  canje?: { socioId: string; numero: number };
  cantidad: number;
  subtotal: number;
  stockDisponible: number;
};

export type DatosCliente = {
  email: string;
  nombre: string;
  telefono: string;
  dni: string;
  direccion: string;
  ciudad: string;
  provincia: string;
  cp: string;
  /**
   * Calle, número y piso por separado, cuando la dirección salió del
   * buscador. Opcionales: con los campos manuales viaja solo `direccion`.
   * Sirven para cotizar y, más adelante, para la etiqueta.
   */
  calle?: string;
  numero?: string;
  piso?: string;
  /** El partido que trajo el buscador (ver DestinoEnvio). */
  partido?: string;
  aceptaPromos: boolean;
  /**
   * Confirmó ser mayor de edad (o tener autorización de su representante
   * legal) y aceptó los Términos y condiciones. Obligatorio para comprar
   * (lo exige validarCliente); no se recuerda entre compras. Opcional en el
   * tipo porque los pedidos ya confirmados se reconstruyen sin él.
   */
  aceptaTerminos?: boolean;
};

export type EstadoPedido =
  | "pendiente"
  | "pagado"
  | "preparando"
  | "enviado"
  | "entregado"
  | "cancelado"
  | "rechazado";

/** Cómo recibe el comprador. Son los códigos de la API de Correo Argentino. */
export type ModoEnvio = "D" | "S";

/** Servicio contratado: Clásico o Expreso. */
export type ServicioEnvio = "CP" | "EP";

/**
 * Una opción ya cotizada contra MiCorreo (Correo Argentino directo). Hoy no
 * se usa en el checkout, que cotiza con Envia; queda para la importación de
 * etiquetas de lib/correo.ts.
 */
export type OpcionCorreo = {
  modo: ModoEnvio;
  servicio: ServicioEnvio;
  sucursal?: string;
  nombre: string;
  precio: number;
};

/**
 * Una opción de envío a domicilio cotizada con Envia (ver lib/envia.ts).
 * Los precios salen siempre del servidor.
 */
export type OpcionEnvio = {
  /** Transportista y servicio como los nombra Envia: "andreani:ground". */
  id: string;
  transportista: string;
  /** "Andreani", "Correo Argentino", "Rueddo". */
  transportistaNombre: string;
  servicio: string;
  /** La descripción del servicio que da Envia, por ejemplo "Estándar". */
  servicioNombre: string;
  /** Lo que cobra el transportista según Envia (`totalPrice`), con centavos. */
  costo: number;
  /** Lo que paga el comprador si no tiene envío gratis: el costo en pesos enteros, redondeado hacia arriba. */
  precio: number;
  /** El plazo que informa el transportista, por ejemplo "2-4 días". Null si no lo informa. */
  plazo: string | null;
  /**
   * Comprobante firmado por el servidor con este precio, el destino y el
   * carrito (ver lib/cotizacion-envio.ts). El checkout cobra con él, sin
   * volver a cotizar; el navegador no lo puede modificar.
   */
  comprobante: string;
};

/** Lo que el navegador manda de la opción elegida. Nunca un precio. */
export type EleccionEnvio = {
  /** "andreani:ground". */
  id?: string;
  comprobante?: string;
};

/** Hacia dónde se cotiza: lo justo para el precio, sin nombre, mail ni DNI. */
export type DestinoEnvio = {
  cp: string;
  provincia: string;
  ciudad: string;
  calle: string;
  numero: string;
  /**
   * El partido, cuando la dirección salió del buscador ("San Isidro" para
   * Martínez): con él se sabe la zona del reparto de AMBA. Sin él, se busca
   * por la localidad.
   */
  partido?: string;
};

/** Desde dónde se despacha. Sale de Config (claves envio_origen_*). */
export type OrigenEnvio = {
  nombre: string;
  telefono: string;
  calle: string;
  numero: string;
  piso: string;
  ciudad: string;
  /** Nombre completo, como en el checkout: "Ciudad Autónoma de Buenos Aires". */
  provincia: string;
  cp: string;
};

/**
 * El envío tal como queda en el pedido: lo cobrado, el costo real que
 * cotizó el transportista (aunque sea gratis para el comprador) y la copia
 * de la cotización para generar después la etiqueta con lo mismo.
 */
export type EnvioDelPedido = {
  /**
   * "envia": cotizado con Envia; "tarifa": AMBA, con la tarifa directa del
   * reparto (lib/rueddo.ts); "plano": la tarifa de Config, porque no se pudo
   * cotizar.
   */
  origen: "envia" | "tarifa" | "plano";
  opcion: Omit<OpcionEnvio, "comprobante"> | null;
  /** Lo que paga el comprador: 0 con envío gratis. */
  cobrado: number;
  bonificado: boolean;
  /** Cuándo se cotizó (ISO). Null en la tarifa plana. */
  cotizadoEn: string | null;
  /** Copia de lo cotizado (paquete, destino sin datos personales, opción). */
  cotizacion: Record<string, unknown> | null;
};

/** La caja que se despacha, ya sumadas todas las unidades del pedido. */
export type Paquete = {
  pesoG: number;
  largoCm: number;
  anchoCm: number;
  altoCm: number;
};
