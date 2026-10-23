"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { Direccion, Sugerencia } from "@/lib/direcciones";
import AtribucionGoogle from "./AtribucionGoogle";

/** La dirección elegida de la lista, con el id de Google para no repetirla. */
export type DireccionElegida = Direccion & { id: string };

/** Lo que contesta /api/direcciones. */
type RespuestaSugerencias = { sugerencias?: Sugerencia[]; disponible?: boolean; error?: string };
type RespuestaDetalle = { direccion?: Direccion; disponible?: boolean; error?: string };

/** Espera entre la última tecla y la consulta: cada consulta cuesta plata. */
const ESPERA_MS = 250;
const MINIMO = 4;
/** Alto máximo de la lista; en celular se achica a lo que deja el teclado. */
const ALTO_LISTA_MAX = 304;
const ALTO_LISTA_MIN = 150;

function nuevaSesion() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/** Hasta dónde se ve de verdad: con el teclado abierto, menos que la ventana. */
function bordeVisible() {
  const vv = window.visualViewport;
  return vv ? vv.offsetTop + vv.height : window.innerHeight;
}

/**
 * El casillero único de dirección: el comprador escribe, Google sugiere, y
 * tiene que elegir una de la lista. Del lado del navegador no hay nada de
 * Google: la lista la arma /api/direcciones.
 *
 * Es un combobox accesible (WAI-ARIA): flechas para moverse, Enter para
 * elegir, Escape para cerrar; la llegada de resultados se anuncia al lector de
 * pantalla y, elegida la dirección, el foco pasa a la tarjeta con el resumen.
 * El autocompletado nativo del navegador va apagado para que no se pise con
 * la lista: Chrome ignora `off` en campos de dirección, pero no sugiere nada
 * en un campo cuyo `autocomplete` no reconoce; los gestores de contraseñas lo
 * ignoran por sus atributos.
 */
