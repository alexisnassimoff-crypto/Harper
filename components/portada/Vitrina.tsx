"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useCarrito } from "@/components/carrito/CarritoContexto";
import { precio as formatearPrecio } from "@/lib/formato";
import { trackAgregarAlCarrito } from "@/lib/pixel";
import { TEXTOS } from "@/lib/textos";

/**
 * La vitrina de la portada (la única vez que aparecen los modelos): una
 * tarjeta por modelo, sobre el color del armazón elegido, para tocar un color
 * y sumarlo sin salir de la portada. El interruptor «Al sol | Adentro» es uno
 * solo para toda la vitrina: muestra que son fotocromáticos sin explicarlo.
 *
 * Todo lo que es plata (precio, cuotas, el total de llevarse todos) viene
 * armado del servidor: acá no se calcula ningún monto.
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

export type DatosVitrina = {
  /** El nombre de la línea de la vitrina ("Fotocromáticos"). */
  linea: string;
  /** "$ 89.900", o null si los modelos no cuestan lo mismo. */
  precio: string | null;
  /** "6 cuotas sin interés de $ 14.983", verificada para ese precio; null si no. */
  cuota: string | null;
  /** El atajo para llevarse uno de cada uno; null con un solo modelo. */
  todos: { texto: string } | null;
  /** "También: estuches y paños", con sus enlaces. */
  complementos: { nombre: string; slug: string }[];
};

type Estado = "sol" | "adentro";

export default function Vitrina({ modelos, datos }: { modelos: ModeloVitrina[]; datos: DatosVitrina }) {
  const { items, agregar, abrirPanel } = useCarrito();
  // Cuántos de cada color hay en el carrito: el número va arriba del color, como en la ficha.
  const enCarrito = new Map<string, number>();
  for (const item of items) enCarrito.set(item.varianteId, (enCarrito.get(item.varianteId) ?? 0) + item.cantidad);
  const [estado, setEstado] = useState<Estado>("sol");
  const [elegidos, setElegidos] = useState<Record<string, number>>(() => Object.fromEntries(modelos.map((m) => [m.slug, m.inicial])));
  const [sumados, setSumados] = useState<Record<string, boolean>>({});
  const [aviso, setAviso] = useState("");
  const hayAlSol = modelos.some((m) => m.colores.some((c) => c.alSol));

  function fotoDe(c: ColorVitrina) {
    return estado === "sol" && c.alSol ? c.alSol : c.adentro;
  }

  function elegirColor(slug: string, indice: number) {
    setElegidos((e) => ({ ...e, [slug]: indice }));
    setSumados((s) => ({ ...s, [slug]: false }));
  }

  function sumar(modelo: ModeloVitrina, color: ColorVitrina) {
    agregar({ productoSlug: modelo.slug, varianteId: color.id, cantidad: 1 });
    trackAgregarAlCarrito({ sku: color.sku, nombre: modelo.nombre, precio: modelo.precio });
  }

  function sumarEste(modelo: ModeloVitrina) {
    const color = modelo.colores[elegidos[modelo.slug] ?? modelo.inicial];
    if (!color || color.agotada) return;
    sumar(modelo, color);
    setSumados((s) => ({ ...s, [modelo.slug]: true }));
    setAviso(`Sumaste ${modelo.nombre} ${color.color}.`);
    // En escritorio se abre el carrito al costado; en el celular avisa la barra de abajo.
    abrirPanel();
  }

  function sumarTodos() {
    const nombres: string[] = [];
    for (const modelo of modelos) {
      const elegido = modelo.colores[elegidos[modelo.slug] ?? modelo.inicial];
      // Si el color a la vista se agotó, el primero que tenga stock.
      const color = elegido && !elegido.agotada ? elegido : modelo.colores.find((c) => !c.agotada);
      if (!color) continue;
      sumar(modelo, color);
      nombres.push(`${modelo.nombre} ${color.color}`);
    }
    setSumados(Object.fromEntries(modelos.map((m) => [m.slug, true])));
    setAviso(`Sumaste ${nombres.join(", ")}.`);
    abrirPanel();
  }

  const interruptor = (clase: string) =>
    hayAlSol ? (
      <div className={`interruptor-sol ${clase}`} role="radiogroup" aria-label="Cómo se ven los cristales">
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
    ) : null;

  return (
    <>
      {/* ---------- Los modelos, uno por uno ---------- */}
      <section id="los-modelos" className="contenedor seccion vitrina-modelos" aria-labelledby="los-modelos-titulo">
        <div className="vitrina-modelos__cabecera">
          {/* Sin contar modelos: la colección crece (Ale, 30/10/2026). */}
          <p className="etiqueta-mono">{datos.linea} · Ya disponibles</p>
          <h2 id="los-modelos-titulo" className="titulo-serif">
            {datos.precio ? TEXTOS.modelos.titulo : TEXTOS.modelos.tituloSinPrecio}
          </h2>
          <p className="apagado">{hayAlSol ? TEXTOS.modelos.bajadaConSol : TEXTOS.modelos.bajada}</p>
          {interruptor("vitrina-modelos__interruptor")}
        </div>

        <div className="pieza-lista">
          {modelos.map((m) => {
            const indice = elegidos[m.slug] ?? m.inicial;
            const color = m.colores[indice];
            if (!color) return null;
            return (
              <article key={m.id} id={`modelo-${m.slug}`} className="pieza">
                <Link
                  href={color.enlace}
                  className="pieza__foto"
                  style={{ background: color.tinte || m.tinte }}
                  aria-label={`Ver ${m.nombre} ${color.color}`}
                >
                  <Image
                    src={fotoDe(color)}
                    alt={`${m.nombre} ${color.color}${estado === "sol" && color.alSol ? ", al sol" : ""}`}
                    fill
                    sizes="(max-width: 768px) 50vw, 24vw"
                    className="foto-multiplicada"
                  />
                </Link>
                <div className="pieza__cuerpo">
                  {/* Los colores, pegados a la foto: al tocar uno se ve el cambio. */}
                  {m.colores.length > 1 ? (
                    <div className="pieza__colores" role="radiogroup" aria-label={`Color de ${m.nombre}`}>
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
                      <span className="pieza__color">{color.color}</span>
                    </div>
                  ) : null}

                  <h3 className="pieza__nombre">{m.nombre}</h3>
                  {m.forma ? <p className="pieza__forma">{m.forma}</p> : null}
                  {m.colores.length > 1 ? null : <p className="pieza__color">{color.color}</p>}

                  <p className="pieza__precio">
                    <span>{formatearPrecio(m.precio)}</span>
                    {datos.cuota ? <small>{datos.cuota}</small> : null}
                  </p>

                  <button
                    type="button"
                    className="boton boton--bloque pieza__sumar"
                    onClick={() => sumarEste(m)}
                    disabled={color.agotada}
                  >
                    {color.agotada ? "Sin stock en este color" : sumados[m.slug] ? "Sumado. ¿Otro color?" : "Sumar este"}
                  </button>
                  <Link href={color.enlace} className="pieza__ficha">
                    Ver ficha completa
                  </Link>
                </div>
              </article>
            );
          })}
        </div>

        {datos.todos ? (
          <div className="vitrina-todos">
            <p className="vitrina-todos__pregunta">{TEXTOS.modelos.todos}</p>
            <button type="button" className="boton boton--contorno vitrina-todos__boton" onClick={sumarTodos}>
              {datos.todos.texto}
            </button>
          </div>
        ) : null}

        {datos.complementos.length > 0 ? (
          <p className="vitrina-complementos">
            También:{" "}
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
      </section>
    </>
  );
}
