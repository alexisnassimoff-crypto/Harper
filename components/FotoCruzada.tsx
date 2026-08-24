"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

/**
 * Imagen que cruza en fundido cuando cambia la fuente.
 *
 * Mantiene la foto anterior debajo mientras la nueva aparece encima, así el
 * cambio de color no es un corte seco ni pega un blancazo con el fondo de la
 * ficha. Cuando termina el fundido, la anterior se descarta.
 */
export default function FotoCruzada({
  src,
  alt,
  sizes,
  prioridad = false,
  duracion = 320,
}: {
  src: string;
  alt: string;
  sizes: string;
  prioridad?: boolean;
  /** Milisegundos del cruce. */
  duracion?: number;
}) {
  const [actual, setActual] = useState(src);
  const [saliente, setSaliente] = useState<string | null>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (src === actual) return;

    setSaliente(actual);
    setActual(src);

    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => setSaliente(null), duracion);
  }, [src, actual, duracion]);

  useEffect(
    () => () => {
      if (temporizador.current) clearTimeout(temporizador.current);
    },
    []
  );

  return (
    <>
      {saliente ? (
        <Image
          key={saliente}
          src={saliente}
          alt=""
          aria-hidden="true"
          fill
          sizes={sizes}
          draggable={false}
          className="foto-cruzada foto-cruzada--sale"
          style={{ objectFit: "contain" }}
        />
      ) : null}

      <Image
        key={actual}
        src={actual}
        alt={alt}
        fill
        sizes={sizes}
        priority={prioridad}
        draggable={false}
        className="foto-cruzada foto-cruzada--entra"
        style={{ objectFit: "contain" }}
      />
    </>
  );
}
