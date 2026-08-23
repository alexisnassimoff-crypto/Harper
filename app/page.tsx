import { isAirtableConfigured } from "@/lib/airtable";

export const dynamic = "force-dynamic";

export default function Home() {
  const airtableReady = isAirtableConfigured();

  return (
    <main>
      <h1>Harper</h1>
      <p>
        Proyecto inicializado. GitHub &rarr; Vercel conectado con deploys
        automáticos en cada push.
      </p>
      <div className="status">
        <span className={`dot ${airtableReady ? "on" : "off"}`} />
        {airtableReady
          ? "Airtable configurado"
          : "Airtable pendiente: falta AIRTABLE_TOKEN / AIRTABLE_BASE_ID"}
      </div>
    </main>
  );
}
