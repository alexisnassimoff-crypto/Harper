"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useImperativeHandle, useRef, useState, type Ref } from "react";
import { useCarrito } from "@/components/carrito/CarritoContexto";
import { trackAgregarAlCarrito } from "@/lib/pixel";

/**
 * «Armá tu pack»: una hoja para elegir los pares de un pack (se pueden
 * mezclar modelos y colores: el descuento por cantidad cuenta todos los
 * anteojos juntos) y comprarlos de una. La usan la portada (DeADos) y la
 * ficha (las opciones «llevá 3, pagá 2»). Acá solo se cuenta cuántos pares
 * eligió: los montos vienen armados del servidor.
 *
 * Socios Harper la usa para elegir el primer par de la membresía: con
 * `extras`, la membresía entra al carrito junto con el par.
 */

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

/** Lo que entra al carrito junto con los pares (la membresía, por ejemplo). */
export type ExtraDeLaHoja = { productoSlug: string; varianteId: string; sku: string; nombre: string; precio: number };

export type HojaPackControl = {
  /** Abre la hoja para `cantidad` pares, con los que ya vienen elegidos (variante → cantidad). */
  abrir: (cantidad: number, elegidos?: Record<string, number>) => void;
};

export default function HojaPack({
  ref,
  colores,
  estuche = null,
  totales,
  titulo = "Armá tu pack",
  extras = [],
  textoComprar,
}: {
  ref?: Ref<HojaPackControl>;
  colores: ColorDeADos[];
  estuche?: EstucheDeADos | null;
  /** El total de cada pack, para el botón ("$ 179.800"); sin él, el botón no lo dice. */
  totales: Record<number, string>;
  titulo?: string;
  /** Lo que se suma al carrito junto con los pares elegidos. */
  extras?: ExtraDeLaHoja[];
  /** El texto del botón de compra, si no es «Comprar N pares». */
  textoComprar?: string;
}) {
  const router = useRouter();
  const { agregar } = useCarrito();
  const hoja = useRef<HTMLDialogElement>(null);
  const [pack, setPack] = useState(2);
  const [elegidos, setElegidos] = useState<Record<string, number>>({});
  const [conEstuche, setConEstuche] = useState(false);
  const [yendo, setYendo] = useState(false);
  const cuenta = Object.values(elegidos).reduce((n, c) => n + c, 0);

  useImperativeHandle(ref, () => ({
    abrir(cantidad, iniciales = {}) {
      // Lo que ya viene elegido, sin pasarse del pack ni elegir colores agotados.
      const validos: Record<string, number> = {};
      let suma = 0;
      for (const [id, n] of Object.entries(iniciales)) {
        const color = colores.find((c) => c.id === id);
        if (!color || color.agotada || n <= 0) continue;
        const cupo = Math.min(n, cantidad - suma);
        if (cupo <= 0) break;
        validos[id] = cupo;
        suma += cupo;
      }
      setPack(cantidad);
      setElegidos(validos);
      setConEstuche(false);
      hoja.current?.showModal();
    },
  }));

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
    for (const e of extras) {
      agregar({ productoSlug: e.productoSlug, varianteId: e.varianteId, cantidad: 1 });
      trackAgregarAlCarrito({ sku: e.sku, nombre: e.nombre, precio: e.precio });
    }
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
    <dialog ref={hoja} className="hoja-pack" aria-labelledby="hoja-pack-titulo" onClose={() => setYendo(false)}>
      <div className="hoja-pack__cabecera">
        <h2 id="hoja-pack-titulo" className="hoja-pack__titulo">
          {titulo}
        </h2>
        <button type="button" className="hoja-pack__cerrar" aria-label="Cerrar" onClick={() => hoja.current?.close()}>
          ×
        </button>
      </div>
      <p className="hoja-pack__contador" role="status">
        {pack === 1
          ? cuenta === 1
            ? "Listo: ya elegiste tu par."
            : "Elegí un par."
          : cuenta === pack
            ? `Listo: ${pack} pares.`
            : `Elegí ${pack} pares · ${cuenta} de ${pack}`}
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
          {yendo
            ? "Un momento…"
            : (textoComprar ?? `Comprar ${pack} ${pack === 1 ? "par" : "pares"}${totales[pack] && !conEstuche ? ` · ${totales[pack]}` : ""}`)}
        </button>
      </div>
    </dialog>
  );
}
