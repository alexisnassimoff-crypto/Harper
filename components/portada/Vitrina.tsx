"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useCarrito } from "@/components/carrito/CarritoContexto";
import Estrellas, { formatearPuntaje } from "./Estrellas";
import { precio as formatearPrecio } from "@/lib/formato";
import { trackAgregarAlCarrito } from "@/lib/pixel";

/**
 * La vitrina de la portada: arriba, los modelos en mosaicos de color con el
 * interruptor «Al sol | Adentro»; abajo, una ficha grande por modelo para
 * elegir el color y sumarlo sin salir de la portada. El interruptor es uno
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
  etiqueta: string;
  /** El nombre de la línea de la vitrina ("Fotocromáticos"), arriba de los mosaicos. */
  linea: string;
  titulo: string;
  bajada: string;
  /** "$ 89.900", o null si los modelos no cuestan lo mismo. */
  precio: string | null;
  /** "6 cuotas sin interés de $ 14.983", verificada para ese precio; null si no. */
  cuota: string | null;
  /** "Con estuche rígido Harper y paño de microfibra."; null si no está cargado. */
  incluye: string | null;
  calificacion: { promedio: number; total: number } | null;
  /** "Cuotas sin interés con Visa y Mastercard · CFTEA 0,00 %"; null sin cuotas. */
  letraChica: string | null;
  /** El atajo para llevarse uno de cada uno; null con un solo modelo. */
  todos: { texto: string } | null;
};

type Estado = "sol" | "adentro";

/** `children` va entre la portada y las fichas: las líneas de Harper. */
export default function Vitrina({ modelos, datos, children }: { modelos: ModeloVitrina[]; datos: DatosVitrina; children?: ReactNode }) {
  const { items, agregar, abrirPanel } = useCarrito();
  // Cuántos de cada color hay en el carrito: el número va arriba del color, como en la ficha.
  const enCarrito = new Map<string, number>();
  for (const item of items) enCarrito.set(item.varianteId, (enCarrito.get(item.varianteId) ?? 0) + item.cantidad);
  const [estado, setEstado] = useState<Estado>("sol");
  const [elegidos, setElegidos] = useState<Record<string, number>>(() => Object.fromEntries(modelos.map((m) => [m.slug, m.inicial])));
  const [sumados, setSumados] = useState<Record<string, boolean>>({});
  const [aviso, setAviso] = useState("");
  const hayAlSol = modelos.some((m) => m.colores.some((c) => c.alSol));
  const total = String(modelos.length).padStart(2, "0");

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
      {/* ---------- La portada: los modelos sobre color ---------- */}
      <section id="vitrina-portada" className="vitrina-portada" aria-labelledby="vitrina-titulo">
        <div className="contenedor vitrina-portada__grilla">
          <div className="vitrina-portada__texto">
            <p className="etiqueta-mono">{datos.etiqueta}</p>
            <h1 id="vitrina-titulo" className="vitrina-portada__titulo">
              {datos.titulo}
            </h1>
            <p className="vitrina-portada__bajada">{datos.bajada}</p>
          </div>

          <div className="vitrina-portada__vitrina">
            <p className="etiqueta-mono vitrina-portada__linea">{datos.linea} · ya disponibles</p>
            {hayAlSol ? (
              <div className="vitrina-portada__control">
                {interruptor("vitrina-portada__interruptor")}
                <p className="vitrina-portada__nota">Se oscurecen solos al sol. El tono final depende de la luz.</p>
              </div>
            ) : null}
            <ul className="mosaicos" aria-label="Los modelos">
              {modelos.map((m, i) => {
                const color = m.colores[elegidos[m.slug] ?? m.inicial];
                if (!color) return null;
                return (
                  <li key={m.id}>
                    <a href={`#modelo-${m.slug}`} className="mosaico" style={{ background: m.tinte }}>
                      <span className="mosaico__numero etiqueta-mono">{String(i + 1).padStart(2, "0")}</span>
                      <span className="mosaico__foto">
                        <Image
                          src={fotoDe(color)}
                          alt={`${m.nombre} ${color.color}`}
                          fill
                          sizes="(max-width: 768px) 46vw, 29vw"
                          priority={i < 4}
                          className="foto-multiplicada"
                        />
                      </span>
                      <span className="mosaico__nombre">{m.nombre}</span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="vitrina-portada__acciones">
            <a href="#los-modelos" className="boton vitrina-portada__boton">
              Elegir los míos
            </a>
            {datos.calificacion ? (
              <a href="#opiniones" className="vitrina-portada__opiniones">
                <Estrellas puntaje={datos.calificacion.promedio} />
                <span>
                  {formatearPuntaje(datos.calificacion.promedio)} · {datos.calificacion.total.toLocaleString("es-AR")}{" "}
                  {datos.calificacion.total === 1 ? "opinión" : "opiniones"} de clientes Harper
                </span>
              </a>
            ) : null}
            {datos.letraChica ? <p className="vitrina-portada__letra">{datos.letraChica}</p> : null}
          </div>
        </div>
      </section>

      {children}

      {/* ---------- Los modelos, uno por uno ---------- */}
      <section id="los-modelos" className="contenedor seccion vitrina-modelos" aria-labelledby="los-modelos-titulo">
        <div className="vitrina-modelos__cabecera">
          <p className="etiqueta-mono">
            {datos.linea} · {modelos.length === 4 ? "los cuatro" : `${modelos.length} modelos`}
          </p>
          <h2 id="los-modelos-titulo" className="titulo-serif">
            {datos.precio ? "Mismo precio. " : ""}
            {modelos.length === 4 ? "Cuatro formas." : "Elegí la tuya."}
          </h2>
          <p className="apagado">Tocá un color.{hayAlSol ? " Pasalo al sol." : ""}</p>
          {interruptor("vitrina-modelos__interruptor")}
        </div>

        <div className="pieza-lista">
          {modelos.map((m, i) => {
            const indice = elegidos[m.slug] ?? m.inicial;
            const color = m.colores[indice];
            if (!color) return null;
            return (
              <article key={m.id} id={`modelo-${m.slug}`} className="pieza">
                <Link
                  href={color.enlace}
                  className="pieza__foto"
                  style={{ background: m.tinte }}
                  aria-label={`Ver ${m.nombre} ${color.color}`}
                >
                  <Image
                    src={fotoDe(color)}
                    alt={`${m.nombre} ${color.color}${estado === "sol" && color.alSol ? ", al sol" : ""}`}
                    fill
                    sizes="(max-width: 768px) 100vw, 46vw"
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

                  <p className="etiqueta-mono">
                    {String(i + 1).padStart(2, "0")} / {total}
                  </p>
                  <h3 className="pieza__nombre">{m.nombre}</h3>
                  {m.forma ? <p className="pieza__forma">{m.forma}</p> : null}
                  {m.colores.length > 1 ? null : <p className="pieza__color">{color.color}</p>}

                  <p className="pieza__precio">
                    <span>{formatearPrecio(m.precio)}</span>
                    {datos.cuota ? <small> · {datos.cuota}</small> : null}
                  </p>
                  {datos.incluye ? <p className="pieza__incluye">{datos.incluye}</p> : null}

                  <button
                    type="button"
                    className="boton boton--contorno boton--bloque pieza__sumar"
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
            <p className="vitrina-todos__pregunta">¿Te gustaron todos?</p>
            <button type="button" className="boton boton--contorno vitrina-todos__boton" onClick={sumarTodos}>
              {datos.todos.texto}
            </button>
          </div>
        ) : null}

        <p className="solo-lectores" role="status">
          {aviso}
        </p>
      </section>
    </>
  );
}
