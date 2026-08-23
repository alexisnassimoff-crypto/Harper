import { NextResponse } from "next/server";
import { isAirtableConfigured } from "@/lib/airtable";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    ok: true,
    service: "harper-web",
    airtable: isAirtableConfigured() ? "configured" : "missing-env",
  });
}
