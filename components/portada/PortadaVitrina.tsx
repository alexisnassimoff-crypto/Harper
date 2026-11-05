import BarraTusPares from "./BarraTusPares";
import Opiniones from "./Opiniones";
import PortadaHero from "./PortadaHero";
import { ConfianzaPortada, type ItemConfianza } from "./SeccionesPortada";
import Vitrina, { type CategoriaVitrina } from "./Vitrina";
import { caracteristicasDe } from "@/lib/caracteristicas";
import { categoriasConProductos, esCategoriaDeAnteojos } from "@/lib/categorias";
import type { ConfigTienda } from "@/lib/config";
import { DIAS_ARREPENTIMIENTO, DIAS_CAMBIO, MESES_GARANTIA, mensajesDeConfianza } from "@/lib/confianza";
import { type CuotasVerificadas } from "@/lib/cuotas";
import { conEspera, verificarCuotas } from "@/lib/cuotas-servidor";
import { condicionesDeCompra } from "@/lib/ficha";
import { precio as formatearPrecio, precioConCentavos } from "@/lib/formato";
import { datosDeMercadoLibre, ultimoDeMercadoLibre } from "@/lib/ml-resenas-servidor";
import { CUOTAS_SON_BENEFICIO, CUOTAS_SUSCRIPTORES } from "@/lib/suscriptores";
import { TEXTOS } from "@/lib/textos";
import type { Producto, Variante } from "@/lib/tipos";
import { beneficiosDeSuscriptor } from "@/components/suscriptores/BeneficiosSuscriptor";
import CajaSuscripcion from "@/components/suscriptores/CajaSuscripcion";
import Cifras from "@/components/Cifras";
import { rutaDeVariante } from "@/lib/variantes";
import { enlaceWhatsApp } from "@/lib/whatsapp";
import { categoriasParaComprar, FORMAS, fotoDeLaPortada, fotosDeVitrina, precioUnico, tinteDe, tinteDeColor } from "@/lib/vitrina";

/**
 * La portada (Ale, 05/11/2026: «vamos a simplificar radicalmente el Home»).
 * Solo cinco partes y el pie:
 *
 * 1. Presentación: Harper como marca de anteojos de diseño, una foto
 *    protagonista y «Explorar anteojos».
 * 2. Comprar: una categoría de anteojos por bloque, solo las que tienen stock.
 * 3. Confianza: envío, devolución y asesoramiento, compacto.
 * 4. Suscripción: breve, aparte y con el formulario a la vista.
 * 5. Opiniones: unas pocas, reales.
 *
 * Lo largo (cómo funcionan los cristales, qué trae la caja, las preguntas)
 * quedó en las fichas y en /preguntas-frecuentes. Los montos salen de
 * Airtable y de Mercado Pago (cuotas verificadas), nada que no esté
 * confirmado se afirma y no se nombra a Mercado Libre.
 */

