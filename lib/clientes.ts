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
 * El buzón real de un mail, para que «ana+2@gmail.com» o «a.na@gmail.com» no
 * cuenten como otra persona para el cupón de bienvenida: sin lo que va
 * después de un «+», y en Gmail también sin puntos (Gmail los ignora).
 */
export function emailCanonico(email: string): string {
  const limpio = email.trim().toLowerCase();
  const arroba = limpio.lastIndexOf("@");
  if (arroba <= 0) return limpio;
  let usuario = limpio.slice(0, arroba).replace(/\+.*$/, "");
  let dominio = limpio.slice(arroba + 1);
  if (dominio === "googlemail.com") dominio = "gmail.com";
  if (dominio === "gmail.com") usuario = usuario.replace(/\./g, "");
  return usuario ? `${usuario}@${dominio}` : limpio;
}

/**
 * Si ya hay una compra confirmada con este email o este DNI: lo que decide si
 * el cupón de bienvenida corresponde. `Primera_compra` se escribe solo cuando
 * Mercado Pago aprueba un pago (marcarCompra), así que un pedido pendiente o
 * un pago rechazado no cuentan. Con el mail se mira también su buzón real
 * (emailCanonico): «ana+2@gmail.com» cuenta como «ana@gmail.com».
 */
export async function yaCompro(email: string, dni: string): Promise<boolean> {
  const dniLimpio = dni.replace(/\D/g, "");
  const mails = [...new Set([email.trim().toLowerCase(), emailCanonico(email)])];
  const consultas = [
    ...mails.map((m) =>
      listRecords<FilaCliente>(TABLAS.clientes, {
        filterByFormula: `LOWER({Email}) = '${escaparFormula(m)}'`,
        revalidate: 0,
      })
    ),
    dniLimpio.length >= 7
      ? listRecords<FilaCliente>(TABLAS.clientes, { filterByFormula: `{DNI} = '${escaparFormula(dniLimpio)}'`, revalidate: 0 })
      : Promise.resolve([]),
  ];
  const encontrados = (await Promise.all(consultas)).flat();
  return encontrados.some((c) => Boolean(c.fields.Primera_compra));
}

/**
 * Crea o actualiza el cliente con los datos completos del checkout. Se llama
 * antes del pago: si el cliente ya compró, su DNI queda el de esa compra (un
 * checkout sin pagar con otro DNI no lo pisa, porque con ese DNI se decide si
 * el cupón de bienvenida corresponde). El DNI nuevo queda igual en el pedido.
 */
export async function guardarCliente(datos: DatosCliente): Promise<{ id: string; dniAnterior: string | null }> {
  const existente = await buscarPorEmail(datos.email);
  const dniGuardado = existente?.fields.Primera_compra ? (existente.fields.DNI ?? "").trim() : "";
  const conservarDni = Boolean(dniGuardado);
  // El DNI con el que figura, si es otro que el de este checkout: va a las notas del pedido.
  const dniAnterior = conservarDni && dniGuardado.replace(/\D/g, "") !== datos.dni.replace(/\D/g, "") ? dniGuardado : null;

  const campos: Partial<FilaCliente> = {
    Email: datos.email,
    Nombre: datos.nombre,
    Telefono: datos.telefono,
    ...(conservarDni ? {} : { DNI: datos.dni }),
    Acepta_promos: datos.aceptaPromos,
  };

  if (existente) {
    await updateRecord<FilaCliente>(TABLAS.clientes, existente.id, campos);
    return { id: existente.id, dniAnterior };
  }

  const creado = await createRecord<FilaCliente>(TABLAS.clientes, campos);
  return { id: creado.id, dniAnterior: null };
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
