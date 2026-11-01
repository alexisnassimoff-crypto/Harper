/**
 * La competencia en Mercado Libre: qué venden, a cuánto y dónde aparecen en
 * las búsquedas. Funciones puras; los pedidos están en
 * lib/ml-competencia-servidor.ts.
 *
 * Mercado Libre no deja leer publicaciones de otros vendedores sin una cuenta
 * (las páginas y la API sin token contestan 403), y no publica a quién sigue
 * cada vendedor. Por eso los competidores se cargan a mano en la tabla
 * Competencia y se leen con la cuenta de Harper.
 */

export type IdsDeLink = { item: string | null; userProduct: string | null; producto: string | null };

/**
 * Los ids de un link de Mercado Libre, incluido el de «compartir» de la app:
 *   articulo.mercadolibre.com.ar/MLA-123-titulo   → publicación MLA123
 *   mercadolibre.com.ar/up/MLAU456?...item_id:MLA789 → producto de usuario MLAU456 y publicación MLA789
 *   mercadolibre.com.ar/titulo/p/MLA321            → producto de catálogo MLA321
 */
export function idsDeLink(texto: string): IdsDeLink {
  let t = texto.trim();
  try {
    t = decodeURIComponent(t);
  } catch {
    // Un % suelto: se usa tal cual.
  }
  const userProduct = t.match(/\b(MLAU\d+)/i)?.[1].toUpperCase() ?? null;
  const producto = t.match(/\/p\/(MLA\d+)/i)?.[1].toUpperCase() ?? null;
  const delQuery = t.match(/(?:item_id[:=]|[?&#]wid=)(MLA\d+)/i)?.[1];
  const delCamino = t.match(/articulo\.mercadolibre\.com\.ar\/MLA-?(\d+)/i)?.[1];
  const solo = t.match(/^MLA-?(\d+)$/i)?.[1];
  const item = delQuery ? delQuery.toUpperCase() : delCamino || solo ? `MLA${delCamino ?? solo}` : null;
  return { item, userProduct, producto };
}

/** El apodo como lo guarda Mercado Libre: mayúsculas, sin espacios ni acentos. */
export function normalizarApodo(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export type PublicacionAjena = {
  id: string;
  titulo: string;
  precio: number | null;
  /** El precio tachado, si está en oferta. */
  precioOriginal: number | null;
  vendedorId: number | null;
  vendedor: string | null;
  envioGratis: boolean | null;
  full: boolean | null;
  cuotasSinInteres: boolean | null;
  vendidas: number | null;
  estado: string | null;
  permalink: string | null;
};

const numero = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const texto = (v: unknown) => (typeof v === "string" && v ? v : null);
const objeto = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

/**
 * Una publicación de otro vendedor, sea del multiget de /items o de un
 * resultado de búsqueda (que trae el vendedor y las cuotas de otra forma).
 * En Argentina, gold_pro es la publicación con cuotas sin interés.
 */
export function leerPublicacionAjena(cuerpo: unknown): PublicacionAjena | null {
  const b = objeto(cuerpo);
  const id = texto(b.id);
  if (!id) return null;
  const vendedor = objeto(b.seller);
  const envio = objeto(b.shipping);
  const cuotas = objeto(b.installments);
  const tasa = numero(cuotas.rate);
  const tipo = texto(b.listing_type_id);
  const cuotasSinInteres =
    tasa !== null ? tasa === 0 && (numero(cuotas.quantity) ?? 0) > 1 : tipo === "gold_pro" ? true : tipo === "gold_special" ? false : null;
  const precio = numero(b.price);
  const original = numero(b.original_price);
  return {
    id,
    titulo: texto(b.title) ?? id,
    precio,
    precioOriginal: original !== null && precio !== null && original > precio ? original : null,
    vendedorId: numero(vendedor.id) ?? numero(b.seller_id),
    vendedor: texto(vendedor.nickname),
    envioGratis: typeof envio.free_shipping === "boolean" ? envio.free_shipping : null,
    full: texto(envio.logistic_type) ? envio.logistic_type === "fulfillment" : null,
    cuotasSinInteres,
    vendidas: numero(b.sold_quantity),
    estado: texto(b.status),
    permalink: texto(b.permalink),
  };
}

/** Los resultados de /sites/MLA/search. */
export function leerBusqueda(cuerpo: unknown): { total: number | null; resultados: PublicacionAjena[] } {
  const b = objeto(cuerpo);
  const resultados = Array.isArray(b.results) ? b.results.map(leerPublicacionAjena).filter((p): p is PublicacionAjena => p !== null) : [];
  return { total: numero(objeto(b.paging).total), resultados };
}

/** El precio que ve el comprador, de /items/{id}/sale_price (incluye promociones). */
export function leerPrecioDeVenta(cuerpo: unknown): { precio: number; original: number | null } | null {
  const b = objeto(cuerpo);
  const precio = numero(b.amount);
  if (precio === null) return null;
  const original = numero(b.regular_amount);
  return { precio, original: original !== null && original > precio ? original : null };
}

export type Reputacion = { apodo: string | null; nivel: string | null; medalla: string | null; ventas: number | null };

/** Lo público de /users/{id}. */
export function leerReputacion(cuerpo: unknown): Reputacion {
  const b = objeto(cuerpo);
  const rep = objeto(b.seller_reputation);
  return {
    apodo: texto(b.nickname),
    nivel: texto(rep.level_id),
    medalla: texto(rep.power_seller_status),
    ventas: numero(objeto(rep.transactions).completed),
  };
}

export type Posicion = {
  puesto: number;
  id: string;
  titulo: string;
  precio: number | null;
  vendedor: string | null;
  /** «Harper», el nombre del competidor de la tabla, o null si es otro. */
  quien: string | null;
  full: boolean | null;
  cuotasSinInteres: boolean | null;
};

/**
 * Dónde aparece cada uno en una búsqueda: los primeros `primeros` resultados
 * siempre (para ver contra quién se compite) y, más abajo, solo las
 * publicaciones propias y las de los competidores de la tabla.
 */
export function posicionesEnBusqueda(
  resultados: PublicacionAjena[],
  miId: number,
  competidores: Map<number, string>,
  primeros = 5
): Posicion[] {
  return resultados.flatMap((p, i) => {
    const quien = p.vendedorId === miId ? "Harper" : (p.vendedorId !== null && competidores.get(p.vendedorId)) || null;
    if (i >= primeros && !quien) return [];
    return [{ puesto: i + 1, id: p.id, titulo: p.titulo, precio: p.precio, vendedor: p.vendedor, quien, full: p.full, cuotasSinInteres: p.cuotasSinInteres }];
  });
}

export type Prueba = { que: string; status: number | null; ok: boolean; detalle: string };

export type VendedorCompetidor = {
  nombre: string;
  /** Cómo se lo encontró: por apodo, buscando el nombre, o por el link. */
  como: string | null;
  id: number | null;
  reputacion: Reputacion | null;
  publicaciones: number | null;
  ejemplos: PublicacionAjena[];
};

export type FotoCompetencia = {
  fecha: string;
  pruebas: Prueba[];
  publicaciones: (PublicacionAjena & { nombre: string })[];
  vendedores: VendedorCompetidor[];
  busquedas: { texto: string; total: number | null; posiciones: Posicion[] }[];
};

/** Qué deja leer Mercado Libre, en una línea por tipo de dato. */
export function resumenDeAcceso(pruebas: Prueba[]): { que: string; ok: number; total: number }[] {
  const grupos = new Map<string, { ok: number; total: number }>();
  for (const p of pruebas) {
    const tipo = p.que.split(":")[0];
    const g = grupos.get(tipo) ?? { ok: 0, total: 0 };
    g.total++;
    if (p.ok) g.ok++;
    grupos.set(tipo, g);
  }
  return [...grupos].map(([que, g]) => ({ que, ...g }));
}

const escapar = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const pesos = (n: number | null) => (n === null ? "—" : `$${Math.round(n).toLocaleString("es-AR")}`);
const sino = (b: boolean | null) => (b === null ? "—" : b ? "sí" : "no");

/** La foto de la competencia como página, para abrir desde el celular. */
export function paginaDeCompetencia(f: FotoCompetencia): string {
  const estilo =
    "font-family:Helvetica,Arial,sans-serif;color:#1f1e1b;font-size:14px;line-height:1.45";
  const tabla = (cabecera: string[], filas: string[][]) =>
    `<div style="overflow-x:auto"><table style="border-collapse:collapse;width:100%;font-size:13px"><thead><tr>${cabecera
      .map((c) => `<th style="text-align:left;border-bottom:1px solid #d9d6cc;padding:6px 8px;white-space:nowrap">${c}</th>`)
      .join("")}</tr></thead><tbody>${filas
      .map((fila) => `<tr>${fila.map((c) => `<td style="border-bottom:1px solid #eeebe3;padding:6px 8px;vertical-align:top">${c}</td>`).join("")}</tr>`)
      .join("")}</tbody></table></div>`;
  const titulo = (p: { titulo: string; permalink?: string | null }) =>
    p.permalink ? `<a href="${escapar(p.permalink)}" style="color:#1f1e1b">${escapar(p.titulo)}</a>` : escapar(p.titulo);

  const acceso = resumenDeAcceso(f.pruebas)
    .map((a) => `<li>${a.ok === a.total ? "✅" : a.ok ? "⚠️" : "❌"} ${escapar(a.que)}: ${a.ok} de ${a.total}</li>`)
    .join("");
  const fallas = f.pruebas.filter((p) => !p.ok);

  const partes = [
    `<h1 style="font-size:20px;margin:0 0 4px">Competencia en Mercado Libre</h1>`,
    `<p style="color:#78756c;margin:0 0 16px">${escapar(f.fecha)}</p>`,
    `<h2 style="font-size:16px">Qué deja leer Mercado Libre</h2><ul style="padding-left:20px">${acceso || "<li>No se probó nada: la tabla Competencia está vacía.</li>"}</ul>`,
    fallas.length
      ? `<details><summary style="cursor:pointer;color:#78756c">Detalle de lo que no se pudo leer (${fallas.length})</summary><ul style="padding-left:20px;color:#78756c;font-size:12px">${fallas
          .map((p) => `<li>${escapar(p.que)} — ${p.status ?? "sin respuesta"}: ${escapar(p.detalle)}</li>`)
          .join("")}</ul></details>`
      : "",
  ];

  if (f.publicaciones.length) {
    partes.push(
      `<h2 style="font-size:16px">Publicaciones de la tabla</h2>`,
      tabla(
        ["Publicación", "Vendedor", "Precio", "Antes", "Cuotas s/int.", "Full", "Envío gratis", "Vendidas"],
        f.publicaciones.map((p) => [
          titulo(p),
          escapar(p.vendedor ?? p.nombre),
          pesos(p.precio),
          pesos(p.precioOriginal),
          sino(p.cuotasSinInteres),
          sino(p.full),
          sino(p.envioGratis),
          p.vendidas === null ? "—" : String(p.vendidas),
        ])
      )
    );
  }

  if (f.vendedores.length) {
    partes.push(
      `<h2 style="font-size:16px">Vendedores</h2>`,
      tabla(
        ["Nombre", "Apodo en ML", "Reputación", "Ventas", "Publicaciones", "Ejemplos"],
        f.vendedores.map((v) => [
          escapar(v.nombre),
          v.reputacion?.apodo ? escapar(v.reputacion.apodo) : v.id === null ? "no encontrado" : "—",
          escapar([v.reputacion?.nivel, v.reputacion?.medalla].filter(Boolean).join(" · ") || "—"),
          v.reputacion?.ventas === null || v.reputacion?.ventas === undefined ? "—" : v.reputacion.ventas.toLocaleString("es-AR"),
          v.publicaciones === null ? "—" : String(v.publicaciones),
          v.ejemplos
            .slice(0, 3)
            .map((p) => `${titulo(p)} — ${pesos(p.precio)}`)
            .join("<br>") || "—",
        ])
      )
    );
  }

  for (const b of f.busquedas) {
    partes.push(
      `<h2 style="font-size:16px">Búsqueda «${escapar(b.texto)}»${b.total === null ? "" : ` <span style="color:#78756c;font-weight:normal">(${b.total.toLocaleString("es-AR")} resultados)</span>`}</h2>`,
      b.posiciones.length
        ? tabla(
            ["Puesto", "Publicación", "Quién", "Precio", "Cuotas s/int.", "Full"],
            b.posiciones.map((p) => [
              String(p.puesto),
              escapar(p.titulo),
              p.quien ? `<strong>${escapar(p.quien)}</strong>` : escapar(p.vendedor ?? "—"),
              pesos(p.precio),
              sino(p.cuotasSinInteres),
              sino(p.full),
            ])
          )
        : `<p style="color:#78756c">Sin resultados legibles.</p>`
    );
  }

  return `<div style="${estilo};max-width:860px;margin:0 auto">${partes.join("")}</div>`;
}
