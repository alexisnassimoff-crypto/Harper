import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { claveDeIp, consumirCuota } from "@/lib/cuota";
import { claveDeCodigos, clienteQueCompro, codigoCorrecto, datosDeLaUltimaCompra, normalizarEmail } from "@/lib/reconocer-cliente";

export const dynamic = "force-dynamic";

const MINUTO = 60_000;
const sinCache = { "Cache-Control": "private, no-store" };
const INCORRECTO = "El código no es correcto o ya venció. Revisalo o pedí otro.";

/**
 * Con el código que le llegó por mail, los datos de su última compra para
 * completar el checkout (ver lib/reconocer-cliente.ts).
 *
 *   POST /api/clientes/datos  { email, codigo, desafio }  → 200 { datos }
 *
 * Pocos intentos por mail y por IP: seis números no se adivinan así.
 */
export async function POST(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return NextResponse.json({ error: "Origen no permitido" }, { status: 403, headers: sinCache });
  }
  const clave = claveDeCodigos();
  if (!clave) return NextResponse.json({ error: "No disponible" }, { status: 503, headers: sinCache });

  const cuerpo = (await request.json().catch(() => null)) as { email?: unknown; codigo?: unknown; desafio?: unknown } | null;
  const email = normalizarEmail(cuerpo?.email);
  if (!email) return NextResponse.json({ error: "Revisá el mail" }, { status: 400, headers: sinCache });

  const ip = claveDeIp(request.headers.get("x-forwarded-for")?.split(",")[0] ?? "");
  const delMail = createHash("sha256").update(email).digest("base64url").slice(0, 16);
  const cuota = await consumirCuota([
    { clave: `datos-ip:${ip}`, ventanaMs: 60 * MINUTO, limite: 20 },
    { clave: `datos-mail:${delMail}`, ventanaMs: 15 * MINUTO, limite: 6 },
  ]);
  if (cuota.excedida) {
    return NextResponse.json(
      { error: "Demasiados intentos. Esperá unos minutos y pedí un código nuevo." },
      { status: 429, headers: { ...sinCache, "Retry-After": "300" } }
    );
  }

  if (!codigoCorrecto(clave, cuerpo?.desafio, email, cuerpo?.codigo)) {
    return NextResponse.json({ error: INCORRECTO }, { status: 400, headers: sinCache });
  }

  try {
    const cliente = await clienteQueCompro(email);
    if (!cliente) return NextResponse.json({ error: INCORRECTO }, { status: 400, headers: sinCache });
    return NextResponse.json({ datos: await datosDeLaUltimaCompra(cliente) }, { headers: sinCache });
  } catch (error) {
    console.error("[clientes] no se pudieron leer los datos:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "No pudimos traer tus datos. Probá en un rato." }, { status: 503, headers: sinCache });
  }
}
