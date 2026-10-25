import { cuotasActivas, evaluarCuotas, MARCAS_VERIFICADAS, type CuotasVerificadas } from "./cuotas";
import { consultarCuotas, mercadoPagoConfigurado } from "./mercadopago";

/**
 * La consulta a Mercado Pago, solo en el servidor (usa el token de MP). La
 * decisión y los tipos están en lib/cuotas.ts, que también usa el navegador.
 */

/** Las cuotas sin interés confirmadas por Mercado Pago para un precio, o null. */
export async function verificarCuotas(monto: number): Promise<CuotasVerificadas | null> {
  const cuotas = cuotasActivas();
  if (!cuotas || !mercadoPagoConfigurado() || !(monto > 0)) return null;

  try {
    const respuestas = await Promise.all(MARCAS_VERIFICADAS.map((m) => consultarCuotas(monto, m)));
    return evaluarCuotas(respuestas, cuotas, monto);
  } catch (error) {
    console.warn("[cuotas] no se pudieron verificar con Mercado Pago:", error);
    return null;
  }
}

/** Para los listados: se verifica con el precio más bajo de los productos mostrados. */
export async function verificarCuotasPara(precios: number[]): Promise<CuotasVerificadas | null> {
  const validos = precios.filter((p) => p > 0);
  if (validos.length === 0) return null;
  return verificarCuotas(Math.min(...validos));
}
