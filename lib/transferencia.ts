import { conDescuento } from "./descuentos";
import type { ItemResuelto } from "./tipos";

/**
 * Pago por transferencia bancaria.
 *
 *  - 10% más sobre los productos, nunca sobre el envío.
 *  - Se suma a la mejor promoción del pedido (el cupón HARPER10 o el
 *    descuento por cantidad, la que convenga): primero esa, después el 10%
 *    sobre el importe ya descontado. $ 89.900 con HARPER10 es $ 80.910, y por
 *    transferencia $ 72.819.
 *  - El envío se calcula como siempre: la transferencia no cambia quién
 *    tiene envío gratis.
 *  - El pedido queda pendiente y se confirma cuando Harper recibe la plata.
 *    El stock no se reserva: se descuenta al confirmar el pago.
 *
 * Este archivo lo usan el checkout y el servidor: sin nada de servidor.
 */

export const PORCENTAJE_TRANSFERENCIA = 10;

/** Cuánto tiene el comprador para transferir. */
export const PLAZO_TRANSFERENCIA_HORAS = 24;

export type MedioPago = "mercadopago" | "transferencia";

/** Cualquier cosa que no sea "transferencia" es Mercado Pago, como siempre. */
export function leerMedioPago(crudo: unknown): MedioPago {
  return crudo === "transferencia" ? "transferencia" : "mercadopago";
}

/** El nombre que va en el pedido de Airtable (campo Medio_pago). */
export const NOMBRE_MEDIO: Record<MedioPago, string> = {
  mercadopago: "Mercado Pago",
  transferencia: "Transferencia",
};

/** La línea que queda en Notas si el pedido no tiene el campo Medio_pago. */
export const NOTA_TRANSFERENCIA = "Medio de pago: Transferencia bancaria";

/** Verdadero si el pedido de Airtable se paga por transferencia. */
export function esPedidoPorTransferencia(fila: { Medio_pago?: unknown; Notas?: unknown }): boolean {
  if (fila.Medio_pago === NOMBRE_MEDIO.transferencia) return true;
  return typeof fila.Notas === "string" && fila.Notas.split("\n").some((l) => l.trim() === NOTA_TRANSFERENCIA);
}

export type PrecioTransferencia = {
  porcentaje: number;
  /** Los ítems a cobrar por transferencia. */
  items: ItemResuelto[];
  /** Los productos con todos los descuentos. */
  subtotal: number;
  /** Lo que descuenta la transferencia, aparte de la otra promoción. */
  ahorro: number;
};

/**
 * El 10% de la transferencia sobre los productos, ya con su mejor promoción.
 *
 * Se calcula sobre el total de los productos, como se haría a mano: dos pares
 * a $ 85.405 son $ 170.810, y por transferencia $ 153.729. Ese total se
 * reparte entre los renglones para que el pedido sume exacto; el redondeo, si
 * lo hay, lo absorbe el renglón más grande.
 */
export function aplicarTransferencia(
  items: ItemResuelto[],
  porcentaje: number = PORCENTAJE_TRANSFERENCIA
): PrecioTransferencia {
  const antes = items.reduce((total, i) => total + i.subtotal, 0);
  const subtotal = conDescuento(antes, porcentaje);

  const lineas = items.map((i) => conDescuento(i.subtotal, porcentaje));
  if (lineas.length > 0) {
    const mayor = items.reduce((m, i, indice) => (i.subtotal > items[m].subtotal ? indice : m), 0);
    lineas[mayor] += subtotal - lineas.reduce((total, l) => total + l, 0);
  }

  return {
    porcentaje,
    items: items.map((i, indice) => ({
      ...i,
      descuentoTransferencia: porcentaje,
      // El renglón manda: el unitario puede quedar con centavos.
      precioUnitario: lineas[indice] / i.cantidad,
      subtotal: lineas[indice],
    })),
    subtotal,
    ahorro: antes - subtotal,
  };
}

/** Los datos de la cuenta, de Config (claves transferencia_*). */
export type DatosTransferencia = {
  titular: string;
  cuit: string;
  banco: string;
  /** Tipo y número de cuenta, tal como los da el banco. */
  cuenta: string;
  cbu: string;
  alias: string;
};

/**
 * Lee los datos de la cuenta. Sin titular, CBU válido y alias no se ofrece
 * la transferencia: un dato mal cargado mandaría la plata a otra cuenta.
 */
export function leerDatosTransferencia(leer: (clave: string) => string | undefined): DatosTransferencia | null {
  const valor = (clave: string) => leer(`transferencia_${clave}`)?.trim() ?? "";
  const datos: DatosTransferencia = {
    titular: valor("titular"),
    cuit: valor("cuit"),
    banco: valor("banco"),
    cuenta: valor("cuenta"),
    cbu: valor("cbu").replace(/\D/g, ""),
    alias: valor("alias"),
  };

  if (!datos.titular || !datos.alias || !cbuValido(datos.cbu)) return null;
  return datos;
}

/**
 * Los datos de la cuenta, en el orden en que se cargan en el home banking.
 * La referencia es el número de pedido: con eso se identifica la transferencia.
 */
export function filasDeCuenta(cuenta: DatosTransferencia, numero: string): [string, string][] {
  const filas: [string, string][] = [["Titular", cuenta.titular]];
  if (cuenta.cuit) filas.push(["CUIT", formatearCuit(cuenta.cuit)]);
  if (cuenta.banco) filas.push(["Banco", cuenta.banco]);
  if (cuenta.cuenta) filas.push(["Cuenta", cuenta.cuenta]);
  filas.push(["CBU", cuenta.cbu], ["Alias", cuenta.alias], ["Referencia", numero]);
  return filas;
}

/** CBU de 22 dígitos con sus dos dígitos verificadores. */
export function cbuValido(cbu: string): boolean {
  if (!/^\d{22}$/.test(cbu)) return false;

  const verifica = (bloque: string, pesos: number[]) => {
    const suma = pesos.reduce((total, peso, i) => total + Number(bloque[i]) * peso, 0);
    return (10 - (suma % 10)) % 10 === Number(bloque[pesos.length]);
  };

  return (
    verifica(cbu.slice(0, 8), [7, 1, 3, 9, 7, 1, 3]) &&
    verifica(cbu.slice(8), [3, 9, 7, 1, 3, 9, 7, 1, 3, 9, 7, 1, 3])
  );
}

/** "30718023161" → "30-71802316-1". Si no tiene 11 dígitos, queda como está. */
export function formatearCuit(cuit: string): string {
  const digitos = cuit.replace(/\D/g, "");
  return digitos.length === 11 ? `${digitos.slice(0, 2)}-${digitos.slice(2, 10)}-${digitos.slice(10)}` : cuit;
}

/** Hasta cuándo puede transferir, desde que confirmó el pedido. */
export function venceLaTransferencia(creado: Date): Date {
  return new Date(creado.getTime() + PLAZO_TRANSFERENCIA_HORAS * 60 * 60 * 1000);
}

/** "lunes 27/10, 15:40", en hora de Buenos Aires. */
export function fechaDeVencimiento(fecha: Date): string {
  const partes = new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(fecha);
  const parte = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";
  return `${parte("weekday")} ${parte("day")}/${parte("month")}, ${parte("hour")}:${parte("minute")}`;
}
