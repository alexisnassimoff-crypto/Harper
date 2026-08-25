/** Tipos de dominio de la tienda. */

export type Categoria = "Anteojos" | "Estuches" | "Paños";

export type Variante = {
  id: string;
  sku: string;
  color: string;
  colorHex: string;
  stock: number;
  fotos: string[];
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
  aceptaPromos: boolean;
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

/** Lo que el navegador puede pedir. Nunca incluye un precio. */
export type EleccionEnvio = {
  modo: ModoEnvio;
  servicio: ServicioEnvio;
  /** Solo cuando `modo` es "S". */
  sucursal?: string;
};

/** Una opción de envío ya cotizada contra Correo Argentino. */
export type OpcionEnvio = EleccionEnvio & {
  nombre: string;
  precio: number;
};

/** La caja que se despacha, ya sumadas todas las unidades del pedido. */
export type Paquete = {
  pesoG: number;
  largoCm: number;
  anchoCm: number;
  altoCm: number;
};
