import { escaparFormula, listRecords, TABLAS } from "./airtable";
import { tokenVigente } from "./ml-auth";
import { ErrorML, idDeLaCuenta, pedirML } from "./ml-cliente";
import { diaAnterior, fechaArgentina, leerAnunciante } from "./ml-metricas";
import { TABLA_METRICAS_ML } from "./ml-metricas-servidor";
import {
  idsConReferencia,
  idsDeLink,
  leerBusqueda,
  leerCompetitividad,
  leerReferencia,
  METRICAS_COMPETITIVIDAD,
  leerPrecioDeVenta,
  leerPublicacionAjena,
  leerReputacion,
  normalizarApodo,
  posicionesEnBusqueda,
  type FotoCompetencia,
  type Prueba,
  type ReferenciaDePrecio,
  type PublicacionAjena,
  type VendedorCompetidor,
} from "./ml-competencia";

/**
 * La competencia con lo que Mercado Libre deja leer: las Referencias de
 * precios de cada publicación propia (comparada con las parecidas) y la
 * competitividad de las campañas de publicidad. Además prueba leer a los
 * competidores de la tabla Competencia y las búsquedas clave (al 1/11/2026
 * Mercado Libre rechaza las dos cosas con 403). Cada pedido queda anotado en
 * `pruebas`: Mercado Libre restringe qué se puede leer de otros vendedores, y
 * esto muestra exactamente qué deja y qué no.
 */

export const TABLA_COMPETENCIA = "tblFbqlG2S0qooix7";

/** Se cambian con la clave competencia_busquedas de Config (una por línea). */
const BUSQUEDAS_POR_DEFECTO = [
  "estuche anteojos",
  "estuche rigido anteojos",
  "estuche magnetico anteojos",
  "paño microfibra anteojos",
  "anteojos filtro luz azul fotocromaticos",
];

const CAMPOS_ITEM =
  "id,title,price,original_price,seller_id,status,sold_quantity,listing_type_id,shipping,permalink,catalog_product_id";

type FilaCompetencia = { Nombre?: string; Vendedor?: string; Link?: string };
type FilaMetricas = { ML_id?: string; Titulo?: string; Estado?: string; Unidades_30d?: number };

/** Como mucho, cuántas referencias de precio se piden por corrida. */
const MAXIMO_REFERENCIAS = 25;

