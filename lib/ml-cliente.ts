import { tokenVigente } from "./ml-auth";

/**
 * Pedidos autenticados a la API de Mercado Libre para las métricas y las
 * preguntas. A diferencia de lib/mercadolibre.ts, el error conserva el
 * status: un 403 (sin permiso en la aplicación) y un 404 (no existe) se
 * tratan distinto que una caída.
 *
 * `ML_API_URL` reemplaza la API real SOLO fuera de Vercel, para probar de
 * punta a punta contra un Mercado Libre de mentira.
 */
const API = (!process.env.VERCEL && process.env.ML_API_URL?.replace(/\/$/, "")) || "https://api.mercadolibre.com";

export class ErrorML extends Error {
  constructor(
    readonly status: number,
    readonly ruta: string,
    detalle: string
  ) {
    super(`Mercado Libre ${status} en ${ruta}${detalle ? ` (${detalle})` : ""}`);
    this.name = "ErrorML";
  }
}

/** El motivo que da Mercado Libre. Sus respuestas de error no traen el token. */
async function motivo(respuesta: Response): Promise<string> {
  const cuerpo = (await respuesta.json().catch(() => null)) as Record<string, unknown> | null;
  if (!cuerpo) return "";
  return ["error", "message", "code"]
    .map((k) => (typeof cuerpo[k] === "string" ? (cuerpo[k] as string) : ""))
    .filter(Boolean)
    .join(": ")
    .slice(0, 200);
}

export async function pedirML<T = unknown>(
  ruta: string,
  opciones: { metodo?: "GET" | "POST"; cuerpo?: unknown; headers?: Record<string, string>; token?: string } = {}
): Promise<T> {
  const token = opciones.token ?? (await tokenVigente());

  const respuesta = await fetch(`${API}${ruta}`, {
    method: opciones.metodo ?? "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      ...(opciones.cuerpo === undefined ? {} : { "Content-Type": "application/json" }),
      ...opciones.headers,
    },
    body: opciones.cuerpo === undefined ? undefined : JSON.stringify(opciones.cuerpo),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });

  if (!respuesta.ok) throw new ErrorML(respuesta.status, ruta, await motivo(respuesta));
  if (respuesta.status === 204) return null as T;
  return respuesta.json() as Promise<T>;
}

/** El id numérico de la cuenta conectada. */
export async function idDeLaCuenta(token?: string): Promise<number> {
  const yo = await pedirML<{ id?: number }>("/users/me", { token });
  if (typeof yo?.id !== "number") throw new Error("Mercado Libre no devolvió el id de la cuenta");
  return yo.id;
}
