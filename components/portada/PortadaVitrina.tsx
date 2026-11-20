import BarraTusPares from "./BarraTusPares";
import Opiniones from "./Opiniones";
import PortadaHero from "./PortadaHero";
import { ConfianzaPortada, type ItemConfianza } from "./SeccionesPortada";
import Vitrina, { type CategoriaVitrina, type DestacadoVitrina, type DuoVitrina } from "./Vitrina";
import { duoParaAnunciar } from "./duoDelServidor";
import { caracteristicasDe } from "@/lib/caracteristicas";
import { categoriasConProductos, esCategoriaDeAnteojos } from "@/lib/categorias";
import type { ConfigTienda } from "@/lib/config";
import { DIAS_ARREPENTIMIENTO, DIAS_CAMBIO, MESES_GARANTIA, mensajesDeConfianza } from "@/lib/confianza";
import { NOMBRE_MARCAS, type CuotasVerificadas } from "@/lib/cuotas";
import { conEspera, verificarCuotas } from "@/lib/cuotas-servidor";
import { PORCENTAJE_DINERO_MP } from "@/lib/dinero-mp";
import { condicionesDeCompra } from "@/lib/ficha";
import { precio as formatearPrecio, precioConCentavos } from "@/lib/formato";
import { datosDeMercadoLibre, ultimoDeMercadoLibre } from "@/lib/ml-resenas-servidor";
import { TEXTOS } from "@/lib/textos";
import type { Producto, Variante } from "@/lib/tipos";
import Link from "next/link";
import CajaSuscripcion from "@/components/suscriptores/CajaSuscripcion";
import { rutaDeVariante } from "@/lib/variantes";
import { enlaceWhatsApp } from "@/lib/whatsapp";
import { categoriasParaComprar, destacadosDeLaPortada, FORMAS, fotoDeLaPortada, fotosDeVitrina, tinteDe, tinteDeColor } from "@/lib/vitrina";

/**
 * La portada (Ale, 05/11/2026: «vamos a simplificar radicalmente el Home»).
 * Solo cinco partes y el pie:
 *
 * 1. Presentación: «Anteojos de diseño», la frase de la marca, una foto real
 *    del anteojo entero y «Explorar anteojos».
 * 2. Comprar: cuatro modelos destacados como mucho y un acceso por cada
 *    categoría de anteojos con stock (las vacías no se muestran).
 * 3. Confianza: las condiciones de compra (envío, pago y cuotas), la
 *    devolución y el asesoramiento, compacto.
 * 4. La cuenta Harper y las novedades: un título, una bajada breve y el
 *    formulario a la vista; qué trae la cuenta, a un enlace.
 * 5. Opiniones: solo de anteojos, reales; sin ninguna, no aparece.
 *
 * Lo largo (cómo funcionan los cristales, qué trae la caja, las preguntas)
 * quedó en las fichas y en /preguntas-frecuentes. Los montos salen de
 * Airtable y de Mercado Pago (cuotas verificadas), nada que no esté
 * confirmado se afirma y no se nombra a Mercado Libre.
 *
 * Ale, 18/11/2026: la portada va sin la barra de anuncios, así que las
 * condiciones de compra se dicen acá, las mismas para todos: el envío gratis
 * con los dos mínimos de Config, el 10 % por pagar con el dinero de la cuenta
 * de Mercado Pago y las cuotas que Mercado Pago confirmó. El Dúo se muestra
 * en «Comprar» (debajo del título y junto a cada precio) solo si el servidor
 * dice que está prendido, con lo que cobra por dos anteojos; apagado, la
 * portada no lo nombra. La sección 4 ya no promete beneficios: es la cuenta
 * y los mails de novedades.
 */

const ESPERA_CUOTAS_MS = 3_000;
const ESPERA_OPINIONES_MS = 9_000;

/**
 * El video del hero: tres modelos con el cristal que se oscurece al sol y se
 * aclara adentro (public/portada). Es un archivo fijo: si alguno de los tres
 * modelos se deja de vender, hay que rehacerlo.
 */
const VIDEO_PORTADA = {
  src: "/portada/fotocromaticos.mp4",
  imagen: "/portada/fotocromaticos.jpg",
  descripcion: TEXTOS.inicio.video,
};

/** El color más vistoso primero: así la vitrina no abre con cuatro anteojos negros. */
const ORDEN_DE_COLORES = ["carey", "gris", "ambar", "negro"];

const plano = (texto: string) => texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

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

function textoCuota(c: CuotasVerificadas | null | undefined): string | null {
  return c ? `${c.cuotas} cuotas sin interés de ${precioConCentavos(c.montoCuota)}` : null;
}

