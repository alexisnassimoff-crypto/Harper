import {
  Attachment,
  AirtableRecord,
  escaparFormula,
  listRecords,
  TABLAS,
} from "./airtable";
import { aNumero } from "./formato";
import { videoReproducible } from "./galeria";
import type { Categoria, Envase, Producto, Variante } from "./tipos";

/** Cada cuántos segundos se refresca el catálogo cacheado. */
const REVALIDATE = 60;

/**
 * Ejecuta una lectura del catálogo tolerando fallos.
 *
 * Si Airtable no está configurado o no responde, la tienda muestra el catálogo
 * vacío en vez de devolver un 500. Preferimos degradar antes que caernos: una
 * página sin productos se recupera sola en el próximo revalidate, un error no.
 */
async function tolerante<T>(operacion: () => Promise<T>, porDefecto: T): Promise<T> {
  try {
    return await operacion();
  } catch (error) {
    console.error("[catalogo] no se pudo leer Airtable:", error);
    return porDefecto;
  }
}

type FilaProducto = {
  Nombre?: string;
  Slug?: string;
  Categoria?: string;
  Descripcion?: string;
  Precio?: number;
  Precio_anterior?: number;
  Activo?: boolean;
  Orden?: number;
  Video?: Attachment[];
  Videos_url?: string;
  Peso_g?: number;
  Largo_cm?: number;
  Ancho_cm?: number;
  Alto_cm?: number;
};

type FilaVariante = {
  SKU?: string;
  Producto?: string[];
  Color?: string;
  Color_hex?: string;
  Stock?: number;
  Fotos?: Attachment[];
  Fotos_url?: string;
  Activo?: boolean;
  Orden?: number;
};

/**
 * Resuelve las fotos de una variante.
 *
 * Prioriza `Fotos_url` (el espejo permanente en Blob). Cae a los attachments
 * de Airtable solo como respaldo: esas URLs vencen a las ~2 horas, así que
 * sirven para ver el producto recién cargado, no para producción.
 */
function resolverFotos(fila: FilaVariante): string[] {
  const espejadas = (fila.Fotos_url ?? "")
    .split(/[\n,]/)
    .map((u) => u.trim())
    .filter(Boolean);

  if (espejadas.length > 0) return espejadas;

  return (fila.Fotos ?? []).map((a) => a.url);
}

/**
 * Resuelve los videos del producto, quedándose con los que se pueden reproducir.
 *
 * Un `.mov` solo lo abre Safari: en Chrome, Brave o Android el visitante ve un
 * recuadro negro roto. Preferimos no mostrar nada —el sync lo reporta como
 * aviso— antes que ensuciar la ficha con un reproductor que no anda.
 *
 * Igual que con las fotos, manda `Videos_url` (el espejo permanente en Blob) y
 * los attachments quedan de respaldo: esas URLs vencen a las ~2 horas.
 */
function resolverVideos(fila: FilaProducto): string[] {
  const adjuntos = fila.Video ?? [];

  const espejados = (fila.Videos_url ?? "")
    .split(/[\n,]/)
    .map((u) => u.trim())
    .filter(Boolean);

  // El espejo conserva la extensión original, así que alcanza para juzgarlo.
  if (espejados.length > 0) {
    return espejados.filter((url) => videoReproducible({ url }));
  }

  return adjuntos
    .filter((a) => videoReproducible({ url: a.filename, tipo: a.type }))
    .map((a) => a.url);
}

function armarVariante(registro: AirtableRecord<FilaVariante>): Variante {
  const stock = aNumero(registro.fields.Stock, 0);

  return {
    id: registro.id,
    sku: registro.fields.SKU?.trim() ?? registro.id,
    color: registro.fields.Color?.trim() ?? "Único",
    colorHex: registro.fields.Color_hex?.trim() || "#CCCCCC",
    stock,
    fotos: resolverFotos(registro.fields),
    agotada: stock <= 0,
  };
}

/** Trae todos los productos activos con sus variantes activas, ya ordenados. */
export async function getProductos(categoria?: Categoria): Promise<Producto[]> {
  return tolerante(() => leerProductos(categoria), []);
}

/**
 * El catálogo sin cachear y sin red de contención, para cobrar.
 *
 * Se diferencia de `getProductos` en dos cosas, las dos a propósito:
 *
 *  - No usa el cache de 60 segundos. Un precio o un stock viejo da igual en
 *    una grilla; cobrando, no.
 *  - No pasa por `tolerante()`. Si Airtable no responde tiene que explotar
 *    para que el checkout conteste "problema momentáneo" y no el "tu carrito
 *    está vacío" que salía antes, que es mentira y encima espanta la venta.
 */
export async function getProductosParaCobrar(): Promise<Producto[]> {
  return leerProductos(undefined, 0);
}

