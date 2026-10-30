import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { escaparFormula, getRecord, listRecords, TABLAS } from "./airtable";
import { emailValido } from "./validacion";

/**
 * Reconocer a quien ya compró, para no hacerle cargar todo de nuevo.
 *
 * Con el mail solo NO se devuelve nada: cualquiera puede escribir el mail de
 * otro, y vería su nombre, su DNI, su teléfono y su dirección. Por eso se le
 * manda un código de 6 números a ese mail, y recién con el código se
 * completan los datos de su última compra. En el mismo navegador ni hace
 * falta: el checkout ya los recuerda.
 *
 * El código no se guarda en ningún lado: viaja firmado (HMAC) en un
 * "desafío" que el navegador devuelve junto con lo que escribió la persona.
 * Sin la clave del servidor no se puede fabricar un desafío válido. Los
 * intentos se limitan por mail y por IP (ver las rutas en
 * app/api/clientes/).
 */

/** Diez minutos para escribir el código. */
export const VIGENCIA_CODIGO_MS = 10 * 60_000;

/** La clave de las firmas: sale del secreto del webhook de Mercado Pago, que siempre existe si se puede cobrar. */
export function claveDeCodigos(): Buffer | null {
  const secreto = process.env.MP_WEBHOOK_SECRET?.trim();
  return secreto ? createHmac("sha256", secreto).update("harper:reconocer-cliente:v1").digest() : null;
}

/** El mail como se compara: sin espacios y en minúsculas. Null si no tiene forma de mail. */
export function normalizarEmail(crudo: unknown): string | null {
  if (typeof crudo !== "string") return null;
  const email = crudo.trim().toLowerCase();
  return email.length <= 120 && emailValido(email) ? email : null;
}

export function codigoNuevo(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

function firma(clave: Buffer, email: string, codigo: string, vence: number) {
  return createHmac("sha256", clave).update(`${email}|${codigo}|${vence}`).digest("base64url");
}

/** El desafío que viaja al navegador: el vencimiento y la firma del código, nunca el código. */
export function crearDesafio(clave: Buffer, email: string, codigo: string, ahora = Date.now()): string {
  const vence = ahora + VIGENCIA_CODIGO_MS;
  return `${vence}.${firma(clave, email, codigo, vence)}`;
}

/** Si el código que escribió la persona es el del desafío, para ese mail y sin vencer. */
export function codigoCorrecto(clave: Buffer, desafio: unknown, email: string, codigo: unknown, ahora = Date.now()): boolean {
  if (typeof desafio !== "string" || typeof codigo !== "string" || !/^\d{6}$/.test(codigo.trim())) return false;
  const [venceTexto, firmado, sobra] = desafio.split(".");
  const vence = Number(venceTexto);
  if (!firmado || sobra !== undefined || !Number.isFinite(vence) || vence <= ahora) return false;
  const esperada = Buffer.from(firma(clave, email, codigo.trim(), vence));
  const recibida = Buffer.from(firmado);
  return esperada.length === recibida.length && timingSafeEqual(esperada, recibida);
}

type FilaCliente = {
  Email?: string;
  Nombre?: string;
  Telefono?: string;
  DNI?: string;
  Primera_compra?: string;
  Pedidos?: string[];
};

type FilaPedido = {
  Cliente?: string[];
  Direccion?: string;
  Ciudad?: string;
  Provincia?: string;
  CP?: string;
  Fecha?: string;
};

/** Lo que se completa en el checkout: lo de la última compra. */
export type DatosRecordados = {
  email: string;
  nombre: string;
  telefono: string;
  dni: string;
  direccion: string;
  ciudad: string;
  provincia: string;
  cp: string;
};

/**
 * El cliente con ese mail, si tiene una compra confirmada (`Primera_compra`
 * la escribe el webhook cuando Mercado Pago aprueba el pago). Null si no.
 */
export async function clienteQueCompro(email: string) {
  const encontrados = await listRecords<FilaCliente>(TABLAS.clientes, {
    filterByFormula: `LOWER({Email}) = '${escaparFormula(email)}'`,
    revalidate: 0,
  });
  return encontrados.find((c) => Boolean(c.fields.Primera_compra)) ?? null;
}

/**
 * Los datos de la última compra de ese cliente: nombre, teléfono y DNI del
 * cliente, y la dirección del pedido más reciente que la tenga.
 */
export async function datosDeLaUltimaCompra(cliente: { id: string; fields: FilaCliente }): Promise<DatosRecordados> {
  const pedidos = await pedidosDelCliente(cliente);
  const ultimo = pedidos
    .filter((p) => (p.Direccion ?? "").trim() && (p.Ciudad ?? "").trim())
    .sort((a, b) => (b.Fecha ?? "").localeCompare(a.Fecha ?? ""))[0];

  return {
    email: (cliente.fields.Email ?? "").trim(),
    nombre: (cliente.fields.Nombre ?? "").trim(),
    telefono: (cliente.fields.Telefono ?? "").trim(),
    dni: (cliente.fields.DNI ?? "").trim(),
    direccion: (ultimo?.Direccion ?? "").trim(),
    ciudad: (ultimo?.Ciudad ?? "").trim(),
    provincia: (ultimo?.Provincia ?? "").trim(),
    cp: (ultimo?.CP ?? "").trim(),
  };
}

/**
 * Los pedidos del cliente: los enlazados en su registro (los últimos cinco)
 * o, si el enlace no está (la base de prueba no lo mantiene), los más
 * recientes que lo nombran.
 */
async function pedidosDelCliente(cliente: { id: string; fields: FilaCliente }): Promise<FilaPedido[]> {
  const enlazados = (cliente.fields.Pedidos ?? []).slice(-5);
  if (enlazados.length > 0) {
    const leidos = await Promise.allSettled(enlazados.map((id) => getRecord<FilaPedido>(TABLAS.pedidos, id)));
    return leidos.flatMap((r) => (r.status === "fulfilled" ? [r.value.fields] : []));
  }
  const recientes = await listRecords<FilaPedido>(TABLAS.pedidos, {
    filterByFormula: "{Direccion} != ''",
    sort: [{ field: "Fecha", direction: "desc" }],
    maxRecords: 200,
    revalidate: 0,
  });
  return recientes.filter((p) => p.fields.Cliente?.includes(cliente.id)).map((p) => p.fields);
}
