"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const ESCALA_MIN = 1;
const ESCALA_MAX = 4;
const ESCALA_DOBLE_TOQUE = 2.5;

type Punto = { x: number; y: number };

/** Distancia entre dos dedos. Alcanza con las coordenadas, de ahí el tipo mínimo. */
function distancia(a: Punto, b: Punto) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function comoPunto(t: React.Touch): Punto {
  return { x: t.clientX, y: t.clientY };
}

/**
 * Visor de foto a pantalla completa, con zoom.
 *
 * En el celular: pellizcar para acercar, arrastrar para recorrer la foto
 * ampliada, doble toque para acercar de una, y deslizar para pasar de foto
 * cuando está sin zoom. En la computadora: rueda para acercar, arrastrar para
 * recorrer, flechas para pasar y Escape para salir.
 */
export default function VisorFoto({
  fotos,
  indice,
  alt,
  alCambiar,
  alCerrar,
}: {
  fotos: string[];
  indice: number;
  alt: string;
  alCambiar: (i: number) => void;
  alCerrar: () => void;
}) {
  const [escala, setEscala] = useState(1);
  const [origen, setOrigen] = useState<Punto>({ x: 0, y: 0 });

  const marco = useRef<HTMLDivElement>(null);
  const cerrarBoton = useRef<HTMLButtonElement>(null);

  // Gesto en curso.
  const pellizco = useRef<{ distancia: number; escala: number } | null>(null);
  const arrastre = useRef<{ punto: Punto; origen: Punto } | null>(null);
  const toqueInicial = useRef<Punto | null>(null);
  const ultimoToque = useRef(0);
  // El navegador sintetiza un `dblclick` a partir de dos toques. Sin esta
  // marca, el doble toque se procesaría dos veces —una acá y otra en
  // onDoubleClick— y el zoom se acercaría y se alejaría de inmediato.
  const ultimoGestoTactil = useRef(false);

  const conZoom = escala > 1.01;

  const reiniciar = useCallback(() => {
    setEscala(1);
    setOrigen({ x: 0, y: 0 });
  }, []);

  const ir = useCallback(
    (paso: number) => {
      if (fotos.length < 2) return;
      reiniciar();
      alCambiar((indice + paso + fotos.length) % fotos.length);
    },
    [fotos.length, indice, alCambiar, reiniciar]
  );

  /** Evita que la foto ampliada se vaya de la pantalla. */
  const acotar = useCallback((punto: Punto, escalaActual: number): Punto => {
    const caja = marco.current?.getBoundingClientRect();
    if (!caja) return punto;

    const margenX = (caja.width * (escalaActual - 1)) / 2;
    const margenY = (caja.height * (escalaActual - 1)) / 2;

    return {
      x: Math.min(margenX, Math.max(-margenX, punto.x)),
      y: Math.min(margenY, Math.max(-margenY, punto.y)),
    };
  }, []);

  const aplicarEscala = useCallback(
    (siguiente: number) => {
      const acotada = Math.min(ESCALA_MAX, Math.max(ESCALA_MIN, siguiente));
      setEscala(acotada);
      setOrigen((previo) =>
        acotada <= 1.01 ? { x: 0, y: 0 } : acotar(previo, acotada)
      );
    },
    [acotar]
  );

  // Bloquea el scroll del fondo mientras el visor está abierto.
  useEffect(() => {
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    cerrarBoton.current?.focus();
    return () => {
      document.body.style.overflow = previo;
    };
  }, []);

  useEffect(() => {
    function alTeclear(e: KeyboardEvent) {
      if (e.key === "Escape") alCerrar();
      else if (e.key === "ArrowRight") ir(1);
      else if (e.key === "ArrowLeft") ir(-1);
    }
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [alCerrar, ir]);

  function alTocarInicio(e: React.TouchEvent) {
    ultimoGestoTactil.current = true;

    if (e.touches.length === 2) {
      pellizco.current = {
        distancia: distancia(comoPunto(e.touches[0]), comoPunto(e.touches[1])),
        escala,
      };
      arrastre.current = null;
      return;
    }

    if (e.touches.length === 1) {
      const t = e.touches[0];
      toqueInicial.current = { x: t.clientX, y: t.clientY };

      if (conZoom) {
        arrastre.current = {
          punto: { x: t.clientX, y: t.clientY },
          origen,
        };
      }

      // Doble toque: acerca o vuelve a la vista completa.
      const ahora = e.timeStamp;
      if (ahora - ultimoToque.current < 300) {
        aplicarEscala(conZoom ? 1 : ESCALA_DOBLE_TOQUE);
        ultimoToque.current = 0;
      } else {
        ultimoToque.current = ahora;
      }
    }
  }

  function alTocarMover(e: React.TouchEvent) {
    if (e.touches.length === 2 && pellizco.current) {
      const actual = distancia(comoPunto(e.touches[0]), comoPunto(e.touches[1]));
      aplicarEscala((pellizco.current.escala * actual) / pellizco.current.distancia);
      return;
    }

    if (e.touches.length === 1 && arrastre.current) {
      const t = e.touches[0];
      const siguiente = {
        x: arrastre.current.origen.x + (t.clientX - arrastre.current.punto.x),
        y: arrastre.current.origen.y + (t.clientY - arrastre.current.punto.y),
      };
      setOrigen(acotar(siguiente, escala));
    }
  }

  function alTocarFin(e: React.TouchEvent) {
    pellizco.current = null;
    arrastre.current = null;

    // Sin zoom, un deslizamiento horizontal pasa de foto.
    const desde = toqueInicial.current;
    toqueInicial.current = null;
    if (conZoom || !desde || e.changedTouches.length === 0) return;

    const t = e.changedTouches[0];
    const dx = t.clientX - desde.x;
    const dy = t.clientY - desde.y;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) ir(dx < 0 ? 1 : -1);
  }

  function alRodar(e: React.WheelEvent) {
    aplicarEscala(escala - e.deltaY * 0.0022);
  }

  function alBajarPuntero(e: React.PointerEvent) {
    if (e.pointerType === "touch") return;
    ultimoGestoTactil.current = false;
    if (!conZoom) return;
    arrastre.current = { punto: { x: e.clientX, y: e.clientY }, origen };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }

  function alMoverPuntero(e: React.PointerEvent) {
    if (e.pointerType === "touch" || !arrastre.current) return;
    setOrigen(
      acotar(
        {
          x: arrastre.current.origen.x + (e.clientX - arrastre.current.punto.x),
          y: arrastre.current.origen.y + (e.clientY - arrastre.current.punto.y),
        },
        escala
      )
    );
  }

  function alSoltarPuntero() {
    arrastre.current = null;
  }

  // Va por portal al <body>: cualquier ancestro con transform, filtro o
  // will-change convierte al `position: fixed` en un absolute relativo a él, y
  // el visor deja de cubrir la pantalla.
  return createPortal(
    <div
      className="visor"
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      onClick={(e) => {
        // Tocar el fondo cierra; sobre la foto ampliada, no.
        if (e.target === e.currentTarget) alCerrar();
      }}
    >
      <button
        ref={cerrarBoton}
        type="button"
        className="visor__cerrar"
        onClick={alCerrar}
        aria-label="Cerrar"
      >
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>

      <div
        ref={marco}
        className="visor__marco"
        data-zoom={conZoom || undefined}
        onTouchStart={alTocarInicio}
        onTouchMove={alTocarMover}
        onTouchEnd={alTocarFin}
        onWheel={alRodar}
        onPointerDown={alBajarPuntero}
        onPointerMove={alMoverPuntero}
        onPointerUp={alSoltarPuntero}
        onDoubleClick={() => {
          // En táctil ya lo resolvió el doble toque.
          if (ultimoGestoTactil.current) return;
          aplicarEscala(conZoom ? 1 : ESCALA_DOBLE_TOQUE);
        }}
      >
        <Image
          key={fotos[indice]}
          src={fotos[indice]}
          alt={alt}
          fill
          sizes="100vw"
          priority
          draggable={false}
          style={{
            objectFit: "contain",
            transform: `translate(${origen.x}px, ${origen.y}px) scale(${escala})`,
            transition: pellizco.current || arrastre.current ? "none" : "transform 200ms var(--curva)",
          }}
        />
      </div>

      {fotos.length > 1 ? (
        <>
          <button type="button" className="visor__flecha visor__flecha--izq" onClick={() => ir(-1)} aria-label="Foto anterior">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </button>
          <button type="button" className="visor__flecha visor__flecha--der" onClick={() => ir(1)} aria-label="Foto siguiente">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <p className="visor__cuenta">
            {indice + 1} / {fotos.length}
          </p>
        </>
      ) : null}
    </div>,
    document.body
  );
}
