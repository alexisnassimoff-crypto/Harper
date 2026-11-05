import { cuotasAnunciables, evaluarMejoresCuotas, MARCAS_VERIFICADAS, resumirCuotasMP, evaluarCuotas, type CuotasVerificadas } from "./cuotas";
import { consultarCuotas, mercadoPagoConfigurado } from "./mercadopago";
import { CUOTAS_SON_BENEFICIO, CUOTAS_SUSCRIPTORES, CUOTAS_TODOS, cuotasMaximas } from "./suscriptores";

/**
 * La consulta a Mercado Pago, solo en el servidor (usa el token de MP). La
 * decisión y los tipos están en lib/cuotas.ts, que también usa el navegador.
 */

/** Lo que contesta Mercado Pago para este monto, una respuesta por marca; null si no se puede preguntar. */
async function respuestasDeMercadoPago(monto: number): Promise<unknown[] | null> {
  if (!mercadoPagoConfigurado() || !(monto > 0)) return null;
  try {
    return await Promise.all(MARCAS_VERIFICADAS.map((m) => consultarCuotas(monto, m)));
  } catch (error) {
    console.warn("[cuotas] no se pudieron verificar con Mercado Pago:", error);
    return null;
  }
}

/**
 * Para varios topes a la vez (3 y 6) con una sola consulta a Mercado Pago:
 * para cada tope, las más cuotas sin interés confirmadas para `monto` sin
 * pasarlo (lib/cuotas.ts, evaluarMejoresCuotas), o null.
 */
export async function verificarVarias(monto: number, topes: number[]): Promise<(CuotasVerificadas | null)[]> {
  const anunciables = topes.map((t) => cuotasAnunciables(t));
  if (anunciables.every((t) => t === null)) return topes.map(() => null);
  const respuestas = await respuestasDeMercadoPago(monto);
  return anunciables.map((t) => (t && respuestas ? evaluarMejoresCuotas(respuestas, t, monto) : null));
}

/**
 * Las cuotas sin interés confirmadas por Mercado Pago para un monto, o null:
 * las más que confirma sin pasar de `pedidas` (3 para cualquier comprador,
 * por defecto; 6 para un suscriptor, lib/suscriptores.ts). Nunca más que el
 * tope de `NEXT_PUBLIC_CUOTAS`.
 */
export async function verificarCuotas(monto: number, pedidas: number = CUOTAS_TODOS): Promise<CuotasVerificadas | null> {
  const [verificadas] = await verificarVarias(monto, [pedidas]);
  return verificadas;
}

/** Para los listados: se verifica con el precio más bajo de los productos mostrados. */
export async function verificarCuotasPara(precios: number[], pedidas: number = CUOTAS_TODOS): Promise<CuotasVerificadas | null> {
  const validos = precios.filter((p) => p > 0);
  if (validos.length === 0) return null;
  return verificarCuotas(Math.min(...validos), pedidas);
}

/** Las de suscriptor van solo si son más que las de todos para ese monto: si no, no son un beneficio. */
function soloSiSonMas(todos: CuotasVerificadas | null, suscriptores: CuotasVerificadas | null): CuotasVerificadas | null {
  return suscriptores && (!todos || suscriptores.cuotas > todos.cuotas) ? suscriptores : null;
}

/**
 * Para anunciar las dos cantidades juntas (la barra, la portada, la ficha,
 * /suscriptores): las de cualquier comprador y las de suscriptor, cada una
 * confirmada con Mercado Pago para el mismo precio (Ale, 03/11/2026). Las de
 * suscriptor van solo si son más que las de todos. Si Mercado Pago tarda más
 * de `ms`, sin cuotas.
 */
export async function cuotasDeTodosYSuscriptores(
  precios: number[],
  ms: number
): Promise<{ todos: CuotasVerificadas | null; suscriptores: CuotasVerificadas | null }> {
  const validos = precios.filter((p) => p > 0);
  if (validos.length === 0) return { todos: null, suscriptores: null };
  return conEspera(cuotasDelPrecio(Math.min(...validos)), ms, { todos: null, suscriptores: null });
}

/** Las de todos y las de suscriptor para un mismo precio, con una sola consulta. */
export async function cuotasDelPrecio(monto: number): Promise<{ todos: CuotasVerificadas | null; suscriptores: CuotasVerificadas | null }> {
  const [todos, suscriptores] = await verificarVarias(monto, CUOTAS_SON_BENEFICIO ? [CUOTAS_TODOS, CUOTAS_SUSCRIPTORES] : [CUOTAS_TODOS]);
  return { todos, suscriptores: soloSiSonMas(todos, suscriptores ?? null) };
}

/**
 * Las de este comprador para un importe exacto (el del carrito o el
 * checkout, ya con descuentos, cupón y saldo): `suyas`, con su tope (3, o 6
 * si es suscriptor con sesión verificada); y a quien no lo es, `deSuscriptor`,
 * las que tendría siéndolo, solo si son más.
 */
export async function cuotasParaComprador(
  monto: number,
  esSuscriptor: boolean
): Promise<{ suyas: CuotasVerificadas | null; deSuscriptor: CuotasVerificadas | null }> {
  if (esSuscriptor || !CUOTAS_SON_BENEFICIO) {
    return { suyas: await verificarCuotas(monto, cuotasMaximas(esSuscriptor)), deSuscriptor: null };
  }
  const [suyas, deSuscriptor] = await verificarVarias(monto, [CUOTAS_TODOS, CUOTAS_SUSCRIPTORES]);
  return { suyas, deSuscriptor: soloSiSonMas(suyas, deSuscriptor) };
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
