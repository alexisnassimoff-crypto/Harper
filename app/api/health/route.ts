import { NextResponse } from "next/server";
import { isAirtableConfigured } from "@/lib/airtable";
import { blobConfigurado } from "@/lib/media";
import { mailsConfigurados } from "@/lib/mails";
import { mercadoPagoListo } from "@/lib/mercadopago";
import { esUrlPublica, urlDelSitio } from "@/lib/sitio";

export const dynamic = "force-dynamic";

/**
 * Variables que el sitio necesita, con el detalle de cuál está cargada.
 *
 * Solo presencia, nunca el valor: saber que existe no es un secreto, y sin
 * esto la única forma de averiguar por qué no cobra es adivinar entre tres
 * variables y un redeploy que quizá no se hizo.
 *
 * `deUnaVez` marca las que se leen en tiempo de build: si se cargan después
 * del deploy, no alcanza con esperar, hay que volver a deployar.
 */
const VARIABLES = [
  { nombre: "NEXT_PUBLIC_SITE_URL", deUnaVez: true },
  { nombre: "MP_ACCESS_TOKEN", deUnaVez: false },
  { nombre: "MP_WEBHOOK_SECRET", deUnaVez: false },
  { nombre: "RESEND_API_KEY", deUnaVez: false },
  { nombre: "AIRTABLE_TOKEN", deUnaVez: false },
  { nombre: "AIRTABLE_BASE_ID", deUnaVez: false },
] as const;

/** Smoke test del deploy: muestra qué integraciones están conectadas. */
export function GET() {
  const sitio = urlDelSitio();

  const variables: Record<string, boolean> = {};
  for (const v of VARIABLES) {
    variables[v.nombre] = Boolean(process.env[v.nombre]?.trim());
  }

  // Un valor con espacios o saltos de línea al final entra en Vercel sin
  // aviso y después la firma del webhook no valida nunca. Es invisible salvo
  // que se lo busque a propósito.
  const conBasura = VARIABLES.map((v) => v.nombre).filter((nombre) => {
    const valor = process.env[nombre];
    return Boolean(valor) && valor !== valor!.trim();
  });

  return NextResponse.json({
    ok: true,
    servicio: "harper-web",
    sitio,
    // Con qué commit se armó este deploy: sirve para saber si el redeploy
    // realmente corrió.
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    integraciones: {
      airtable: isAirtableConfigured(),
      // Exige el token Y el secreto del webhook: con uno solo se cobra la
      // plata y ningún pedido llega a confirmarse.
      mercadopago: mercadoPagoListo(),
      resend: mailsConfigurados(),
      blob: blobConfigurado(),
    },
    variables,
    avisos: [
      variables.MP_ACCESS_TOKEN ? null : "Falta MP_ACCESS_TOKEN",
      variables.MP_WEBHOOK_SECRET
        ? null
        : "Falta MP_WEBHOOK_SECRET: sin esto se cobra pero ningún pedido se confirma",
      esUrlPublica(sitio) ? null : `El sitio no es una URL pública: ${sitio}`,
      variables.RESEND_API_KEY ? null : "Falta RESEND_API_KEY: no sale ningún mail",
      conBasura.length > 0
        ? `Con espacios o saltos de línea al final: ${conBasura.join(", ")}`
        : null,
    ].filter(Boolean),
  });
}
