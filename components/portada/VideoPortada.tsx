"use client";

import { useEffect, useRef } from "react";

/**
 * El video del hero (Ale, 17/11/2026): los anteojos con el cristal que se
 * oscurece al sol y se aclara adentro, armado con las dos fotos reales de
 * cada modelo.
 *
 * Lo primero que se ve es la imagen fija, que es el primer cuadro del video:
 * la página no espera al video para mostrarse. El video se pide recién en el
 * navegador, y solo si corresponde: quien pidió menos animaciones o ahorrar
 * datos se queda con la imagen. Se repite sin corte, sin sonido, y se detiene
 * cuando queda fuera de la pantalla.
 */
export default function VideoPortada({
  src,
  imagen,
  descripcion,
}: {
  src: string;
  /** El primer cuadro del video: lo que se ve mientras carga, o si no se reproduce. */
  imagen: string;
  /** Qué muestra, para quien no lo ve. */
  descripcion: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;

    const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ahorro = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
    if (quieto || ahorro) return;

    // React no escribe el atributo `muted`, y sin sonido apagado el navegador
    // no deja que un video arranque solo.
    video.muted = true;
    video.src = src;
    // Si el celular no lo deja arrancar (modo de bajo consumo), queda la imagen.
    const reproducir = () => void video.play().catch(() => {});
    reproducir();

    const observador = new IntersectionObserver(
      ([entrada]) => {
        if (entrada.isIntersecting) reproducir();
        else video.pause();
      },
      { threshold: 0.1 }
    );
    observador.observe(video);
    return () => observador.disconnect();
  }, [src]);

  return (
    <video
      ref={ref}
      className="inicio-hero__video"
      poster={imagen}
      muted
      loop
      playsInline
      preload="none"
      aria-label={descripcion}
    />
  );
}
