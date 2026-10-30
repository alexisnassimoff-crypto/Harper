"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useCarrito } from "@/components/carrito/CarritoContexto";
import { trackAgregarAlCarrito } from "@/lib/pixel";

/**
 * «Uno está bien. Dos, mejor.»: lo que cuesta llevarse 1, 2 o 4 pares, con la
 * cuenta ya hecha, y «Armá tu pack» para elegirlos de una (se pueden mezclar
 * modelos y colores: el descuento por cantidad cuenta todos los anteojos
 * juntos). Los montos vienen del servidor (lib/packs.ts, cuotas verificadas):
 * acá solo se cuenta cuántos pares eligió.
 */

export type FilaDeADos = {
  cantidad: number;
  /** "La cuenta que cierra". */
  apodo: string;
  /** "2 pares · 5 % OFF". */
  titulo: string;
  total: string;
  detalle: string[];
  /** "Envío gratis a todo el país", en la fila destacada. */
  sello: string | null;
  boton: string;
};

export type ColorDeADos = {
  id: string;
  sku: string;
  modeloSlug: string;
  modeloNombre: string;
  precio: number;
  color: string;
  foto: string;
  agotada: boolean;
};

export type EstucheDeADos = { slug: string; varianteId: string; sku: string; nombre: string; precio: number; precioTexto: string };

