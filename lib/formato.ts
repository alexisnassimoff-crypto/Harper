/** Formateo de precios en pesos argentinos. */

const formateador = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

export function precio(valor: number) {
  return formateador.format(valor);
}

/** Convierte un texto de Airtable a número, tolerando vacíos y separadores. */
export function aNumero(valor: unknown, porDefecto = 0): number {
  if (typeof valor === "number" && Number.isFinite(valor)) return valor;
  if (typeof valor !== "string") return porDefecto;

  const limpio = valor.replace(/[^\d.-]/g, "");
  const n = Number.parseFloat(limpio);
  return Number.isFinite(n) ? n : porDefecto;
}
