import Image from "next/image";
import Link from "next/link";
import BarraTusPares from "./BarraTusPares";
import DeADos, { type ColorDeADos, type FilaDeADos } from "./DeADos";
import Opiniones from "./Opiniones";
import { PreguntasFrecuentes } from "./SeccionesPortada";
import UnDia, { type MomentoDelDia } from "./UnDia";
import Vitrina, { type ModeloVitrina } from "./Vitrina";
import { caracteristicasDe } from "@/lib/caracteristicas";
import { categoriasConProductos, esCategoriaDeAnteojos } from "@/lib/categorias";
import type { ConfigTienda } from "@/lib/config";
import { DIAS_ARREPENTIMIENTO, DIAS_CAMBIO, MESES_GARANTIA } from "@/lib/confianza";
import { CUPON_BIENVENIDA, HAY_CUPONES } from "@/lib/cupones";
import { NOMBRE_MARCAS, type CuotasVerificadas } from "@/lib/cuotas";
import { conEspera, verificarCuotas } from "@/lib/cuotas-servidor";
import { escalaDe, fraseDeLaEscala, getTramos, nombreDelTramo } from "@/lib/descuentos";
import { PORCENTAJE_DINERO_MP } from "@/lib/dinero-mp";
import { precio as formatearPrecio, precioConCentavos } from "@/lib/formato";
import { LINEAS, lineasDeLaPortada } from "@/lib/lineas";
import { enlaceWhatsApp, mensajeGraduadosModelo } from "@/lib/whatsapp";
import { datosDeMercadoLibre, ultimoDeMercadoLibre } from "@/lib/ml-resenas-servidor";
import { armarPack, cantidadesDePack, paresDisponibles } from "@/lib/packs";
import { ESTUCHE_PORTADA, preguntasDePortada } from "@/lib/portada";
import { TEXTOS } from "@/lib/textos";
import type { Producto, Variante } from "@/lib/tipos";
import { rutaDeVariante } from "@/lib/variantes";
import { enLetras, FORMAS, fotosDeVitrina, precioUnico, tinteDe } from "@/lib/vitrina";

/**
 * La portada vitrina (pedido de Ale, 30/10/2026): marca primero y compra
 * rápida. Los modelos sobre color, que se suman sin salir de la portada; la
 * cuenta de llevarse dos; lo que trae cada par; las opiniones; las cuentas
 * claras y un día con el mismo par. Lo de siempre se respeta: los montos
 * salen de Airtable y de Mercado Pago (cuotas verificadas para cada total),
 * nada que no esté confirmado se afirma y no se nombra a Mercado Libre.
 */

const ESPERA_CUOTAS_MS = 3_000;
const ESPERA_OPINIONES_MS = 9_000;

/** El color más vistoso primero: así la vitrina no abre con cuatro anteojos negros. */
const ORDEN_DE_COLORES = ["carey", "gris", "ambar", "negro"];

const plano = (texto: string) => texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const mayuscula = (texto: string) => texto.charAt(0).toUpperCase() + texto.slice(1);
const minuscula = (texto: string) => texto.charAt(0).toLowerCase() + texto.slice(1);
/** ["a", "b", "c"] → "a, b y c". */
const enumerar = (partes: string[]) => (partes.length <= 1 ? partes.join("") : `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`);

/** El color con el que abre cada modelo: con stock y foto al sol, sin repetir el del anterior si se puede. */
function coloresIniciales(modelos: Producto[]): number[] {
  const usados = new Set<string>();
  return modelos.map((m) => {
    const opciones = m.variantes
      .map((v, i) => ({ v, i, alSol: fotosDeVitrina(v, m.fotoPrincipal ?? "").alSol !== null }))
      .filter((o) => !o.v.agotada);
    const puntaje = (o: { v: Variante; alSol: boolean }) => {
      const orden = ORDEN_DE_COLORES.findIndex((c) => plano(o.v.color).startsWith(c));
      return (o.alSol ? 0 : 100) + (usados.has(plano(o.v.color)) ? 10 : 0) + (orden === -1 ? 5 : orden);
    };
    const elegida = [...opciones].sort((a, b) => puntaje(a) - puntaje(b))[0];
    if (!elegida) return 0;
    usados.add(plano(elegida.v.color));
    return elegida.i;
  });
}

function textoCuota(c: CuotasVerificadas | undefined): string | null {
  return c ? `${c.cuotas} cuotas sin interés de ${precioConCentavos(c.montoCuota)}` : null;
}

