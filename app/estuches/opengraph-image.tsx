import { ImageResponse } from "next/og";
import { getProductos } from "@/lib/catalogo";
import {
  TAMANO,
  TarjetaCategoria,
  contentType,
  fotoIncrustada,
  fuentes,
} from "@/app/_og/tarjeta";

// `fs` para leer las fotos y la tipografía: hace falta el runtime de Node.
export const runtime = "nodejs";

export const size = TAMANO;
export { contentType };
export const alt = "Estuches Harper";

export default async function Imagen() {
  const productos = await getProductos("Estuches");

  const fotos = productos
    .map((p) => fotoIncrustada(p.variantes.find((v) => v.fotos.length > 0)?.fotos[0]))
    .filter((f): f is string => Boolean(f));

  // Con el catálogo vacío —o Airtable caído— `TarjetaCategoria` cae sola a la
  // tarjeta de marca.
  return new ImageResponse(<TarjetaCategoria titulo="Estuches" fotos={fotos} />, {
    ...size,
    fonts: fuentes(),
  });
}
