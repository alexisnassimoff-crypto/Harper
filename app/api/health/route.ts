import { NextResponse } from "next/server";
import { isAirtableConfigured } from "@/lib/airtable";
import { blobConfigurado } from "@/lib/media";
import { mailsConfigurados } from "@/lib/mails";
import { mercadoPagoListo } from "@/lib/mercadopago";
import { esUrlPublica, urlDelSitio } from "@/lib/sitio";

export const dynamic = "force-dynamic";

/** Smoke test del deploy: muestra qué integraciones están conectadas. */
export function GET() {
  const sitio = urlDelSitio();

  return NextResponse.json({
    ok: true,
    servicio: "harper-web",
    sitio,
    integraciones: {
      airtable: isAirtableConfigured(),
      // Exige el token Y el secreto del webhook: con uno solo se cobra la
      // plata y ningún pedido llega a confirmarse.
      mercadopago: mercadoPagoListo(),
      resend: mailsConfigurados(),
      blob: blobConfigurado(),
    },
    avisos: [
      mercadoPagoListo() ? null : "Falta MP_ACCESS_TOKEN y/o MP_WEBHOOK_SECRET",
      esUrlPublica(sitio) ? null : `NEXT_PUBLIC_SITE_URL no es una URL pública: ${sitio}`,
      mailsConfigurados() ? null : "Falta RESEND_API_KEY: no sale ningún mail",
    ].filter(Boolean),
  });
}
