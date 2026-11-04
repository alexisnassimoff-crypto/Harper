import { createHash } from "node:crypto";
import { after, NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import { claveDeIp, consumirCuota } from "@/lib/cuota";
import { enviarMail, mailCodigoSuscriptor } from "@/lib/mails";
import { claveDeCodigos, codigoNuevo, crearDesafio, normalizarEmail } from "@/lib/reconocer-cliente";

export const dynamic = "force-dynamic";

const MINUTO = 60_000;
const HORA = 60 * MINUTO;
const DIA = 24 * HORA;
const sinCache = { "Cache-Control": "private, no-store" };

/**
 * Pide el código para suscribirse o para entrar como suscriptor (Ale,
 * 03/11/2026). El mismo código sirve para las dos cosas: lo confirma
 * /api/suscriptores/confirmar.
 *
 *   POST /api/suscriptores/codigo  { email }  → 200 { desafio }
 *
 * La respuesta es la misma sea suscriptor o no, y el mail sale después de
 * responder: desde afuera no se puede averiguar quién está suscripto. Con
 * topes por IP y por mail (por hora y por día), y uno de toda la tienda por
 * día que cuenta solo los pedidos que pasaron los otros: unas pocas IP no
 * pueden agotarlo con pedidos que igual se iban a rechazar. El código firma
 * «suscriptor»: no sirve para /api/clientes/datos.
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
  const demasiados = NextResponse.json(
    { error: "Pediste varios códigos seguidos. Probá de nuevo en unos minutos." },
    { status: 429, headers: { ...sinCache, "Retry-After": "300" } }
  );
  const cuota = await consumirCuota([
    { clave: `suscriptor-codigo-ip:${ip}`, ventanaMs: HORA, limite: 10 },
    { clave: `suscriptor-codigo-ip-dia:${ip}`, ventanaMs: DIA, limite: 20 },
    { clave: `suscriptor-codigo-mail:${delMail}`, ventanaMs: 15 * MINUTO, limite: 3 },
    { clave: `suscriptor-codigo-mail-dia:${delMail}`, ventanaMs: DIA, limite: 8 },
  ]);
  if (cuota.excedida) return demasiados;
  // El de toda la tienda, aparte y solo con lo que pasó los topes de arriba.
  const total = await consumirCuota([{ clave: "suscriptor-codigo-total", ventanaMs: DIA, limite: 2_000 }]);
  if (total.excedida) {
    console.error("[suscriptores] se llegó al tope diario de códigos de toda la tienda");
    return demasiados;
  }

  const codigo = codigoNuevo();
  const desafio = crearDesafio(clave, email, codigo, Date.now(), "suscriptor");

  after(async () => {
    try {
      const enviado = await enviarMail(mailCodigoSuscriptor({ email, codigo, config: await getConfig() }));
      if (!enviado) console.warn("[suscriptores] no salió el mail con el código");
    } catch (error) {
      console.error("[suscriptores] no se pudo mandar el código:", error instanceof Error ? error.message : error);
    }
  });

  return NextResponse.json({ desafio }, { headers: sinCache });
}
