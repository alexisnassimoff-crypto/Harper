import { createHash } from "node:crypto";
import { after, NextResponse } from "next/server";
import { getProductos } from "@/lib/catalogo";
import { esCategoriaDeAnteojos } from "@/lib/categorias";
import { getConfig } from "@/lib/config";
import { claveDeIp, consumirCuota } from "@/lib/cuota";
import { conEspera, verificarCuotasPara } from "@/lib/cuotas-servidor";
import { enviarMail, mailBienvenidaSuscriptor } from "@/lib/mails";
import { claveDeCodigos, codigoCorrecto, normalizarEmail } from "@/lib/reconocer-cliente";
import { urlDelSitio } from "@/lib/sitio";
import { CUOTAS_SON_BENEFICIO, CUOTAS_SUSCRIPTORES, normalizarOrigenSuscripcion } from "@/lib/suscriptores";
import {
  darDeAlta,
  ErrorAltaEnCurso,
  estaActivo,
  resumenDeLaCuenta,
  suscriptorPorEmail,
  tieneCupon,
} from "@/lib/suscriptores-cuenta";
import {
  claveDeSesionSuscriptor,
  COOKIE_SUSCRIPTOR,
  crearSesionSuscriptor,
  DURACION_SESION_MS,
  enlaceDeBaja,
  opcionesDeCookie,
} from "@/lib/suscriptores-sesion";

export const dynamic = "force-dynamic";

const MINUTO = 60_000;
const sinCache = { "Cache-Control": "private, no-store" };
const INCORRECTO = "El código no es correcto o ya venció. Revisalo o pedí otro.";
/** Cuánto se espera a Mercado Pago para nombrar las cuotas en la bienvenida: si tarda, el mail sale sin ellas. */
const ESPERA_CUOTAS_MS = 5_000;

/**
 * Con el código que le llegó por mail, suscribe a la persona o, si ya estaba
 * suscripta, la reconoce (Ale, 03/11/2026). En los dos casos abre la sesión en
 * este navegador (cookie firmada, lib/suscriptores-sesion.ts).
 *
 *   POST /api/suscriptores/confirmar
 *     { email, codigo, desafio, nombre?, aceptaMails, origen? }
 *     → 200 { estado: "nueva" | "reactivada" | "ya", suscriptor: { email, nombre, cupon, saldoDisponible, saldoEnCamino } }
 *     → 400 { error }  (con `faltaAceptarMails: true` si hace falta la casilla para suscribirse)
 *
 * Para suscribirse (o volver después de una baja) `aceptaMails` tiene que ser
 * `true`: es el consentimiento para los mails. Para entrar ya suscripto no
 * hace falta. El mail de bienvenida sale solo con un alta nueva, después de
 * responder. Pocos intentos por mail y por IP: seis números no se adivinan así.
 */
export async function POST(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return NextResponse.json({ error: "Origen no permitido" }, { status: 403, headers: sinCache });
  }
  const clave = claveDeCodigos();
  const claveSesion = claveDeSesionSuscriptor();
  if (!clave || !claveSesion) return NextResponse.json({ error: "No disponible" }, { status: 503, headers: sinCache });

  const cuerpo = (await request.json().catch(() => null)) as {
    email?: unknown;
    codigo?: unknown;
    desafio?: unknown;
    nombre?: unknown;
    aceptaMails?: unknown;
    origen?: unknown;
  } | null;
  const email = normalizarEmail(cuerpo?.email);
  if (!email) return NextResponse.json({ error: "Revisá el mail" }, { status: 400, headers: sinCache });

  const ip = claveDeIp(request.headers.get("x-forwarded-for")?.split(",")[0] ?? "");
  const delMail = createHash("sha256").update(email).digest("base64url").slice(0, 16);
  const cuota = await consumirCuota([
    { clave: `suscriptor-confirmar-ip:${ip}`, ventanaMs: 60 * MINUTO, limite: 20 },
    { clave: `suscriptor-confirmar-mail:${delMail}`, ventanaMs: 15 * MINUTO, limite: 6 },
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

  const nombre = typeof cuerpo?.nombre === "string" ? cuerpo.nombre.trim().slice(0, 80) : "";
  const origen = normalizarOrigenSuscripcion(cuerpo?.origen);

  try {
    // Suscribirse (o volver después de una baja) necesita el consentimiento
    // explícito para los mails; entrar ya suscripto, no.
    const existente = await suscriptorPorEmail(email);
    if (!(existente && estaActivo(existente)) && cuerpo?.aceptaMails !== true) {
      return NextResponse.json(
        { error: "Para suscribirte, aceptá recibir nuestros mails.", faltaAceptarMails: true },
        { status: 400, headers: sinCache }
      );
    }
    const { cuenta, estado } = await darDeAlta({ email, nombre, origen });

    const ahora = Date.now();
    const valor = crearSesionSuscriptor(claveSesion, { suscriptorId: cuenta.id, email: cuenta.email }, ahora);
    const resumen = await resumenDeLaCuenta(cuenta);

    const respuesta = NextResponse.json(
      {
        estado,
        suscriptor: {
          email: resumen.email,
          nombre: resumen.nombre,
          cupon: resumen.cupon,
          saldoDisponible: resumen.saldoDisponible,
          saldoEnCamino: resumen.saldoEnCamino,
        },
      },
      { headers: sinCache }
    );
    respuesta.cookies.set(COOKIE_SUSCRIPTOR, valor, opcionesDeCookie(ahora + DURACION_SESION_MS, ahora));

    if (estado === "nueva") {
      const sitio = urlDelSitio(request);
      after(async () => {
        try {
          const [config, productos] = await Promise.all([getConfig(), getProductos()]);
          const precios = productos.filter((p) => esCategoriaDeAnteojos(p.categoria)).map((p) => p.precio);
          const cuotas = CUOTAS_SON_BENEFICIO
            ? await conEspera(verificarCuotasPara(precios, CUOTAS_SUSCRIPTORES), ESPERA_CUOTAS_MS, null)
            : null;
          const enviado = await enviarMail(
            mailBienvenidaSuscriptor({
              email: cuenta.email,
              nombre: cuenta.nombre,
              cuponDisponible: tieneCupon(cuenta),
              cuotas,
              sitio,
              enlaceBaja: enlaceDeBaja(sitio, { suscriptorId: cuenta.id, email: cuenta.email }),
              config,
            })
          );
          if (!enviado) console.warn("[suscriptores] no salió el mail de bienvenida");
        } catch (error) {
          console.error("[suscriptores] no se pudo mandar la bienvenida:", error instanceof Error ? error.message : error);
        }
      });
    }

    return respuesta;
  } catch (error) {
    if (error instanceof ErrorAltaEnCurso) {
      return NextResponse.json({ error: "Ya estamos confirmando tu mail. Esperá un momento." }, { status: 409, headers: sinCache });
    }
    console.error("[suscriptores] no se pudo confirmar:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "No pudimos confirmar tu mail. Probá en un rato." }, { status: 503, headers: sinCache });
  }
}
