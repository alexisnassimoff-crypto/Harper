import { configuracionRedis } from "./cerrojo";

/**
 * Cuántas veces pasó algo en la última ventana de tiempo: el límite de
 * búsquedas de direcciones por IP.
 *
 * Google cobra por request, y /api/direcciones es público: sin un tope, un
 * script podría gastar la cuota del mes en una tarde. Con Redis (el mismo
 * Upstash del cerrojo) el contador es compartido entre instancias; sin Redis
 * queda en memoria de la instancia, que para frenar un bucle alcanza.
 *
 * Nunca frena una venta: si Redis falla, se deja pasar y se avisa en el log.
 * Lo que protege es la cuota, no el pago.
 */

const memoria = new Map<string, { cuenta: number; vence: number }>();

export async function contarEnVentana(
  clave: string,
  ventanaMs: number,
  opciones: { fetchImpl?: typeof fetch; ahora?: number } = {}
): Promise<number> {
  const config = configuracionRedis();
  const ahora = opciones.ahora ?? Date.now();

  if (!config) {
    const entrada = memoria.get(clave);
    if (entrada && entrada.vence > ahora) {
      entrada.cuenta += 1;
      return entrada.cuenta;
    }
    memoria.set(clave, { cuenta: 1, vence: ahora + ventanaMs });
    // Que el mapa no crezca sin fin con IPs que no vuelven.
    if (memoria.size > 5_000) {
      for (const [k, v] of memoria) if (v.vence <= ahora) memoria.delete(k);
    }
    return 1;
  }

  const fetchImpl = opciones.fetchImpl ?? fetch;

  async function ejecutar(comando: string[]): Promise<unknown> {
    const respuesta = await fetchImpl(config!.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${config!.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(comando),
      signal: AbortSignal.timeout(3_000),
      cache: "no-store",
    });
    const cuerpo = (await respuesta.json().catch(() => null)) as { result?: unknown; error?: string } | null;
    if (!respuesta.ok || !cuerpo || typeof cuerpo.error === "string") {
      throw new Error(`Redis ${respuesta.status} al ${comando[0]}: ${cuerpo?.error ?? "respuesta ilegible"}`);
    }
    return cuerpo.result;
  }

  try {
    const cuenta = Number(await ejecutar(["INCR", clave]));
    // La ventana arranca con el primer evento y vence sola.
    if (cuenta === 1) await ejecutar(["PEXPIRE", clave, String(ventanaMs)]);
    return cuenta;
  } catch (error) {
    console.warn("[cuota] no se pudo contar; se deja pasar:", error instanceof Error ? error.message : error);
    return 1;
  }
}

/** Para las pruebas. */
export function reiniciarCuotaEnMemoria() {
  memoria.clear();
}
