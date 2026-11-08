import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { IconoCondicion } from "@/components/producto/InfoFicha";
import { getProductos } from "@/lib/catalogo";
import { esCategoriaDeAnteojos, rutaDeCategoria } from "@/lib/categorias";
import { getConfig } from "@/lib/config";
import { DIAS_ARREPENTIMIENTO, DIAS_CAMBIO, MESES_GARANTIA, mensajesDeConfianza } from "@/lib/confianza";
import { condicionesDeCompra } from "@/lib/ficha";
import { LINEAS, lineasDeLaPortada } from "@/lib/lineas";
import { coleccionDeNosotros, mosaicoDeNosotros } from "@/lib/nosotros";
import { TEXTOS } from "@/lib/textos";
import { enlaceWhatsApp } from "@/lib/whatsapp";

/**
 * Quiénes somos, página editorial de marca (Ale, 08/11/2026).
 *
 * 1. Apertura: la frase de la marca, qué es Harper y tres fotos reales del
 *    catálogo (un detalle de cerca y dos modelos de tres cuartos).
 * 2. Cómo pensamos los anteojos: el manifiesto, en cuatro ideas.
 * 3. La colección: cada modelo con su forma y sus colores con stock; cada
 *    color lleva a su ficha.
 * 4. Comprar en Harper: las mismas condiciones que la ficha (envío,
 *    devolución, cambios, garantía, pago) y el asesoramiento por WhatsApp.
 * 5. Cierre: a Anteojos.
 *
 * Sin precios ni promociones, sin la razón social (está en los Términos), sin
 * caras ni historia de la empresa. Tampoco el programa nuevo (Crédito Harper,
 * Dúo): no está activo.
 */

export const revalidate = 300;

/** ["a", "b", "c"] → "a, b y c". */
const enumerar = (partes: string[]) => (partes.length <= 1 ? partes.join("") : `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`);

export const metadata: Metadata = {
  title: "Quiénes somos",
  description:
    "Harper es una marca de anteojos de diseño de Buenos Aires, Argentina: formas simples y colores para combinar con tu estilo.",
  alternates: { canonical: "/quienes-somos" },
};

const { nosotros: N } = TEXTOS;

