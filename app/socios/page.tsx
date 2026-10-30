import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ColorDeADos } from "@/components/HojaPack";
import PlanesSocio from "@/components/socios/PlanesSocio";
import { getProductos } from "@/lib/catalogo";
import { getConfig } from "@/lib/config";
import { planesDeSocio } from "@/lib/socios";
import { TEXTOS } from "@/lib/textos";
import { fotosDeVitrina } from "@/lib/vitrina";

/**
 * Socios Harper (Ale, 30/10/2026): la membresía de 12 meses, con sus planes,
 * lo que incluye y las condiciones. Los precios y los lugares que quedan
 * salen de Airtable (lib/socios.ts). Mientras la membresía no esté publicada,
 * la página no existe.
 */

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Socios Harper",
  description:
    "Una membresía de 12 meses: dos pares en el año, envío gratis siempre, reposición si se rompen o los perdés y precio congelado. Lugares limitados.",
  alternates: { canonical: "/socios" },
};

const { socios: T } = TEXTOS;

export default async function Socios() {
  const [productos, config] = await Promise.all([getProductos(), getConfig()]);
  const planes = planesDeSocio(productos, config.sociosCupos);
  if (!planes) notFound();

  // Para elegir el primer par: todos los colores de la línea de siempre.
  const colores: ColorDeADos[] = productos
    .filter((p) => p.categoria === "Anteojos")
    .flatMap((p) =>
      p.variantes.map((v) => ({
        id: v.id,
        sku: v.sku,
        modeloSlug: p.slug,
        modeloNombre: p.nombre,
        precio: p.precio,
        color: v.color,
        foto: fotosDeVitrina(v, p.fotoPrincipal ?? "").adentro,
        agotada: v.agotada,
      }))
    );

  const beneficios = planes.aumento ? [...T.beneficios, T.beneficioAumento] : T.beneficios;

  return (
    <>
      <section className="contenedor socios-portada" aria-labelledby="socios-titulo">
        <div className="socios-portada__texto">
          <p className="etiqueta-mono">
            {T.etiqueta} · {T.cupos(planes.quedan, planes.cupos)}
          </p>
          <h1 id="socios-titulo" className="nosotros-portada__titulo">
            {T.titulo}
          </h1>
          <p className="nosotros-portada__bajada">{T.bajada}</p>
        </div>
        <div className="socios-portada__tarjeta">
          <Image src="/productos/socios/socio.webp" alt="La tarjeta de Socios Harper" fill sizes="(max-width: 768px) 100vw, 45vw" priority />
        </div>
      </section>

      <section className="de-a-dos socios-planes" aria-label="Los planes">
        <div className="contenedor">
          <PlanesSocio planes={planes} colores={colores} />
        </div>
      </section>

      <section className="contenedor seccion" aria-labelledby="socios-beneficios-titulo">
        <h2 id="socios-beneficios-titulo" className="solo-lectores">
          Lo que incluye
        </h2>
        <ol className="lista-numerada nosotros-lista">
          {beneficios.map((b) => (
            <li key={b.titulo}>
              <div>
                <h3 className="nosotros-lista__titulo">{b.titulo}</h3>
                <p className="nosotros-lista__texto">{b.texto}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="contenedor seccion socios-pasos" aria-labelledby="socios-pasos-titulo">
        <h2 id="socios-pasos-titulo" className="titulo-serif">
          {T.pasosTitulo}
        </h2>
        <ol className="socios-pasos__lista">
          {T.pasos.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ol>
      </section>

      <section className="contenedor seccion socios-condiciones" aria-labelledby="socios-condiciones-titulo">
        <h2 id="socios-condiciones-titulo" className="etiqueta-mono">
          {T.condicionesTitulo}
        </h2>
        <ul>
          {T.condiciones.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <p className="apagado">
          Todo el detalle, en los <Link href="/legales/terminos#socios">términos y condiciones</Link>.
        </p>
      </section>
    </>
  );
}
