import { NextResponse } from "next/server";
import {
  createRecord,
  escaparFormula,
  listRecords,
  TABLAS,
  updateRecord,
} from "@/lib/airtable";
import { tokenValido } from "@/lib/media";
import {
  fotoEnMaximaCalidad,
  medidasDePublicaciones,
  publicacionesDeVendedor,
  sugerirSku,
} from "@/lib/mercadolibre";

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

type FilaVariante = {
  SKU?: string;
  Fotos?: { url: string }[];
  Fotos_url?: string;
  Producto?: string[];
};

type FilaProducto = {
  Nombre?: string;
  Peso_g?: number;
  Largo_cm?: number;
  Ancho_cm?: number;
  Alto_cm?: number;
};

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
  const medidas = url.searchParams.get("medidas") === "1";
  const nickname = url.searchParams.get("nickname") ?? NICKNAME_POR_DEFECTO;

  try {
    if (medidas) {
      return NextResponse.json(
        await importarMedidas(url.searchParams.get("forzar") === "1")
      );
    }

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
/**
 * Trae el peso y las medidas de las publicaciones de Mercado Libre y los
 * escribe en Productos.
 *
 * Es lo que le falta a Correo Argentino para poder cotizar un envío. La
 * información ya existe cargada en cada publicación; esto solo la trae.
 *
 * El camino es publicación -> variante -> producto, usando el enlace que ya se
 * revisó a mano en la tabla Importacion ML. El peso vive en Productos y no en
 * Variantes porque los colores de un mismo modelo pesan igual.
 *
 * Por defecto **no pisa** lo que ya esté cargado: si alguien midió un producto
 * a mano, ese número gana sobre el de Mercado Libre. Con `&forzar=1` se
 * sobrescribe.
 */
async function importarMedidas(forzar: boolean) {
  const filas = await listRecords<FilaImportacion>(IMPORTACION, {
    filterByFormula: `AND({Variante}, {Estado} != 'ignorar')`,
  });

  const conMLId = filas.filter((f) => f.fields.ML_id && f.fields.Variante?.[0]);

  if (conMLId.length === 0) {
    return {
      ok: true,
      mensaje:
        "No hay filas enlazadas a una variante en la tabla Importacion ML. Enlazalas primero.",
    };
  }

  const [variantes, productos, medidasML] = await Promise.all([
    listRecords<FilaVariante>(TABLAS.variantes, {}),
    listRecords<FilaProducto>(TABLAS.productos, {}),
    medidasDePublicaciones(conMLId.map((f) => f.fields.ML_id!)),
  ]);

  const productoDeVariante = new Map(variantes.map((v) => [v.id, v.fields.Producto?.[0]]));
  const nombreDeProducto = new Map(productos.map((p) => [p.id, p.fields.Nombre ?? p.id]));
  const yaCargado = new Map(
    productos.map((p) => [p.id, Boolean(p.fields.Peso_g && p.fields.Largo_cm)])
  );
  const porMLId = new Map(medidasML.map((m) => [m.id, m]));

  const aEscribir = new Map<string, { pesoG: number; largoCm: number; anchoCm: number; altoCm: number; publicacion: string }>();
  const sinDatos: string[] = [];
  const conflictos: string[] = [];

  for (const fila of conMLId) {
    const mlId = fila.fields.ML_id!;
    const productoId = productoDeVariante.get(fila.fields.Variante![0]);
    const m = porMLId.get(mlId);

    if (!productoId) continue;

    // Sin los cuatro datos no se puede cotizar: se reporta y no se escribe nada
    // a medias, que sería peor que no tener nada.
    if (!m || !m.pesoG || !m.largoCm || !m.anchoCm || !m.altoCm) {
      sinDatos.push(`${fila.fields.Titulo ?? mlId} (${mlId})`);
      continue;
    }

    const previo = aEscribir.get(productoId);

    if (previo && previo.pesoG !== m.pesoG) {
      // Dos colores del mismo modelo con pesos distintos: se avisa y se queda
      // con el primero, que es lo menos sorpresivo.
      conflictos.push(
        `${nombreDeProducto.get(productoId)}: ${previo.pesoG}g vs ${m.pesoG}g`
      );
      continue;
    }

    if (!previo) {
      aEscribir.set(productoId, {
        pesoG: m.pesoG,
        largoCm: m.largoCm,
        anchoCm: m.anchoCm,
        altoCm: m.altoCm,
        publicacion: mlId,
      });
    }
  }

  const escritos: string[] = [];
  const respetados: string[] = [];

  for (const [productoId, datos] of aEscribir) {
    if (!forzar && yaCargado.get(productoId)) {
      respetados.push(nombreDeProducto.get(productoId) ?? productoId);
      continue;
    }

    await updateRecord<FilaProducto>(TABLAS.productos, productoId, {
      Peso_g: datos.pesoG,
      Largo_cm: datos.largoCm,
      Ancho_cm: datos.anchoCm,
      Alto_cm: datos.altoCm,
    });

    escritos.push(
      `${nombreDeProducto.get(productoId)}: ${datos.pesoG}g · ${datos.largoCm}×${datos.anchoCm}×${datos.altoCm} cm`
    );
  }

  // Los que quedan sin medidas después de todo esto hay que cargarlos a mano.
  const faltantes = productos
    .filter((p) => !aEscribir.has(p.id) && !p.fields.Peso_g)
    .map((p) => p.fields.Nombre ?? p.id);

  return {
    ok: true,
    escritos,
    respetados,
    faltantes,
    publicacionesSinMedidas: sinDatos,
    conflictos,
    mensaje:
      faltantes.length > 0
        ? `Faltan cargar a mano en Airtable: ${faltantes.join(", ")}`
        : "Todos los productos tienen peso y medidas.",
  };
}

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

    // Antes de copiar, cada URL se sube a su mejor variante disponible:
    // las guardadas pueden ser la estándar de 500 px y en la ficha se pixela.
    const mejoradas = await Promise.all(
      urls.slice(0, 10).map((url) => fotoEnMaximaCalidad(url))
    );

    await updateRecord<FilaVariante>(TABLAS.variantes, varianteId, {
      Fotos: mejoradas.map((url) => ({ url })),
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
