"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useCarrito } from "@/components/carrito/CarritoContexto";
import { precio as formatearPrecio } from "@/lib/formato";
import { trackAgregarAlCarrito } from "@/lib/pixel";
import { TEXTOS } from "@/lib/textos";

/**
 * «Comprar» en la portada (Ale, 05/11/2026): cuatro modelos destacados como
 * mucho y, arriba, un acceso por cada categoría de anteojos con stock (hoy,
 * los fotocromáticos; mañana también de sol, receta y clip-on, sin alargar la
 * portada). Cada modelo, sobre el color del armazón elegido, se suma al
 * carrito sin salir de la portada. Donde hay fotos al sol, el interruptor
 * «Al sol | Adentro».
 *
 * Todo lo que es plata (precio, cuotas) viene armado del servidor: acá no se
 * calcula ningún monto.
 */

export type ColorVitrina = {
  id: string;
  sku: string;
  color: string;
  colorHex: string;
  agotada: boolean;
  adentro: string;
  /** Null si ese color no tiene foto al sol: queda como está. */
  alSol: string | null;
  /** La ficha del modelo en este color. */
  enlace: string;
  /** El fondo de este color (lib/vitrina.ts, tinteDeColor). */
  tinte: string;
};

export type ModeloVitrina = {
  id: string;
  slug: string;
  nombre: string;
  precio: number;
  tinte: string;
  forma: string | null;
  colores: ColorVitrina[];
  /** El color con el que abre (con stock y, si hay, con foto al sol). */
  inicial: number;
};

/** Un acceso a la página de una categoría con stock: «Fotocromáticos (4)». */
export type CategoriaVitrina = {
  slug: string;
  /** "Fotocromáticos", "Anteojos de sol". */
  titulo: string;
  /** La página de la categoría. */
  enlace: string;
  /** Cuántos modelos con stock tiene. */
  cantidad: number;
};

export type DestacadoVitrina = ModeloVitrina & {
  /** El nombre corto de su categoría; se muestra solo si hay más de una. */
  categoria: string;
  /** "6 cuotas sin interés de $ 14.983,33", verificada para su precio; null si no. */
  cuota: string | null;
};

export type DatosVitrina = {
  /** "También: estuches y paños", con sus enlaces. */
  complementos: { nombre: string; slug: string }[];
};

type Estado = "sol" | "adentro";

const T = TEXTOS.inicio.comprar;

