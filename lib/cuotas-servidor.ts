import { cuotasAnunciables, evaluarCuotas, MARCAS_VERIFICADAS, resumirCuotasMP, type CuotasVerificadas } from "./cuotas";
import { consultarCuotas, mercadoPagoConfigurado } from "./mercadopago";
import { CUOTAS_SUSCRIPTORES, CUOTAS_TODOS } from "./suscriptores";

/**
 * La consulta a Mercado Pago, solo en el servidor (usa el token de MP). La
 * decisión y los tipos están en lib/cuotas.ts, que también usa el navegador.
 */

/**
 * Las cuotas sin interés confirmadas por Mercado Pago para un precio, o null.
 * `cuotas` es la cantidad que se quiere anunciar: 3 para todos (por
 * defecto), 6 para un suscriptor (lib/suscriptores.ts). Nunca más que el
 * tope de `NEXT_PUBLIC_CUOTAS`.
 */
export async function verificarCuotas(monto: number, pedidas: number = CUOTAS_TODOS): Promise<CuotasVerificadas | null> {
  const cuotas = cuotasAnunciables(pedidas);
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
export async function verificarCuotasPara(precios: number[], pedidas: number = CUOTAS_TODOS): Promise<CuotasVerificadas | null> {
  const validos = precios.filter((p) => p > 0);
  if (validos.length === 0) return null;
  return verificarCuotas(Math.min(...validos), pedidas);
}

/**
 * Para anunciar las dos cantidades juntas (la barra, la portada, la ficha,
 * /suscriptores): las de cualquier comprador y las de suscriptor, cada una
 * confirmada aparte con Mercado Pago para el mismo precio (Ale, 03/11/2026).
 * Las de suscriptor van solo si son más que las de todos: con el tope de
 * `NEXT_PUBLIC_CUOTAS` en 3, serían las mismas. Si Mercado Pago tarda más de
 * `ms`, sin cuotas.
 */
export async function cuotasDeTodosYSuscriptores(
  precios: number[],
  ms: number
): Promise<{ todos: CuotasVerificadas | null; suscriptores: CuotasVerificadas | null }> {
  const [todos, suscriptores] = await Promise.all([
    conEspera(verificarCuotasPara(precios, CUOTAS_TODOS), ms, null),
    conEspera(verificarCuotasPara(precios, CUOTAS_SUSCRIPTORES), ms, null),
  ]);
  return { todos, suscriptores: suscriptores && (!todos || suscriptores.cuotas > todos.cuotas) ? suscriptores : null };
}

/**
 * Para /api/health: si las cuotas anunciadas se pueden verificar con
 * Mercado Pago para un precio, y qué contestó por marca (resumido, sin
 * credenciales). Nunca tira error.
 */
export async function diagnosticarCuotas(monto: number, pedidas: number = CUOTAS_TODOS) {
  const cuotas = cuotasAnunciables(pedidas);
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

/**
 * Espera una promesa como máximo `ms`; si tarda más, sigue con `siTarda`.
 * Para los datos que solo se muestran (las cuotas, las opiniones): si el
 * servicio tarda, la página sale igual, sin anunciarlos.
 */
export function conEspera<T>(promesa: Promise<T>, ms: number, siTarda: T): Promise<T> {
  return Promise.race([promesa, new Promise<T>((listo) => setTimeout(() => listo(siTarda), ms))]);
}
