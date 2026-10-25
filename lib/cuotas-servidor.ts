import { cuotasActivas, evaluarCuotas, MARCAS_VERIFICADAS, resumirCuotasMP, type CuotasVerificadas } from "./cuotas";
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

/**
 * Para /api/health: si las cuotas anunciadas se pueden verificar con
 * Mercado Pago para un precio, y qué contestó por marca (resumido, sin
 * credenciales). Nunca tira error.
 */
export async function diagnosticarCuotas(monto: number) {
  const cuotas = cuotasActivas();
  if (!cuotas) return { anunciadas: null };
  if (!mercadoPagoConfigurado()) return { anunciadas: cuotas, mercadoPago: false };
  const marcas = await Promise.all(
    MARCAS_VERIFICADAS.map(async (marca) => {
      try {
        const respuesta = await consultarCuotas(monto, marca);
        return { marca, respuesta, detalle: resumirCuotasMP(respuesta, cuotas) };
      } catch (error) {
        return { marca, respuesta: null, error: error instanceof Error ? error.message : String(error) };
      }
    })
  );
  const verificadas = marcas.every((m) => m.respuesta !== null)
    ? evaluarCuotas(marcas.map((m) => m.respuesta), cuotas, monto)
    : null;
  return {
    anunciadas: cuotas,
    monto,
    verificadas: verificadas !== null,
    marcas: marcas.map(({ marca, detalle, error }) => ({ marca, ...(error ? { error } : { detalle }) })),
  };
}
