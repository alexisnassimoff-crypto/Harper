import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getProductos } from "@/lib/catalogo";
import { getConfig } from "@/lib/config";
import { LINEAS, lineasDeLaPortada } from "@/lib/lineas";
import { indiceVarianteInicial, rutaDeVariante } from "@/lib/variantes";
import { fotosDeVitrina, tinteDe } from "@/lib/vitrina";

/**
 * Quiénes somos (Ale, 30/10/2026): el estilo, los colores, lo contemporáneo y
 * el anteojo como accesorio que se combina, igual que una prenda. Sin precios,
 * sin la razón social (está en los Términos), sin caras ni historia familiar.
 * Los modelos y los colores salen del catálogo: lo que se ve, se puede comprar.
 */

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Quiénes somos",
  description:
    "Harper hace anteojos para combinar como una prenda: colores, formas de ahora y cristales que funcionan. Desde Buenos Aires, Argentina.",
  alternates: { canonical: "/quienes-somos" },
};

const MANIFIESTO = [
  {
    titulo: "Color, primero.",
    texto:
      "Negro, carey, ámbar y gris traslúcidos. Colores pensados para ir con lo que ya tenés en el placard: el jean de todos los días, la camisa blanca, el buzo del domingo. ¿Uno para la semana y otro para el finde? Eso.",
  },
  {
    titulo: "Formas de ahora.",
    texto:
      "Cuadrados de bordes suaves, geométricos con un quiebre en las esquinas, rectangulares de esquinas redondeadas. Líneas limpias, nada recargado. Diseño contemporáneo para todos los días.",
  },
  {
    titulo: "Lindos, y además funcionan.",
    texto:
      "Cristales que se oscurecen solos al sol, filtro de luz azul para las pantallas y protección UV400. Un objeto que da gusto mirar y que hace su trabajo.",
  },
  {
    titulo: "Sin caras famosas.",
    texto: "Ni celebridades ni campañas con modelos. Acá los protagonistas son los anteojos. El estilo lo ponés vos.",
  },
];

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
          Los anteojos también se combinan.
        </h1>
        <p className="nosotros-portada__bajada">
          Durante años fueron algo que había que usar. Para nosotros vuelven a ser lo que eran: un accesorio. Se eligen como una campera,
          unas zapatillas o un reloj. Por cómo te quedan y con qué los vas a usar.
        </p>
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
                <span className="etiqueta-mono nosotros-tira__nombre">{t.nombre}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="nosotros-frase" aria-label="Lo que hacemos">
        <p className="contenedor titulo-serif nosotros-frase__texto">
          Para ver bien.
          <br />Y para que te vean.
        </p>
      </section>

      <section className="contenedor seccion nosotros-manifiesto" aria-labelledby="nosotros-manifiesto-titulo">
        <h2 id="nosotros-manifiesto-titulo" className="solo-lectores">
          Cómo pensamos los anteojos
        </h2>
        <ol className="lista-numerada nosotros-lista">
          {MANIFIESTO.map((m) => (
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
            ¿Con cuál salís hoy?
          </h2>
          <p className="apagado">Cada color, en cada forma. Tocá uno y miralo de cerca.</p>
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
            Más formas. Más colores. Más combinaciones.
          </h2>
          <ul className="nosotros-viene__lista">
            {proximas.map((l) => (
              <li key={l.clave}>
                <h3 className="nosotros-viene__nombre">{l.nombre}</h3>
                <p className="apagado">{l.promesa}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="cierre" aria-labelledby="nosotros-cierre-titulo">
        <div className="contenedor cierre__cuerpo">
          <h2 id="nosotros-cierre-titulo" className="titulo-serif">
            Harper.
          </h2>
          <p>Anteojos para combinar. Buenos Aires, Argentina.</p>
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
