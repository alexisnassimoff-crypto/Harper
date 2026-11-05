"use client";

import Image from "next/image";
import { useState, type CSSProperties } from "react";

/**
 * La primera pantalla (Ale, 05/11/2026): vende los anteojos. Qué son y qué
 * tienen de especial arriba; un solo par grande sobre su color, que cambia
 * tocando un círculo (nunca solo); el precio, «Ver anteojos» y, como acción
 * secundaria, los beneficios de suscribirse. Los montos vienen armados del
 * servidor.
 */

export type ColorPortada = {
  id: string;
  modeloSlug: string;
  modeloNombre: string;
  color: string;
  colorHex: string;
  foto: string;
  alSol: boolean;
  tinte: string;
  agotada: boolean;
};

export type DatosPortada = {
  etiqueta: string;
  titulo: string;
  /** Qué son, en una o dos oraciones, debajo del título; null no muestra nada. */
  bajada: string | null;
  boton: string;
  /** "$ 89.900", o null si los modelos no cuestan lo mismo. */
  precio: string | null;
  /** "6 cuotas sin interés de $ 14.983,33", verificada con Mercado Pago; null si no. */
  cuota: string | null;
  /** "Cuotas sin interés con Visa y Mastercard · CFTEA 0,00 %"; null sin cuotas. */
  letraChica: string | null;
  /** La acción secundaria («Conocer mis beneficios»), que baja a Suscriptores Harper; null no la muestra. */
  suscribite: string | null;
};

const minuscula = (texto: string) => texto.charAt(0).toLowerCase() + texto.slice(1);

export default function PortadaColor({ colores, inicial, datos }: { colores: ColorPortada[]; inicial: number; datos: DatosPortada }) {
  // Se guarda el id del color, no su posición: si la lista cambia (un modelo
  // se agota y la portada se regenera), la elección no apunta a otro color.
  const [elegidoId, setElegidoId] = useState(() => (colores[inicial] ?? colores[0])?.id);
  const color = colores.find((c) => c.id === elegidoId) ?? colores[inicial] ?? colores[0];
  if (!color) return null;

  // Los círculos, agrupados por modelo y en el orden de la vitrina.
  const modelos: { nombre: string; colores: ColorPortada[] }[] = [];
  for (const c of colores) {
    const grupo = modelos.find((m) => m.nombre === c.modeloNombre);
    if (grupo) grupo.colores.push(c);
    else modelos.push({ nombre: c.modeloNombre, colores: [c] });
  }

  return (
    <section id="vitrina-portada" className="portada-color" style={{ "--tinte": color.tinte } as CSSProperties} aria-labelledby="portada-titulo">
      <div className="contenedor portada-color__grilla">
        <div className="portada-color__encabezado">
          <p className="etiqueta-mono">{datos.etiqueta}</p>
          <h1 id="portada-titulo" className="portada-color__titulo">
            {datos.titulo}
          </h1>
          {datos.bajada ? <p className="portada-color__bajada">{datos.bajada}</p> : null}
        </div>

        <figure className="portada-color__foto">
          <span className="portada-color__marco">
            <Image
              key={color.id}
              src={color.foto}
              alt={`${color.modeloNombre} ${color.color}${color.alSol ? ", al sol" : ""}`}
              fill
              priority
              sizes="(max-width: 768px) 100vw, 55vw"
              className="foto-multiplicada"
            />
          </span>
          <figcaption className="portada-color__pie" aria-live="polite">
            <strong>{color.modeloNombre.charAt(0) + color.modeloNombre.slice(1).toLowerCase()}</strong> en {minuscula(color.color)}
            {color.alSol ? ", al sol" : ""}
          </figcaption>
        </figure>

        <div className="portada-color__colores" role="radiogroup" aria-label="Elegí un color">
          {modelos.map((m) => (
            <div key={m.nombre} className="portada-color__grupo">
              <span className="portada-color__modelo">{m.nombre}</span>
              <span className="portada-color__circulos">
                {m.colores.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    role="radio"
                    aria-checked={c.id === color.id}
                    aria-label={`${c.modeloNombre} ${c.color}${c.agotada ? ", agotado" : ""}`}
                    title={c.color}
                    className="portada-color__circulo"
                    data-agotada={c.agotada || undefined}
                    style={{ background: c.colorHex }}
                    onClick={() => setElegidoId(c.id)}
                  />
                ))}
              </span>
            </div>
          ))}
        </div>

        <div className="portada-color__compra">
          {datos.precio ? (
            <p className="portada-color__precio">
              <strong>{datos.precio}</strong> el par
              {datos.cuota ? <span className="portada-color__cuota">{datos.cuota}</span> : null}
            </p>
          ) : null}
          <div className="portada-color__acciones">
            <a href="#los-modelos" className="boton portada-color__boton">
              {datos.boton}
            </a>
            {datos.suscribite ? (
              <a href="#suscriptores" className="boton boton--contorno portada-color__secundario">
                {datos.suscribite}
              </a>
            ) : null}
          </div>
          {datos.letraChica ? <p className="portada-color__letra">{datos.letraChica}</p> : null}
        </div>

      </div>
    </section>
  );
}
