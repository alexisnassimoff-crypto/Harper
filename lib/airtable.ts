/**
 * Cliente mínimo de Airtable sobre la REST API (sin dependencias).
 * Config por variables de entorno en Vercel:
 *   AIRTABLE_TOKEN    -> Personal Access Token (empieza con "pat...")
 *   AIRTABLE_BASE_ID  -> ID de la base (empieza con "app...")
 */

const API_URL = "https://api.airtable.com/v0";

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

async function request<T>(
  path: string,
  init: RequestInit & { query?: Record<string, string | undefined> } = {}
): Promise<T> {
  const { token, baseId } = config();
  const { query, ...rest } = init;

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
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Airtable ${res.status} en ${path}: ${body}`);
  }

  return res.json() as Promise<T>;
}

/** Lista registros de una tabla. `table` puede ser el nombre o el tableId. */
export async function listRecords<T = Record<string, unknown>>(
  table: string,
  options: { view?: string; maxRecords?: number; filterByFormula?: string } = {}
): Promise<AirtableRecord<T>[]> {
  const data = await request<{ records: AirtableRecord<T>[] }>(
    encodeURIComponent(table),
    {
      method: "GET",
      query: {
        view: options.view,
        maxRecords: options.maxRecords?.toString(),
        filterByFormula: options.filterByFormula,
      },
    }
  );

  return data.records;
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
