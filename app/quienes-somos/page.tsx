import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getProductos } from "@/lib/catalogo";
import { getConfig } from "@/lib/config";
import { LINEAS, lineasDeLaPortada } from "@/lib/lineas";
import { TEXTOS } from "@/lib/textos";
import { indiceVarianteInicial, rutaDeVariante } from "@/lib/variantes";
import { fotosDeVitrina, tinteDe } from "@/lib/vitrina";

/**
 * Quiénes somos (Ale, 30/10/2026): el estilo, los colores, lo contemporáneo y
 * el anteojo como accesorio que se combina, igual que una prenda. Sin precios,
 * sin la razón social (está en los Términos), sin caras ni historia familiar.
 * Los modelos y los colores salen del catálogo: lo que se ve, se puede comprar.
 */

export const revalidate = 300;

/** ["a", "b", "c"] → "a, b y c". */
const enumerar = (partes: string[]) => (partes.length <= 1 ? partes.join("") : `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`);

export const metadata: Metadata = {
  title: "Quiénes somos",
  description:
    "Harper hace anteojos para elegir como una prenda: por el color, la forma y con qué los combinás. Para ver bien y para que te vean. Buenos Aires, Argentina.",
  alternates: { canonical: "/quienes-somos" },
};

const { nosotros: N } = TEXTOS;

export default async function QuienesSomos() {
  const [productos, config] = await Promise.all([getProductos(), getConfig()]);
  const modelos = productos.filter((p) => p.categoria === LINEAS[0].categoria && p.variantes.some((v) => !v.agotada));

  // Arriba, un par de cada modelo al sol.
  const tira = modelos.slice(0, 4).map((m, i) => {
    const variante = m.variantes[indiceVarianteInicial(m)];
    const fotos = fotosDeVitrina(variante, m.fotoPrincipal ?? "");
    return { clave: m.id, nombre: m.nombre, color: variante.color, foto: fotos.alSol ?? fotos.adentro, tinte: tinteDe(m.slug, i) };
  });

  // La paleta: cada color con stock, en su modelo.
  const paleta = modelos.flatMap((m, i) =>
    m.variantes.flatMap((v, j) =>
      v.agotada
        ? []
        : [
            {
              clave: v.id,
              modelo: m.nombre,
              color: v.color,
              colorHex: v.colorHex,
              foto: fotosDeVitrina(v, m.fotoPrincipal ?? "").adentro,
              tinte: tinteDe(m.slug, i),
              enlace: rutaDeVariante(m, j),
            },
          ],
    ),
  );

  const proximas = lineasDeLaPortada(productos).filter((l) => l.estado === "proximamente");

  return (
    <>
      <section className="contenedor nosotros-portada" aria-labelledby="nosotros-titulo">
        <p className="etiqueta-mono">Quiénes somos · Buenos Aires, Argentina</p>
        <h1 id="nosotros-titulo" className="nosotros-portada__titulo">
          {N.titulo}
        </h1>
        <p className="nosotros-portada__bajada">{N.bajada}</p>
        {tira.length > 0 ? (
          <ul className="nosotros-tira" aria-label="Los modelos">
            {tira.map((t, i) => (
              <li key={t.clave} className="nosotros-tira__pieza" style={{ background: t.tinte }}>
                <Image
                  src={t.foto}
                  alt={`${t.nombre} ${t.color}`}
                  fill
                  sizes="(max-width: 768px) 46vw, 23vw"
                  priority={i < 2}
                  className="foto-multiplicada"
                />
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="nosotros-frase" aria-label="Lo que hacemos">
        <p className="contenedor titulo-serif nosotros-frase__texto">
          {N.frase[0]}
          <br />
          {N.frase[1]}
        </p>
      </section>

      <section className="contenedor seccion nosotros-manifiesto" aria-labelledby="nosotros-manifiesto-titulo">
        <h2 id="nosotros-manifiesto-titulo" className="solo-lectores">
          Cómo pensamos los anteojos
        </h2>
        <ol className="lista-numerada nosotros-lista">
          {N.manifiesto.map((m) => (
            <li key={m.titulo}>
              <div>
                <h3 className="nosotros-lista__titulo">{m.titulo}</h3>
                <p className="nosotros-lista__texto">{m.texto}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {paleta.length > 0 ? (
        <section className="contenedor seccion nosotros-paleta" aria-labelledby="nosotros-paleta-titulo">
          <p className="etiqueta-mono">La paleta</p>
          <h2 id="nosotros-paleta-titulo" className="titulo-serif">
            {N.paleta}
          </h2>
          <p className="apagado">{N.paletaBajada}</p>
          <ul className="nosotros-paleta__grilla">
            {paleta.map((c) => (
              <li key={c.clave}>
                <Link href={c.enlace} className="nosotros-color" style={{ background: c.tinte }}>
                  <span className="nosotros-color__foto">
                    <Image src={c.foto} alt="" fill sizes="(max-width: 768px) 46vw, 23vw" className="foto-multiplicada" />
                  </span>
                  <span className="nosotros-color__pie">
                    <i className="nosotros-color__punto" style={{ background: c.colorHex }} aria-hidden="true" />
                    <span className="nosotros-color__nombre">{c.color}</span>
                    <span className="etiqueta-mono">{c.modelo}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {proximas.length > 0 ? (
        <section className="contenedor seccion nosotros-viene" aria-labelledby="nosotros-viene-titulo">
          <p className="etiqueta-mono">Lo que viene</p>
          <h2 id="nosotros-viene-titulo" className="titulo-serif">
            {N.viene} {enumerar(proximas.map((l) => l.corto.toLowerCase()))}.
          </h2>
          <Link href="/#lo-que-viene" className="boton boton--contorno nosotros-viene__boton">
            {N.vieneBoton}
          </Link>
        </section>
      ) : null}

      <section className="cierre" aria-labelledby="nosotros-cierre-titulo">
        <div className="contenedor cierre__cuerpo">
          <h2 id="nosotros-cierre-titulo" className="titulo-serif">
            Harper.
          </h2>
          <p>{N.cierre}</p>
          <Link href="/#los-modelos" className="boton cierre__boton">
            Ver los modelos
          </Link>
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