export default async function PortadaVitrina({ productos, config }: { productos: Producto[]; config: ConfigTienda }) {
  // La vitrina es de los fotocromáticos (la primera línea); las demás líneas
  // van en la tira de abajo y, mientras no tengan productos, en «Lo que viene».
  const lineaVitrina = LINEAS[0];
  const lineas = lineasDeLaPortada(productos);
  const proximas = lineas.filter((l) => l.estado === "proximamente");
  const modelos = productos.filter((p) => p.categoria === lineaVitrina.categoria && paresDisponibles(p.variantes) > 0);
  const precio = precioUnico(modelos);
  const estuche = productos.find((p) => p.slug === ESTUCHE_PORTADA) ?? null;
  const varianteEstuche = estuche?.variantes.find((v) => !v.agotada) ?? null;

  const tramos = await getTramos();
  const categoria = modelos[0]?.categoria ?? "Anteojos";
  const packs = precio ? cantidadesDePack(tramos, categoria).map((cantidad) => armarPack({ precio, cantidad, tramos, categoria })) : [];
  // La escala «llevá 3, pagá 2 · llevá 5, pagá 3» (Ale, 30/10/2026); vacía si no hay.
  const escala = escalaDe(tramos, categoria);
  const tramoDe = (cantidad: number) => escala.find((t) => t.desdeUnidades === cantidad) ?? null;
  const todos = precio && modelos.length > 1 ? armarPack({ precio, cantidad: modelos.length, tramos, categoria }) : null;

  // Las cuotas de cada monto que se anuncia, confirmadas una por una con Mercado Pago.
  const montos = [...new Set([...packs.map((p) => p.total), ...(todos ? [todos.total] : [])])];
  const [verificadas, mercadoLibre] = await Promise.all([
    conEspera(Promise.all(montos.map(async (m) => [m, await verificarCuotas(m)] as const)), ESPERA_CUOTAS_MS, []),
    conEspera(datosDeMercadoLibre(), ESPERA_OPINIONES_MS, ultimoDeMercadoLibre()),
  ]);
  const cuotasDe = (monto: number) => verificadas.find(([m]) => m === monto)?.[1] ?? undefined;
  const opiniones = mercadoLibre?.opiniones ?? null;
  const reputacion = mercadoLibre?.reputacion ?? null;

  const iniciales = coloresIniciales(modelos);
  const vitrina: ModeloVitrina[] = modelos.map((m, i) => ({
    id: m.id,
    slug: m.slug,
    nombre: m.nombre,
    precio: m.precio,
    tinte: tinteDe(m.slug, i),
    forma: FORMAS[m.slug] ?? null,
    inicial: iniciales[i],
    colores: m.variantes.map((v, j) => ({
      id: v.id,
      sku: v.sku,
      color: v.color,
      colorHex: v.colorHex,
      agotada: v.agotada,
      ...fotosDeVitrina(v, m.fotoPrincipal ?? ""),
      enlace: rutaDeVariante(m, j),
    })),
  }));

  const confirmados = modelos.length > 0 && modelos.every((m) => caracteristicasDe(m) !== null);
  const pack1 = packs.find((p) => p.cantidad === 1);
  // El primer pack de más de un par: el de la promoción (3 con la escala, 2 sin ella).
  const pack2 = packs.find((p) => p.cantidad > 1);
  const cuota1 = pack1 ? cuotasDe(pack1.total) : undefined;
  const cuota2 = pack2 ? cuotasDe(pack2.total) : undefined;
  const nombrePromo = pack2 ? (tramoDe(pack2.cantidad) ? nombreDelTramo(tramoDe(pack2.cantidad)!) : `${mayuscula(enLetras(pack2.cantidad))} pares`) : null;
  const incluye = modelos[0]?.incluye ?? [];
  const marcas = cuota1 ?? cuota2;
  const letraChica = marcas ? `Cuotas sin interés con ${NOMBRE_MARCAS} · CFTEA ${marcas.cftea}` : null;

  // Envío gratis: en AMBA desde un mínimo y en todo el país desde otro (sobre el subtotal sin cupón).
  const gratisPais = (monto: number) => config.envioGratisDesde > 0 && monto >= config.envioGratisDesde;
  const gratisAmba = (monto: number) => config.envioGratisAmbaDesde > 0 && monto >= config.envioGratisAmbaDesde && !gratisPais(monto);
  const envioDe = (monto: number) =>
    gratisPais(monto) ? "Envío gratis a todo el país" : gratisAmba(monto) ? "Envío gratis en AMBA" : null;

  // Qué son y cuánto salen, sin contar modelos ni colores: la colección crece (Ale, 30/10/2026).
  const bajada =
    config.portadaSubtitulo ||
    [
      confirmados ? TEXTOS.portada.bajada : null,
      precio ? `${TEXTOS.portada.precio} ${formatearPrecio(precio)}.` : null,
      precio && cuota2 && nombrePromo ? `${nombrePromo}: ${cuota2.cuotas} cuotas sin interés de ${precioConCentavos(cuota2.montoCuota)}.` : null,
    ]
      .filter(Boolean)
      .join(" ");

  const filas: FilaDeADos[] = packs.map((p) => {
    const cuota = textoCuota(cuotasDe(p.total));
    const envio = envioDe(p.totalParaEnvio);
    const destacada = p.cantidad === pack2?.cantidad;
    const tramo = tramoDe(p.cantidad);
    const ultimo = p.cantidad === packs[packs.length - 1]?.cantidad;
    return {
      cantidad: p.cantidad,
      apodo: tramo
        ? ultimo
          ? "Mejor precio por par"
          : `Llevás ${enLetras(tramo.desdeUnidades - tramo.paga)} gratis`
        : p.cantidad === 1
          ? "Para arrancar"
          : p.cantidad === 2
            ? "La cuenta que cierra"
            : "Para cuando no te decidís",
      titulo: tramo ? nombreDelTramo(tramo) : `${p.cantidad} ${p.cantidad === 1 ? "par" : "pares"}${p.porcentaje ? ` · ${p.porcentaje} % OFF` : ""}`,
      total: formatearPrecio(p.total),
      // El precio de a uno por la cantidad: el tachado es real.
      tachado: p.cantidad > 1 && p.lista > p.total ? formatearPrecio(p.lista) : null,
      detalle: [
        cuota,
        p.cantidad > 1 ? `Cada par te queda en ${formatearPrecio(p.precioUnitario)}` : null,
        destacada ? null : envio,
      ].filter((d): d is string => Boolean(d)),
      sello: destacada ? envio : null,
      boton: p.cantidad === 1 ? "Elegir 1" : p.cantidad === 2 ? "Armar mis dos" : `Armar mis ${enLetras(p.cantidad)}`,
    };
  });

  const coloresPack: ColorDeADos[] = vitrina.flatMap((m) =>
    m.colores.map((c) => ({
      id: c.id,
      sku: c.sku,
      modeloSlug: m.slug,
      modeloNombre: m.nombre,
      precio: m.precio,
      color: c.color,
      foto: c.adentro,
      agotada: c.agotada,
    })),
  );
  const fotosPack = [vitrina[0], vitrina[Math.min(2, vitrina.length - 1)]]
    .filter((m, i, lista) => m && lista.indexOf(m) === i)
    .map((m) => ({ src: m.colores[m.inicial].adentro, alt: `${m.nombre} ${m.colores[m.inicial].color}` }));

  // Un día cualquiera: cada momento con el modelo y el color que le quedan, si tienen stock.
  const momento = (
    slug: string,
    color: string,
    alSol: boolean,
    datos: Pick<MomentoDelDia, "hora" | "lugar" | "texto" | "tinte">,
  ): MomentoDelDia | null => {
    const m = vitrina.find((v) => v.slug === slug);
    if (!m) return null;
    const c = m.colores.find((x) => !x.agotada && plano(x.color).startsWith(color)) ?? m.colores.find((x) => !x.agotada);
    if (!c) return null;
    return {
      ...datos,
      foto: alSol && c.alSol ? c.alSol : c.adentro,
      alt: `${m.nombre} ${c.color}${alSol && c.alSol ? ", al sol" : ""}`,
      par: {
        slug: m.slug,
        varianteId: c.id,
        sku: c.sku,
        nombre: m.nombre,
        color: c.color,
        precio: m.precio,
        precioTexto: formatearPrecio(m.precio),
      },
    };
  };
  const momentos = confirmados
    ? [
        momento("citrino", "carey", true, {
          hora: "10:15",
          lugar: "Café",
          texto: TEXTOS.unDia.cafe,
          tinte: "#efe6d6",
        }),
        momento("obsidiana", "negro", false, {
          hora: "16:00",
          lugar: "Oficina",
          texto: TEXTOS.unDia.oficina,
          tinte: "#d6e6ea",
        }),
        momento("cuarzo", "negro", false, {
          hora: "19:30",
          lugar: "Fútbol 5",
          texto: TEXTOS.unDia.futbol,
          tinte: "#f0d9a8",
        }),
        momento("amatista", "gris", true, {
          hora: "Domingo",
          lugar: "Brunch",
          texto: TEXTOS.unDia.brunch,
          tinte: "#dce5dd",
        }),
      ].filter((m): m is MomentoDelDia => m !== null)
    : [];

  const portadaAsiLlega = vitrina[0] ? modelos[0].variantes[vitrina[0].inicial]?.fotoPortada : null;
  const cuotasAnteojos = cuota1 ?? null;
  const ambaConUnPar = precio !== null && gratisAmba(precio);
  // Con cuántos pares el envío es gratis a todo el país (null si con 5 todavía no).
  const paresPaisGratis =
    precio !== null
      ? ([1, 2, 3, 4, 5].find((n) => gratisPais(armarPack({ precio, cantidad: n, tramos, categoria }).totalParaEnvio)) ?? null)
      : null;
  const paisConDos = paresPaisGratis !== null && paresPaisGratis > 1;
  const complementos = categoriasConProductos(productos).filter((c) => !esCategoriaDeAnteojos(c.nombre));
  // Los cristales con aumento los vende Harper: se consultan por WhatsApp (Ale, 30/10/2026).
  const consultaAumento = enlaceWhatsApp(config.whatsapp, mensajeGraduadosModelo(""));

  return (
    <>
      <Vitrina
        modelos={vitrina}
        datos={{
          etiqueta: lineas.length > 1 ? lineas.map((l) => l.corto).join(" · ") : "Anteojos Harper",
          linea: lineaVitrina.nombre,
          titulo: config.portadaTitulo || TEXTOS.portada.titulo,
          bajada,
          precio: precio ? formatearPrecio(precio) : null,
          cuota: textoCuota(cuota1),
          calificacion: opiniones ? { promedio: opiniones.promedio, total: opiniones.total } : null,
          letraChica,
          todos: todos
            ? {
                texto: `${TEXTOS.modelos.todosBoton} · ${formatearPrecio(todos.total)}${
                  todos.porcentaje ? (escala.length > 0 ? ` · cada par a ${formatearPrecio(todos.precioUnitario)}` : ` · ${todos.porcentaje} % OFF`) : ""
                }`,
              }
            : null,
        }}
      >
        {lineas.length > 1 ? (
          <section className="lineas" aria-labelledby="lineas-titulo">
            <div className="contenedor">
              <p className="etiqueta-mono">Las líneas</p>
              <h2 id="lineas-titulo" className="titulo-serif">
                {TEXTOS.lineas.titulo}
              </h2>
            </div>
            <ul className="lineas__carril">
              {lineas.map((l) => (
                <li key={l.clave}>
                  <a
                    href={
                      l.estado === "proximamente" ? `#viene-${l.clave}` : l.clave === lineaVitrina.clave ? "#los-modelos" : (l.ruta ?? "#")
                    }
                    className="linea"
                    data-estado={l.estado}
                  >
                    <span className="linea__estado">{l.estado === "disponible" ? "Ya disponibles" : "Próximamente"}</span>
                    <span className="linea__nombre">{l.nombre}</span>
                    <span className="linea__promesa">{l.promesa}</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </Vitrina>

      {confirmados && portadaAsiLlega ? (
        <section className="asi-llega" aria-labelledby="asi-llega-titulo">
          <div className="contenedor asi-llega__grilla">
            <div className="asi-llega__foto">
              <Image
                src={portadaAsiLlega}
                alt={`${vitrina[0].nombre} al sol y adentro, con su estuche y su paño`}
                fill
                sizes="(max-width: 768px) 100vw, 55vw"
              />
            </div>
            <div className="asi-llega__texto">
              <p className="etiqueta-mono">{TEXTOS.asiLlega.etiqueta}</p>
              <h2 id="asi-llega-titulo" className="titulo-serif">
                {TEXTOS.asiLlega.titulo}
              </h2>
              <p className="apagado">{TEXTOS.asiLlega.texto}</p>
              <ol className="lista-numerada">
                <li>{TEXTOS.asiLlega.alSol}</li>
                <li>{TEXTOS.asiLlega.adentro}</li>
                {incluye.length > 0 ? <li>{mayuscula(enumerar(incluye.map(minuscula)))}, incluidos.</li> : null}
              </ol>
              <p className="asi-llega__tira">
                UV400: UVA y UVB · ¿Usás aumento? Te ponemos los cristales oftálmicos.{" "}
                {consultaAumento ? (
                  <a href={consultaAumento} target="_blank" rel="noopener noreferrer">
                    Consultanos por WhatsApp.
                  </a>
                ) : null}
              </p>
              {precio ? (
                <p className="asi-llega__cierre">
                  Todo eso, {formatearPrecio(precio)}. {TEXTOS.asiLlega.cierre}
                </p>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {precio && filas.length > 0 ? (
        <DeADos
          filas={filas}
          colores={coloresPack}
          estuche={
            estuche && varianteEstuche
              ? {
                  slug: estuche.slug,
                  varianteId: varianteEstuche.id,
                  sku: varianteEstuche.sku,
                  nombre: `estuche ${estuche.nombre}`,
                  precio: estuche.precio,
                  precioTexto: formatearPrecio(estuche.precio),
                }
              : null
          }
          fotos={fotosPack}
          letraChica={
            letraChica
              ? `${letraChica}. Con dinero en tu cuenta de Mercado Pago, ${PORCENTAJE_DINERO_MP} % OFF extra.`
              : `Con dinero en tu cuenta de Mercado Pago, ${PORCENTAJE_DINERO_MP} % OFF extra.`
          }
          totales={Object.fromEntries(packs.map((p) => [p.cantidad, formatearPrecio(p.total)]))}
          encabezado={
            escala.length > 0
              ? {
                  // El stock es limitado de verdad (Ale, 30/10/2026).
                  etiqueta: "Stock limitado",
                  titulo: `${nombreDelTramo(escala[0])}.`,
                  bajada: TEXTOS.pack.bajada,
                }
              : undefined
          }
        />
      ) : null}

      {proximas.length > 0 ? (
        <section id="lo-que-viene" className="contenedor seccion lo-que-viene" aria-labelledby="lo-que-viene-titulo">
          <p className="etiqueta-mono">Próximamente</p>
          <h2 id="lo-que-viene-titulo" className="titulo-serif">
            {TEXTOS.viene.titulo}
          </h2>
          {/* Una sola vez cuánto llega: lo que dice cada línea ya está en la tira de arriba. */}
          <p className="apagado">
            {mayuscula(enumerar(proximas.map((l) => l.nombre.toLowerCase())))}: {proximas.reduce((n, l) => n + l.modelos, 0)} modelos,{" "}
            {proximas.reduce((n, l) => n + l.colores, 0)} colores. {TEXTOS.viene.cierre}
          </p>
          {proximas.map((l) => (
            <div key={l.clave} id={`viene-${l.clave}`} className="viene">
              <div className="viene__cabecera">
                <h3 className="viene__titulo">{l.nombre}</h3>
              </div>
              <ul className="viene__modelos">
                {l.enCamino.map((m) => (
                  <li key={m.nombre}>
                    <span className="viene__nombre">{m.nombre}</span>
                    <span className="viene__colores" aria-label={`${m.colores.length || m.cantidadDeColores} colores`}>
                      {m.colores.map((c, i) => (
                        <i key={i} style={{ background: c }} />
                      ))}
                      {m.colores.length === 0 && m.cantidadDeColores ? <small>{m.cantidadDeColores} colores</small> : null}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {config.instagram ? (
            <a href={config.instagram} target="_blank" rel="noopener noreferrer" className="boton boton--contorno lo-que-viene__boton">
              {TEXTOS.viene.boton}
            </a>
          ) : null}
        </section>
      ) : null}

      <Opiniones opiniones={opiniones} reputacion={reputacion} />

      <section className="contenedor seccion cuentas" aria-labelledby="cuentas-titulo">
        <h2 id="cuentas-titulo" className="titulo-serif">
          Las cuentas, claras.
        </h2>
        <dl className="cuentas__lista">
          {cuotasAnteojos ? (
            <div>
              <dt>{cuotasAnteojos.cuotas}</dt>
              <dd>
                cuotas sin interés en anteojos con {NOMBRE_MARCAS}. CFTEA {cuotasAnteojos.cftea}.
              </dd>
            </div>
          ) : null}
          <div>
            <dt>{PORCENTAJE_DINERO_MP} %</dt>
            <dd>OFF extra pagando con dinero en tu cuenta de Mercado Pago.</dd>
          </div>
          {ambaConUnPar ? (
            <div>
              <dt>24 h</dt>
              <dd>hábiles y te llega, en AMBA. Envío gratis con cualquier par.</dd>
            </div>
          ) : null}
          {paisConDos ? (
            <div>
              <dt>{paresPaisGratis}</dt>
              <dd>pares y el envío es gratis a todo el país.</dd>
            </div>
          ) : null}
          <div>
            <dt>{DIAS_CAMBIO}</dt>
            <dd>días para cambiarlo o devolverlo, sin uso y en su empaque.</dd>
          </div>
          <div>
            <dt>{MESES_GARANTIA}</dt>
            <dd>meses de garantía por defectos de fabricación.</dd>
          </div>
        </dl>
        {HAY_CUPONES ? (
          <p className="cuentas__cupon">
            ¿Primera compra? <strong>{CUPON_BIENVENIDA.codigo}</strong>: {CUPON_BIENVENIDA.porcentaje} % OFF. No se suma a la promo por
            cantidad: se aplica la que más te conviene.
          </p>
        ) : null}
      </section>

      <PreguntasFrecuentes
        preguntas={preguntasDePortada({
          incluye,
          caracteristicas: confirmados ? (caracteristicasDe(modelos[0])?.lista ?? null) : null,
          cuotas: cuotasAnteojos,
          nombreMarcas: NOMBRE_MARCAS,
          envioGratisDesde: config.envioGratisDesde,
          envioGratisTexto: formatearPrecio(config.envioGratisDesde),
          envioGratisAmbaTexto:
            config.envioGratisAmbaDesde > 0 && (config.envioGratisDesde <= 0 || config.envioGratisAmbaDesde < config.envioGratisDesde)
              ? formatearPrecio(config.envioGratisAmbaDesde)
              : null,
          hayWhatsapp: Boolean(config.whatsapp),
          diasArrepentimiento: DIAS_ARREPENTIMIENTO,
          diasCambio: DIAS_CAMBIO,
          mesesGarantia: MESES_GARANTIA,
          cupon: HAY_CUPONES ? CUPON_BIENVENIDA : null,
          escala: fraseDeLaEscala(tramos, categoria),
          porcentajeDineroMP: PORCENTAJE_DINERO_MP,
        })}
      />

      <UnDia momentos={momentos} />

      <section className="cierre" aria-labelledby="cierre-titulo">
        <div className="contenedor cierre__cuerpo">
          <ul className="cierre__anteojos" aria-hidden="true">
            {vitrina.map((m) => {
              const c = m.colores[m.inicial];
              return (
                <li key={m.id}>
                  <Image src={c.alSol ?? c.adentro} alt="" fill sizes="22vw" className="foto-multiplicada" />
                </li>
              );
            })}
          </ul>
          <h2 id="cierre-titulo" className="titulo-serif">
            {TEXTOS.cierre.titulo}
          </h2>
          {precio ? (
            <p>
              {TEXTOS.cierre.precio} {formatearPrecio(precio)}.
              {escala[0]
                ? ` Y si te llevás ${enLetras(escala[0].desdeUnidades)}, pagás ${enLetras(escala[0].paga ?? escala[0].desdeUnidades)}.`
                : paisConDos && paresPaisGratis
                  ? ` Con ${enLetras(paresPaisGratis)}, envío gratis a todo el país.`
                  : ""}
            </p>
          ) : null}
          <a href="#los-modelos" className="boton cierre__boton">
            {TEXTOS.cierre.boton}
          </a>
          {complementos.length > 0 ? (
            <p className="cierre__complementos">
              También:{" "}
              {complementos.map((c, i) => (
                <span key={c.slug}>
                  {i > 0 ? " y " : ""}
                  <Link href={`/${c.slug}`}>{c.nombre.toLowerCase()}</Link>
                </span>
              ))}
              .
            </p>
          ) : null}
          <p className="cierre__complementos">
            <Link href="/quienes-somos">Quiénes somos</Link>
          </p>
        </div>
      </section>

      {precio ? (
        <BarraTusPares
          despuesDe="vitrina-portada"
          precioPar={precio}
          invitacion={
            cuota2 && nombrePromo
              ? `${nombrePromo}: ${cuota2.cuotas} cuotas sin interés de ${precioConCentavos(cuota2.montoCuota)}`
              : `Cada par, ${formatearPrecio(precio)}`
          }
        />
      ) : null}
    </>
  );
}
