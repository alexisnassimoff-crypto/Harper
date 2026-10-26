import {
  createRecord,
  escaparFormula,
  getRecord,
  listRecords,
  TABLAS,
  updateRecord,
} from "./airtable";
import type { DatosCliente } from "./tipos";

type FilaCliente = {
  Email?: string;
  Nombre?: string;
  Telefono?: string;
  DNI?: string;
  Acepta_promos?: boolean;
  Carrito_abandonado?: boolean;
  Primera_compra?: string;
  Ultima_compra?: string;
};

/** Busca un cliente por email. Devuelve null si no existe. */
async function buscarPorEmail(email: string) {
  const encontrados = await listRecords<FilaCliente>(TABLAS.clientes, {
    filterByFormula: `LOWER({Email}) = '${escaparFormula(email.toLowerCase())}'`,
    maxRecords: 1,
  });

  return encontrados[0] ?? null;
}

/**
 * Si ya hay una compra confirmada con este email o este DNI: lo que decide si
 * el cupón de bienvenida corresponde. `Primera_compra` se escribe solo cuando
 * Mercado Pago aprueba un pago (marcarCompra), así que un pedido pendiente o
 * un pago rechazado no cuentan.
 */
export async function yaCompro(email: string, dni: string): Promise<boolean> {
  const dniLimpio = dni.replace(/\D/g, "");
  const consultas = [
    listRecords<FilaCliente>(TABLAS.clientes, {
      filterByFormula: `LOWER({Email}) = '${escaparFormula(email.trim().toLowerCase())}'`,
      revalidate: 0,
    }),
    dniLimpio.length >= 7
      ? listRecords<FilaCliente>(TABLAS.clientes, { filterByFormula: `{DNI} = '${escaparFormula(dniLimpio)}'`, revalidate: 0 })
      : Promise.resolve([]),
  ];
  const encontrados = (await Promise.all(consultas)).flat();
  return encontrados.some((c) => Boolean(c.fields.Primera_compra));
}

/** Crea o actualiza el cliente con los datos completos del checkout. */
export async function guardarCliente(datos: DatosCliente): Promise<string> {
  const existente = await buscarPorEmail(datos.email);

  const campos: Partial<FilaCliente> = {
    Email: datos.email,
    Nombre: datos.nombre,
    Telefono: datos.telefono,
    DNI: datos.dni,
    Acepta_promos: datos.aceptaPromos,
  };

  if (existente) {
    await updateRecord<FilaCliente>(TABLAS.clientes, existente.id, campos);
    return existente.id;
  }

  const creado = await createRecord<FilaCliente>(TABLAS.clientes, campos);
  return creado.id;
}

/**
 * Marca la compra como concretada.
 * Se llama solo cuando Mercado Pago confirma que el pago fue aprobado.
 */
export async function marcarCompra(clienteId: string, fechaISO: string) {
  const dia = fechaISO.slice(0, 10);

  const actual = await getRecord<FilaCliente>(TABLAS.clientes, clienteId);
  const primera = actual.fields.Primera_compra;

  await updateRecord<FilaCliente>(TABLAS.clientes, clienteId, {
    Ultima_compra: dia,
    // La primera compra se escribe una sola vez.
    ...(primera ? {} : { Primera_compra: dia }),
    Carrito_abandonado: false,
  });
}
