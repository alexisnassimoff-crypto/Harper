"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import {
  alCambiarConsentimiento,
  EVENTO_ABRIR_PREFERENCIAS,
  guardarConsentimiento,
  leerConsentimiento,
} from "@/lib/consentimiento";

/** Se emite en `window` cuando el aviso aparece o se va. */
const EVENTO_AVISO = "harper:aviso-cookies";

function suscribirAviso(alCambiar: () => void) {
  window.addEventListener(EVENTO_AVISO, alCambiar);
  return () => window.removeEventListener(EVENTO_AVISO, alCambiar);
}

/**
 * Si el aviso (o el panel) está en pantalla. Las barras fijas de compra lo
 * usan para quedarse visibles mientras tanto: el aviso tapa la parte de abajo
 * y, sin la barra, el botón real de comprar podría quedar justo debajo.
 */
export function useAvisoCookiesAbierto(): boolean {
  return useSyncExternalStore(
    suscribirAviso,
    () => document.body.dataset.avisoCookies !== undefined,
    () => false
  );
}

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
  const botonPreferencias = useRef<HTMLButtonElement>(null);
  // Dónde estaba el foco antes de abrir el panel, para devolverlo al cerrar.
  const vuelta = useRef<HTMLElement | null>(null);
  const panelAbierto = useRef(false);
  panelAbierto.current = panel;

  useEffect(() => {
    const guardado = leerConsentimiento();
    if (!guardado) setVisible(true);
    else setPublicidad(guardado.publicidad);

    function abrir() {
      recordarFoco();
      setPublicidad(leerConsentimiento()?.publicidad === true);
      setVisible(true);
      setPanel(true);
    }
    window.addEventListener(EVENTO_ABRIR_PREFERENCIAS, abrir);

    // Si elige en otra pestaña, el aviso compacto de esta se va solo.
    const dejar = alCambiarConsentimiento((dato) => {
      if (!dato) return;
      setPublicidad(dato.publicidad);
      if (!panelAbierto.current) setVisible(false);
    });

    return () => {
      window.removeEventListener(EVENTO_ABRIR_PREFERENCIAS, abrir);
      dejar();
    };
  }, []);

  // Mientras está en pantalla lo marca en <body> y avisa a las barras fijas.
  useEffect(() => {
    if (!visible) return;
    document.body.dataset.avisoCookies = "";
    window.dispatchEvent(new Event(EVENTO_AVISO));
    return () => {
      delete document.body.dataset.avisoCookies;
      window.dispatchEvent(new Event(EVENTO_AVISO));
    };
  }, [visible]);

  // El panel recibe el foco al abrirse. Escape lo cierra: si todavía no
  // eligió, vuelve al aviso compacto; si ya había elegido, se va todo. Solo
  // con el foco adentro del panel: un Escape en un campo del checkout (por
  // ejemplo, para cerrar las sugerencias de dirección) es de ese campo.
  useEffect(() => {
    if (!panel) return;
    dialogo.current?.focus();
    function alTeclear(e: KeyboardEvent) {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (!dialogo.current?.contains(document.activeElement)) return;
      cerrarPanel(Boolean(leerConsentimiento()));
    }
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [panel]);

  function recordarFoco() {
    vuelta.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }

  function cerrarPanel(cerrarTodo: boolean) {
    // El foco se mueve solo si estaba en el aviso o en el panel: si la
    // persona ya estaba en otra parte de la página, se queda donde está.
    const activo = document.activeElement;
    const enElAviso = activo instanceof Element && activo.closest(".cookies") !== null;
    setPanel(false);
    if (cerrarTodo) setVisible(false);
    const destino = vuelta.current;
    vuelta.current = null;
    if (!enElAviso) return;
    // Después de que React saque el panel: a donde estaba (el enlace del pie),
    // al "Preferencias" del aviso si sigue, o al contenido de la página.
    requestAnimationFrame(() => {
      if (destino?.isConnected) destino.focus();
      else if (botonPreferencias.current) botonPreferencias.current.focus();
      else document.getElementById("contenido")?.focus({ preventScroll: true });
    });
  }

  function elegir(acepta: boolean) {
    guardarConsentimiento(acepta);
    setPublicidad(acepta);
    cerrarPanel(true);
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
        <span aria-hidden="true"> · </span>
        <button
          type="button"
          ref={botonPreferencias}
          className="cookies__preferencias"
          onClick={() => {
            recordarFoco();
            setPanel(true);
          }}
        >
          Preferencias
        </button>
      </p>
      <div className="cookies__acciones">
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
