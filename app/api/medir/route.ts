import { cookies } from "next/headers";
import { claveDeIp, consumirCuota } from "@/lib/cuota";
import { esEventoMedido } from "@/lib/medir";
import { contarEvento } from "@/lib/medir-servidor";
import { claveDelPanel, COOKIE_PANEL, leerSesionPanel } from "@/lib/panel-sesion";

export const dynamic = "force-dynamic";

const HORA = 60 * 60_000;
const DIA = 24 * HORA;

/** Buscadores, vistas previas de enlaces y navegadores automáticos: no son visitas. */
const NO_ES_PERSONA = /bot|crawl|spider|slurp|headless|lighthouse|preview|facebookexternalhit|whatsapp|telegram|curl|wget|python|node-fetch|axios/i;

/**
 * Cuenta un paso del embudo del panel (lib/medir.ts).
 *
 *   POST /api/medir  "visita" | "producto" | "carrito" | "checkout"  → 204
 *
 * Contesta 204 siempre, cuente o no: es una medición, no tiene nada que
 * decir. No cuenta a los robots, ni el navegador de quien tiene abierta la
 * sesión del panel. Los topes viven en la memoria de la instancia: no gastan
 * comandos de Redis, que es el mismo de los pagos.
 */
export async function POST(request: Request) {
  const nada = new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  if (request.headers.get("sec-fetch-site") === "cross-site") return nada;
  if (NO_ES_PERSONA.test(request.headers.get("user-agent") ?? "")) return nada;

  const evento = (await request.text().catch(() => "")).trim().slice(0, 20);
  if (!esEventoMedido(evento)) return nada;

  // Desde el navegador del panel no se cuenta (alcanza con la firma: no hace falta Airtable).
  const clave = claveDelPanel();
  const sesion = (await cookies()).get(COOKIE_PANEL)?.value;
  if (clave && sesion && leerSesionPanel(clave, sesion)) return nada;

  const ip = claveDeIp(request.headers.get("x-forwarded-for")?.split(",")[0] ?? "");
  const cuota = await consumirCuota(
    [
      { clave: `medir-ip:${ip}`, ventanaMs: HORA, limite: 60 },
      { clave: "medir-instancia", ventanaMs: DIA, limite: 20_000 },
    ],
    { soloMemoria: true }
  );
  if (cuota.excedida) return nada;

  await contarEvento(evento);
  return nada;
}
