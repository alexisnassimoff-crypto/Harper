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

function nuevaSesion() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * El casillero único de dirección: el comprador escribe, Google sugiere, y
 * tiene que elegir una de la lista. Del lado del navegador no hay nada de
 * Google: la lista la arma /api/direcciones.
 *
 * Es un combobox accesible (WAI-ARIA): flechas para moverse, Enter para
 * elegir, Escape para cerrar; cada opción se anuncia al lector de pantalla.
 * El autocompletado nativo del navegador va apagado para que no se pise con
 * la lista, y los gestores de contraseñas lo ignoran.
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
  /** Google no está disponible: el formulario pasa a los campos manuales. */
  onNoDisponible(): void;
  /** No encuentra su dirección: pasa a los campos manuales por decisión propia. */
  onManual(): void;
  error?: string;
}) {
  const idLista = useId();
  const [texto, setTexto] = useState("");
  const [sugerencias, setSugerencias] = useState<Sugerencia[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [activa, setActiva] = useState(-1);
  const [buscando, setBuscando] = useState(false);
  const [sinResultados, setSinResultados] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const sesion = useRef<string | null>(null);
  // Solo lo que el comprador escribe dispara consultas: nunca un valor restaurado.
  const escribio = useRef(false);
  // El padre pasa una función nueva en cada render: si fuera dependencia del
  // efecto, cada render del formulario cancelaría y repetiría la consulta
  // (y cada consulta cuesta plata).
  const avisarNoDisponible = useRef(onNoDisponible);
  avisarNoDisponible.current = onNoDisponible;

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

        if (respuesta.status === 503 && cuerpo.disponible === false) {
          avisarNoDisponible.current();
          return;
        }
        if (!respuesta.ok) {
          setMensaje(cuerpo.error ?? "No pudimos buscar la dirección. Probá de nuevo o cargala a mano.");
          return;
        }

        const lista = cuerpo.sugerencias ?? [];
        setMensaje(null);
        setSugerencias(lista);
        setSinResultados(lista.length === 0);
        setActiva(-1);
        setAbierto(true);
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
  // si el casillero está en la mitad de abajo, se lo sube al abrir la lista.
  useEffect(() => {
    if (!abierto || sugerencias.length === 0 || !input.current) return;
    const caja = input.current.getBoundingClientRect();
    if (caja.bottom > window.innerHeight * 0.45) {
      input.current.scrollIntoView({ block: "start", behavior: "smooth" });
    }
  }, [abierto, sugerencias.length]);

  async function elegir(s: Sugerencia) {
    setAbierto(false);
    setBuscando(true);
    const token = sesion.current ?? nuevaSesion();
    try {
      const respuesta = await fetch(
        `/api/direcciones?id=${encodeURIComponent(s.id)}&sesion=${encodeURIComponent(token)}`
      );
      const cuerpo: RespuestaDetalle = await respuesta.json().catch(() => ({}));

      if (respuesta.status === 503 && cuerpo.disponible === false) {
        onNoDisponible();
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
      onElegir({ ...cuerpo.direccion, id: s.id });
    } catch {
      setMensaje("No pudimos leer esa dirección. Probá de nuevo o cargala a mano.");
    } finally {
      setBuscando(false);
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

  const resumen = elegida
    ? [elegida.barrio, elegida.localidad, provinciaCorta(elegida.provincia)].filter(Boolean).join(", ")
    : "";
  const mostrarLista = abierto && (sugerencias.length > 0 || sinResultados);

  return (
    <div className="campo domicilio" data-error={Boolean(error)}>
      <label htmlFor="domicilio">
        <span>Dirección de entrega</span>
      </label>

      {elegida ? (
        <div className="domicilio__elegida" id="domicilio" tabIndex={-1}>
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
            name="domicilio"
            type="text"
            role="combobox"
            aria-expanded={mostrarLista}
            aria-controls={idLista}
            aria-autocomplete="list"
            aria-activedescendant={abierto && activa >= 0 ? `${idLista}-${activa}` : undefined}
            aria-invalid={Boolean(error)}
            aria-busy={buscando || undefined}
            autoComplete="off"
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

          <ul
            id={idLista}
            role="listbox"
            aria-label="Direcciones sugeridas"
            className="combobox__lista"
            hidden={!mostrarLista}
          >
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
            {sinResultados ? (
              <li className="combobox__vacio" role="presentation">
                No encontramos esa dirección. Probá con calle y número, o{" "}
                <button type="button" className="enlace-accion" onMouseDown={(e) => e.preventDefault()} onClick={onManual}>
                  cargala a mano
                </button>
                .
              </li>
            ) : null}
            <li className="combobox__pie" role="presentation">
              <AtribucionGoogle />
            </li>
          </ul>
        </div>
      )}

      {error ? <small>{error}</small> : mensaje ? <small>{mensaje}</small> : null}

      {!elegida ? (
        <p className="domicilio__ayuda apagado">
          Elegí tu dirección de la lista.{" "}
          <button type="button" className="enlace-accion" onClick={onManual}>
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
