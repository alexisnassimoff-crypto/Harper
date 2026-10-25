import { TABLAS } from "../airtable";
import { cumpleFormula } from "./formula";
import { tablasIniciales, type RegistroFixture } from "./datos";

/**
 * Un Airtable de mentira, en memoria.
 *
 * Responde a las mismas rutas y con las mismas formas que la REST API real,
 * así `lib/airtable.ts` no tiene que saber si está hablando con uno u otro.
 * Soporta lo que la tienda usa: listar con fórmula y orden, leer un registro,
 * crear y actualizar (de a uno o en lote).
 *
 * El estado vive en el módulo: mientras el proceso corra, los pedidos creados
 * en una prueba se pueden leer después. Al reiniciar, vuelve al catálogo.
 */

const tablas = tablasIniciales();
let secuencia = 0;

type Init = {
  method?: string;
  body?: string | null;
  query?: Record<string, string | undefined>;
};

function tabla(id: string): RegistroFixture[] {
  const filas = tablas.get(id);
  if (!filas) throw new Error(`Modo de prueba: no existe la tabla ${id}`);
  return filas;
}

function nuevoId() {
  secuencia += 1;
  return `recFIX${secuencia.toString().padStart(11, "0")}`;
}

function comparar(a: unknown, b: unknown) {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a ?? "").localeCompare(String(b ?? ""));
}

function listar(id: string, query: Record<string, string | undefined>) {
  let filas = [...tabla(id)];

  const formula = query.filterByFormula;
  if (formula) filas = filas.filter((f) => cumpleFormula(formula, f.fields));

  // sort[0][field], sort[0][direction], sort[1][field]…
  const ordenes = Object.keys(query)
    .filter((k) => /^sort\[\d+\]\[field\]$/.test(k))
    .sort()
    .map((k) => {
      const indice = k.slice(5, k.indexOf("]"));
      return {
        campo: query[k] as string,
        direccion: query[`sort[${indice}][direction]`] === "desc" ? -1 : 1,
      };
    });

  if (ordenes.length > 0) {
    filas.sort((a, b) => {
      for (const o of ordenes) {
        const r = comparar(a.fields[o.campo], b.fields[o.campo]) * o.direccion;
        if (r !== 0) return r;
      }
      return 0;
    });
  }

  const maximo = query.maxRecords ? Number(query.maxRecords) : undefined;
  if (maximo) filas = filas.slice(0, maximo);

  return { records: filas };
}

function leer(id: string, recordId: string) {
  const fila = tabla(id).find((f) => f.id === recordId);
  if (!fila) throw respuesta(404, `Registro ${recordId} no encontrado en ${id}`);
  return fila;
}

function crear(id: string, fields: Record<string, unknown>) {
  // Para probar una base sin los campos de facturación: Airtable contesta 422.
  const sinFactura = process.env.HARPER_FIXTURES_PEDIDOS_SIN_FACTURA === "1" && id === TABLAS.pedidos;
  const desconocido = sinFactura ? Object.keys(fields).find((k) => k.startsWith("Factura_")) : undefined;
  if (desconocido) {
    throw respuesta(422, JSON.stringify({ error: { type: "UNKNOWN_FIELD_NAME", message: `Unknown field name: "${desconocido}"` } }));
  }

  const fila: RegistroFixture = {
    id: nuevoId(),
    createdTime: new Date().toISOString(),
    fields: { ...fields },
  };
  tabla(id).push(fila);
  return fila;
}

function actualizar(id: string, recordId: string, fields: Record<string, unknown>) {
  const fila = leer(id, recordId);
  Object.assign(fila.fields, fields);
  return fila;
}

/** Error con la forma del que arma `lib/airtable.ts` para que se trate igual. */
export class RespuestaFixture extends Error {
  constructor(readonly status: number, mensaje: string) {
    super(mensaje);
    this.name = "RespuestaFixture";
  }
}

function respuesta(status: number, mensaje: string) {
  return new RespuestaFixture(status, mensaje);
}

/**
 * Gancho para las pruebas: se llama antes de atender cada llamada.
 *
 * Sirve para ordenar carreras (demorar una escritura hasta que otra
 * "instancia" haya leído), para simular caídas (tirar un error justo antes de
 * una escritura) y para simular respuestas de Airtable (tirar una
 * `RespuestaFixture`). Fuera de las pruebas es `null` y no hace nada.
 */
export type Interceptor = (
  path: string,
  llamada: { method: string; body: string | null }
) => Promise<void> | void;

let interceptor: Interceptor | null = null;

export function interceptar(fn: Interceptor | null) {
  interceptor = fn;
}

export function interceptorActual() {
  return interceptor;
}

/** Atiende una llamada tal como la haría la API. `path` viene ya codificado. */
export function atender<T>(path: string, init: Init): T {
  const [tablaCodificada, recordId] = path.split("/");
  const id = decodeURIComponent(tablaCodificada);
  const metodo = (init.method ?? "GET").toUpperCase();
  const cuerpo = init.body ? (JSON.parse(init.body) as Record<string, unknown>) : {};

  if (metodo === "GET") {
    return (recordId ? leer(id, recordId) : listar(id, init.query ?? {})) as T;
  }

  if (metodo === "POST") {
    return crear(id, (cuerpo.fields as Record<string, unknown>) ?? {}) as T;
  }

  if (metodo === "PATCH") {
    if (recordId) {
      return actualizar(id, recordId, (cuerpo.fields as Record<string, unknown>) ?? {}) as T;
    }

    const lote = (cuerpo.records as { id: string; fields: Record<string, unknown> }[]) ?? [];
    return { records: lote.map((r) => actualizar(id, r.id, r.fields)) } as T;
  }

  throw respuesta(405, `Modo de prueba: método ${metodo} no soportado`);
}

/** Para las pruebas: vuelve al catálogo inicial. */
export function reiniciar() {
  tablas.clear();
  for (const [id, filas] of tablasIniciales()) tablas.set(id, filas);
  secuencia = 0;
}
