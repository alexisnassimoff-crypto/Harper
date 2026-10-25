/**
 * Cuotas sin interés.
 *
 * La tienda no decide si hay cuotas: lo decide la cuenta de Mercado Pago.
 * `NEXT_PUBLIC_CUOTAS` dice cuántas se quieren anunciar (las que Ale activó
 * en el panel de MP), pero no alcanza con eso: antes de anunciarlas se le
 * pregunta a Mercado Pago qué ofrece de verdad para ese precio. Se anuncian
 * solo si, con Visa y con Mastercard y en todos los bancos que devuelve, esas
 * cuotas existen, no tienen interés y el CFT es 0. Si Mercado Pago no lo
 * confirma (o no contesta), no se anuncian cuotas: nunca un CFT supuesto.
 *
 * Lo que se muestra cumple la Res. SIyC 4/2025 (art. 2 inc. d): precio de
 * contado, cantidad y monto de cada cuota (el que calcula Mercado Pago, con
 * centavos) y el costo financiero total efectivo anual.
 */

/** Las marcas con las que se verifica. Son las que nombra el anuncio. */
export const MARCAS_VERIFICADAS = ["visa", "master"] as const;
export const NOMBRE_MARCAS = "Visa y Mastercard";

export type CuotasVerificadas = {
  cuotas: number;
  /** Lo que se paga por cuota, con centavos, como lo calcula Mercado Pago. */
  montoCuota: number;
  /** El CFTEA que informa Mercado Pago, por ejemplo "0,00 %". */
  cftea: string;
};

/** Cantidad de cuotas que se quieren anunciar, o `null` si no corresponde. */
export function cuotasActivas(): number | null {
  // La referencia tiene que ser literal para que Next la incruste en el bundle.
  const crudo = process.env.NEXT_PUBLIC_CUOTAS ?? "";
  const n = Number.parseInt(crudo, 10);

  if (!Number.isInteger(n) || n < 2) return null;
  return n;
}

type CostoMP = {
  installments?: unknown;
  installment_rate?: unknown;
  installment_amount?: unknown;
  total_amount?: unknown;
  labels?: unknown;
};
type OpcionMP = { payer_costs?: unknown };

/** "CFT_0,00%|TEA_0,00%" → 0. Sin etiqueta de CFT → null. */
function cftDeEtiquetas(labels: unknown): number | null {
  if (!Array.isArray(labels)) return null;
  for (const etiqueta of labels) {
    const m = typeof etiqueta === "string" ? /CFT_([\d.,]+)%/.exec(etiqueta) : null;
    if (m) return Number(m[1].replace(/\./g, "").replace(",", "."));
  }
  return null;
}

/**
 * La decisión, con lo que contestó Mercado Pago (una respuesta por marca).
 * Sin red de por medio, para poder probarla.
 */
export function evaluarCuotas(
  respuestas: unknown[],
  cuotas: number,
  monto: number
): CuotasVerificadas | null {
  if (respuestas.length === 0 || cuotas < 2 || monto <= 0) return null;

  let montoCuota: number | null = null;

  for (const respuesta of respuestas) {
    // Una marca sin opciones = Mercado Pago no la ofrece para este monto.
    if (!Array.isArray(respuesta) || respuesta.length === 0) return null;

    for (const opcion of respuesta as OpcionMP[]) {
      const costos = Array.isArray(opcion?.payer_costs) ? (opcion.payer_costs as CostoMP[]) : [];
      const costo = costos.find((c) => c?.installments === cuotas);
      // Un banco sin esas cuotas, o con interés: el anuncio no sería cierto.
      if (!costo || costo.installment_rate !== 0) return null;

      // El CFT, tal como lo informa Mercado Pago. Si no viene en la etiqueta,
      // vale como 0 solo si lo que se paga en total es el precio de contado.
      const cft = cftDeEtiquetas(costo.labels);
      const total = typeof costo.total_amount === "number" ? costo.total_amount : null;
      if (cft === null ? total === null || Math.abs(total - monto) > 0.5 : cft !== 0) return null;

      if (montoCuota === null && typeof costo.installment_amount === "number" && costo.installment_amount > 0) {
        montoCuota = costo.installment_amount;
      }
    }
  }

  return {
    cuotas,
    montoCuota: montoCuota ?? Math.round((monto / cuotas) * 100) / 100,
    cftea: "0,00 %",
  };
}

/**
 * Lo que contestó Mercado Pago, resumido para /api/health: por banco, qué
 * cuotas ofrece y, para las anunciadas, la tasa, el CFT y el total. Sin datos
 * personales ni credenciales. Sirve para saber por qué no se anuncian cuotas.
 */
export function resumirCuotasMP(respuesta: unknown, cuotas: number) {
  if (!Array.isArray(respuesta)) return { formato: "inesperado" };
  return respuesta.map((opcion: { issuer?: { name?: unknown }; payment_type_id?: unknown; processing_mode?: unknown; payer_costs?: unknown }) => {
    const costos = Array.isArray(opcion?.payer_costs) ? (opcion.payer_costs as CostoMP[]) : [];
    const costo = costos.find((c) => c?.installments === cuotas);
    return {
      emisor: typeof opcion?.issuer?.name === "string" ? opcion.issuer.name : null,
      tipo: typeof opcion?.payment_type_id === "string" ? opcion.payment_type_id : null,
      modo: typeof opcion?.processing_mode === "string" ? opcion.processing_mode : null,
      ofrece: costos.map((c) => c?.installments).filter((n) => typeof n === "number"),
      anunciadas: costo
        ? {
            tasa: costo.installment_rate ?? null,
            etiquetas: Array.isArray(costo.labels) ? costo.labels.filter((l) => typeof l === "string") : null,
            monto: costo.installment_amount ?? null,
            total: costo.total_amount ?? null,
          }
        : null,
    };
  });
}