export default async function QuienesSomos() {
  const [productos, config] = await Promise.all([getProductos(), getConfig()]);
  const modelos = productos.filter((p) => esCategoriaDeAnteojos(p.categoria) && p.variantes.some((v) => !v.agotada));

  const mosaico = mosaicoDeNosotros(modelos);
  const coleccion = coleccionDeNosotros(modelos);

  // Comprar en Harper: las condiciones de la ficha, con sus enlaces, y WhatsApp si está cargado.
  const condiciones = condicionesDeCompra(mensajesDeConfianza(config), {
    diasArrepentimiento: DIAS_ARREPENTIMIENTO,
    diasCambio: DIAS_CAMBIO,
    mesesGarantia: MESES_GARANTIA,
  });
  const whatsapp = enlaceWhatsApp(config.whatsapp, "Hola, Harper. Quiero consultar por los anteojos.");

  const proximas = lineasDeLaPortada(productos).filter((l) => l.estado === "proximamente");

  return (
    <>
      {/* 1. Apertura. */}
      <section className="contenedor nosotros-hero" aria-labelledby="nosotros-titulo">
        <div className="nosotros-hero__texto">
          <p className="etiqueta-mono nosotros-hero__etiqueta">{N.etiqueta}</p>
          <h1 id="nosotros-titulo" className="nosotros-hero__titulo">
            <span>{N.frase[0]}</span>
            <span className="nosotros-hero__acento">{N.frase[1]}</span>
          </h1>
          <p className="nosotros-hero__bajada">{N.bajada}</p>
        </div>
        {mosaico.length > 0 ? (
          <ul className="nosotros-mosaico" aria-label="Los anteojos">
            {mosaico.map((p, i) => (
              <li key={p.clave} className={`nosotros-mosaico__pieza${p.detalle ? " nosotros-mosaico__pieza--grande" : ""}`}>
                <Link href={p.enlace} className="nosotros-mosaico__enlace" style={{ background: p.tinte }}>
                  <Image
                    src={p.src}
                    alt={p.alt}
                    fill
                    priority={i === 0}
                    sizes={p.detalle ? "(max-width: 1024px) 100vw, 34vw" : "(max-width: 1024px) 50vw, 22vw"}
                    className={`foto-multiplicada${p.detalle ? " nosotros-mosaico__foto--cerca" : ""}`}
                  />
                  <span className="nosotros-mosaico__pie">{p.pie}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {/* 2. Cómo pensamos los anteojos. */}
      <section className="nosotros-ideas" aria-labelledby="nosotros-ideas-titulo">
        <div className="contenedor nosotros-ideas__grilla">
          <header className="nosotros-cabecera">
            <p className="etiqueta-mono">{N.ideas.etiqueta}</p>
            <h2 id="nosotros-ideas-titulo" className="nosotros-cabecera__titulo">
              {N.ideas.titulo}
            </h2>
            <p className="nosotros-cabecera__bajada">{N.ideas.bajada}</p>
          </header>
          <ol className="nosotros-ideas__lista">
            {N.manifiesto.map((m, i) => (
              <li key={m.titulo} className="nosotros-idea">
                <span className="nosotros-idea__numero" aria-hidden="true">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="nosotros-idea__titulo">{m.titulo}</h3>
                <p className="nosotros-idea__texto">{m.texto}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* 3. La colección. */}
      {coleccion.length > 0 ? (
        <section className="nosotros-coleccion" aria-labelledby="nosotros-coleccion-titulo">
          <div className="contenedor">
            <header className="nosotros-cabecera">
              <p className="etiqueta-mono">{N.coleccion.etiqueta}</p>
              <h2 id="nosotros-coleccion-titulo" className="nosotros-cabecera__titulo">
                {N.coleccion.titulo}
              </h2>
              <p className="nosotros-cabecera__bajada">{N.coleccion.bajada}</p>
            </header>
            <ul className="nosotros-modelos">
              {coleccion.map((m) => (
                <li key={m.clave} className="nosotros-modelo">
                  <div className="nosotros-modelo__texto">
                    <h3 className="nosotros-modelo__nombre">{m.nombre}</h3>
                    {m.forma ? <p className="nosotros-modelo__forma">{m.forma}</p> : null}
                    <Link href={m.enlace} className="enlace-verde nosotros-modelo__enlace">
                      {N.coleccion.verModelo(m.nombre)}
                    </Link>
                  </div>
                  <ul className="nosotros-modelo__colores" aria-label={`Colores del ${m.nombre}`}>
                    {m.colores.map((c) => (
                      <li key={c.clave}>
                        <Link href={c.enlace} className="nosotros-color" style={{ background: c.tinte }}>
                          <span className="nosotros-color__foto">
                            <Image
                              src={c.foto}
                              alt={`${m.nombre} en ${c.color.toLowerCase()}`}
                              fill
                              sizes="(max-width: 768px) 44vw, (max-width: 1024px) 22vw, 17vw"
                              className="foto-multiplicada"
                            />
                          </span>
                          <span className="nosotros-color__pie">
                            <i className="nosotros-color__punto" style={{ background: c.colorHex }} aria-hidden="true" />
                            <span className="nosotros-color__nombre">{c.color}</span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {/* 4. Comprar en Harper. */}
      <section className="nosotros-compra" aria-labelledby="nosotros-compra-titulo">
        <div className="contenedor nosotros-compra__grilla">
          <header className="nosotros-cabecera">
            <p className="etiqueta-mono">{N.compra.etiqueta}</p>
            <h2 id="nosotros-compra-titulo" className="nosotros-cabecera__titulo">
              {N.compra.titulo}
            </h2>
            <p className="nosotros-cabecera__bajada">{N.compra.bajada}</p>
          </header>
          <ul className="nosotros-compra__lista">
            {condiciones.map((c) => (
              <li key={c.clave} className="nosotros-compra__item">
                <span className="nosotros-compra__icono" aria-hidden="true">
                  <IconoCondicion clave={c.clave} />
                </span>
                <span className="nosotros-compra__texto">{c.texto}</span>
                {c.detalle ? <span className="nosotros-compra__detalle">{c.detalle}</span> : null}
                <Link href={c.href} className="enlace-verde nosotros-compra__enlace">
                  {c.enlace}
                </Link>
              </li>
            ))}
            {whatsapp ? (
              <li className="nosotros-compra__item">
                <span className="nosotros-compra__icono" aria-hidden="true">
                  <IconoCondicion clave="whatsapp" />
                </span>
                <span className="nosotros-compra__texto">{N.compra.whatsapp}</span>
                <span className="nosotros-compra__detalle">{N.compra.whatsappDetalle}</span>
                <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="enlace-verde nosotros-compra__enlace">
                  {N.compra.whatsappEnlace}
                </a>
              </li>
            ) : null}
          </ul>
        </div>
      </section>

      {/* 5. Cierre: a la colección de anteojos. */}
      <section className="cierre nosotros-cierre" aria-labelledby="nosotros-cierre-titulo">
        <div className="contenedor cierre__cuerpo">
          <h2 id="nosotros-cierre-titulo" className="cierre__titulo">
            {N.cierre.titulo}
          </h2>
          <p className="nosotros-cierre__texto">{N.cierre.texto}</p>
          <Link href={rutaDeCategoria(LINEAS[0].categoria)} className="boton cierre__boton">
            {N.cierre.boton}
          </Link>
          {proximas.length > 0 ? (
            <p className="nosotros-cierre__viene">{N.viene(enumerar(proximas.map((l) => l.nombre.toLowerCase())))}</p>
          ) : null}
          {config.instagram ? (
            <p className="cierre__complementos">
              <a href={config.instagram} target="_blank" rel="noopener noreferrer">
                Seguinos en Instagram
              </a>
            </p>
          ) : null}
        </div>
      </section>
    </>
  );
}
