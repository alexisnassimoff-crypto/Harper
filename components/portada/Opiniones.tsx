"use client";

import { useRef } from "react";
import { textoVentas, type OpinionesML, type ReputacionML } from "@/lib/ml-resenas";
import Estrellas, { formatearPuntaje } from "./Estrellas";

const MES = new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric", timeZone: "America/Argentina/Buenos_Aires" });

/**
 * Lo que dicen quienes compraron anteojos Harper, y cuánto vende Harper. Son
 * las opiniones y las cifras reales de la cuenta de Harper en Mercado Libre
 * (lib/ml-resenas-servidor.ts), pero en la página no se nombra a Mercado
 * Libre: Ale no quiere decir que vende por ahí. Por eso no va la medalla de
 * MercadoLíder ni el termómetro, que son de Mercado Libre. Si no hay nada, la
 * sección no aparece.
 */
export default function Opiniones({
  opiniones,
  reputacion,
}: {
  opiniones: OpinionesML | null;
  reputacion: ReputacionML | null;
}) {
  const carril = useRef<HTMLUListElement>(null);
  if (!opiniones && !reputacion) return null;

  function pasar(sentido: 1 | -1) {
    const nodo = carril.current;
    if (!nodo) return;
    const tarjeta = nodo.querySelector("li");
    const paso = tarjeta ? tarjeta.getBoundingClientRect().width + 16 : nodo.clientWidth * 0.8;
    nodo.scrollBy({ left: sentido * paso, behavior: "smooth" });
  }

  const destacadas = opiniones?.destacadas ?? [];

  return (
    <section id="opiniones" className="contenedor seccion opiniones" aria-labelledby="opiniones-titulo">
      <div className="seccion__cabecera">
        <div className="pila" style={{ gap: "0.4rem" }}>
          <span className="label">Opiniones</span>
          <h2 id="opiniones-titulo" className="titulo titulo--chico">
            Lo que dicen quienes ya compraron Harper
          </h2>
        </div>
        {destacadas.length > 1 ? (
          <div className="opiniones__flechas">
            <button type="button" className="opiniones__flecha" aria-label="Opiniones anteriores" onClick={() => pasar(-1)}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M15 5l-7 7 7 7" />
              </svg>
            </button>
            <button type="button" className="opiniones__flecha" aria-label="Más opiniones" onClick={() => pasar(1)}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        ) : null}
      </div>

      {opiniones ? (
        <p className="opiniones__resumen">
          <span className="opiniones__promedio">{formatearPuntaje(opiniones.promedio)}</span>
          <span className="pila" style={{ gap: "0.15rem" }}>
            <Estrellas puntaje={opiniones.promedio} tamano={18} />
            <span className="apagado" style={{ fontSize: "0.8125rem" }}>
              {opiniones.total.toLocaleString("es-AR")} {opiniones.total === 1 ? "opinión" : "opiniones"} de compradores de
              anteojos Harper
            </span>
          </span>
        </p>
      ) : null}

      {destacadas.length > 0 ? (
        <ul ref={carril} className="opiniones__carril" aria-label="Opiniones de compradores">
          {destacadas.map((r) => (
            <li key={r.id} className="opinion">
              <Estrellas puntaje={r.estrellas} />
              {r.titulo ? <p className="opinion__titulo">{r.titulo}</p> : null}
              <p className="opinion__texto">{r.texto}</p>
              <p className="opinion__pie">
                {[r.modelo ? `Modelo ${r.modelo}` : null, fechaLegible(r.fecha)].filter(Boolean).join(" · ")}
              </p>
              <span className="opinion__verificada">
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m5 12.5 4.5 4.5L19 7.5" />
                </svg>
                Compra verificada
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {reputacion && (reputacion.ventas > 0 || reputacion.positivas !== null) ? (
        <div className="vendedor">
          <dl className="vendedor__datos">
            {reputacion.ventas > 0 ? (
              <div>
                <dt>{textoVentas(reputacion.ventas).replace(/ ventas?$/, "")}</dt>
                <dd>{reputacion.ventas === 1 ? "Venta" : "Ventas"}</dd>
              </div>
            ) : null}
            {reputacion.positivas !== null ? (
              <div>
                <dt>{reputacion.positivas}%</dt>
                <dd>Calificaciones positivas</dd>
              </div>
            ) : null}
          </dl>
        </div>
      ) : null}
    </section>
  );
}

function fechaLegible(iso: string): string | null {
  const fecha = new Date(iso);
  return Number.isNaN(fecha.getTime()) ? null : MES.format(fecha);
}
