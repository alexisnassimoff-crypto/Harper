import { NextResponse } from "next/server";
import { isAirtableConfigured } from "@/lib/airtable";
import { blobConfigurado } from "@/lib/media";
import { mailsConfigurados } from "@/lib/mails";
import { mercadoPagoConfigurado } from "@/lib/mercadopago";

export const dynamic = "force-dynamic";

/** Smoke test del deploy: muestra qué integraciones están conectadas. */
export function GET() {
  return NextResponse.json({
    ok: true,
    servicio: "harper-web",
    integraciones: {
      airtable: isAirtableConfigured(),
      mercadopago: mercadoPagoConfigurado(),
      resend: mailsConfigurados(),
      blob: blobConfigurado(),
    },
  });
}