const ESPERA_CUOTAS_MS = 3_000;
const ESPERA_OPINIONES_MS = 9_000;

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
  // Las categorías de anteojos con stock, en orden; cada una con sus modelos con stock.
  const categorias = categoriasParaComprar(productos);
  const modelos = categorias.flatMap((c) => c.productos);
  const precios = [...new Set(categorias.map((c) => precioUnico(c.productos)).filter((p): p is number => p !== null))];
  const precioPar = modelos.length > 0 ? Math.min(...modelos.map((m) => m.precio)) : null;

  // Las cuotas de cada precio que se anuncia, confirmadas con Mercado Pago; las
  // de suscriptor, solo si son un beneficio (lib/suscriptores.ts).
  const [verificadas, mercadoLibre, cuotasSuscriptor] = await Promise.all([
    conEspera(Promise.all(precios.map(async (p) => [p, await verificarCuotas(p)] as const)), ESPERA_CUOTAS_MS, []),
    conEspera(datosDeMercadoLibre(), ESPERA_OPINIONES_MS, ultimoDeMercadoLibre()),
    precioPar && CUOTAS_SON_BENEFICIO ? conEspera(verificarCuotas(precioPar, CUOTAS_SUSCRIPTORES), ESPERA_CUOTAS_MS, null) : Promise.resolve(null),
  ]);
  const cuotasDe = (precio: number | null) => (precio === null ? null : (verificadas.find(([p]) => p === precio)?.[1] ?? null));
  const cuotasAnteojos = cuotasDe(precioPar);
  const cuotasDeSuscriptor =
    cuotasSuscriptor && (!cuotasAnteojos || cuotasSuscriptor.cuotas > cuotasAnteojos.cuotas) ? cuotasSuscriptor : null;

  // 2. Comprar: los modelos de cada categoría, con su color inicial y su fondo.
  const iniciales = coloresIniciales(modelos);
  const vitrina: CategoriaVitrina[] = categorias.map((c) => ({
    slug: c.slug,
    titulo: c.titulo,
    // Lo de la línea («Fotocromáticos · Filtro de luz azul · UV400»), solo si está confirmado en cada modelo.
    detalle: c.productos.every((p) => caracteristicasDe(p) !== null) ? c.detalle : null,
    enlace: c.enlace,
    cuota: textoCuota(cuotasDe(precioUnico(c.productos))),
    modelos: c.productos.map((m) => {
      const i = modelos.indexOf(m);
      return {
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
      };
    }),
  }));
  const complementos = categoriasConProductos(productos).filter((c) => !esCategoriaDeAnteojos(c.nombre));

  // 3. Confianza: envío, devolución y asesoramiento (los mismos plazos y enlaces que la ficha).
  const envio = mensajesDeConfianza(config).find((m) => m.clave === "envio");
  const hayEnvioGratis = config.envioGratisDesde > 0 || config.envioGratisAmbaDesde > 0;
  const devolucion = condicionesDeCompra([], {
    diasArrepentimiento: DIAS_ARREPENTIMIENTO,
    diasCambio: DIAS_CAMBIO,
    mesesGarantia: MESES_GARANTIA,
  }).find((c) => c.clave === "devolucion");
  const whatsapp = enlaceWhatsApp(config.whatsapp, "Hola, Harper. Quiero consultar por los anteojos.");
  const confianza: ItemConfianza[] = [
    {
      clave: "envio",
      texto: TEXTOS.inicio.confianza.envio,
      detalle: hayEnvioGratis && envio ? envio.texto : TEXTOS.inicio.confianza.envioDetalle,
      href: "/legales/terminos#envios",
    },
    ...(devolucion ? [{ clave: "devolucion" as const, texto: devolucion.texto, detalle: devolucion.detalle, href: devolucion.href }] : []),
    ...(whatsapp
      ? [{ clave: "whatsapp" as const, texto: TEXTOS.inicio.confianza.whatsapp, detalle: TEXTOS.inicio.confianza.whatsappDetalle, href: whatsapp, externo: true }]
      : []),
  ];

  const beneficios = beneficiosDeSuscriptor(cuotasDeSuscriptor, cuotasAnteojos?.cuotas ?? null);

  return (
    <>
      {/* 1. Presentación. Config `portada_titulo` y `portada_subtitulo` ganan si se cargan; hoy están vacíos. */}
      <PortadaHero
        etiqueta={TEXTOS.inicio.etiqueta}
        titulo={config.portadaTitulo || TEXTOS.inicio.titulo}
        bajada={config.portadaSubtitulo || TEXTOS.inicio.bajada}
        boton={TEXTOS.inicio.boton}
        foto={config.portadaImagen ? { src: config.portadaImagen, alt: "" } : fotoDeLaPortada(modelos)}
      />

      {/* 2. Comprar, por categoría. */}
      <Vitrina categorias={vitrina} datos={{ complementos: complementos.map((c) => ({ nombre: c.nombre, slug: c.slug })) }} />

      {/* 3. Confianza. */}
      <ConfianzaPortada items={confianza} />

      {/* 4. Suscripción: breve, aparte de la compra y con el formulario a la vista. */}
      <section id="suscriptores" className="suscripcion-inicio" aria-labelledby="suscripcion-inicio-titulo">
        <div className="contenedor suscripcion-inicio__grilla">
          <div className="suscripcion-inicio__texto">
            <p className="etiqueta-mono">{TEXTOS.inicio.suscripcion.etiqueta}</p>
            <h2 id="suscripcion-inicio-titulo" className="suscripcion-inicio__titulo">
              {TEXTOS.suscriptores.titulo}
            </h2>
            <ul className="suscripcion-inicio__beneficios">
              {beneficios.map((b) => (
                <li key={b.clave}>
                  <Cifras>{b.titulo}</Cifras>
                </li>
              ))}
            </ul>
            <p className="suscripcion-inicio__bajada">{TEXTOS.inicio.suscripcion.bajada}</p>
          </div>
          <div id="suscribirme" className="suscripcion-inicio__form">
            <CajaSuscripcion origen="Portada" />
          </div>
        </div>
      </section>

      {/* 5. Opiniones: una selección corta. */}
      <Opiniones opiniones={mercadoLibre?.opiniones ?? null} reputacion={mercadoLibre?.reputacion ?? null} compacta />

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
