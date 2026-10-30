import { after, NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import { claveDeIp, consumirCuota } from "@/lib/cuota";
import { enviarMail, mailCodigoDeAcceso } from "@/lib/mails";
import { claveDeCodigos, clienteQueCompro, codigoNuevo, crearDesafio, normalizarEmail } from "@/lib/reconocer-cliente";
import { createHash } from "node:crypto";

export const dynamic = "force-dynamic";

const MINUTO = 60_000;
const HORA = 60 * MINUTO;
const DIA = 24 * HORA;
const sinCache = { "Cache-Control": "private, no-store" };

/**
 * Pide el código para completar los datos de una compra anterior (ver
 * lib/reconocer-cliente.ts).
 *
 *   POST /api/clientes/codigo  { email }  → 200 { desafio }
 *
 * La respuesta es la misma haya comprado o no ese mail (y el mail sale
 * después de responder): desde afuera no se puede averiguar quién compró en
 * Harper. Solo si compró le llega el código. Con topes por IP, por mail y en
 * total, para que nadie use la ruta para llenarle la casilla a otro.
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
    { clave: `codigo-ip:${ip}`, ventanaMs: HORA, limite: 10 },
    { clave: `codigo-mail:${delMail}`, ventanaMs: 15 * MINUTO, limite: 3 },
    { clave: "codigo-total", ventanaMs: DIA, limite: 500 },
  ]);
  if (cuota.excedida) {
    return NextResponse.json(
      { error: "Pediste varios códigos seguidos. Probá de nuevo en unos minutos." },
      { status: 429, headers: { ...sinCache, "Retry-After": "300" } }
    );
  }

  const codigo = codigoNuevo();
  const desafio = crearDesafio(clave, email, codigo);

  // Después de responder: el tiempo de la respuesta no delata si compró.
  after(async () => {
    try {
      const cliente = await clienteQueCompro(email);
      if (!cliente) return;
      const enviado = await enviarMail(mailCodigoDeAcceso({ email, codigo, config: await getConfig() }));
      if (!enviado) console.warn("[clientes] no salió el mail con el código");
    } catch (error) {
      console.error("[clientes] no se pudo mandar el código:", error instanceof Error ? error.message : error);
    }
  });

  return NextResponse.json({ desafio }, { headers: sinCache });
}