async function leerProductos(
  categoria?: Categoria,
  revalidate: number = REVALIDATE
): Promise<Producto[]> {
  const [productos, variantes] = await Promise.all([
    listRecords<FilaProducto>(TABLAS.productos, {
      filterByFormula: "{Activo}",
      sort: [{ field: "Orden" }],
      revalidate,
    }),
    listRecords<FilaVariante>(TABLAS.variantes, {
      filterByFormula: "{Activo}",
      sort: [{ field: "Orden" }],
      revalidate,
    }),
  ]);

  // Agrupa las variantes por el ID del producto al que enlazan.
  const porProducto = new Map<string, Variante[]>();
  for (const registro of variantes) {
    const productoId = registro.fields.Producto?.[0];
    if (!productoId) continue;

    const lista = porProducto.get(productoId) ?? [];
    lista.push(armarVariante(registro));
    porProducto.set(productoId, lista);
  }

  return productos
    .map((registro): Producto => {
      const f = registro.fields;
      const misVariantes = porProducto.get(registro.id) ?? [];
      const precioAnterior = aNumero(f.Precio_anterior, 0);
      const precio = aNumero(f.Precio, 0);

      return {
        id: registro.id,
        nombre: f.Nombre?.trim() ?? "Sin nombre",
        slug: f.Slug?.trim() ?? registro.id,
        categoria: (f.Categoria as Categoria) ?? "Anteojos",
        descripcion: f.Descripcion?.trim() ?? "",
        precio,
        // Solo tiene sentido mostrarlo tachado si es mayor al precio actual.
        precioAnterior: precioAnterior > precio ? precioAnterior : null,
        videos: resolverVideos(f),
        variantes: misVariantes,
        fotoPrincipal: misVariantes.find((v) => v.fotos.length > 0)?.fotos[0] ?? null,
        agotado: misVariantes.length > 0 && misVariantes.every((v) => v.agotada),
        envase: armarEnvase(f),
      };
    })
    .filter((p) => (categoria ? p.categoria === categoria : true))
    // Sin variantes cargadas no hay nada que vender.
    .filter((p) => p.variantes.length > 0);
}

/**
 * Peso y medidas del producto, o `null` si falta alguno.
 *
 * Se exige que estén los cuatro: con un dato incompleto Correo Argentino
 * cotizaría cualquier cosa, y es preferible caer al precio plano de Config
 * antes que cobrarle al cliente un envío calculado sobre datos a medias.
 */
function armarEnvase(f: FilaProducto): Envase | null {
  const pesoG = aNumero(f.Peso_g, 0);
  const largoCm = aNumero(f.Largo_cm, 0);
  const anchoCm = aNumero(f.Ancho_cm, 0);
  const altoCm = aNumero(f.Alto_cm, 0);

  if (pesoG <= 0 || largoCm <= 0 || anchoCm <= 0 || altoCm <= 0) return null;

  return { pesoG, largoCm, anchoCm, altoCm };
}

/** Trae un producto por su slug, o null si no existe o está inactivo. */
export async function getProducto(slug: string): Promise<Producto | null> {
  return tolerante(() => leerProducto(slug), null);
}

async function leerProducto(slug: string): Promise<Producto | null> {
  const productos = await listRecords<FilaProducto>(TABLAS.productos, {
    filterByFormula: `AND({Activo}, {Slug} = '${escaparFormula(slug)}')`,
    maxRecords: 1,
    revalidate: REVALIDATE,
  });

  const registro = productos[0];
  if (!registro) return null;

  const variantes = await listRecords<FilaVariante>(TABLAS.variantes, {
    filterByFormula: "{Activo}",
    sort: [{ field: "Orden" }],
    revalidate: REVALIDATE,
  });

  const misVariantes = variantes
    .filter((v) => v.fields.Producto?.[0] === registro.id)
    .map(armarVariante);

  if (misVariantes.length === 0) return null;

  const f = registro.fields;
  const precio = aNumero(f.Precio, 0);
  const precioAnterior = aNumero(f.Precio_anterior, 0);

  return {
    id: registro.id,
    nombre: f.Nombre?.trim() ?? "Sin nombre",
    slug: f.Slug?.trim() ?? registro.id,
    categoria: (f.Categoria as Categoria) ?? "Anteojos",
    descripcion: f.Descripcion?.trim() ?? "",
    precio,
    precioAnterior: precioAnterior > precio ? precioAnterior : null,
    videos: resolverVideos(f),
    variantes: misVariantes,
    fotoPrincipal: misVariantes.find((v) => v.fotos.length > 0)?.fotos[0] ?? null,
    agotado: misVariantes.every((v) => v.agotada),
    envase: armarEnvase(f),
  };
}

/** Todos los slugs activos, para generar las rutas estáticas y el sitemap. */
export async function getSlugs(): Promise<string[]> {
  return tolerante(() => leerSlugs(), []);
}

async function leerSlugs(): Promise<string[]> {
  const productos = await listRecords<FilaProducto>(TABLAS.productos, {
    filterByFormula: "{Activo}",
    revalidate: REVALIDATE,
  });

  return productos.map((p) => p.fields.Slug?.trim()).filter((s): s is string => Boolean(s));
}