export default function CampoDireccion({
  elegida,
  onElegir,
  onCambiar,
  onNoDisponible,
  onManual,
  error,
}: {
  elegida: DireccionElegida | null;
  onElegir(direccion: DireccionElegida): void;
  /** Quiere buscar otra dirección: se descarta la elegida. */
  onCambiar(): void;
  /** Google no está disponible: el formulario pasa a los campos manuales, con lo tipeado. */
  onNoDisponible(texto: string): void;
  /** No encuentra su dirección: pasa a los campos manuales por decisión propia, con lo tipeado. */
  onManual(texto: string): void;
  error?: string;
}) {
  const idBase = useId();
  const idEtiqueta = `${idBase}-etiqueta`;
  const idLista = `${idBase}-lista`;
  const idAyuda = `${idBase}-ayuda`;
  const [texto, setTexto] = useState("");
  const [sugerencias, setSugerencias] = useState<Sugerencia[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [activa, setActiva] = useState(-1);
  const [buscando, setBuscando] = useState(false);
  const [sinResultados, setSinResultados] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [anuncio, setAnuncio] = useState("");
  const [altoLista, setAltoLista] = useState(ALTO_LISTA_MAX);
  const input = useRef<HTMLInputElement>(null);
  const tarjeta = useRef<HTMLDivElement>(null);
  const sesion = useRef<string | null>(null);
  // Solo lo que el comprador escribe dispara consultas: nunca un valor restaurado.
  const escribio = useRef(false);
  // Para ignorar un detalle que llega tarde (ya eligió otro, o se fue a manual).
  const pedidoDetalle = useRef(0);
  const vivo = useRef(true);
  // Verdadero entre que eligió y que la tarjeta recibe el foco.
  const eligio = useRef(false);
  // El padre pasa funciones nuevas en cada render: si fueran dependencias del
  // efecto, cada render del formulario cancelaría y repetiría la consulta
  // (y cada consulta cuesta plata).
  const avisarNoDisponible = useRef(onNoDisponible);
  avisarNoDisponible.current = onNoDisponible;

  useEffect(() => {
    vivo.current = true;
    return () => {
      vivo.current = false;
    };
  }, []);

  useEffect(() => {
    if (!escribio.current || elegida) return;

    const consulta = texto.trim();
    if (consulta.length < MINIMO) {
      setSugerencias([]);
      setSinResultados(false);
      setBuscando(false);
      return;
    }

    const controlador = new AbortController();
    const id = window.setTimeout(async () => {
      sesion.current ??= nuevaSesion();
      setBuscando(true);
      try {
        const respuesta = await fetch(
          `/api/direcciones?q=${encodeURIComponent(consulta)}&sesion=${encodeURIComponent(sesion.current)}`,
          { signal: controlador.signal }
        );
        const cuerpo: RespuestaSugerencias = await respuesta.json().catch(() => ({}));
        if (controlador.signal.aborted) return;

        if (respuesta.status === 503 && cuerpo.disponible === false) {
          avisarNoDisponible.current(consulta);
          return;
        }
        if (!respuesta.ok) {
          const aviso = cuerpo.error ?? "No pudimos buscar la dirección. Probá de nuevo o cargala a mano.";
          setMensaje(aviso);
          setAnuncio(aviso);
          return;
        }

        const lista = cuerpo.sugerencias ?? [];
        setMensaje(null);
        setSugerencias(lista);
        setSinResultados(lista.length === 0);
        setActiva(-1);
        setAbierto(true);
        setAnuncio(
          lista.length === 0
            ? "No encontramos esa dirección."
            : `${lista.length} ${lista.length === 1 ? "dirección sugerida" : "direcciones sugeridas"}. Bajá con la flecha para elegir.`
        );
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          setMensaje("No pudimos buscar la dirección. Probá de nuevo o cargala a mano.");
        }
      } finally {
        if (!controlador.signal.aborted) setBuscando(false);
      }
    }, ESPERA_MS);

    return () => {
      window.clearTimeout(id);
      controlador.abort();
    };
  }, [texto, elegida]);

  // En celular, con el teclado abierto, la lista tiene que quedar a la vista:
  // se achica a lo que entra debajo del casillero y, si no entra ni lo mínimo,
  // se sube el casillero. Se mide con el visual viewport, que es el que se
  // reduce cuando aparece el teclado (la ventana no).
  useEffect(() => {
    if (!abierto || sugerencias.length === 0 || !input.current) return;

    function acomodar() {
      const caja = input.current?.getBoundingClientRect();
      if (!caja) return;
      const lugar = bordeVisible() - caja.bottom - 12;
      setAltoLista(Math.max(ALTO_LISTA_MIN, Math.min(ALTO_LISTA_MAX, lugar)));
      if (lugar < ALTO_LISTA_MIN) input.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    }

    acomodar();
    window.visualViewport?.addEventListener("resize", acomodar);
    return () => window.visualViewport?.removeEventListener("resize", acomodar);
  }, [abierto, sugerencias.length]);

  // Elegida la dirección, el casillero se va y aparece la tarjeta: el foco
  // tiene que seguirla (si no, se pierde en el body y el lector no dice nada).
  useEffect(() => {
    if (elegida && eligio.current) {
      eligio.current = false;
      tarjeta.current?.focus();
    }
  }, [elegida]);

  async function elegir(s: Sugerencia) {
    const mio = ++pedidoDetalle.current;
    setAbierto(false);
    setBuscando(true);
    const token = sesion.current ?? nuevaSesion();
    try {
      const respuesta = await fetch(
        `/api/direcciones?id=${encodeURIComponent(s.id)}&sesion=${encodeURIComponent(token)}`
      );
      const cuerpo: RespuestaDetalle = await respuesta.json().catch(() => ({}));
      // Llegó tarde: ya eligió otra, o se fue a cargar a mano.
      if (!vivo.current || mio !== pedidoDetalle.current) return;

      if (respuesta.status === 503 && cuerpo.disponible === false) {
        avisarNoDisponible.current(texto);
        return;
      }
      if (!respuesta.ok || !cuerpo.direccion) {
        setMensaje(cuerpo.error ?? "No pudimos leer esa dirección. Probá de nuevo o cargala a mano.");
        return;
      }

      // El detalle cierra la sesión de Google: la próxima búsqueda abre otra.
      sesion.current = null;
      setMensaje(null);
      setSugerencias([]);
      setTexto("");
      eligio.current = true;
      onElegir({ ...cuerpo.direccion, id: s.id });
    } catch {
      if (vivo.current && mio === pedidoDetalle.current) {
        setMensaje("No pudimos leer esa dirección. Probá de nuevo o cargala a mano.");
      }
    } finally {
      if (vivo.current && mio === pedidoDetalle.current) setBuscando(false);
    }
  }

  function alTeclear(evento: React.KeyboardEvent<HTMLInputElement>) {
    if (evento.key === "ArrowDown" || evento.key === "ArrowUp") {
      if (sugerencias.length === 0) return;
      evento.preventDefault();
      setAbierto(true);
      setActiva((a) => {
        const paso = evento.key === "ArrowDown" ? 1 : -1;
        return (a + paso + sugerencias.length) % sugerencias.length;
      });
      return;
    }

    if (evento.key === "Enter") {
      // Nunca manda el formulario desde acá: Enter elige la dirección.
      evento.preventDefault();
      if (sugerencias.length === 0) return;
      void elegir(sugerencias[activa >= 0 ? activa : 0]);
      return;
    }

    if (evento.key === "Escape") {
      setAbierto(false);
    }
  }

  /** A los campos manuales, llevándose lo que ya tipeó. */
  function aMano() {
    pedidoDetalle.current += 1;
    onManual(texto);
  }

  const resumen = elegida
    ? [elegida.barrio, elegida.localidad, provinciaCorta(elegida.provincia)].filter(Boolean).join(", ")
    : "";
  const mostrarLista = abierto && (sugerencias.length > 0 || sinResultados);
  const ayuda = error ?? mensaje ?? null;

  return (
    <div className="campo domicilio" data-error={Boolean(error)}>
      <span id={idEtiqueta}>Dirección de entrega</span>

      {elegida ? (
        <div
          ref={tarjeta}
          className="domicilio__elegida"
          id="domicilio"
          role="group"
          aria-labelledby={idEtiqueta}
          aria-describedby={ayuda ? idAyuda : undefined}
          tabIndex={-1}
        >
          <span className="domicilio__tilde" aria-hidden="true">
            ✓
          </span>
          <div>
            <strong>{`${elegida.calle} ${elegida.numero}`.trim()}</strong>
            <span className="apagado">
              {resumen}
              {elegida.cp ? ` · CP ${elegida.cp}` : ""}
            </span>
          </div>
          <button
            type="button"
            className="enlace-accion"
            onClick={() => {
              onCambiar();
              escribio.current = false;
              window.setTimeout(() => input.current?.focus(), 0);
            }}
          >
            Cambiar
          </button>
        </div>
      ) : (
        <div className="combobox">
          <input
            ref={input}
            id="domicilio"
            name="buscador-direccion"
            type="text"
            role="combobox"
            aria-labelledby={idEtiqueta}
            aria-expanded={mostrarLista}
            aria-controls={idLista}
            aria-autocomplete="list"
            aria-activedescendant={abierto && activa >= 0 ? `${idLista}-${activa}` : undefined}
            aria-invalid={Boolean(error)}
            aria-describedby={ayuda ? idAyuda : undefined}
            aria-busy={buscando || undefined}
            // Un valor que ningún navegador reconoce: Chrome ignora "off" en
            // los campos de dirección, pero con esto no muestra sus sugerencias.
            autoComplete="direccion-harper"
            autoCorrect="off"
            autoCapitalize="words"
            spellCheck={false}
            data-lpignore="true"
            data-1p-ignore=""
            data-form-type="other"
            enterKeyHint="search"
            placeholder="Calle y número"
            value={texto}
            onChange={(e) => {
              escribio.current = true;
              setTexto(e.target.value);
              setMensaje(null);
            }}
            onKeyDown={alTeclear}
            onFocus={() => {
              if (sugerencias.length > 0 || sinResultados) setAbierto(true);
            }}
            onBlur={() => setAbierto(false)}
          />

          <div className="combobox__panel" hidden={!mostrarLista} style={{ maxHeight: altoLista }}>
            <ul id={idLista} role="listbox" aria-labelledby={idEtiqueta} className="combobox__lista">
              {sugerencias.map((s, i) => (
                <li
                  key={s.id}
                  id={`${idLista}-${i}`}
                  role="option"
                  aria-selected={i === activa}
                  className="combobox__opcion"
                  // Que el toque no le saque el foco al casillero antes del click.
                  onPointerDown={(e) => e.preventDefault()}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => void elegir(s)}
                  onMouseEnter={() => setActiva(i)}
                >
                  <span className="combobox__principal">{s.principal}</span>
                  <span className="combobox__secundario">{s.secundario}</span>
                </li>
              ))}
            </ul>
            {sinResultados ? (
              <p className="combobox__vacio">
                No encontramos esa dirección. Probá con calle y número, o{" "}
                <button type="button" className="enlace-accion" onMouseDown={(e) => e.preventDefault()} onClick={aMano}>
                  cargala a mano
                </button>
                .
              </p>
            ) : null}
            <div className="combobox__pie">
              <AtribucionGoogle />
            </div>
          </div>
        </div>
      )}

      {/* Lo que pasa sin que se vea: resultados, "sin resultados", errores. */}
      <div role="status" aria-live="polite" className="solo-lectores">
        {anuncio}
      </div>

      {ayuda ? <small id={idAyuda}>{ayuda}</small> : null}

      {!elegida ? (
        <p className="domicilio__ayuda apagado">
          Elegí tu dirección de la lista.{" "}
          <button type="button" className="enlace-accion" onClick={aMano}>
            ¿No aparece? Cargala a mano
          </button>
        </p>
      ) : null}
    </div>
  );
}

/** "Ciudad Autónoma de Buenos Aires" no entra en una línea de celular. */
function provinciaCorta(provincia: string) {
  return provincia === "Ciudad Autónoma de Buenos Aires" ? "CABA" : provincia;
}
