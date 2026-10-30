"use client";

import Image from "next/image";
import { useRef } from "react";
import HojaPack, { type ColorDeADos, type EstucheDeADos, type HojaPackControl } from "@/components/HojaPack";

export type { ColorDeADos, EstucheDeADos } from "@/components/HojaPack";

/**
 * Lo que cuesta llevarse 1, 3 o 5 pares («llevá 3, pagá 2 · llevá 5, pagá
 * 3», Ale 30/10/2026; antes 1, 2 o 4 con porcentaje), con la cuenta ya hecha
 * y el precio de a uno tachado, y «Armá tu pack» para elegirlos de una (se
 * pueden mezclar modelos y colores: el descuento por cantidad cuenta todos los
 * anteojos juntos). Los montos vienen del servidor (lib/packs.ts, cuotas
 * verificadas): acá solo se elige.
 */

export type FilaDeADos = {
  cantidad: number;
  /** "Llevás uno gratis". */
  apodo: string;
  /** "Llevá 3, pagá 2". */
  titulo: string;
  total: string;
  /** El precio de a uno por la cantidad, tachado; null en 1 par. */
  tachado?: string | null;
  detalle: string[];
  /** "Envío gratis a todo el país", en la fila destacada. */
  sello: string | null;
  boton: string;
};

/** Lo de arriba de las filas; sin él, el de siempre («De a dos»). */
export type EncabezadoDeADos = { etiqueta: string; titulo: string; bajada: string };

const ENCABEZADO_DE_SIEMPRE: EncabezadoDeADos = {
  etiqueta: "De a dos",
  titulo: "Uno está bien. Dos, mejor.",
  bajada: "Uno para la semana, otro para el finde. Mezclá modelos y colores: el descuento se aplica solo.",
};

export default function DeADos({
  filas,
  colores,
  estuche,
  fotos,
  letraChica,
  totales,
  encabezado = ENCABEZADO_DE_SIEMPRE,
}: {
  filas: FilaDeADos[];
  colores: ColorDeADos[];
  estuche: EstucheDeADos | null;
  /** Dos pares distintos para las tarjetas de arriba. */
  fotos: { src: string; alt: string }[];
  letraChica: string | null;
  /** El total de cada pack, para el botón de la hoja ("$ 179.800"); sin él, el botón no lo dice. */
  totales: Record<number, string>;
  encabezado?: EncabezadoDeADos;
}) {
  const hoja = useRef<HojaPackControl>(null);

  function abrir(cantidad: number) {
    if (cantidad === 1) {
      document.getElementById("los-modelos")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    hoja.current?.abrir(cantidad);
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
          <p className="etiqueta-mono">{encabezado.etiqueta}</p>
          <h2 id="de-a-dos-titulo" className="titulo-serif">
            {encabezado.titulo}
          </h2>
          <p className="de-a-dos__bajada">{encabezado.bajada}</p>

          <ul className="de-a-dos__filas">
            {filas.map((f) => (
              <li key={f.cantidad} className="de-a-dos__fila" data-destacada={f.sello ? "" : undefined}>
                {f.sello ? <span className="de-a-dos__sello">{f.sello}</span> : null}
                <div className="de-a-dos__fila-datos">
                  <p className="etiqueta-mono de-a-dos__apodo">{f.apodo}</p>
                  <p className="de-a-dos__fila-titulo">{f.titulo}</p>
                  <p className="de-a-dos__total">
                    {f.total}
                    {f.tachado ? <s className="de-a-dos__tachado">{f.tachado}</s> : null}
                  </p>
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

      <HojaPack ref={hoja} colores={colores} estuche={estuche} totales={totales} />
    </section>
  );
}