export default async function PortadaVitrina({ productos, config }: { productos: Producto[]; config: ConfigTienda }) {
  // Las categorías de anteojos con stock, en orden; de ahí, cuatro destacados como mucho.
  const categorias = categoriasParaComprar(productos);
  const destacadosProductos = destacadosDeLaPortada(categorias);
  const todos = categorias.flatMap((c) => c.productos);
  const precios = [...new Set(destacadosProductos.map((p) => p.precio))];
  const precioPar = todos.length > 0 ? Math.min(...todos.map((m) => m.precio)) : null;

  // Las cuotas de cada precio que se muestra, confirmadas con Mercado Pago.
  // Son las mismas para todos (Ale, 18/11/2026: hasta 3; nadie tiene más).
  // El Dúo, solo si el servidor lo tiene prendido: null y la portada no lo nombra.
  const [verificadas, mercadoLibre, duoAnunciado] = await Promise.all([
    conEspera(Promise.all(precios.map(async (p) => [p, await verificarCuotas(p)] as const)), ESPERA_CUOTAS_MS, []),
    conEspera(datosDeMercadoLibre(), ESPERA_OPINIONES_MS, ultimoDeMercadoLibre()),
    duoParaAnunciar(todos),
  ]);
  const cuotasDe = (precio: number | null) => (precio === null ? null : (verificadas.find(([p]) => p === precio)?.[1] ?? null));
  const cuotasAnteojos = cuotasDe(precioPar);

  // El Dúo en «Comprar»: la regla, lo que cobra el servidor por dos anteojos
  // (solo si todos cuestan lo mismo y pudo armar ese carrito) y la etiqueta
  // de cada tarjeta. Los textos, de TEXTOS.programa; los números, del servidor.
  const D = TEXTOS.programa.duo;
  const duo: DuoVitrina | null = duoAnunciado
    ? {
        titulo: `${D.regla(duoAnunciado.porcentaje)}.`,
        detalle: [
          duoAnunciado.dos ? D.dosAnteojos(formatearPrecio(duoAnunciado.dos.total), formatearPrecio(duoAnunciado.dos.lista)) : null,
          D.combinar,
        ]
          .filter(Boolean)
          .join(" "),
        etiqueta: D.etiqueta(duoAnunciado.porcentaje),
      }
    : null;

  // 2. Comprar: los destacados, cada uno con su color inicial, su fondo y sus cuotas.
  const iniciales = coloresIniciales(destacadosProductos);
  const destacados: DestacadoVitrina[] = destacadosProductos.map((m, i) => ({
    id: m.id,
    slug: m.slug,
    nombre: m.nombre,
    precio: m.precio,
    tinte: tinteDe(m.slug, i),
    forma: FORMAS[m.slug] ?? null,
    inicial: iniciales[i],
    categoria: categorias.find((c) => c.nombre === m.categoria)?.titulo ?? m.categoria,
    cuota: textoCuota(cuotasDe(m.precio)),
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
  const accesos: CategoriaVitrina[] = categorias.map((c) => ({ slug: c.slug, titulo: c.titulo, enlace: c.enlace, cantidad: c.productos.length }));
  const complementos = categoriasConProductos(productos).filter((c) => !esCategoriaDeAnteojos(c.nombre));

  // Las condiciones de las cuotas de las tarjetas, una vez para la sección
  // (Res. SIyC 4/2025): tarjetas, CFTEA y precio de contado. El importe va
  // solo si todos los destacados cuestan lo mismo.
  const cuotasDeTarjetas = destacadosProductos.map((m) => cuotasDe(m.precio)).find((c) => c !== null) ?? null;
  const condicionesCuotas = cuotasDeTarjetas
    ? TEXTOS.programa.cuotas.deLaSeccion(NOMBRE_MARCAS, cuotasDeTarjetas.cftea, precios.length === 1 ? formatearPrecio(precios[0]) : null)
    : null;

  // 3. Confianza. Arriba, las condiciones de compra, las mismas para todos:
  // el envío con los dos mínimos de Config (y cómo se cuentan), el 10 % por
  // pagar con el dinero de la cuenta de Mercado Pago y las cuotas confirmadas.
  // Abajo, la devolución y el asesoramiento (los mismos plazos y enlaces que la ficha).
  const mensajes = mensajesDeConfianza(config, cuotasAnteojos, "en anteojos");
  const envio = mensajes.find((m) => m.clave === "envio");
  const cuotas = mensajes.find((m) => m.clave === "cuotas");
  const hayEnvioGratis = config.envioGratisDesde > 0 || config.envioGratisAmbaDesde > 0;
  const devolucion = condicionesDeCompra([], {
    diasArrepentimiento: DIAS_ARREPENTIMIENTO,
    diasCambio: DIAS_CAMBIO,
    mesesGarantia: MESES_GARANTIA,
  }).find((c) => c.clave === "devolucion");
  const whatsapp = enlaceWhatsApp(config.whatsapp, "Hola, Harper. Quiero consultar por los anteojos.");
  const M = TEXTOS.programa.dineroMP;
  const condiciones: ItemConfianza[] = [
    hayEnvioGratis && envio
      ? { clave: "envio", texto: envio.texto, detalle: envio.detalle ?? null, nota: envio.nota ?? null, href: "/legales/terminos#envios" }
      : { clave: "envio", texto: TEXTOS.inicio.confianza.envio, detalle: TEXTOS.inicio.confianza.envioDetalle, href: "/legales/terminos#envios" },
    {
      clave: "pago",
      texto: M.barra(PORCENTAJE_DINERO_MP),
      // «Se suma al Dúo.» solo con el Dúo prendido.
      detalle: duo ? `${M.detalle} ${M.seSumaAlDuo}` : M.detalle,
      href: "/preguntas-frecuentes",
    },
    ...(cuotas ? [{ clave: "cuotas" as const, texto: cuotas.texto, detalle: cuotas.detalle ?? null, href: "/preguntas-frecuentes" }] : []),
  ];
  const servicio: ItemConfianza[] = [
    ...(devolucion ? [{ clave: "devolucion" as const, texto: devolucion.texto, detalle: devolucion.detalle, href: devolucion.href }] : []),
    ...(whatsapp
      ? [{ clave: "whatsapp" as const, texto: TEXTOS.inicio.confianza.whatsapp, detalle: TEXTOS.inicio.confianza.whatsappDetalle, href: whatsapp, externo: true }]
      : []),
  ];

  const S = TEXTOS.inicio.suscripcion;

  return (
    <>
      {/* 1. Presentación. Config `portada_titulo` y `portada_subtitulo` ganan si se cargan; hoy están vacíos. */}
      <PortadaHero
        producto={TEXTOS.inicio.producto}
        frase={config.portadaTitulo ? [config.portadaTitulo] : [TEXTOS.nosotros.frase[0], TEXTOS.nosotros.frase[1]]}
        bajada={config.portadaSubtitulo || TEXTOS.inicio.bajada}
        boton={TEXTOS.inicio.boton}
        foto={config.portadaImagen ? { src: config.portadaImagen, alt: "" } : fotoDeLaPortada(destacadosProductos)}
        // El video de los cristales (Ale, 17/11/2026). Una foto cargada a propósito en Config.portada_imagen le gana.
        video={config.portadaImagen ? null : VIDEO_PORTADA}
      />

      {/* 2. Comprar: cuatro destacados y un acceso por categoría. */}
      <Vitrina
        destacados={destacados}
        categorias={accesos}
        datos={{ complementos: complementos.map((c) => ({ nombre: c.nombre, slug: c.slug })), condicionesCuotas }}
        duo={duo}
      />

      {/* 3. Confianza: las condiciones de compra y, debajo, la devolución y el asesoramiento. */}
      <ConfianzaPortada filas={[condiciones, servicio]} />

      {/* 4. La cuenta Harper y las novedades: breve. Título, bajada, qué trae la
          cuenta a un enlace y el formulario justo debajo. Sin beneficios en
          plata (Ale, 18/11/2026); los textos, en TEXTOS.inicio.suscripcion. */}
      <section id="suscriptores" className="suscripcion-inicio" aria-labelledby="suscripcion-inicio-titulo">
        <div className="contenedor suscripcion-inicio__grilla">
          <div className="suscripcion-inicio__texto">
            <p className="etiqueta-mono">{S.etiqueta}</p>
            <h2 id="suscripcion-inicio-titulo" className="suscripcion-inicio__titulo">
              {S.titulo}
            </h2>
            <p className="suscripcion-inicio__bajada">{S.bajada}</p>
            <Link href="/suscriptores" className="suscripcion-inicio__mas">
              {S.beneficios}
            </Link>
          </div>
          <div id="suscribirme" className="suscripcion-inicio__form">
            <CajaSuscripcion origen="Portada" />
          </div>
        </div>
      </section>

      {/* 5. Opiniones: solo de anteojos; sin ninguna, la sección no aparece. */}
      <Opiniones opiniones={mercadoLibre?.opiniones ?? null} reputacion={null} soloAnteojos />

      {/* Con algo en el carrito, la barra de abajo lleva a pagar; sin nada, no aparece. */}
      {precioPar ? (
        <BarraTusPares
          despuesDe="vitrina-portada"
          ocultarEn="suscriptores"
          soloConCarrito
          precioPar={precioPar}
          invitacion={cuotasAnteojos ? `${formatearPrecio(precioPar)} · ${textoCuota(cuotasAnteojos)}` : formatearPrecio(precioPar)}
        />
      ) : null}
    </>
  );
}
