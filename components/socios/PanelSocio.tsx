"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import HojaPack, { type ColorDeADos, type HojaPackControl } from "@/components/HojaPack";
import { TEXTOS } from "@/lib/textos";

const { cuenta: T } = TEXTOS.socios;

export type DatosPanelSocio = {
  /** "N.º 007". */
  numero: string;
  nombre: string;
  plan: "Socio" | "Socio con aumento";
  /** "30/10/2027". */
  vence: string;
  canjePendiente: boolean;
  segundoParPedido: string;
  reposicionDisponible: boolean;
};

/**
 * La membresía del socio que entró con su mail: el segundo par para canjear
 * (se elige en la hoja y sigue por el checkout, donde va incluido) y el resto
 * de los beneficios. Lo que se puede o no se decide en el servidor.
 */
export default function PanelSocio({ socio, colores, reposicion }: { socio: DatosPanelSocio; colores: ColorDeADos[]; reposicion: string | null }) {
  const router = useRouter();
  const hoja = useRef<HojaPackControl>(null);
  const [saliendo, setSaliendo] = useState(false);

  async function salir() {
    setSaliendo(true);
    await fetch("/api/socios/salir", { method: "POST" }).catch(() => null);
    router.refresh();
  }

  return (
    <section className="contenedor seccion cuenta-socio" aria-labelledby="cuenta-titulo">
      <p className="etiqueta-mono">
        {TEXTOS.socios.etiqueta} · {socio.numero}
      </p>
      <h1 id="cuenta-titulo" className="titulo-serif">
        {socio.nombre ? `Hola, ${socio.nombre}.` : T.titulo}
      </h1>
      <p className="apagado cuenta-socio__bajada">{T.vence(socio.plan, socio.vence)}</p>

      <ul className="cuenta-socio__beneficios">
        <li className="cuenta-socio__beneficio cuenta-socio__beneficio--principal" data-estado={socio.canjePendiente ? "pendiente" : "usado"}>
          <h2>{T.segundoPar}</h2>
          {socio.canjePendiente ? (
            <>
              <p>
                {T.segundoParPendiente}
                {socio.plan === "Socio con aumento" ? ` ${T.segundoParAumento}` : ""}
              </p>
              <button type="button" className="boton" onClick={() => hoja.current?.abrir(1)}>
                {T.canjear}
              </button>
            </>
          ) : (
            <p>{socio.segundoParPedido ? T.canjeado(socio.segundoParPedido) : T.canjeadoSinPedido}</p>
          )}
        </li>
        <li className="cuenta-socio__beneficio">
          <h2>{T.envioTitulo}</h2>
          <p>{T.envio}</p>
        </li>
        <li className="cuenta-socio__beneficio" data-estado={socio.reposicionDisponible ? "pendiente" : "usado"}>
          <h2>{T.reposicionTitulo}</h2>
          {socio.reposicionDisponible ? (
            <>
              <p>{T.reposicion}</p>
              {reposicion ? (
                <a href={reposicion} target="_blank" rel="noopener noreferrer" className="enlace-accion">
                  {T.reposicionBoton}
                </a>
              ) : null}
            </>
          ) : (
            <p>{T.reposicionUsada}</p>
          )}
        </li>
        <li className="cuenta-socio__beneficio">
          <h2>{T.congeladoTitulo}</h2>
          <p>{T.congelado}</p>
        </li>
        <li className="cuenta-socio__beneficio">
          <h2>{T.anticipoTitulo}</h2>
          <p>{T.anticipo}</p>
        </li>
      </ul>

      <button type="button" className="enlace-accion cuenta-socio__salir" onClick={salir} disabled={saliendo}>
        {T.salir}
      </button>

      <HojaPack ref={hoja} colores={colores} totales={{}} titulo={T.hojaTitulo} textoComprar={T.hojaBoton} />
    </section>
  );
}
