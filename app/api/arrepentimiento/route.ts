import { NextResponse } from "next/server";
import { normalizarSolicitud, validarSolicitud } from "@/lib/arrepentimiento";
import { registrarArrepentimiento } from "@/lib/arrepentimiento-servidor";
import { getConfig } from "@/lib/config";
import { claveDeIp, consumirCuota } from "@/lib/cuota";

export const dynamic = "force-dynamic";

const HORA = 3_600_000;
const DIA = 86_400_000;
/** Un comprador manda una solicitud, quizás dos. Más que esto es un abuso. */
const LIMITE_POR_IP_HORA = 5;
/** Entre todos, por día: que nadie use el formulario para llenar casillas de mail. */
const LIMITE_TOTAL_DIA = 100;

const sinCache = { "Cache-Control": "private, no-store" };

/**
 * Botón de arrepentimiento: recibe la solicitud, la registra con un aviso al
 * mail de pedidos y le da al comprador el código de recepción en el momento,
 * en la respuesta y por email (ver lib/arrepentimiento-servidor.ts).
 *
 *   POST /api/arrepentimiento  { nombre, email, pedido?, producto?, motivo? }
 *     → 200 { codigo, recibida, mailEnviado }
 *     → 400 { errores }   → 429 / 503 { error }
 *
 * Solo atiende al propio sitio: una página ajena no puede usarlo para mandar
 * mails en nombre de Harper.
 */
export async function POST(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return NextResponse.json({ error: "Origen no permitido" }, { status: 403, headers: sinCache });
  }

  const solicitud = normalizarSolicitud(await request.json().catch(() => null));
  const errores = validarSolicitud(solicitud);
  if (Object.keys(errores).length > 0) {
    return NextResponse.json({ error: "Revisá los datos del formulario", errores }, { status: 400, headers: sinCache });
  }

  const ip = claveDeIp(request.headers.get("x-forwarded-for")?.split(",")[0] ?? "");
  const cuota = await consumirCuota([
    { clave: `arrepentimiento:ip:${ip}`, ventanaMs: HORA, limite: LIMITE_POR_IP_HORA },
    { clave: "arrepentimiento:dia", ventanaMs: DIA, limite: LIMITE_TOTAL_DIA },
  ]);
  if (cuota.excedida) {
    return NextResponse.json(
      { error: "Recibimos demasiadas solicitudes seguidas." },
      { status: 429, headers: sinCache }
    );
  }

  const resultado = await registrarArrepentimiento(solicitud, {
    config: await getConfig(),
    ahora: new Date(),
    azar: crypto.getRandomValues(new Uint8Array(5)),
  });

  if (!resultado.ok) {
    return NextResponse.json(
      { error: "No pudimos registrar tu solicitud." },
      { status: 503, headers: sinCache }
    );
  }

  const { codigo, recibida, mailEnviado } = resultado;
  return NextResponse.json({ codigo, recibida, mailEnviado }, { headers: sinCache });
}
