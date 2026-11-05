import { createRecord, escaparFormula, listRecords, TABLAS, updateRecord, type AirtableRecord } from "./airtable";
import { cerrojoDesdeEntorno } from "./cerrojo";
import { claveDelCredito, creditoActivo, esFechaValida } from "./credito-harper";
import type { AlmacenCreditos, DependenciasCredito, EstadoGuardado, FilaCredito } from "./credito-persistencia";

/**
 * Crédito Harper: el almacén sobre la tabla «Créditos» de Airtable
 * (Tarea 10). Los campos son los de docs/plan-programa-harper.md §17.2.
 *
 * SIN CONECTAR: no lo usa el webhook, ni el checkout, ni ninguna página.
 * Además, no escribe salvo en el Airtable de prueba (HARPER_FIXTURES=1, fuera
 * de Vercel) o con HARPER_CREDITO_ACTIVO=1, que sigue apagado: aunque alguien
 * lo llamara por error, en producción no se anota ningún crédito.
 *
 * El cerrojo de Redis es obligatorio (lib/credito-persistencia.ts): sin Redis,
 * `dependenciasCredito()` lo deja en null y cada operación tira sin escribir.
 */

/** Los campos de la tabla «Créditos», con sus nombres de Airtable. */
export type CamposCredito = {
  Clave?: string;
  Pedido?: string;
  Email?: string;
  Monto?: number;
  Porcentaje?: number;
  Base?: number;
  Anteojos?: number;
  Estado?: string;
  Generado_el?: string;
  Fecha_entrega?: string | null;
  Disponible_desde?: string | null;
  Incidencia_abierta?: boolean;
  Reglas?: string;
  Notas?: string;
};

const ESTADOS: readonly EstadoGuardado[] = ["Pendiente", "Disponible", "Anulado", "A revisar"];

/** De la fila a los campos de Airtable: solo lo que viene. Un mail vacío no se manda. */
export function camposDeLaFila(fila: Partial<Omit<FilaCredito, "id">>): CamposCredito {
  const c: CamposCredito = {};
  if (fila.clave !== undefined) c.Clave = fila.clave;
  if (fila.pedido !== undefined) c.Pedido = fila.pedido;
  if (fila.email) c.Email = fila.email;
  if (fila.monto !== undefined) c.Monto = fila.monto;
  if (fila.porcentaje !== undefined) c.Porcentaje = fila.porcentaje;
  if (fila.base !== undefined) c.Base = fila.base;
  if (fila.anteojos !== undefined) c.Anteojos = fila.anteojos;
  if (fila.estado !== undefined) c.Estado = fila.estado;
  if (fila.generadoEl !== undefined) c.Generado_el = fila.generadoEl;
  if (fila.fechaEntrega !== undefined) c.Fecha_entrega = fila.fechaEntrega;
  if (fila.disponibleDesde !== undefined) c.Disponible_desde = fila.disponibleDesde;
  if (fila.incidenciaAbierta !== undefined) c.Incidencia_abierta = fila.incidenciaAbierta;
  if (fila.reglas !== undefined) c.Reglas = fila.reglas;
  if (fila.notas !== undefined) c.Notas = fila.notas;
  return c;
}

const entero = (v: unknown) => typeof v === "number" && Number.isInteger(v) && v >= 0;
const fechaOVacio = (v: unknown) => v === undefined || v === null || v === "" || esFechaValida(v);

/**
 * De Airtable a la fila. Lo que no tiene sentido (un estado desconocido, un
 * monto que no es un entero, una fecha imposible, una clave que no es la de
 * su pedido: alguien la editó a mano) se lee como «A revisar»: nunca se puede
 * usar ni liberar solo. Una fila anulada sigue anulada.
 */
