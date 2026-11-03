import Image from "next/image";
import Link from "next/link";
import BarraTusPares from "./BarraTusPares";
import DeADos, { type ColorDeADos, type FilaDeADos } from "./DeADos";
import Opiniones from "./Opiniones";
import { PreguntasFrecuentes } from "./SeccionesPortada";
import PortadaColor, { type ColorPortada } from "./PortadaColor";
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
import { CUOTAS_SUSCRIPTORES, CUPON_BIENVENIDA as CUPON_SUSCRIPTOR } from "@/lib/suscriptores";
import { TEXTOS } from "@/lib/textos";
import type { Producto, Variante } from "@/lib/tipos";
import BeneficiosSuscriptor from "@/components/suscriptores/BeneficiosSuscriptor";
import CajaSuscripcion from "@/components/suscriptores/CajaSuscripcion";
import { rutaDeVariante } from "@/lib/variantes";
import { enLetras, FORMAS, fotosDeVitrina, precioUnico, tinteDe, tinteDeColor } from "@/lib/vitrina";

/**
 * La portada vitrina (pedido de Ale, 30/10/2026): marca primero y compra
 * rápida. Los modelos sobre color, que se suman sin salir de la portada; la
 * cuenta de llevarse dos; lo que trae cada par; las opiniones; las cuentas
 * claras, un día con el mismo par y Suscriptores Harper (Ale, 03/11/2026: la
 * suscripción gratis con el mail, con el formulario ahí mismo). Lo de
 * siempre se respeta: los montos
 * salen de Airtable y de Mercado Pago (cuotas verificadas para cada total),
 * nada que no esté confirmado se afirma y no se nombra a Mercado Libre.
 */

const ESPERA_CUOTAS_MS = 3_000;
const ESPERA_OPINIONES_MS = 9_000;

/** El color más vistoso primero: así la vitrina no abre con cuatro anteojos negros. */
const ORDEN_DE_COLORES = ["carey", "gris", "ambar", "negro"];

