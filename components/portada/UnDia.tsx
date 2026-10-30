"use client";

import Image from "next/image";
import { useState } from "react";
import { useCarrito } from "@/components/carrito/CarritoContexto";
import { trackAgregarAlCarrito } from "@/lib/pixel";
import { TEXTOS } from "@/lib/textos";

/**
 * «Un día cualquiera»: el mismo par del café al partido. Hoy cada momento es
 * un bloque de color con el anteojo en el estado que corresponde (al sol o
 * adentro); cuando estén las fotos de Kive, la foto reemplaza al bloque y la
 * hora y el ticket quedan. Cada ticket suma ese par sin salir de la portada.
 */

export type MomentoDelDia = {
  hora: string;
  lugar: string;
  texto: string;
  tinte: string;
  foto: string;
  alt: string;
  par: { slug: string; varianteId: string; sku: string; nombre: string; color: string; precio: number; precioTexto: string };
};

export default function UnDia({ momentos }: { momentos: MomentoDelDia[] }) {
  const { agregar, abrirPanel } = useCarrito();
  const [sumados, setSumados] = useState<Record<string, boolean>>({});

  function sumar(m: MomentoDelDia) {
    agregar({ productoSlug: m.par.slug, varianteId: m.par.varianteId, cantidad: 1 });
    trackAgregarAlCarrito({ sku: m.par.sku, nombre: m.par.nombre, precio: m.par.precio });
    setSumados((s) => ({ ...s, [m.hora]: true }));
    abrirPanel();
  }

  if (momentos.length === 0) return null;

  return (
    <section className="un-dia" aria-labelledby="un-dia-titulo">
      <div className="contenedor">
        <p className="etiqueta-mono">{TEXTOS.unDia.etiqueta}</p>
        <h2 id="un-dia-titulo" className="titulo-serif">
          {TEXTOS.unDia.titulo}
        </h2>
      </div>
      <ol className="un-dia__carril">
        {momentos.map((m) => (
          <li key={m.hora} className="momento" style={{ background: m.tinte }}>
            <p className="momento__hora">{m.hora}</p>
            <p className="etiqueta-mono momento__lugar">{m.lugar}</p>
            <span className="momento__foto">
              <Image src={m.foto} alt={m.alt} fill sizes="(max-width: 768px) 80vw, 24vw" className="foto-multiplicada" />
            </span>
            <p className="momento__texto">{m.texto}</p>
            <div className="momento__ticket">
              <span>
                {m.par.nombre} {m.par.color}
                <small>{m.par.precioTexto}</small>
              </span>
              <button
                type="button"
                className="boton boton--chico"
                onClick={() => sumar(m)}
                aria-label={`Sumar ${m.par.nombre} ${m.par.color}`}
              >
                {sumados[m.hora] ? "Sumado" : "Sumar"}
              </button>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