async function busquedasClave(): Promise<string[]> {
  const filas = await listRecords<{ Valor?: string }>(TABLAS.config, {
    filterByFormula: `{Clave} = '${escaparFormula("competencia_busquedas")}'`,
    revalidate: 0,
  });
  const propias = (filas[0]?.fields.Valor ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  return propias.length ? propias : BUSQUEDAS_POR_DEFECTO;
}

export async function fotoDeLaCompetencia(ahora = Date.now()): Promise<FotoCompetencia> {
  const token = await tokenVigente();
  const miId = await idDeLaCuenta(token);
  const pruebas: Prueba[] = [];

  /** Un pedido que puede fallar: queda anotado y devuelve null. */
  async function intentar<T>(que: string, ruta: string, headers?: Record<string, string>): Promise<T | null> {
    try {
      const r = await pedirML<T>(ruta, { token, headers });
      pruebas.push({ que, status: 200, ok: true, detalle: "" });
      return r;
    } catch (error) {
      pruebas.push({ que, status: error instanceof ErrorML ? error.status : null, ok: false, detalle: (error as Error).message.slice(0, 200) });
      return null;
    }
  }

  // 0a. Tu precio contra las publicaciones parecidas: Referencias de precios.
  // Si la lista de ML no trae nada, se piden las publicaciones activas que más venden.
  const metricas = (await listRecords<FilaMetricas>(TABLA_METRICAS_ML, { revalidate: 0 })).map((r) => r.fields);
  const tituloDe = new Map(metricas.flatMap((m) => (m.ML_id ? [[m.ML_id, m.Titulo ?? m.ML_id] as [string, string]] : [])));
  let conReferencia = idsConReferencia(await intentar("Referencias de precios: lista", `/suggestions/user/${miId}/items`));
  if (!conReferencia.length) {
    conReferencia = metricas
      .filter((m) => m.ML_id && m.Estado === "active" && (m.Unidades_30d ?? 0) > 0)
      .sort((a, b) => (b.Unidades_30d ?? 0) - (a.Unidades_30d ?? 0))
      .map((m) => m.ML_id as string);
  }
  const referencias: ReferenciaDePrecio[] = [];
  for (const id of conReferencia.slice(0, MAXIMO_REFERENCIAS)) {
    const r = leerReferencia(await intentar(`Referencias de precios: ${id}`, `/suggestions/items/${id}/details`), tituloDe.get(id));
    if (r) referencias.push(r);
  }

  // 0b. Publicidad: cuántas veces te gana otro vendedor (últimos 7 días completos).
  let publicidad: FotoCompetencia["publicidad"] = null;
  const anunciante = leerAnunciante(await intentar("Publicidad: anunciante", "/advertising/advertisers?product_id=PADS", { "Api-Version": "1" }));
  if (anunciante) {
    const hasta = diaAnterior(fechaArgentina(ahora));
    let desde = hasta;
    for (let i = 0; i < 6; i++) desde = diaAnterior(desde);
    const cuerpo = await intentar(
      "Publicidad: competitividad de las campañas",
      `/advertising/${anunciante.site}/advertisers/${anunciante.id}/product_ads/campaigns/search?limit=50&offset=0&date_from=${desde}&date_to=${hasta}&metrics=${METRICAS_COMPETITIVIDAD}`,
      { "api-version": "2" }
    );
    if (cuerpo) publicidad = { desde, hasta, campanas: leerCompetitividad(cuerpo) };
  }

  const filas = (await listRecords<FilaCompetencia>(TABLA_COMPETENCIA, { revalidate: 0 })).map((r) => r.fields);

  // 1. Las publicaciones de los links.
  const publicaciones: FotoCompetencia["publicaciones"] = [];
  const conLink = filas.flatMap((f) => (f.Link ? [{ nombre: f.Nombre ?? f.Link, ids: idsDeLink(f.Link) }] : []));
  const items = conLink.filter((l) => l.ids.item);
  if (items.length) {
    const ids = items.map((l) => l.ids.item as string);
    let multiget: { code?: number; body?: unknown }[] = [];
    try {
      multiget = await pedirML<{ code?: number; body?: unknown }[]>(`/items?ids=${ids.join(",")}&attributes=${CAMPOS_ITEM}`, { token });
    } catch (error) {
      const status = error instanceof ErrorML ? error.status : null;
      for (const id of ids) pruebas.push({ que: `Publicaciones de otros vendedores: ${id}`, status, ok: false, detalle: (error as Error).message.slice(0, 200) });
    }
    for (const [i, l] of multiget.length ? items.entries() : []) {
      const respuesta = multiget[i];
      const ok = respuesta?.code === 200;
      pruebas.push({ que: `Publicaciones de otros vendedores: ${l.ids.item}`, status: respuesta?.code ?? null, ok, detalle: ok ? "" : JSON.stringify(respuesta?.body ?? null).slice(0, 200) });
      const p = ok ? leerPublicacionAjena(respuesta?.body) : null;
      if (p) publicaciones.push({ ...p, nombre: l.nombre });
    }
    // El precio de lista no incluye las promociones: el que ve el comprador sale de sale_price.
    for (const p of publicaciones) {
      const venta = leerPrecioDeVenta(
        await intentar("Precio con promociones", `/items/${p.id}/sale_price?context=channel_marketplace`)
      );
      if (venta) {
        p.precio = venta.precio;
        p.precioOriginal = venta.original ?? p.precioOriginal;
      }
    }
  }
  for (const l of conLink) {
    if (l.ids.userProduct) await intentar(`Producto de usuario (página /up/): ${l.ids.userProduct}`, `/user-products/${l.ids.userProduct}`);
    if (l.ids.producto) await intentar(`Producto de catálogo: ${l.ids.producto}`, `/products/${l.ids.producto}`);
  }

  // 2. Los vendedores: por apodo, y si no aparece, buscando el nombre.
  const vendedores: VendedorCompetidor[] = [];
  for (const f of filas.filter((f) => f.Vendedor || (!f.Link && f.Nombre))) {
    const nombre = f.Nombre ?? f.Vendedor ?? "";
    const apodo = normalizarApodo(f.Vendedor ?? nombre);
    const v: VendedorCompetidor = { nombre, como: null, id: null, reputacion: null, publicaciones: null, ejemplos: [] };

    const porApodo = await intentar<unknown>(`Buscar por apodo de vendedor: ${apodo}`, `/sites/MLA/search?nickname=${encodeURIComponent(apodo)}&limit=10`);
    const deApodo = porApodo ? leerBusqueda(porApodo) : null;
    if (deApodo?.resultados.length) {
      v.como = `apodo ${apodo}`;
      v.id = deApodo.resultados[0].vendedorId;
      v.publicaciones = deApodo.total;
      v.ejemplos = deApodo.resultados;
    } else {
      const porNombre = await intentar<unknown>(`Buscar por texto: ${nombre}`, `/sites/MLA/search?q=${encodeURIComponent(nombre)}&limit=50`);
      const coincide = porNombre
        ? leerBusqueda(porNombre).resultados.filter((p) => p.vendedor && normalizarApodo(p.vendedor).includes(apodo))
        : [];
      if (coincide.length) {
        v.como = `buscando «${nombre}»`;
        v.id = coincide[0].vendedorId;
        v.ejemplos = coincide;
      }
    }
    vendedores.push(v);
  }
  // Los vendedores de los links que no están en la lista.
  for (const p of publicaciones) {
    if (p.vendedorId !== null && !vendedores.some((v) => v.id === p.vendedorId)) {
      vendedores.push({ nombre: p.nombre, como: "por el link", id: p.vendedorId, reputacion: null, publicaciones: null, ejemplos: [p] });
    }
  }
  for (const v of vendedores) {
    if (v.id === null) continue;
    const usuario = await intentar<unknown>(`Reputación de vendedor: ${v.nombre}`, `/users/${v.id}`);
    if (usuario) v.reputacion = leerReputacion(usuario);
  }
  for (const p of publicaciones) {
    p.vendedor ??= vendedores.find((v) => v.id === p.vendedorId)?.reputacion?.apodo ?? null;
  }

  // 3. Las búsquedas clave.
  const competidores = new Map<number, string>(vendedores.flatMap((v) => (v.id === null ? [] : [[v.id, v.nombre] as [number, string]])));
  const busquedas: FotoCompetencia["busquedas"] = [];
  for (const q of await busquedasClave()) {
    const cuerpo = await intentar<unknown>(`Búsquedas: ${q}`, `/sites/MLA/search?q=${encodeURIComponent(q)}&limit=50`);
    const { total, resultados } = cuerpo ? leerBusqueda(cuerpo) : { total: null, resultados: [] as PublicacionAjena[] };
    busquedas.push({ texto: q, total, posiciones: posicionesEnBusqueda(resultados, miId, competidores) });
  }

  return {
    fecha: new Date(ahora).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "short", timeStyle: "short" }),
    pruebas,
    referencias,
    publicidad,
    publicaciones,
    vendedores,
    busquedas,
  };
}
