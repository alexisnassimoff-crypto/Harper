"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import {
  EVENTO_ABRIR_PREFERENCIAS,
  guardarConsentimiento,
  leerConsentimiento,
} from "@/lib/consentimiento";

/**
 * El aviso de cookies: discreto, abajo, sin tapar la compra.
 *
 * Aparece una sola vez, hasta que la persona elige. "Rechazar opcionales"
 * está al mismo nivel que "Aceptar" (no hay que buscarlo), y "Preferencias"
 * abre el detalle por categoría. Desde el pie, "Preferencias de cookies"
 * vuelve a abrir el panel para cambiar la elección cuando quiera.
 *
 * Mientras no elige no se carga nada publicitario; y la tienda funciona igual
 * con cualquier elección.
 */
export default function AvisoCookies() {
  const [visible, setVisible] = useState(false);
  const [panel, setPanel] = useState(false);
  const [publicidad, setPublicidad] = useState(false);
  const idTitulo = useId();
  const dialogo = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const guardado = leerConsentimiento();
    if (!guardado) setVisible(true);
    else setPublicidad(guardado.publicidad);

    function abrir() {
      setPublicidad(leerConsentimiento()?.publicidad === true);
      setVisible(true);
      setPanel(true);
    }
    window.addEventListener(EVENTO_ABRIR_PREFERENCIAS, abrir);
    return () => window.removeEventListener(EVENTO_ABRIR_PREFERENCIAS, abrir);
  }, []);

  // El panel recibe el foco al abrirse y se cierra con Escape.
  useEffect(() => {
    if (!panel) return;
    dialogo.current?.focus();
    function alTeclear(e: KeyboardEvent) {
      if (e.key === "Escape" && leerConsentimiento()) {
        setPanel(false);
        setVisible(false);
      }
    }
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [panel]);

  function elegir(acepta: boolean) {
    guardarConsentimiento(acepta);
    setPublicidad(acepta);
    setPanel(false);
    setVisible(false);
  }

  if (!visible) return null;

  if (panel) {
    return (
      <div className="cookies cookies--panel" role="dialog" aria-modal="false" aria-labelledby={idTitulo} ref={dialogo} tabIndex={-1}>
        <h2 id={idTitulo} className="cookies__titulo">
          Preferencias de cookies
        </h2>

        <div className="cookies__categoria">
          <div>
            <strong>Necesarias</strong>
            <p>Hacen funcionar la tienda: carrito, checkout, seguridad y recordar esta elección.</p>
          </div>
          <span className="cookies__siempre">Siempre activas</span>
        </div>

        <label className="cookies__categoria">
          <div>
            <strong>Medición y publicidad</strong>
            <p>
              Meta Pixel y Conversions API, para medir nuestros anuncios y mostrarlos a quien le pueden
              interesar. Opcionales: podés comprar igual sin ellas.
            </p>
          </div>
          <input
            type="checkbox"
            className="cookies__interruptor"
            role="switch"
            checked={publicidad}
            onChange={(e) => setPublicidad(e.target.checked)}
          />
        </label>

        <p className="cookies__mas">
          Más información en la{" "}
          <Link href="/legales/privacidad" className="cookies__enlace">
            Política de privacidad
          </Link>
          .
        </p>

        <div className="cookies__acciones">
          <button type="button" className="boton boton--fantasma boton--chico" onClick={() => elegir(false)}>
            Rechazar opcionales
          </button>
          <button type="button" className="boton boton--chico" onClick={() => elegir(publicidad)}>
            Guardar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="cookies" role="region" aria-label="Aviso de cookies">
      <p className="cookies__texto">
        Usamos cookies necesarias para que la tienda funcione y, si aceptás, cookies de medición y
        publicidad.{" "}
        <Link href="/legales/privacidad" className="cookies__enlace">
          Más información
        </Link>
      </p>
      <div className="cookies__acciones">
        <button type="button" className="cookies__preferencias" onClick={() => setPanel(true)}>
          Preferencias
        </button>
        <button type="button" className="boton boton--fantasma boton--chico" onClick={() => elegir(false)}>
          Rechazar opcionales
        </button>
        <button type="button" className="boton boton--chico" onClick={() => elegir(true)}>
          Aceptar
        </button>
      </div>
    </div>
  );
}

/** El enlace del pie que vuelve a abrir el panel. */
export function EnlacePreferenciasCookies({ className }: { className?: string }) {
  return (
    <button
      type="button"
      className={className ? `enlace-boton ${className}` : "enlace-boton"}
      onClick={() => window.dispatchEvent(new CustomEvent(EVENTO_ABRIR_PREFERENCIAS))}
    >
      Preferencias de cookies
    </button>
  );
}
