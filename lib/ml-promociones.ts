/**
 * Las promociones de cada publicación (Central de promociones de Mercado
 * Libre, /seller-promotions/items/{id}?app_version=v2): cuáles están activas o
 * programadas, a qué precio, desde y hasta cuándo, y cuánto pone Mercado Libre
 * en las campañas compartidas. Funciones puras; los pedidos están en
 * lib/ml-promociones-servidor.ts.
 */

export type Promocion = {
  id: string | null;
  tipo: string;
  nombre: string | null;
  /** started (activa), pending (programada), candidate (invitación de ML), finished. */
  estado: string;
  precio: number | null;
  precioOriginal: number | null;
  desde: string | null;
  hasta: string | null;
  /** % del descuento que pone Mercado Libre y el que pone el vendedor (campañas compartidas). */
  aporteML: number | null;
  aporteVendedor: number | null;
  /** La promoción tal como vino de ML, recortada: los campos cambian según el tipo. */
  crudo: string;
};

const numero = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const texto = (v: unknown) => (typeof v === "string" && v ? v : null);
const objeto = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

/** Las promociones de una publicación; la respuesta es una lista (o { results }). */
export function leerPromociones(cuerpo: unknown): Promocion[] {
  const lista = Array.isArray(cuerpo) ? cuerpo : objeto(cuerpo).results;
  return (Array.isArray(lista) ? lista : []).flatMap((x) => {
    const p = objeto(x);
    const tipo = texto(p.type);
    if (!tipo) return [];
    return [
      {
        id: texto(p.id) ?? texto(p.promotion_id),
        tipo,
        nombre: texto(p.name),
        estado: texto(p.status) ?? "",
        precio: numero(p.price) ?? numero(p.deal_price) ?? numero(p.new_price) ?? numero(p.suggested_discounted_price),
        precioOriginal: numero(p.original_price),
        desde: texto(p.start_date),
        hasta: texto(p.finish_date),
        aporteML: numero(p.meli_percentage) ?? numero(p.meli_percent),
        aporteVendedor: numero(p.seller_percentage) ?? numero(p.seller_percent),
        crudo: JSON.stringify(p).slice(0, 2_000),
      },
    ];
  });
}

/** Los tipos de promoción, dichos para Ale. */
export function nombreDeTipo(tipo: string): string {
  const nombres: Record<string, string> = {
    DEAL: "Campaña de ML",
    MARKETPLACE_CAMPAIGN: "Campaña compartida con ML",
    PRICE_DISCOUNT: "Descuento propio",
    LIGHTNING: "Oferta relámpago",
    DOD: "Oferta del día",
    VOLUME: "Descuento por cantidad",
    PRE_NEGOTIATED: "Descuento pre-acordado",
    SELLER_CAMPAIGN: "Campaña propia",
    SMART: "Campaña automatizada",
    PRICE_MATCHING: "Precio competitivo",
    UNHEALTHY_STOCK: "Stock lento de Full",
    SELLER_COUPON_CAMPAIGN: "Cupón propio",
  };
  return nombres[tipo] ?? tipo;
}

export type PublicacionConPromo = {
  id: string;
  titulo: string;
  precioLista: number | null;
  promociones: Promocion[];
};

/** El % de descuento de una promoción, contra su precio original o el de lista. */
export function descuento(p: Promocion, precioLista: number | null): number | null {
  const original = p.precioOriginal ?? precioLista;
  if (p.precio === null || original === null || original <= 0 || p.precio >= original) return null;
  return Math.round((1 - p.precio / original) * 1000) / 10;
}

/**
 * Los escalones de costos de Mercado Libre (confirmados con los cobros de
 * Harper): debajo de $15.000 el costo fijo es $1.330; entre $15.000 y $23.999,
 * $2.100; entre $24.000 y $32.999, $1.495; desde $33.000 no hay costo fijo pero
 * el envío va por cuenta del vendedor. Avisa si la promoción cruza uno.
 */
export function escalonCruzado(precioLista: number | null, precioPromo: number | null): string | null {
  if (precioLista === null || precioPromo === null) return null;
  const escalones = [
    { limite: 33_000, aviso: "baja de $33.000: deja de tener envío gratis a tu cargo y vuelve el costo fijo" },
    { limite: 24_000, aviso: "baja de $24.000: el costo fijo pasa de $1.495 a $2.100" },
    { limite: 15_000, aviso: "baja de $15.000: el costo fijo pasa de $2.100 a $1.330" },
  ];
  return escalones.find((e) => precioLista >= e.limite && precioPromo < e.limite)?.aviso ?? null;
}

/** Las promociones vigentes o programadas primero; las invitaciones aparte. */
export function separarPromociones(pubs: PublicacionConPromo[]) {
  const activas: { pub: PublicacionConPromo; promo: Promocion }[] = [];
  const invitaciones: { pub: PublicacionConPromo; promo: Promocion }[] = [];
  for (const pub of pubs) {
    for (const promo of pub.promociones) {
      if (promo.estado === "started" || promo.estado === "pending") activas.push({ pub, promo });
      else if (promo.estado === "candidate") invitaciones.push({ pub, promo });
    }
  }
  return { activas, invitaciones };
}

export type FilaPromocion = {
  Clave: string;
  ML_id: string;
  Titulo: string;
  Tipo: string;
  Nombre: string | null;
  Estado: string;
  Precio_lista: number | null;
  Precio_promo: number | null;
  Descuento: number | null;
  Aporte_ML: number | null;
  Aporte_vendedor: number | null;
  Desde: string | null;
  Hasta: string | null;
  Escalon: string | null;
  Crudo: string;
  Actualizado: string;
};

