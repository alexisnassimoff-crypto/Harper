/** Tipos de dominio de la tienda. */

export type Categoria = "Anteojos" | "Estuches";

export type Variante = {
  id: string;
  sku: string;
  color: string;
  colorHex: string;
  stock: number;
  fotos: string[];
  agotada: boolean;
};

export type Producto = {
  id: string;
  nombre: string;
  slug: string;
  categoria: Categoria;
  descripcion: string;
  precio: number;
  precioAnterior: number | null;
  video: string | null;
  variantes: Variante[];
  /** Primera foto disponible entre todas las variantes. */
  fotoPrincipal: string | null;
  /** Verdadero si ninguna variante tiene stock. */
  agotado: boolean;
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
  varianteId: string;
  sku: string;
  color: string;
  foto: string | null;
  precioUnitario: number;
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
