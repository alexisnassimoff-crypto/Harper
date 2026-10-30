/** Formateo de precios en pesos argentinos. */

const formateador = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

export function precio(valor: number) {
  return formateador.format(valor);
}

const conCentavos = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Con centavos: cuotas y precio sin impuestos, que no son pesos enteros. */
export function precioConCentavos(valor: number) {
  return conCentavos.format(valor);
}

/** Convierte un texto de Airtable a número, tolerando vacíos y separadores. */
/**
 * Un monto en pesos escrito a mano en Airtable: "60000", "60.000",
 * "$ 60.000" o "60.000,50". El punto seguido de tres cifras separa los
 * miles, como se escribe en la Argentina: "60.000" son sesenta mil, no
 * sesenta (con `aNumero`, un envío gratis desde $ 60).
 */
export function aPesos(valor: unknown, porDefecto = 0): number {
  if (typeof valor === "number" && Number.isFinite(valor)) return valor;
  if (typeof valor !== "string") return porDefecto;

  let limpio = valor.replace(/[^\d.,-]/g, "");
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(limpio)) limpio = limpio.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d+,\d{1,2}$/.test(limpio)) limpio = limpio.replace(",", ".");
  else limpio = limpio.replace(/,/g, "");
  const n = Number.parseFloat(limpio);
  return Number.isFinite(n) ? n : porDefecto;
}

export function aNumero(valor: unknown, porDefecto = 0): number {
  if (typeof valor === "number" && Number.isFinite(valor)) return valor;
  if (typeof valor !== "string") return porDefecto;

  const limpio = valor.replace(/[^\d.-]/g, "");
  const n = Number.parseFloat(limpio);
  return Number.isFinite(n) ? n : porDefecto;
}
