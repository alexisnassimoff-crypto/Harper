import { createHash } from "node:crypto";
import { after, NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import { claveDeIp, consumirCuota } from "@/lib/cuota";
import { enviarMail, mailCodigoPanel } from "@/lib/mails";
import { esMailDelPanel } from "@/lib/panel-sesion";
import { claveDeCodigos, codigoNuevo, crearDesafio, normalizarEmail } from "@/lib/reconocer-cliente";

export const dynamic = "force-dynamic";

const MINUTO = 60_000;
const HORA = 60 * MINUTO;
const DIA = 24 * HORA;
const sinCache = { "Cache-Control": "private, no-store" };

/**
 * Pide el código para entrar al panel privado (/panel).
 *
 *   POST /api/panel/codigo  { email }  → 200 { desafio }
 *
 * El código sale solo si el mail está autorizado (lib/panel-sesion.ts), pero
 * la respuesta es la misma con cualquier mail: desde afuera no se puede saber
 * cuál entra. Con topes chicos por IP y por mail: lo usa una sola persona.
 */
export async function POST(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return NextResponse.json({ error: "Origen no permitido" }, { status: 403, headers: sinCache });
  }
  const clave = claveDeCodigos();
  if (!clave) return NextResponse.json({ error: "No disponible" }, { status: 503, headers: sinCache });

  const cuerpo = (await request.json().catch(() => null)) as { email?: unknown } | null;
  const email = normalizarEmail(cuerpo?.email);
  if (!email) return NextResponse.json({ error: "Revisá el mail" }, { status: 400, headers: sinCache });

  const ip = claveDeIp(request.headers.get("x-forwarded-for")?.split(",")[0] ?? "");
  const delMail = createHash("sha256").update(email).digest("base64url").slice(0, 16);
  const cuota = await consumirCuota([
    { clave: `panel-codigo-ip:${ip}`, ventanaMs: HORA, limite: 6 },
    { clave: `panel-codigo-ip-dia:${ip}`, ventanaMs: DIA, limite: 12 },
    { clave: `panel-codigo-mail:${delMail}`, ventanaMs: 15 * MINUTO, limite: 3 },
    { clave: `panel-codigo-mail-dia:${delMail}`, ventanaMs: DIA, limite: 8 },
  ]);
  if (cuota.excedida) {
    return NextResponse.json(
      { error: "Pediste varios códigos seguidos. Probá de nuevo en unos minutos." },
      { status: 429, headers: { ...sinCache, "Retry-After": "300" } }
    );
  }

  const codigo = codigoNuevo();
  const desafio = crearDesafio(clave, email, codigo, Date.now(), "panel");

  after(async () => {
    try {
      if (!(await esMailDelPanel(email))) return;
      const enviado = await enviarMail(mailCodigoPanel({ email, codigo, config: await getConfig() }));
      if (!enviado) console.warn("[panel] no salió el mail con el código");
    } catch (error) {
      console.error("[panel] no se pudo mandar el código:", error instanceof Error ? error.message : error);
    }
  });

  return NextResponse.json({ desafio }, { headers: sinCache });
}
