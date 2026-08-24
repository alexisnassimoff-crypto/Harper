import { ImageResponse } from "next/og";
import { getProducto } from "@/lib/catalogo";
import {
  TAMANO,
  TarjetaMarca,
  TarjetaProducto,
  contentType,
  fotoIncrustada,
  fuentes,
} from "@/app/_og/tarjeta";

// `fs` para leer la foto y la tipografía: hace falta el runtime de Node.
export const runtime = "nodejs";

export const size = TAMANO;
export { contentType };
export const alt = "Harper";

export default async function Imagen({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const producto = await getProducto(slug);

  // Sin producto —o con Airtable caído, que devuelve null— igual sale una
  // miniatura de marca. Nunca un 500 ni un cuadro roto en WhatsApp.
  const contenido = producto ? (
    <TarjetaProducto
      nombre={producto.nombre}
      precio={producto.precio}
      colores={producto.variantes.map((v) => v.colorHex)}
      foto={fotoIncrustada(producto.variantes.find((v) => v.fotos.length > 0)?.fotos[0])}
    />
  ) : (
    <TarjetaMarca />
  );

  return new ImageResponse(contenido, { ...size, fonts: fuentes() });
}
