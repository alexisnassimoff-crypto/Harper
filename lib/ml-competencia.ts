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

export type Similar = { id: string | null; titulo: string; precio: number | null; vendidas: number | null; permalink: string | null };

export type ReferenciaDePrecio = {
  id: string;
  titulo: string;
  estado: string | null;
  precio: number | null;
  sugerido: number | null;
  masBajo: number | null;
  /** Cuánto más caro (en %) que la referencia, según Mercado Libre. */
  diferencia: number | null;
  aplicable: boolean | null;
  similares: Similar[];
};

/** Un monto que puede venir como número o como { amount }. */
const monto = (v: unknown) => numero(v) ?? numero(objeto(v).amount);

/** Los ids de /suggestions/user/{id}/items, venga la lista donde venga. */
export function idsConReferencia(cuerpo: unknown): string[] {
  const b = objeto(cuerpo);
  const lista = [b.items, b.results, b.item_ids, cuerpo].find(Array.isArray) as unknown[] | undefined;
  return (lista ?? []).flatMap((x) => {
    const id = typeof x === "string" ? x : texto(objeto(x).item_id) ?? texto(objeto(x).id);
    return id && /^MLA\d+$/.test(id) ? [id] : [];
  });
}

/**
 * La referencia de precio de una publicación propia, de
 * /suggestions/items/{id}/details: el precio que Mercado Libre considera
 * competitivo, el más bajo entre las parecidas y las publicaciones con que
 * compara (metadata.graph).
 */
export function leerReferencia(cuerpo: unknown, titulo = ""): ReferenciaDePrecio | null {
  const b = objeto(cuerpo);
  const id = texto(b.item_id) ?? texto(b.id);
  if (!id) return null;
  const grafico = objeto(b.metadata).graph;
  const similares = (Array.isArray(grafico) ? grafico : []).map((g): Similar => {
    const e = objeto(g);
    const info = objeto(e.info);
    return {
      id: texto(info.id) ?? texto(e.item_id) ?? texto(e.id),
      titulo: texto(info.title) ?? texto(e.title) ?? "",
      precio: monto(e.price),
      vendidas: numero(info.sold_quantity) ?? numero(e.sold_quantity),
      permalink: texto(info.permalink) ?? texto(e.permalink),
    };
  });
  return {
    id,
    titulo: titulo || id,
    estado: texto(b.status),
    precio: monto(b.current_price),
    sugerido: monto(b.suggested_price),
    masBajo: monto(b.lowest_price),
    diferencia: numero(b.percent_difference),
    aplicable: typeof b.applicable_suggestion === "boolean" ? b.applicable_suggestion : null,
    similares,
  };
}

/** El estado de la referencia, dicho para Ale. */
export function estadoDeReferencia(estado: string | null): string {
  switch (estado) {
    case "with_benchmark_highest":
      return "Más caro que la referencia y que la competencia";
    case "with_benchmark_high":
      return "Más caro que la referencia";
    case null:
      return "—";
    default:
      return estado.replace(/_/g, " ");
  }
}

export type CompetitividadCampana = {
  nombre: string;
  /** % de las veces que el anuncio salió, de todas las que pudo salir. */
  cuota: number | null;
  /** % de las veces que salió primero. */
  arriba: number | null;
  /** % que no salió por falta de presupuesto. */
  perdidaPresupuesto: number | null;
  /** % que no salió porque otro vendedor rankeó mejor. */
  perdidaRanking: number | null;
};

/** En mayúsculas, como las demás métricas de Product Ads (en minúsculas contesta 400). */
export const METRICAS_COMPETITIVIDAD = [
  "IMPRESSION_SHARE",
  "TOP_IMPRESSION_SHARE",
  "LOST_IMPRESSION_SHARE_BY_BUDGET",
  "LOST_IMPRESSION_SHARE_BY_AD_RANK",
];

/**
 * La competitividad de cada campaña, de campaigns/search con esas métricas.
 * Acepta varias respuestas (una por métrica, si juntas no las acepta) y las
 * une por campaña. Las métricas vuelven en minúsculas.
 */
