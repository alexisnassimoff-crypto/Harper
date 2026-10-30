import { createRecord, escaparFormula, listRecords, TABLAS } from "./airtable";
import { MESES_SOCIO, planDelPedido } from "./socios";
import type { DatosCliente, ItemResuelto } from "./tipos";

/**
 * El alta de un socio, cuando Mercado Pago aprueba el pago de la membresía
 * (lib/webhook-proceso.ts). Una fila en la tabla Socios por pedido: el número
 * lo pone Airtable (es autonumérico), así que dos altas a la vez nunca tienen
 * el mismo. Si el webhook se reintenta, devuelve la fila que ya existe.
 */

export type FilaSocio = {
  Numero?: number;
  Plan?: string;
  Nombre?: string;
  Email?: string;
  Telefono?: string;
  Alta?: string;
  Vence?: string;
  Pedido?: string;
  Segundo_par?: string;
  Segundo_par_pedido?: string;
  Reposicion?: string;
};

export type Socio = {
  numero: number;
  plan: "Socio" | "Socio con aumento";
  /** "2027-10-30". */
  vence: string;
};

/** "2026-10-30" en Buenos Aires, aunque el servidor esté en otro huso. */
export function fechaArgentina(momento: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(momento);
}

/** El mismo día, `meses` después ("2026-10-30" → "2027-10-30"). */
export function venceEn(alta: string, meses: number = MESES_SOCIO): string {
  const [anio, mes, dia] = alta.split("-").map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1 + meses, dia));
  // 29/2 más un año no existe: queda el último día del mes.
  if (fecha.getUTCDate() !== dia) fecha.setUTCDate(0);
  return fecha.toISOString().slice(0, 10);
}

/** Da de alta al socio de este pedido, o devuelve el que ya estaba. Null si el pedido no trae la membresía. */
export async function registrarSocio(datos: {
  numeroPedido: string;
  items: Pick<ItemResuelto, "productoSlug" | "categoria">[];
  cliente: Pick<DatosCliente, "nombre" | "email" | "telefono">;
  ahora: Date;
}): Promise<Socio | null> {
  const plan = planDelPedido(datos.items);
  if (!plan) return null;

  const existentes = await listRecords<FilaSocio>(TABLAS.socios, {
    filterByFormula: `{Pedido} = '${escaparFormula(datos.numeroPedido)}'`,
    maxRecords: 1,
  });
  const existente = existentes[0]?.fields;
  if (existente?.Numero) {
    return { numero: existente.Numero, plan: (existente.Plan as Socio["plan"]) ?? plan, vence: existente.Vence ?? "" };
  }

  const alta = fechaArgentina(datos.ahora);
  const vence = venceEn(alta);
  const fila = await createRecord<FilaSocio>(TABLAS.socios, {
    Plan: plan,
    Nombre: datos.cliente.nombre,
    Email: datos.cliente.email,
    Telefono: datos.cliente.telefono,
    Alta: alta,
    Vence: vence,
    Pedido: datos.numeroPedido,
    Segundo_par: "Pendiente",
    Reposicion: "Disponible",
  });

  return { numero: fila.fields.Numero ?? 0, plan, vence };
}

/** "N.º 007". */
export function numeroDeSocio(numero: number): string {
  return `N.º ${String(numero).padStart(3, "0")}`;
}
