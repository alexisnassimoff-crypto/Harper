/**
 * Cliente mínimo de Airtable sobre la REST API (sin dependencias).
 *
 * Config por variables de entorno en Vercel:
 *   AIRTABLE_TOKEN    -> Personal Access Token (empieza con "pat...")
 *   AIRTABLE_BASE_ID  -> ID de la base (empieza con "app...")
 */

const API_URL = "https://api.airtable.com/v0";

/** IDs de las tablas de la base Harper. */
export const TABLAS = {
  productos: "tblrhgsHP6oJLa5C2",
  variantes: "tblSgqs3hK8Xk8W8N",
  pedidos: "tbl4HkvPUGzjbdWAe",
  clientes: "tblsaNGzIXaeK8aJM",
  config: "tblMyAedM5pvVijLf",
} as const;

export type Attachment = {
  id: string;
  url: string;
  filename: string;
  type: string;
  size: number;
};

export type AirtableRecord<T = Record<string, unknown>> = {
  id: string;
  createdTime: string;
  fields: T;
};

function config() {
  const token = process.env.AIRTABLE_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID;

  if (!token || !baseId) {
    throw new Error(
      "Faltan variables de entorno: AIRTABLE_TOKEN y/o AIRTABLE_BASE_ID"
    );
  }

  return { token, baseId };
}

export function isAirtableConfigured() {
  return Boolean(process.env.AIRTABLE_TOKEN && process.env.AIRTABLE_BASE_ID);
}

type RequestInitConQuery = RequestInit & {
  query?: Record<string, string | undefined>;
  /** Segundos de revalidación del cache de Next. `0` desactiva el cache. */
  revalidate?: number;
};

async function request<T>(
  path: string,
  init: RequestInitConQuery = {}
): Promise<T> {
  const { token, baseId } = config();
  const { query, revalidate, ...rest } = init;

  const url = new URL(`${API_URL}/${baseId}/${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, value);
  }

  const res = await fetch(url, {
    ...rest,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...rest.headers,
    },
    // Las lecturas se cachean; las escrituras nunca.
    ...(revalidate === undefined
      ? { cache: "no-store" as const }
      : { next: { revalidate } }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Airtable ${res.status} en ${path}: ${body}`);
  }

  return res.json() as Promise<T>;
}

/**
 * Lista registros de una tabla, paginando hasta traerlos todos.
 * `table` puede ser el nombre o el tableId.
 */
export async function listRecords<T = Record<string, unknown>>(
  table: string,
  options: {
    view?: string;
    maxRecords?: number;
    filterByFormula?: string;
    sort?: { field: string; direction?: "asc" | "desc" }[];
    revalidate?: number;
  } = {}
): Promise<AirtableRecord<T>[]> {
  const registros: AirtableRecord<T>[] = [];
  let offset: string | undefined;

  do {
    const query: Record<string, string | undefined> = {
      offset,
      maxRecords: options.maxRecords?.toString(),
      filterByFormula: options.filterByFormula,
      view: options.view,
      pageSize: "100",
    };

    // Airtable espera sort como sort[0][field], sort[0][direction].
    options.sort?.forEach((s, i) => {
      query[`sort[${i}][field]`] = s.field;
      query[`sort[${i}][direction]`] = s.direction ?? "asc";
    });

    const data = await request<{
      records: AirtableRecord<T>[];
      offset?: string;
    }>(encodeURIComponent(table), {
      method: "GET",
      query,
      revalidate: options.revalidate,
    });

    registros.push(...data.records);
    offset = data.offset;
  } while (offset && !options.maxRecords);

  return registros;
}

/** Trae un registro puntual por su ID. */
export async function getRecord<T = Record<string, unknown>>(
  table: string,
  recordId: string
): Promise<AirtableRecord<T>> {
  return request<AirtableRecord<T>>(
    `${encodeURIComponent(table)}/${recordId}`,
    { method: "GET" }
  );
}

/** Crea un registro en una tabla. */
export async function createRecord<T = Record<string, unknown>>(
  table: string,
  fields: Partial<T>
): Promise<AirtableRecord<T>> {
  return request<AirtableRecord<T>>(encodeURIComponent(table), {
    method: "POST",
    body: JSON.stringify({ fields, typecast: true }),
  });
}

/** Actualiza parcialmente un registro (PATCH: no borra los campos que no se mandan). */
export async function updateRecord<T = Record<string, unknown>>(
  table: string,
  recordId: string,
  fields: Partial<T>
): Promise<AirtableRecord<T>> {
  return request<AirtableRecord<T>>(
    `${encodeURIComponent(table)}/${recordId}`,
    {
      method: "PATCH",
      body: JSON.stringify({ fields, typecast: true }),
    }
  );
}

/** Actualiza varios registros de una (máximo 10 por request, la API los limita). */
export async function updateRecords<T = Record<string, unknown>>(
  table: string,
  updates: { id: string; fields: Partial<T> }[]
): Promise<void> {
  for (let i = 0; i < updates.length; i += 10) {
    await request(encodeURIComponent(table), {
      method: "PATCH",
      body: JSON.stringify({ records: updates.slice(i, i + 10), typecast: true }),
    });
  }
}

/**
 * Escapa un valor para interpolarlo con seguridad dentro de un filterByFormula.
 * Sin esto, un email con comillas rompe la consulta.
 */
export function escaparFormula(valor: string) {
  return valor.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
