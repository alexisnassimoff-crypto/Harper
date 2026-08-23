import { NextResponse } from "next/server";
import {
  createRecord,
  escaparFormula,
  listRecords,
  TABLAS,
  updateRecord,
} from "@/lib/airtable";
import { tokenValido } from "@/lib/media";
import { publicacionesDeVendedor, sugerirSku } from "@/lib/mercadolibre";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Tabla intermedia donde caen las publicaciones para revisarlas. */
const IMPORTACION = "tblOh2HN0cORWCPPb";

const NICKNAME_POR_DEFECTO = "HARPER_CASES";

type FilaImportacion = {
  Titulo?: string;
  ML_id?: string;
  Precio?: number;
  Permalink?: string;
  Fotos?: { url: string }[];
  Fotos_origen?: string;
  Variante?: string[];
  Sugerencia?: string;
  Estado?: string;
};

type FilaVariante = { SKU?: string; Fotos?: { url: string }[]; Fotos_url?: string };

/**
 * Importa las fotos de las publicaciones de Mercado Libre.
 *
 * Corre en dos pasos, a propósito: primero trae todo a una tabla intermedia
 * para que se revise, y recién después copia las fotos a las variantes. Nunca
 * asigna una foto a un producto por su cuenta.
 *
 *   Paso 1  GET /api/importar-ml?token=...
 *           Trae las publicaciones y llena la tabla "Importacion ML".
 *
 *   (revisar en Airtable y enlazar cada fila a su variante)
 *
 *   Paso 2  GET /api/importar-ml?token=...&aplicar=1
 *           Copia las fotos de cada fila enlazada a su variante.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const token =
    request.headers.get("x-sync-token") ?? url.searchParams.get("token");

  if (!tokenValido(token)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const aplicar = url.searchParams.get("aplicar") === "1";
  const nickname = url.searchParams.get("nickname") ?? NICKNAME_POR_DEFECTO;

  try {
    return aplicar
      ? NextResponse.json(await aplicarFotos())
      : NextResponse.json(await traerPublicaciones(nickname));
  } catch (error) {
    console.error("[importar-ml] falló:", error);

    return NextResponse.json(
      { error: (error as Error).message },
      { status: 502 }
    );
  }
}

/** Paso 1: trae de Mercado Libre y llena la tabla intermedia. */
async function traerPublicaciones(nickname: string) {
  const publicaciones = await publicacionesDeVendedor(nickname);

  if (publicaciones.length === 0) {
    return {
      ok: true,
      nickname,
      encontradas: 0,
      aviso:
        "Mercado Libre no devolvió publicaciones para ese nickname. Revisá que sea el correcto.",
    };
  }

  const existentes = await listRecords<FilaImportacion>(IMPORTACION);
  const porMlId = new Map(
    existentes
      .map((r) => [r.fields.ML_id, r] as const)
      .filter((par): par is [string, (typeof existentes)[number]] => Boolean(par[0]))
  );

  let creadas = 0;
  let actualizadas = 0;

  for (const publicacion of publicaciones) {
    // Airtable descarga las fotos por su cuenta a partir de la URL.
    const campos: Partial<FilaImportacion> = {
      Titulo: publicacion.titulo,
      ML_id: publicacion.id,
      Precio: publicacion.precio,
      Permalink: publicacion.permalink,
      Fotos: publicacion.fotos.slice(0, 10).map((url) => ({ url })),
      Fotos_origen: publicacion.fotos.join("\n"),
      Sugerencia: sugerirSku(publicacion.titulo),
    };

    const existente = porMlId.get(publicacion.id);

    if (existente) {
      // No se pisa el enlace ni el estado de una fila ya revisada.
      const { Fotos, ...sinFotos } = campos;
      void Fotos;

      await updateRecord<FilaImportacion>(IMPORTACION, existente.id, sinFotos);
      actualizadas += 1;
      continue;
    }

    await createRecord<FilaImportacion>(IMPORTACION, {
      ...campos,
      Estado: "nuevo",
    });
    creadas += 1;
  }

  return {
    ok: true,
    nickname,
    encontradas: publicaciones.length,
    creadas,
    actualizadas,
    siguiente:
      "Abrí la tabla 'Importacion ML' en Airtable, enlazá cada fila a su variante en la columna Variante, y volvé a llamar con &aplicar=1",
  };
}

/** Paso 2: copia las fotos de las filas ya enlazadas a su variante. */
async function aplicarFotos() {
  const filas = await listRecords<FilaImportacion>(IMPORTACION, {
    filterByFormula: `AND({Variante}, {Estado} != 'importado', {Estado} != 'ignorar')`,
  });

  const aplicadas: string[] = [];
  const omitidas: string[] = [];

  for (const fila of filas) {
    const varianteId = fila.fields.Variante?.[0];

    const urls = (fila.fields.Fotos_origen ?? "")
      .split("\n")
      .map((u) => u.trim())
      .filter(Boolean);

    if (!varianteId || urls.length === 0) {
      omitidas.push(fila.fields.Titulo ?? fila.id);
      continue;
    }

    // Se escriben las URLs de Mercado Libre, que son públicas y permanentes.
    // Airtable las descarga; después /api/sync-media las espeja a Blob.
    await updateRecord<FilaVariante>(TABLAS.variantes, varianteId, {
      Fotos: urls.slice(0, 10).map((url) => ({ url })),
      // Se limpia el espejo para que sync-media vuelva a generarlo.
      Fotos_url: "",
    });

    await updateRecord<FilaImportacion>(IMPORTACION, fila.id, {
      Estado: "importado",
    });

    aplicadas.push(fila.fields.Titulo ?? fila.id);
  }

  return {
    ok: true,
    aplicadas: aplicadas.length,
    detalle: aplicadas,
    omitidas,
    siguiente:
      aplicadas.length > 0
        ? "Corré /api/sync-media para pasar las fotos a almacenamiento permanente."
        : "No había filas enlazadas a una variante todavía.",
  };
}

/** Enlaza una fila de importación con una variante buscándola por SKU. */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const token =
    request.headers.get("x-sync-token") ?? url.searchParams.get("token");

  if (!tokenValido(token)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  let cuerpo: { filaId?: string; sku?: string };

  try {
    cuerpo = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { filaId, sku } = cuerpo;

  if (!filaId || !sku) {
    return NextResponse.json(
      { error: "Faltan filaId y sku" },
      { status: 400 }
    );
  }

  const variantes = await listRecords<FilaVariante>(TABLAS.variantes, {
    filterByFormula: `{SKU} = '${escaparFormula(sku)}'`,
    maxRecords: 1,
  });

  const variante = variantes[0];

  if (!variante) {
    return NextResponse.json(
      { error: `No existe ninguna variante con SKU ${sku}` },
      { status: 404 }
    );
  }

  await updateRecord<FilaImportacion>(IMPORTACION, filaId, {
    Variante: [variante.id],
    Estado: "asignado",
  });

  return NextResponse.json({ ok: true, sku, varianteId: variante.id });
}