export function leerCompetitividad(cuerpos: unknown | unknown[]): CompetitividadCampana[] {
  const porCampana = new Map<string, { nombre: string; m: Record<string, unknown> }>();
  for (const cuerpo of Array.isArray(cuerpos) ? cuerpos : [cuerpos]) {
    const resultados = objeto(cuerpo).results;
    for (const r of Array.isArray(resultados) ? resultados : []) {
      const c = objeto(r);
      const clave = String(c.id ?? c.name ?? "");
      const actual = porCampana.get(clave) ?? { nombre: texto(c.name) ?? clave, m: {} };
      const metricas = objeto(c.metrics);
      for (const [k, v] of Object.entries(metricas)) actual.m[k.toLowerCase()] = v;
      porCampana.set(clave, actual);
    }
  }
  return [...porCampana.values()].map(({ nombre, m }) => ({
    nombre,
    cuota: numero(m.impression_share),
    arriba: numero(m.top_impression_share),
    perdidaPresupuesto: numero(m.lost_impression_share_by_budget),
    perdidaRanking: numero(m.lost_impression_share_by_ad_rank),
  }));
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
  referencias: ReferenciaDePrecio[];
  /** Por qué no hay referencias, si Mercado Libre lo dijo. */
  notaReferencias: string | null;
  /** Si se probó leer a otros vendedores (está bloqueado desde el 1/11/2026). */
  terceros: boolean;
  publicidad: { desde: string; hasta: string; campanas: CompetitividadCampana[] } | null;
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

/** Los rechazos agrupados por motivo, sin la ruta (que cambia en cada pedido). */
export function erroresAgrupados(pruebas: Prueba[]): { motivo: string; veces: number }[] {
  const grupos = new Map<string, number>();
  for (const p of pruebas) {
    if (p.ok) continue;
    const motivo = `${p.status ?? "sin respuesta"} ${p.detalle.replace(/^Mercado Libre \d+ en \S+ ?/, "")}`.trim();
    grupos.set(motivo, (grupos.get(motivo) ?? 0) + 1);
  }
  return [...grupos].map(([motivo, veces]) => ({ motivo, veces })).sort((a, b) => b.veces - a.veces);
}

const escapar = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const pesos = (n: number | null) => (n === null ? "—" : `$${Math.round(n).toLocaleString("es-AR")}`);
const sino = (b: boolean | null) => (b === null ? "—" : b ? "sí" : "no");

const porcentaje = (n: number | null) => (n === null ? "—" : `${Math.round(n)}%`);

/** La foto de la competencia como página, para abrir desde el celular. */
export function paginaDeCompetencia(f: FotoCompetencia): string {
  const estilo = "font-family:Helvetica,Arial,sans-serif;color:#1f1e1b;font-size:14px;line-height:1.45";
  const gris = "color:#78756c";
  const h2 = (t: string) => `<h2 style="font-size:16px;margin:24px 0 8px">${t}</h2>`;
  const nota = (t: string) => `<p style="${gris};font-size:13px;margin:4px 0 8px">${t}</p>`;
  const tabla = (cabecera: string[], filas: string[][]) =>
    `<div style="overflow-x:auto"><table style="border-collapse:collapse;width:100%;font-size:13px"><thead><tr>${cabecera
      .map((c) => `<th style="text-align:left;border-bottom:1px solid #d9d6cc;padding:6px 8px;white-space:nowrap">${c}</th>`)
      .join("")}</tr></thead><tbody>${filas
      .map((fila) => `<tr>${fila.map((c) => `<td style="border-bottom:1px solid #eeebe3;padding:6px 8px;vertical-align:top">${c}</td>`).join("")}</tr>`)
      .join("")}</tbody></table></div>`;
  const titulo = (p: { titulo: string; permalink?: string | null }) =>
    p.permalink ? `<a href="${escapar(p.permalink)}" style="color:#1f1e1b">${escapar(p.titulo)}</a>` : escapar(p.titulo);

  const partes = [
    `<h1 style="font-size:20px;margin:0 0 4px">Competencia en Mercado Libre</h1>`,
    `<p style="${gris};margin:0 0 8px">${escapar(f.fecha)}</p>`,
  ];

  // 1. Tu precio contra las publicaciones parecidas (Referencias de precios).
  partes.push(h2("Tu precio contra la competencia"));
  if (f.referencias.length) {
    partes.push(
      nota("Referencias de precios de Mercado Libre: compara cada publicación tuya con las parecidas."),
      tabla(
        ["Publicación", "Tu precio", "Referencia ML", "Más bajo", "Diferencia", "Estado"],
        f.referencias.map((r) => [
          escapar(r.titulo),
          pesos(r.precio),
          pesos(r.sugerido),
          pesos(r.masBajo),
          r.diferencia === null ? "—" : `${r.diferencia > 0 ? "+" : ""}${Math.round(r.diferencia)}%`,
          escapar(estadoDeReferencia(r.estado)),
        ])
      )
    );
    for (const r of f.referencias.filter((r) => r.similares.length)) {
      partes.push(
        `<p style="margin:12px 0 4px;font-size:13px"><strong>${escapar(r.titulo)}</strong>, comparada con:</p><ul style="margin:0;padding-left:20px;font-size:13px">${r.similares
          .slice(0, 5)
          .map((x) => `<li>${titulo(x)} — ${pesos(x.precio)}${x.vendidas === null ? "" : ` · ${x.vendidas.toLocaleString("es-AR")} vendidas`}</li>`)
          .join("")}</ul>`
      );
    }
  } else {
    partes.push(
      nota(
        f.notaReferencias
          ? `Mercado Libre no tiene referencias de precio para ninguna publicación tuya (contestó: «${escapar(f.notaReferencias)}»).`
          : "Mercado Libre no devolvió referencias de precios para tus publicaciones (ver abajo qué contestó)."
      )
    );
  }

  // 2. Publicidad: cuánto te gana la competencia en las subastas.
  partes.push(h2("Publicidad: cuántas veces te gana otro vendedor"));
  if (f.publicidad?.campanas.length) {
    partes.push(
      nota(`Del ${escapar(f.publicidad.desde)} al ${escapar(f.publicidad.hasta)}. «Perdidas por ranking»: veces que tu anuncio podía salir y salió el de otro vendedor.`),
      tabla(
        ["Campaña", "Salió", "Salió primero", "Perdidas por presupuesto", "Perdidas por ranking"],
        f.publicidad.campanas.map((c) => [escapar(c.nombre), porcentaje(c.cuota), porcentaje(c.arriba), porcentaje(c.perdidaPresupuesto), porcentaje(c.perdidaRanking)])
      )
    );
  } else {
    partes.push(nota("Mercado Libre no devolvió estas métricas (ver abajo qué contestó)."));
  }

  // 3. Los competidores de la tabla y las búsquedas: solo si algo se pudo leer.
  if (f.publicaciones.length) {
    partes.push(
      h2("Publicaciones de la tabla Competencia"),
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
  const encontrados = f.vendedores.filter((v) => v.id !== null);
  if (encontrados.length) {
    partes.push(
      h2("Vendedores"),
      tabla(
        ["Nombre", "Apodo en ML", "Reputación", "Ventas", "Publicaciones", "Ejemplos"],
        encontrados.map((v) => [
          escapar(v.nombre),
          escapar(v.reputacion?.apodo ?? "—"),
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
  const faltan = f.vendedores.filter((v) => v.id === null).map((v) => v.nombre);
  if (faltan.length) partes.push(nota(`No se pudo leer a: ${escapar(faltan.join(", "))}.`));
  for (const b of f.busquedas.filter((b) => b.posiciones.length)) {
    partes.push(
      h2(`Búsqueda «${escapar(b.texto)}»${b.total === null ? "" : ` <span style="${gris};font-weight:normal">(${b.total.toLocaleString("es-AR")} resultados)</span>`}`),
      tabla(
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
    );
  }

  if (!f.terceros) {
    partes.push(
      h2("Otros vendedores y búsquedas"),
      nota("Mercado Libre no deja leer publicaciones de otros vendedores ni búsquedas (403, probado el 1/11/2026). Para volver a probar, agregá &amp;terceros=1 al link.")
    );
  }

  // 4. Qué deja leer Mercado Libre, con los rechazos agrupados por motivo.
  const acceso = resumenDeAcceso(f.pruebas)
    .map((a) => `<li>${a.ok === a.total ? "✅" : a.ok ? "⚠️" : "❌"} ${escapar(a.que)}: ${a.ok} de ${a.total}</li>`)
    .join("");
  const errores = erroresAgrupados(f.pruebas);
  partes.push(
    h2("Qué deja leer Mercado Libre"),
    `<ul style="padding-left:20px;margin:0">${acceso || "<li>No se probó nada.</li>"}</ul>`,
    errores.length
      ? `<p style="margin:12px 0 4px;font-size:13px"><strong>Qué contestó cuando no dejó</strong></p><ul style="padding-left:20px;margin:0;${gris};font-size:12px">${errores
          .map((e) => `<li>${escapar(e.motivo)}${e.veces > 1 ? ` (${e.veces} veces)` : ""}</li>`)
          .join("")}</ul>`
      : ""
  );

  return `<div style="${estilo};max-width:860px;margin:0 auto">${partes.join("")}</div>`;
}