export default function Vitrina({
  destacados,
  categorias,
  datos,
}: {
  /** Cuatro como mucho (lib/vitrina.ts, destacadosDeLaPortada). */
  destacados: DestacadoVitrina[];
  /** Las categorías de anteojos con stock, para ir a ver todos los modelos de cada una. */
  categorias: CategoriaVitrina[];
  datos: DatosVitrina;
}) {
  const { items, agregar, abrirPanel } = useCarrito();
  // Cuántos de cada color hay en el carrito: el número va arriba del color, como en la ficha.
  const enCarrito = new Map<string, number>();
  for (const item of items) enCarrito.set(item.varianteId, (enCarrito.get(item.varianteId) ?? 0) + item.cantidad);
  const [estado, setEstado] = useState<Estado>("sol");
  const [elegidos, setElegidos] = useState<Record<string, number>>(() => Object.fromEntries(destacados.map((m) => [m.slug, m.inicial])));
  const [sumados, setSumados] = useState<Record<string, boolean>>({});
  const [aviso, setAviso] = useState("");
  const hayAlSol = destacados.some((m) => m.colores.some((c) => c.alSol));
  const variasCategorias = categorias.length > 1;

  function elegirColor(slug: string, indice: number) {
    setElegidos((e) => ({ ...e, [slug]: indice }));
    setSumados((s) => ({ ...s, [slug]: false }));
  }

  function sumarEste(modelo: ModeloVitrina) {
    const color = modelo.colores[elegidos[modelo.slug] ?? modelo.inicial];
    if (!color || color.agotada) return;
    agregar({ productoSlug: modelo.slug, varianteId: color.id, cantidad: 1 });
    trackAgregarAlCarrito({ sku: color.sku, nombre: modelo.nombre, precio: modelo.precio });
    setSumados((s) => ({ ...s, [modelo.slug]: true }));
    setAviso(`Sumaste ${modelo.nombre} ${color.color}.`);
    // En escritorio se abre el carrito al costado; en el celular avisa la barra de abajo.
    abrirPanel();
  }

  return (
    <section id="los-modelos" className="comprar" aria-labelledby="comprar-titulo">
      <div className="contenedor">
        <div className="comprar__cabecera">
          <p className="etiqueta-mono">{T.etiqueta}</p>
          <h2 id="comprar-titulo" className="titulo-serif">
            {T.titulo}
          </h2>
        </div>

        <div className="comprar__fila">
          {/* Un acceso por categoría con stock: lleva a todos sus modelos. */}
          <nav className="comprar__categorias" aria-label="Categorías de anteojos">
            {categorias.map((c) => (
              <Link key={c.slug} href={c.enlace} className="comprar__chip">
                {c.titulo}
                <span className="comprar__cantidad">{c.cantidad}</span>
                <span aria-hidden="true">→</span>
              </Link>
            ))}
          </nav>
          {hayAlSol ? (
            <div className="interruptor-sol" role="radiogroup" aria-label="Cómo se ven los cristales">
              {(["sol", "adentro"] as const).map((e) => (
                <button
                  key={e}
                  type="button"
                  role="radio"
                  aria-checked={estado === e}
                  className="interruptor-sol__opcion"
                  onClick={() => setEstado(e)}
                >
                  {e === "sol" ? "Al sol" : "Adentro"}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="comprar__grilla">
          {destacados.map((m) => {
            const indice = elegidos[m.slug] ?? m.inicial;
            const color = m.colores[indice];
            if (!color) return null;
            const foto = estado === "sol" && color.alSol ? color.alSol : color.adentro;
            return (
              <article key={m.id} id={`modelo-${m.slug}`} className="tarjeta-inicio">
                <Link
                  href={color.enlace}
                  className="tarjeta-inicio__foto"
                  style={{ background: color.tinte || m.tinte }}
                  aria-label={`Ver ${m.nombre} ${color.color}`}
                >
                  <Image
                    src={foto}
                    alt={`${m.nombre} ${color.color}${estado === "sol" && color.alSol ? ", al sol" : ""}`}
                    fill
                    sizes="(max-width: 768px) 50vw, 24vw"
                    className="foto-multiplicada"
                  />
                </Link>
                <div className="tarjeta-inicio__cuerpo">
                  {variasCategorias ? <p className="etiqueta-mono tarjeta-inicio__categoria">{m.categoria}</p> : null}
                  <div className="tarjeta-inicio__encabezado">
                    <h3 className="tarjeta-inicio__nombre">
                      <Link href={color.enlace}>{m.nombre}</Link>
                    </h3>
                    <span className="tarjeta-inicio__precio">{formatearPrecio(m.precio)}</span>
                  </div>
                  {m.colores.length > 1 ? (
                    <div className="tarjeta-inicio__colores" role="radiogroup" aria-label={`Color de ${m.nombre}`}>
                      {m.colores.map((c, j) => {
                        const cantidad = enCarrito.get(c.id) ?? 0;
                        const enElCarrito = cantidad > 0 ? `, ${cantidad} en el carrito` : "";
                        return (
                          <button
                            key={c.id}
                            type="button"
                            role="radio"
                            aria-checked={j === indice}
                            aria-label={c.color + (c.agotada ? ", agotado" : "") + enElCarrito}
                            title={c.color + (c.agotada ? " — agotado" : "") + enElCarrito}
                            className="pieza__swatch"
                            data-agotada={c.agotada || undefined}
                            style={{ background: c.colorHex }}
                            onClick={() => elegirColor(m.slug, j)}
                          >
                            {cantidad > 0 ? (
                              <span className="swatch__cantidad" aria-hidden="true">
                                {cantidad}
                              </span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                  <p className="tarjeta-inicio__color">{color.color}</p>
                  {m.cuota ? <p className="tarjeta-inicio__cuota">{m.cuota}</p> : null}
                  <button
                    type="button"
                    className="boton boton--bloque boton--chico tarjeta-inicio__sumar"
                    onClick={() => sumarEste(m)}
                    disabled={color.agotada}
                  >
                    {color.agotada ? T.sinStock : sumados[m.slug] ? T.agregado : T.agregar}
                  </button>
                </div>
              </article>
            );
          })}
        </div>

        {datos.complementos.length > 0 ? (
          <p className="comprar__complementos">
            {T.tambien}:{" "}
            {datos.complementos.map((c, i) => (
              <span key={c.slug}>
                {i > 0 ? " y " : ""}
                <Link href={`/${c.slug}`}>{c.nombre.toLowerCase()}</Link>
              </span>
            ))}
            .
          </p>
        ) : null}

        <p className="solo-lectores" role="status">
          {aviso}
        </p>
      </div>
    </section>
  );
}
