import { firmaValida } from "@/lib/ml-preguntas";
import { aprobarBorrador, borradorDe } from "@/lib/ml-preguntas-servidor";

export const dynamic = "force-dynamic";

/**
 * El botón "Revisar y publicar" del mail de borrador.
 *
 * El GET solo muestra el borrador: los programas de mail abren los links
 * para revisarlos, y un GET que publicara respondería preguntas sin que
 * nadie toque nada. Publica el POST del formulario de esta página.
 */

function escapar(texto: string) {
  return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function pagina(cuerpo: string, status = 200) {
  return new Response(
    `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Pregunta de Mercado Libre</title></head>
<body style="margin:0;padding:32px 16px;background:#f2f0ec;font-family:Helvetica,Arial,sans-serif;color:#16150f;line-height:1.5">
<main style="max-width:560px;margin:0 auto;background:#faf9f6;border:1px solid #e3e0d8;padding:24px">${cuerpo}</main></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }
  );
}

function datos(url: URL) {
  const id = url.searchParams.get("id") ?? "";
  const firma = url.searchParams.get("firma");
  return /^\d+$/.test(id) && firmaValida(id, firma, process.env.SYNC_TOKEN ?? "") ? { id, firma: firma! } : null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const d = datos(url);
  if (!d) return pagina("<p>El link no es válido.</p>", 401);

  const fila = await borradorDe(d.id);
  if (!fila) return pagina("<p>No encontré esa pregunta.</p>", 404);

  const pendiente = fila.Estado === "borrador" || fila.Estado === "error";
  return pagina(`<p style="font-size:13px;color:#78756c;margin:0">${escapar(fila.Publicacion ?? "")}</p>
<p style="font-size:17px"><strong>«${escapar(fila.Pregunta ?? "")}»</strong></p>
<p style="font-size:13px;color:#78756c;margin:0 0 4px">Se va a publicar esta respuesta</p>
<p style="background:#f2f0ec;padding:12px 14px;white-space:pre-wrap">${escapar(fila.Respuesta ?? "")}</p>
${
  pendiente
    ? `<form method="post"><button type="submit" style="background:#16150f;color:#faf9f6;border:0;padding:12px 20px;font-size:15px;cursor:pointer">Publicar en Mercado Libre</button></form>
<p style="font-size:13px;color:#78756c">¿Querés cambiarla? Editá la columna Respuesta en Airtable y recargá esta página.</p>`
    : `<p>Esta pregunta ya no espera aprobación (está «${escapar(fila.Estado ?? "")}»).</p>`
}`);
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const d = datos(url);
  if (!d) return pagina("<p>El link no es válido.</p>", 401);

  try {
    const { ok, mensaje } = await aprobarBorrador(d.id);
    return pagina(`<p>${escapar(mensaje)}</p>`, ok ? 200 : 409);
  } catch (error) {
    console.error(`[ml/preguntas/aprobar] ${d.id} falló:`, error);
    return pagina(`<p>No se pudo publicar: ${escapar((error as Error).message)}</p>`, 502);
  }
}