export function filaDelRegistro(r: AirtableRecord<CamposCredito>): FilaCredito {
  const f = r.fields;
  const pedido = (f.Pedido ?? "").trim();
  const leido = ESTADOS.find((e) => e === f.Estado) ?? null;
  const porcentaje = f.Porcentaje === 0 || f.Porcentaje === 5 || f.Porcentaje === 10 ? f.Porcentaje : null;
  const sana =
    leido !== null &&
    pedido !== "" &&
    (f.Clave ?? "").trim() === claveDelCredito(pedido) &&
    entero(f.Monto) &&
    porcentaje !== null &&
    typeof f.Base === "number" &&
    Number.isFinite(f.Base) &&
    f.Base >= 0 &&
    entero(f.Anteojos) &&
    fechaOVacio(f.Fecha_entrega) &&
    fechaOVacio(f.Disponible_desde);
  const estado: EstadoGuardado = leido === "Anulado" ? "Anulado" : sana && leido ? leido : "A revisar";
  return {
    id: r.id,
    clave: (f.Clave ?? "").trim(),
    pedido,
    email: (f.Email ?? "").trim().toLowerCase(),
    monto: entero(f.Monto) ? (f.Monto as number) : 0,
    porcentaje: porcentaje ?? 0,
    base: typeof f.Base === "number" && Number.isFinite(f.Base) ? f.Base : 0,
    anteojos: entero(f.Anteojos) ? (f.Anteojos as number) : 0,
    estado,
    // Sin Generado_el (editada a mano), cuenta desde que se creó la fila.
    generadoEl: f.Generado_el || r.createdTime,
    fechaEntrega: esFechaValida(f.Fecha_entrega) ? f.Fecha_entrega : null,
    disponibleDesde: esFechaValida(f.Disponible_desde) ? f.Disponible_desde : null,
    incidenciaAbierta: f.Incidencia_abierta === true,
    reglas: (f.Reglas ?? "").trim(),
    notas: f.Notas ?? "",
  };
}

/** El Crédito Harper está apagado: no se escribe en la tabla real. */
export class CreditoApagado extends Error {
  constructor() {
    super("El Crédito Harper está apagado (HARPER_CREDITO_ACTIVO): no se escriben créditos");
    this.name = "CreditoApagado";
  }
}

/** Solo en el Airtable de prueba, o con el Crédito Harper prendido (todavía no). */
export function puedeEscribirCreditos(entorno: Record<string, string | undefined> = process.env): boolean {
  const fixtures = entorno.HARPER_FIXTURES === "1" && !entorno.VERCEL;
  return fixtures || creditoActivo(entorno);
}

function exigirEscritura() {
  if (!puedeEscribirCreditos()) throw new CreditoApagado();
}

const tabla = () => TABLAS.creditos;

/** El almacén de lib/credito-persistencia.ts sobre la tabla «Créditos». Lee siempre sin cache. */
export const almacenAirtable: AlmacenCreditos = {
  async delPedido(pedido) {
    const numero = pedido.trim();
    const filas = await listRecords<CamposCredito>(tabla(), { filterByFormula: `{Pedido} = '${escaparFormula(numero)}'`, revalidate: 0 });
    return filas.map(filaDelRegistro).filter((f) => f.pedido === numero);
  },
  async crear(fila) {
    exigirEscritura();
    // Al crear, un campo vacío no se manda (al actualizar, null sí: lo vacía).
    const campos = Object.fromEntries(Object.entries(camposDeLaFila(fila)).filter(([, v]) => v !== null)) as CamposCredito;
    return filaDelRegistro(await createRecord<CamposCredito>(tabla(), campos));
  },
  async actualizar(id, cambios) {
    exigirEscritura();
    return filaDelRegistro(await updateRecord<CamposCredito>(tabla(), id, camposDeLaFila(cambios)));
  },
  async pendientes() {
    const filas = await listRecords<CamposCredito>(tabla(), { filterByFormula: `{Estado} = 'Pendiente'`, revalidate: 0 });
    // Una fila que se lee «A revisar» (datos rotos) no se libera.
    return filas.map(filaDelRegistro).filter((f) => f.estado === "Pendiente");
  },
};

/** Si el pedido ya tiene el cashback de hoy en Saldos (anulado o no). Solo lectura. */
export async function cashbackAnteriorDelPedido(pedido: string): Promise<{ anulado: boolean } | null> {
  const filas = await listRecords<{ Anulado?: boolean }>(TABLAS.saldos, {
    filterByFormula: `AND({Pedido} = '${escaparFormula(pedido.trim())}', {Tipo} = 'Cashback')`,
    revalidate: 0,
  });
  if (filas.length === 0) return null;
  // Si hubiera más de una, alcanza con que exista: bloquea igual.
  return { anulado: filas.every((f) => f.fields.Anulado === true) };
}

/** Las dependencias de verdad: Airtable, el Redis del entorno (o null: no se escribe) y el reloj. */
export function dependenciasCredito(): DependenciasCredito {
  return {
    almacen: almacenAirtable,
    cerrojo: cerrojoDesdeEntorno(),
    cashbackAnterior: cashbackAnteriorDelPedido,
    ahora: () => new Date(),
    nonce: () => crypto.randomUUID(),
  };
}
