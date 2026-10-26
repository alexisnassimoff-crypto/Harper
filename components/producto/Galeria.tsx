"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import FotoCruzada from "@/components/FotoCruzada";
import VisorFoto from "@/components/VisorFoto";
import { useDeslizar } from "@/components/useDeslizar";
import { armarGaleria, indiceEntreFotos, posicionDeFoto } from "@/lib/galeria";

/**
 * La galería de un producto: la foto grande (o el video), las flechas, los
 * puntitos, las miniaturas y el visor ampliado. La usan la ficha y la portada.
 *
 * `fotos` son las del color elegido: cuando cambian (otro color), la galería
 * vuelve a la primera. Tienen que llegar memorizadas, o vuelve a la primera
 * en cada render.
 */
export default function Galeria({
  fotos,
  videos,
  poster,
  alt,
  reinicio = 0,
}: {
  fotos: string[];
  /** Los videos son del producto: van en la galería de todos los colores. */
  videos: string[];
  poster: string | null;
  alt: string;
  /**
   * Cada vez que cambia, vuelve a la primera foto aunque sean las mismas
   * (la ficha lo sube al tocar un color, también el que ya estaba elegido).
   */
  reinicio?: number;
}) {
  const [indiceMedio, setIndiceMedio] = useState(0);
  const [visorAbierto, setVisorAbierto] = useState(false);

  // Otro color (u otro toque en el mismo): de vuelta a la primera foto.
  const [mostrado, setMostrado] = useState({ fotos, reinicio });
  if (mostrado.fotos !== fotos || mostrado.reinicio !== reinicio) {
    setMostrado({ fotos, reinicio });
    setIndiceMedio(0);
  }

  // El video es del producto y las fotos son de la variante: la lista se arma
  // acá, con el video en tercer lugar.
  const medios = useMemo(() => armarGaleria(fotos, videos, poster), [fotos, videos, poster]);

  const medioActual = medios[Math.min(indiceMedio, medios.length - 1)] ?? null;
  const esFoto = medioActual?.tipo === "foto";

  function pasarMedio(paso: number) {
    if (medios.length < 2) return;
    setIndiceMedio((n) => (n + paso + medios.length) % medios.length);
  }

  // Las flechas del teclado funcionan en toda la página, sin tener que hacer
  // click en la galería primero. Con el visor abierto se apaga: el visor tiene
  // sus propias flechas y las dos escuchas juntas pasarían dos fotos por tecla.
  useEffect(() => {
    if (visorAbierto || medios.length < 2) return;

    function alTeclear(e: KeyboardEvent) {
      const objetivo = e.target as HTMLElement | null;
      if (objetivo && /^(INPUT|TEXTAREA|SELECT)$/.test(objetivo.tagName)) return;

      if (e.key === "ArrowRight") pasarMedio(1);
      else if (e.key === "ArrowLeft") pasarMedio(-1);
    }

    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visorAbierto, medios.length]);

  // El estilo del gesto se combina con el del marco; el resto son manejadores.
  const { style: estiloDeslizar, ...gestos } = useDeslizar({
    alSiguiente: () => pasarMedio(1),
    alAnterior: () => pasarMedio(-1),
  });

  return (
    <>
      <div
        // El cursor de lupa solo corresponde sobre una foto: el video no se
        // amplía, se reproduce donde está.
        className={esFoto ? "tarjeta__marco galeria" : "tarjeta__marco"}
        style={{ aspectRatio: "1 / 1", ...estiloDeslizar }}
        role={esFoto ? "button" : undefined}
        tabIndex={medioActual ? 0 : undefined}
        aria-label={esFoto ? "Ampliar la foto" : undefined}
        onClick={() => esFoto && setVisorAbierto(true)}
        onKeyDown={(e) => {
          if (!medioActual) return;
          if (esFoto && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            setVisorAbierto(true);
          } else if (e.key === "ArrowRight") pasarMedio(1);
          else if (e.key === "ArrowLeft") pasarMedio(-1);
        }}
        {...gestos}
      >
        {medioActual?.tipo === "video" ? (
          // Arranca solo, sin sonido —la única forma en que los navegadores
          // permiten el autoplay—. Como el video recién se monta cuando el
          // visitante llega a su lugar en la galería, la descarga también
          // empieza ahí y no antes: la ficha sigue sin gastarle datos a
          // quien nunca pasa de las fotos.
          <video
            key={medioActual.src}
            src={medioActual.src}
            poster={medioActual.poster ?? undefined}
            autoPlay
            controls
            muted
            loop
            playsInline
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
              background: "var(--fondo)",
            }}
          />
        ) : medioActual ? (
          <FotoCruzada src={medioActual.src} alt={alt} sizes="(max-width: 1024px) 100vw, 50vw" prioridad />
        ) : (
          <div className="label" style={{ display: "grid", placeItems: "center", height: "100%" }}>
            Sin foto
          </div>
        )}

        {medios.length > 1 ? (
          <>
            {/* El stopPropagation evita que el click abra el visor de zoom. */}
            <button
              type="button"
              className="galeria__flecha galeria__flecha--izq"
              aria-label="Anterior"
              onClick={(e) => {
                e.stopPropagation();
                pasarMedio(-1);
              }}
            >
              <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M15 5l-7 7 7 7" />
              </svg>
            </button>
            <button
              type="button"
              className="galeria__flecha galeria__flecha--der"
              aria-label="Siguiente"
              onClick={(e) => {
                e.stopPropagation();
                pasarMedio(1);
              }}
            >
              <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </>
        ) : null}
      </div>

      {medios.length > 1 ? (
        <span className="galeria__puntos" aria-hidden="true">
          {medios.map((m, i) => (
            <span key={m.src} className="ficha__punto" data-activo={i === indiceMedio || undefined} />
          ))}
        </span>
      ) : null}

      {medios.length > 1 ? (
        <div className="galeria__minis">
          {medios.map((medio, i) => (
            <button
              key={medio.src}
              type="button"
              onClick={() => setIndiceMedio(i)}
              aria-label={
                medio.tipo === "video" ? "Ver el video" : `Ver foto ${indiceEntreFotos(medios, i) + 1} de ${fotos.length}`
              }
              aria-current={i === indiceMedio}
              className="mini"
            >
              {medio.tipo === "video" ? (
                <>
                  {medio.poster ? (
                    <Image src={medio.poster} alt="" fill sizes="72px" style={{ objectFit: "contain", padding: "6px" }} />
                  ) : null}
                  <span className="mini__play" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                      <path d="M8 5.5v13l11-6.5z" />
                    </svg>
                  </span>
                </>
              ) : (
                <Image src={medio.src} alt="" fill sizes="72px" style={{ objectFit: "contain", padding: "6px" }} />
              )}
            </button>
          ))}
        </div>
      ) : null}

      {visorAbierto && esFoto ? (
        <VisorFoto
          fotos={fotos}
          // El visor cuenta solo fotos; la galería cuenta también el video.
          indice={indiceEntreFotos(medios, indiceMedio)}
          alt={alt}
          alCambiar={(i) => setIndiceMedio(posicionDeFoto(medios, i))}
          alCerrar={() => setVisorAbierto(false)}
        />
      ) : null}
    </>
  );
}