export default function DeADos({
  filas,
  colores,
  estuche,
  fotos,
  letraChica,
  totales,
}: {
  filas: FilaDeADos[];
  colores: ColorDeADos[];
  estuche: EstucheDeADos | null;
  /** Dos pares distintos para las tarjetas de arriba. */
  fotos: { src: string; alt: string }[];
  letraChica: string | null;
  /** El total de cada pack, para el botón de la hoja ("$ 170.810"); sin él, el botón no lo dice. */
  totales: Record<number, string>;
}) {
  const router = useRouter();
  const { agregar } = useCarrito();
  const hoja = useRef<HTMLDialogElement>(null);
  const [pack, setPack] = useState(2);
  const [elegidos, setElegidos] = useState<Record<string, number>>({});
  const [conEstuche, setConEstuche] = useState(false);
  const [yendo, setYendo] = useState(false);
  const cuenta = Object.values(elegidos).reduce((n, c) => n + c, 0);

  function abrir(cantidad: number) {
    if (cantidad === 1) {
      document.getElementById("los-modelos")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    setPack(cantidad);
    setElegidos({});
    setConEstuche(false);
    hoja.current?.showModal();
  }

  function cambiar(id: string, paso: 1 | -1) {
    setElegidos((e) => {
      const actual = e[id] ?? 0;
      if (paso === 1 && cuenta >= pack) return e;
      const nuevo = Math.max(0, actual + paso);
      return { ...e, [id]: nuevo };
    });
  }

  function comprar() {
    if (cuenta !== pack || yendo) return;
    setYendo(true);
    for (const c of colores) {
      const cantidad = elegidos[c.id] ?? 0;
      if (cantidad <= 0) continue;
      agregar({ productoSlug: c.modeloSlug, varianteId: c.id, cantidad });
      trackAgregarAlCarrito({ sku: c.sku, nombre: c.modeloNombre, precio: c.precio, cantidad });
    }
    if (conEstuche && estuche) {
      agregar({ productoSlug: estuche.slug, varianteId: estuche.varianteId, cantidad: 1 });
      trackAgregarAlCarrito({ sku: estuche.sku, nombre: estuche.nombre, precio: estuche.precio });
    }
    hoja.current?.close();
    router.push("/checkout");
  }

  return (
    <section className="de-a-dos" aria-labelledby="de-a-dos-titulo">
      <div className="contenedor de-a-dos__grilla">
        <div className="de-a-dos__fotos" aria-hidden="true">
          {fotos.slice(0, 2).map((f, i) => (
            <span key={f.src} className={`de-a-dos__tarjeta de-a-dos__tarjeta--${i + 1}`}>
              <Image src={f.src} alt="" fill sizes="(max-width: 768px) 60vw, 30vw" className="foto-multiplicada" />
            </span>
          ))}
        </div>

        <div className="de-a-dos__texto">
          <p className="etiqueta-mono">De a dos</p>
          <h2 id="de-a-dos-titulo" className="titulo-serif">
            Uno está bien. Dos, mejor.
          </h2>
          <p className="de-a-dos__bajada">Uno para la semana, otro para el finde. Mezclá modelos y colores: el descuento se aplica solo.</p>

          <ul className="de-a-dos__filas">
            {filas.map((f) => (
              <li key={f.cantidad} className="de-a-dos__fila" data-destacada={f.sello ? "" : undefined}>
                {f.sello ? <span className="de-a-dos__sello">{f.sello}</span> : null}
                <div className="de-a-dos__fila-datos">
                  <p className="etiqueta-mono de-a-dos__apodo">{f.apodo}</p>
                  <p className="de-a-dos__fila-titulo">{f.titulo}</p>
                  <p className="de-a-dos__total">{f.total}</p>
                  {f.detalle.map((d) => (
                    <p key={d} className="de-a-dos__detalle">
                      {d}
                    </p>
                  ))}
                </div>
                <button type="button" className="boton boton--chico de-a-dos__boton" onClick={() => abrir(f.cantidad)}>
                  {f.boton}
                </button>
              </li>
            ))}
          </ul>
          {letraChica ? <p className="de-a-dos__letra">{letraChica}</p> : null}
        </div>
      </div>

      <dialog ref={hoja} className="hoja-pack" aria-labelledby="hoja-pack-titulo" onClose={() => setYendo(false)}>
        <div className="hoja-pack__cabecera">
          <h2 id="hoja-pack-titulo" className="hoja-pack__titulo">
            Armá tu pack
          </h2>
          <button type="button" className="hoja-pack__cerrar" aria-label="Cerrar" onClick={() => hoja.current?.close()}>
            ×
          </button>
        </div>
        <p className="hoja-pack__contador" role="status">
          {cuenta === pack ? `Listo: ${pack} pares.` : `Elegí ${pack} pares · ${cuenta} de ${pack}`}
        </p>

        <ul className="hoja-pack__colores">
          {colores.map((c) => {
            const cantidad = elegidos[c.id] ?? 0;
            return (
              <li key={c.id} className="hoja-pack__color" data-elegido={cantidad > 0 || undefined} data-agotada={c.agotada || undefined}>
                <span className="hoja-pack__foto">
                  <Image src={c.foto} alt="" fill sizes="30vw" className="foto-multiplicada" />
                </span>
                <span className="hoja-pack__nombre">
                  {c.modeloNombre}
                  <small>{c.color}</small>
                </span>
                {c.agotada ? (
                  <span className="hoja-pack__agotado">Agotado</span>
                ) : (
                  <span className="hoja-pack__cantidad">
                    <button
                      type="button"
                      aria-label={`Uno menos de ${c.modeloNombre} ${c.color}`}
                      onClick={() => cambiar(c.id, -1)}
                      disabled={cantidad === 0}
                    >
                      −
                    </button>
                    <span aria-live="polite">{cantidad}</span>
                    <button
                      type="button"
                      aria-label={`Uno más de ${c.modeloNombre} ${c.color}`}
                      onClick={() => cambiar(c.id, 1)}
                      disabled={cuenta >= pack}
                    >
                      +
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>

        <div className="hoja-pack__pie">
          {estuche ? (
            <label className="hoja-pack__estuche">
              <input type="checkbox" checked={conEstuche} onChange={(e) => setConEstuche(e.target.checked)} />
              <span>
                Sumar el {estuche.nombre} (+ {estuche.precioTexto})
              </span>
            </label>
          ) : null}

          <button type="button" className="boton boton--bloque hoja-pack__comprar" onClick={comprar} disabled={cuenta !== pack || yendo}>
            {yendo ? "Un momento…" : `Comprar ${pack} pares${totales[pack] && !conEstuche ? ` · ${totales[pack]}` : ""}`}
          </button>
        </div>
      </dialog>
    </section>
  );
}
