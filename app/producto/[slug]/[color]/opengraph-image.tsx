import Imagen, { alt, contentType, size } from "../opengraph-image";

/**
 * La miniatura para compartir de la ficha por color.
 *
 * Next no hereda el `opengraph-image` del segmento padre, así que sin este
 * archivo el link a un color se compartía sin foto. Es la misma tarjeta que
 * la de la ficha base: la foto del producto, su nombre y su precio.
 */

// `fs` para leer la foto y la tipografía: hace falta el runtime de Node.
export const runtime = "nodejs";

export { alt, contentType, size };

export default async function ImagenColor({
  params,
}: {
  params: Promise<{ slug: string; color: string }>;
}) {
  const { slug } = await params;
  return Imagen({ params: Promise.resolve({ slug }) });
}
