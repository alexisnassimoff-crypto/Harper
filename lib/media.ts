import { put } from "@vercel/blob";
import {
  Attachment,
  AirtableRecord,
  listRecords,
  TABLAS,
  updateRecord,
} from "./airtable";

/**
 * Espejo permanente de las imágenes y videos de Airtable.
 *
 * Las URLs de attachment de Airtable vencen a las ~2 horas. Si la tienda las
 * usara directo, las fotos dejarían de cargar solas. Este módulo copia cada
 * archivo a Vercel Blob —donde la URL es permanente y se sirve por CDN— y
 * escribe esa URL definitiva de vuelta en Airtable.
 *
 * Ale sigue subiendo las fotos en Airtable como siempre; esto corre detrás.
 */

export function blobConfigurado() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

/**
 * Ruta determinística dentro de Blob.
 *
 * Incluir el ID del attachment permite saber si un archivo ya fue espejado
 * y detectar cuándo se reemplazó una foto por otra.
 */
function rutaBlob(carpeta: string, recordId: string, adjunto: Attachment) {
  const extension = adjunto.filename.includes(".")
    ? adjunto.filename.slice(adjunto.filename.lastIndexOf(".")).toLowerCase()
    : "";

  return `harper/${carpeta}/${recordId}/${adjunto.id}${extension}`;
}

/** Verdadero si todos los adjuntos ya figuran en las URLs guardadas. */
function yaEspejado(adjuntos: Attachment[], urls: string[]) {
  if (adjuntos.length !== urls.length) return false;
  return adjuntos.every((a) => urls.some((u) => u.includes(a.id)));
}

async function subir(carpeta: string, recordId: string, adjunto: Attachment) {
  const descarga = await fetch(adjunto.url);

  if (!descarga.ok) {
    throw new Error(
      `No se pudo descargar ${adjunto.filename} desde Airtable (HTTP ${descarga.status})`
    );
  }

  const resultado = await put(
    rutaBlob(carpeta, recordId, adjunto),
    await descarga.arrayBuffer(),
    {
      access: "public",
      contentType: adjunto.type,
      addRandomSuffix: false,
      // Si se reemplazó la foto, se pisa la anterior en la misma ruta.
      allowOverwrite: true,
      // Es contenido inmutable: se cachea agresivamente en el CDN.
      cacheControlMaxAge: 60 * 60 * 24 * 365,
    }
  );

  return resultado.url;
}

export type ResultadoSync = {
  variantesActualizadas: number;
  productosActualizados: number;
  archivosSubidos: number;
  errores: string[];
};

type FilaVariante = { Fotos?: Attachment[]; Fotos_url?: string; SKU?: string };
type FilaProducto = { Video?: Attachment[]; Video_url?: string; Nombre?: string };

export async function sincronizarMedia(): Promise<ResultadoSync> {
  const resultado: ResultadoSync = {
    variantesActualizadas: 0,
    productosActualizados: 0,
    archivosSubidos: 0,
    errores: [],
  };

  // ---- Fotos de las variantes ----
  const variantes = await listRecords<FilaVariante>(TABLAS.variantes);

  for (const registro of variantes) {
    const adjuntos = registro.fields.Fotos ?? [];
    if (adjuntos.length === 0) continue;

    const urlsActuales = (registro.fields.Fotos_url ?? "")
      .split("\n")
      .map((u) => u.trim())
      .filter(Boolean);

    if (yaEspejado(adjuntos, urlsActuales)) continue;

    try {
      const nuevas: string[] = [];

      for (const adjunto of adjuntos) {
        // Si ya estaba espejado, se reutiliza en lugar de volver a subirlo.
        const existente = urlsActuales.find((u) => u.includes(adjunto.id));

        if (existente) {
          nuevas.push(existente);
          continue;
        }

        nuevas.push(await subir("variantes", registro.id, adjunto));
        resultado.archivosSubidos += 1;
      }

      await updateRecord<FilaVariante>(TABLAS.variantes, registro.id, {
        Fotos_url: nuevas.join("\n"),
      });

      resultado.variantesActualizadas += 1;
    } catch (error) {
      const etiqueta = registro.fields.SKU ?? registro.id;
      resultado.errores.push(`Variante ${etiqueta}: ${(error as Error).message}`);
    }
  }

  // ---- Videos de los productos ----
  const productos = await listRecords<FilaProducto>(TABLAS.productos);

  for (const registro of productos) {
    const adjunto = registro.fields.Video?.[0];
    if (!adjunto) continue;

    const actual = registro.fields.Video_url?.trim() ?? "";
    if (actual.includes(adjunto.id)) continue;

    try {
      const url = await subir("videos", registro.id, adjunto);

      await updateRecord<FilaProducto>(TABLAS.productos, registro.id, {
        Video_url: url,
      });

      resultado.archivosSubidos += 1;
      resultado.productosActualizados += 1;
    } catch (error) {
      const etiqueta = registro.fields.Nombre ?? registro.id;
      resultado.errores.push(`Producto ${etiqueta}: ${(error as Error).message}`);
    }
  }

  return resultado;
}

/** Compara dos tokens en tiempo constante, para no filtrarlos por temporización. */
function coincide(recibido: string, esperado: string) {
  if (recibido.length !== esperado.length) return false;

  let diferencia = 0;
  for (let i = 0; i < esperado.length; i += 1) {
    diferencia |= esperado.charCodeAt(i) ^ recibido.charCodeAt(i);
  }

  return diferencia === 0;
}

/**
 * Autoriza la sincronización.
 *
 * Acepta SYNC_TOKEN (para la automation de Airtable y las corridas manuales)
 * y CRON_SECRET (el que manda Vercel en sus crons).
 */
export function tokenValido(recibido: string | null) {
  if (!recibido) return false;

  const aceptados = [process.env.SYNC_TOKEN, process.env.CRON_SECRET].filter(
    (t): t is string => Boolean(t)
  );

  return aceptados.some((esperado) => coincide(recibido, esperado));
}
