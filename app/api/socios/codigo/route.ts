import { createHash } from "node:crypto";
import { after, NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import { claveDeIp, consumirCuota } from "@/lib/cuota";
import { enviarMail, mailCodigoSocio } from "@/lib/mails";
import { claveDeCodigos, codigoNuevo, crearDesafio, normalizarEmail } from "@/lib/reconocer-cliente";
import { socioPorEmail } from "@/lib/socios-cuenta";

export const dynamic = "force-dynamic";

const MINUTO = 60_000;
const HORA = 60 * MINUTO;
const DIA = 24 * HORA;
const sinCache = { "Cache-Control": "private, no-store" };

/**
 * Pide el código para entrar como socio (lib/socios-sesion.ts).
 *
 *   POST /api/socios/codigo  { email }  → 200 { desafio }
 *
 * Como /api/clientes/codigo: la respuesta es la misma sea socio o no (y el
 * mail sale después de responder), así desde afuera no se puede averiguar
 * quién es socio. Solo a un socio vigente le llega el código. Con topes por
 * IP, por mail y en total.
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
    { clave: `socio-codigo-ip:${ip}`, ventanaMs: HORA, limite: 10 },
    { clave: `socio-codigo-mail:${delMail}`, ventanaMs: 15 * MINUTO, limite: 3 },
    { clave: "socio-codigo-total", ventanaMs: DIA, limite: 500 },
  ]);
  if (cuota.excedida) {
    return NextResponse.json(
      { error: "Pediste varios códigos seguidos. Probá de nuevo en unos minutos." },
      { status: 429, headers: { ...sinCache, "Retry-After": "300" } }
    );
  }

  const codigo = codigoNuevo();
  const desafio = crearDesafio(clave, email, codigo);

  after(async () => {
    try {
      if (!(await socioPorEmail(email))) return;
      const enviado = await enviarMail(mailCodigoSocio({ email, codigo, config: await getConfig() }));
      if (!enviado) console.warn("[socios] no salió el mail con el código");
    } catch (error) {
      console.error("[socios] no se pudo mandar el código:", error instanceof Error ? error.message : error);
    }
  });

  return NextResponse.json({ desafio }, { headers: sinCache });
}