const plano = (texto: string) => texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const mayuscula = (texto: string) => texto.charAt(0).toUpperCase() + texto.slice(1);
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
  // Y las de suscriptor (6) para un par, aparte: se nombran solo si Mercado Pago las confirma.
  const [verificadas, mercadoLibre, cuotasSuscriptor] = await Promise.all([
    conEspera(Promise.all(montos.map(async (m) => [m, await verificarCuotas(m)] as const)), ESPERA_CUOTAS_MS, []),
    conEspera(datosDeMercadoLibre(), ESPERA_OPINIONES_MS, ultimoDeMercadoLibre()),
    precio ? conEspera(verificarCuotas(precio, CUOTAS_SUSCRIPTORES), ESPERA_CUOTAS_MS, null) : Promise.resolve(null),
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
      tinte: tinteDeColor(m.slug, v.color, i),
    })),
  }));

  const confirmados = modelos.length > 0 && modelos.every((m) => caracteristicasDe(m) !== null);
  const pack1 = packs.find((p) => p.cantidad === 1);
  // El primer pack de más de un par: el de la promoción (3 con la escala, 2 sin ella).
  const pack2 = packs.find((p) => p.cantidad > 1);
  const cuota1 = pack1 ? cuotasDe(pack1.total) : undefined;
  // Sin promoción por cantidad (Ale, 03/11/2026: sin «llevá 3, pagá 2») no se
  // empuja a llevar más de uno: ni el bloque de packs ni la promo en la bajada o la barra.
  const hayPromo = escala.length > 0 || packs.some((p) => p.porcentaje > 0);
  const cuota2 = pack2 && hayPromo ? cuotasDe(pack2.total) : undefined;
  const nombrePromo = pack2 && hayPromo ? (tramoDe(pack2.cantidad) ? nombreDelTramo(tramoDe(pack2.cantidad)!) : `${mayuscula(enLetras(pack2.cantidad))} pares`) : null;
  const incluye = modelos[0]?.incluye ?? [];
  const marcas = cuota1 ?? cuota2;
  const letraChica = marcas ? `Cuotas sin interés con ${NOMBRE_MARCAS} · CFTEA ${marcas.cftea}` : null;

  // Envío gratis: en AMBA desde un mínimo y en todo el país desde otro (sobre el subtotal sin cupón).
  const gratisPais = (monto: number) => config.envioGratisDesde > 0 && monto >= config.envioGratisDesde;
  const gratisAmba = (monto: number) => config.envioGratisAmbaDesde > 0 && monto >= config.envioGratisAmbaDesde && !gratisPais(monto);
  const envioDe = (monto: number) =>
    gratisPais(monto) ? "Envío gratis a todo el país" : gratisAmba(monto) ? "Envío gratis en AMBA" : null;

  const tramo2 = pack2 ? tramoDe(pack2.cantidad) : null;

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

  const portadaAsiLlega = vitrina[0] ? modelos[0].variantes[vitrina[0].inicial]?.fotoPortada : null;
  const cuotasAnteojos = cuota1 ?? null;
  // Las de suscriptor, solo si son más que las de todos (con el tope en 3 serían las mismas).
  const cuotasDeSuscriptor = cuotasSuscriptor && (!cuotasAnteojos || cuotasSuscriptor.cuotas > cuotasAnteojos.cuotas) ? cuotasSuscriptor : null;
  // Con cuántos pares el envío es gratis a todo el país (null si con 5 todavía no).
  const paresPaisGratis =
    precio !== null
      ? ([1, 2, 3, 4, 5].find((n) => gratisPais(armarPack({ precio, cantidad: n, tramos, categoria }).totalParaEnvio)) ?? null)
      : null;
  const paisConDos = paresPaisGratis !== null && paresPaisGratis > 1;
  const complementos = categoriasConProductos(productos).filter((c) => !esCategoriaDeAnteojos(c.nombre));
  // Los cristales con aumento los vende Harper: se consultan por WhatsApp (Ale, 30/10/2026).
  const consultaAumento = enlaceWhatsApp(config.whatsapp, mensajeGraduadosModelo(""));

  // La portada: un solo par grande, que abre en carey (el color más vistoso) si hay.
  const coloresPortada: ColorPortada[] = vitrina.flatMap((m) =>
    m.colores.map((c) => ({
      id: c.id,
      modeloSlug: m.slug,
      modeloNombre: m.nombre,
      color: c.color,
      colorHex: c.colorHex,
      foto: c.alSol ?? c.adentro,
      alSol: c.alSol !== null,
      tinte: c.tinte,
      agotada: c.agotada,
    }))
  );
  const inicialPortada = Math.max(
    0,
    [
      (c: ColorPortada) => !c.agotada && c.alSol && plano(c.color).startsWith("carey"),
      (c: ColorPortada) => !c.agotada && c.alSol,
      (c: ColorPortada) => !c.agotada,
    ]
      .map((elegible) => coloresPortada.findIndex(elegible))
      .find((i) => i >= 0) ?? 0,
  );

  // Un mismo par, adentro y al sol: el primero que tenga las dos fotos.
  const parDelDia = vitrina
    .flatMap((m) => m.colores.filter((c) => c.alSol && !c.agotada).map((c) => ({ m, c })))
    .at(0);
  const momentosDelDia = [
    { hora: "10:15", lugar: "Café", texto: TEXTOS.unDia.cafe },
    { hora: "16:00", lugar: "Oficina", texto: TEXTOS.unDia.oficina },
    { hora: "19:30", lugar: "Fútbol 5", texto: TEXTOS.unDia.futbol },
    { hora: "Domingo", lugar: "Brunch", texto: TEXTOS.unDia.brunch },
  ];

  return (
    <>
      <PortadaColor
        colores={coloresPortada}
        inicial={inicialPortada}
        datos={{
          etiqueta: confirmados ? TEXTOS.portada.etiqueta : lineaVitrina.nombre,
          titulo: config.portadaTitulo || TEXTOS.portada.titulo,
          bajada: config.portadaSubtitulo || TEXTOS.portada.bajadaMarca,
          boton: TEXTOS.portada.boton,
          precio: precio ? formatearPrecio(precio) : null,
          cuota: textoCuota(cuota1),
          letraChica,
          suscribite: TEXTOS.suscriptores.enlacePortada(formatearPrecio(CUPON_SUSCRIPTOR)),
        }}
      />

      <Vitrina
        modelos={vitrina}
        datos={{
          linea: lineaVitrina.nombre,
          precio: precio ? formatearPrecio(precio) : null,
          cuota: textoCuota(cuota1),
          todos: todos
            ? {
                texto: `${TEXTOS.modelos.todosBoton} · ${formatearPrecio(todos.total)}${
                  todos.porcentaje ? (escala.length > 0 ? ` · cada par a ${formatearPrecio(todos.precioUnitario)}` : ` · ${todos.porcentaje} % OFF`) : ""
                }`,
              }
            : null,
          complementos: complementos.map((c) => ({ nombre: c.nombre, slug: c.slug })),
        }}
      />

      {confirmados && parDelDia?.c.alSol ? (
        <section className="un-par" aria-labelledby="un-par-titulo">
          <div className="contenedor">
            <div className="un-par__cabecera">
              <p className="etiqueta-mono">{TEXTOS.unDia.etiqueta}</p>
              <h2 id="un-par-titulo" className="titulo-serif">
                {TEXTOS.unDia.titulo}
              </h2>
              <p className="un-par__bajada">{TEXTOS.asiLlega.texto}</p>
            </div>
            <div className="un-par__grilla">
              <div className="un-par__fotos">
                <figure className="un-par__foto" style={{ background: "#ecebe6" }}>
                  <Image src={parDelDia.c.adentro} alt={`${parDelDia.m.nombre} ${parDelDia.c.color}, adentro`} fill sizes="(max-width: 768px) 50vw, 30vw" className="foto-multiplicada" />
                  <figcaption>
                    <strong>Adentro</strong> {mayuscula(TEXTOS.asiLlega.adentro.replace(/^Adentro, /, ""))}
                  </figcaption>
                </figure>
                <figure className="un-par__foto" style={{ background: parDelDia.c.tinte }}>
                  <Image src={parDelDia.c.alSol} alt={`${parDelDia.m.nombre} ${parDelDia.c.color}, al sol`} fill sizes="(max-width: 768px) 50vw, 30vw" className="foto-multiplicada" />
                  <figcaption>
                    <strong>Al sol</strong> {mayuscula(TEXTOS.asiLlega.alSol.replace(/^Al sol, /, ""))}
                  </figcaption>
                </figure>
              </div>
              <div>
                <ol className="un-par__momentos">
                  {momentosDelDia.map((m) => (
                    <li key={m.hora}>
                      <span className="un-par__hora">
                        {m.hora}
                        <span className="un-par__lugar">{m.lugar}</span>
                      </span>
                      <span className="un-par__momento">{m.texto}</span>
                    </li>
                  ))}
                </ol>
                <p className="un-par__nota">Protección UV400 contra los rayos UVA y UVB. El tono final depende de la luz.</p>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {confirmados && portadaAsiLlega ? (
        <section className="asi-llega" aria-labelledby="asi-llega-titulo">
          <div className="contenedor asi-llega__grilla">
            <div className="asi-llega__foto">
              <Image
                src={portadaAsiLlega}
                alt={`${vitrina[0].nombre} al sol y adentro, con su estuche y su paño`}
                fill
                sizes="(max-width: 768px) 100vw, 50vw"
              />
            </div>
            <div className="asi-llega__texto">
              <h2 id="asi-llega-titulo" className="titulo-serif">
                {TEXTOS.asiLlega.etiqueta}
              </h2>
              {incluye.length > 0 ? (
                <ul className="asi-llega__incluye">
                  {incluye.map((i) => (
                    <li key={i}>{i}</li>
                  ))}
                </ul>
              ) : null}
              <p className="asi-llega__tira">
                {TEXTOS.asiLlega.aumento}{" "}
                {consultaAumento ? (
                  <a href={consultaAumento} target="_blank" rel="noopener noreferrer">
                    Consultanos por WhatsApp.
                  </a>
                ) : null}
              </p>
              {precio ? (
                <p className="asi-llega__cierre">
                  {TEXTOS.asiLlega.todoEso} <span className="cifra">{formatearPrecio(precio)}</span>.
                  <span className="asi-llega__preparate">{TEXTOS.asiLlega.preparate}</span>
                </p>
              ) : null}
            </div>
          </div>
          <dl className="contenedor cuentas__lista">
            {cuotasAnteojos ? (
              <div>
                <dt>{cuotasAnteojos.cuotas}</dt>
                <dd>
                  cuotas sin interés en anteojos con {NOMBRE_MARCAS}. CFTEA {cuotasAnteojos.cftea}.
                </dd>
              </div>
            ) : null}
            <div>
              <dt>{PORCENTAJE_DINERO_MP}%</dt>
              <dd>OFF extra pagando con dinero en tu cuenta de Mercado Pago.</dd>
            </div>
            <div>
              <dt>{DIAS_CAMBIO}</dt>
              <dd>días para cambiarlo o devolverlo, sin uso y en su empaque.</dd>
            </div>
            <div>
              <dt>{MESES_GARANTIA}</dt>
              <dd>meses de garantía por defectos de fabricación.</dd>
            </div>
          </dl>
        </section>
      ) : null}

      <Opiniones opiniones={opiniones} reputacion={reputacion} />

      {/* Suscriptores Harper (Ale, 03/11/2026): donde estaban los socios, con
          el formulario ahí mismo. */}
      <section id="suscriptores" className="suscriptores-portada" aria-labelledby="suscriptores-portada-titulo">
        <div className="contenedor suscriptores-portada__grilla">
          <div className="suscriptores-portada__texto">
            <p className="etiqueta-mono">{TEXTOS.suscriptores.etiqueta} · Es gratis</p>
            <h2 id="suscriptores-portada-titulo" className="suscriptores-portada__titulo">
              {TEXTOS.suscriptores.titulo}
            </h2>
            <p className="suscriptores-portada__bajada">{TEXTOS.suscriptores.bajada}</p>
            <BeneficiosSuscriptor cuotas={cuotasDeSuscriptor} cuotasTodos={cuotasAnteojos?.cuotas ?? null} />
          </div>
          <div className="suscriptores-portada__form">
            <CajaSuscripcion origen="Portada" />
          </div>
        </div>
      </section>

      {precio && filas.length > 0 && hayPromo ? (
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
        <section id="lo-que-viene" className="lo-que-viene" aria-labelledby="lo-que-viene-titulo">
          <div className="contenedor lo-que-viene__grilla">
            <div>
              <p className="etiqueta-mono">Próximamente</p>
              <h2 id="lo-que-viene-titulo" className="titulo-serif">
                {TEXTOS.viene.titulo}
              </h2>
              <p className="lo-que-viene__bajada">
                {TEXTOS.viene.bajada(
                  enumerar(proximas.map((l) => l.nombre.toLowerCase())),
                  proximas.reduce((n, l) => n + l.modelos, 0),
                  proximas.reduce((n, l) => n + l.colores, 0),
                )}
              </p>
            </div>
            <div>
              <ul className="lo-que-viene__lineas">
                {proximas.map((l) => (
                  <li key={l.clave} id={`viene-${l.clave}`}>
                    <span className="lo-que-viene__nombre">{l.nombre}</span>
                    <span className="lo-que-viene__promesa">{l.promesa}</span>
                    <span className="lo-que-viene__cuantos">
                      {l.modelos} {l.modelos === 1 ? "modelo" : "modelos"}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="lo-que-viene__acciones">
                <a href="#suscriptores" className="lo-que-viene__suscribite">
                  {TEXTOS.viene.suscribite}
                </a>
                {config.instagram ? (
                  <a href={config.instagram} target="_blank" rel="noopener noreferrer" className="boton boton--contorno lo-que-viene__boton">
                    {TEXTOS.viene.boton}
                  </a>
                ) : null}
              </div>
            </div>
          </div>
        </section>
      ) : null}

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
          cuotasSuscriptor: cuotasDeSuscriptor,
          suscriptores: true,
        })}
      />

      <section className="cierre" aria-labelledby="cierre-titulo">
        <div className="contenedor cierre__cuerpo">
          <h2 id="cierre-titulo" className="cierre__titulo">
            {TEXTOS.nosotros.frase[0]}
            <span>{TEXTOS.nosotros.frase[1]}</span>
          </h2>
          {precio ? (
            <p>
              {TEXTOS.cierre.precio(formatearPrecio(precio))}
              {escala[0]
                ? TEXTOS.cierre.escala(enLetras(escala[0].desdeUnidades), enLetras(escala[0].paga ?? escala[0].desdeUnidades))
                : paisConDos && paresPaisGratis
                  ? ` Con ${enLetras(paresPaisGratis)}, envío gratis a todo el país.`
                  : ""}
            </p>
          ) : null}
          <a href="#los-modelos" className="boton cierre__boton">
            {TEXTOS.cierre.boton}
          </a>
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
            cuota2 && tramo2 && nombrePromo
              ? `${nombrePromo}: ${cuota2.cuotas} cuotas sin interés de ${precioConCentavos(cuota2.montoCuota)} · CFTEA ${cuota2.cftea}`
              : cuota1
                ? `${formatearPrecio(precio)} · ${cuota1.cuotas} cuotas sin interés de ${precioConCentavos(cuota1.montoCuota)} · CFTEA ${cuota1.cftea}`
                : `Cada par, ${formatearPrecio(precio)}`
          }
        />
      ) : null}
    </>
  );
}