/** Una fila por publicación y promoción, para la tabla Promociones ML. */
export function filasDePromociones(pubs: PublicacionConPromo[], ahora: number): FilaPromocion[] {
  return pubs.flatMap((pub) =>
    pub.promociones.map((promo, i) => {
      const lista = promo.precioOriginal ?? pub.precioLista;
      return {
        Clave: `${pub.id} · ${promo.id ?? `${promo.tipo}-${i}`}`,
        ML_id: pub.id,
        Titulo: pub.titulo,
        Tipo: nombreDeTipo(promo.tipo),
        Nombre: promo.nombre,
        Estado: promo.estado,
        Precio_lista: lista,
        Precio_promo: promo.precio,
        Descuento: descuento(promo, pub.precioLista),
        Aporte_ML: promo.aporteML,
        Aporte_vendedor: promo.aporteVendedor,
        Desde: promo.desde,
        Hasta: promo.hasta,
        Escalon: escalonCruzado(lista, promo.precio),
        Crudo: promo.crudo,
        Actualizado: new Date(ahora).toISOString(),
      };
    })
  );
}

const escapar = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const pesos = (n: number | null) => (n === null ? "—" : `$${Math.round(n).toLocaleString("es-AR")}`);

/** Una fecha de ML en hora de Argentina, corta. */
export function fechaCorta(iso: string | null): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  return new Date(t).toLocaleString("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export type FotoPromociones = {
  fecha: string;
  publicaciones: PublicacionConPromo[];
  errores: { id: string; titulo: string; detalle: string }[];
};

/** Las promociones como página, para abrir desde el celular. */
export function paginaDePromociones(f: FotoPromociones, guardado?: string): string {
  const gris = "color:#78756c";
  const tabla = (cabecera: string[], filas: string[][]) =>
    `<div style="overflow-x:auto"><table style="border-collapse:collapse;width:100%;font-size:13px"><thead><tr>${cabecera
      .map((c) => `<th style="text-align:left;border-bottom:1px solid #d9d6cc;padding:6px 8px;white-space:nowrap">${c}</th>`)
      .join("")}</tr></thead><tbody>${filas
      .map((fila) => `<tr>${fila.map((c) => `<td style="border-bottom:1px solid #eeebe3;padding:6px 8px;vertical-align:top">${c}</td>`).join("")}</tr>`)
      .join("")}</tbody></table></div>`;
  const { activas, invitaciones } = separarPromociones(f.publicaciones);
  const estado = (e: string) => (e === "started" ? "activa" : e === "pending" ? "programada" : e);

  const partes = [
    `<h1 style="font-size:20px;margin:0 0 4px">Promociones en Mercado Libre</h1>`,
    `<p style="${gris};margin:0 0 8px">${escapar(f.fecha)} · ${f.publicaciones.length} publicaciones activas revisadas</p>`,
    `<h2 style="font-size:16px;margin:24px 0 8px">Activas y programadas</h2>`,
  ];
  if (activas.length) {
    partes.push(
      tabla(
        ["Publicación", "Tipo", "Estado", "Lista", "Promo", "Descuento", "Aporte ML", "Desde", "Hasta", "Ojo"],
        activas.map(({ pub, promo }) => {
          const d = descuento(promo, pub.precioLista);
          return [
            escapar(pub.titulo),
            escapar(promo.nombre ? `${nombreDeTipo(promo.tipo)} · ${promo.nombre}` : nombreDeTipo(promo.tipo)),
            estado(promo.estado),
            pesos(promo.precioOriginal ?? pub.precioLista),
            pesos(promo.precio),
            d === null ? "—" : `${d.toLocaleString("es-AR")}%`,
            promo.aporteML === null ? "—" : `${promo.aporteML}%`,
            escapar(fechaCorta(promo.desde)),
            escapar(fechaCorta(promo.hasta)),
            escapar(escalonCruzado(promo.precioOriginal ?? pub.precioLista, promo.precio) ?? ""),
          ];
        })
      )
    );
  } else {
    partes.push(`<p style="${gris}">Ninguna publicación tiene una promoción activa o programada.</p>`);
  }
  if (invitaciones.length) {
    partes.push(
      `<h2 style="font-size:16px;margin:24px 0 8px">Invitaciones de Mercado Libre (sin aceptar)</h2>`,
      tabla(
        ["Publicación", "Tipo", "Precio sugerido", "Aporte ML", "Desde", "Hasta"],
        invitaciones.map(({ pub, promo }) => [
          escapar(pub.titulo),
          escapar(promo.nombre ? `${nombreDeTipo(promo.tipo)} · ${promo.nombre}` : nombreDeTipo(promo.tipo)),
          pesos(promo.precio),
          promo.aporteML === null ? "—" : `${promo.aporteML}%`,
          escapar(fechaCorta(promo.desde)),
          escapar(fechaCorta(promo.hasta)),
        ])
      )
    );
  }
  if (f.errores.length) {
    partes.push(
      `<p style="margin:16px 0 4px;font-size:13px"><strong>No se pudieron leer (${f.errores.length})</strong></p><ul style="padding-left:20px;margin:0;${gris};font-size:12px">${f.errores
        .map((e) => `<li>${escapar(e.titulo)}: ${escapar(e.detalle)}</li>`)
        .join("")}</ul>`
    );
  }
  if (guardado) partes.push(`<p style="${gris};font-size:12px;margin-top:16px">${escapar(guardado)}</p>`);
  return `<div style="font-family:Helvetica,Arial,sans-serif;color:#1f1e1b;font-size:14px;line-height:1.45;max-width:960px;margin:0 auto">${partes.join("")}</div>`;
}
