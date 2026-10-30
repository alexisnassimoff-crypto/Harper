"use client";

import { useEffect, useRef, useState } from "react";
import type { DatosRecordados } from "@/lib/reconocer-cliente";

type Fase = "ofrecer" | "pidiendo" | "codigo" | "verificando";

/**
 * Debajo del mail: si ya compró con ese mail, le mandamos un código y con el
 * código completamos sus datos de la última compra (ver
 * lib/reconocer-cliente.ts). Sin el código no se muestra nada: cualquiera
 * puede escribir el mail de otro.
 *
 * Se ofrece con una línea, sin trabar a quien compra por primera vez.
 */
export default function ReconocerComprador({
  email,
  onDatos,
}: {
  /** El mail ya válido que escribió (si cambia, se empieza de nuevo). */
  email: string;
  onDatos: (datos: DatosRecordados) => void;
}) {
  const [fase, setFase] = useState<Fase>("ofrecer");
  const [desafio, setDesafio] = useState<string | null>(null);
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const campo = useRef<HTMLInputElement>(null);

  // Otro mail: lo pedido para el anterior ya no sirve.
  useEffect(() => {
    setFase("ofrecer");
    setDesafio(null);
    setCodigo("");
    setError(null);
  }, [email]);

  useEffect(() => {
    if (fase === "codigo") campo.current?.focus();
  }, [fase]);

  async function pedirCodigo() {
    setFase("pidiendo");
    setError(null);
    try {
      const r = await fetch("/api/clientes/codigo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const cuerpo = (await r.json().catch(() => ({}))) as { desafio?: string; error?: string };
      if (!r.ok || !cuerpo.desafio) throw new Error(cuerpo.error ?? "No pudimos mandar el código. Probá en un rato.");
      setDesafio(cuerpo.desafio);
      setCodigo("");
      setFase("codigo");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos mandar el código. Probá en un rato.");
      setFase("ofrecer");
    }
  }

  async function verificar(valor = codigo) {
    if (!/^\d{6}$/.test(valor) || !desafio) {
      setError("Son 6 números.");
      return;
    }
    setFase("verificando");
    setError(null);
    try {
      const r = await fetch("/api/clientes/datos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, codigo: valor, desafio }),
      });
      const cuerpo = (await r.json().catch(() => ({}))) as { datos?: DatosRecordados; error?: string };
      if (!r.ok || !cuerpo.datos) throw new Error(cuerpo.error ?? "No pudimos verificar el código.");
      onDatos(cuerpo.datos);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos verificar el código.");
      setFase("codigo");
    }
  }

  return (
    <div className="reconocer" aria-live="polite">
      {fase === "ofrecer" || fase === "pidiendo" ? (
        <p className="reconocer__oferta">
          ¿Ya compraste con este mail?{" "}
          <button type="button" className="enlace-accion" onClick={pedirCodigo} disabled={fase === "pidiendo"}>
            {fase === "pidiendo" ? "Mandando el código…" : "Completá tus datos con un código"}
          </button>
        </p>
      ) : (
        <div className="reconocer__codigo">
          <label htmlFor="codigo-acceso" className="reconocer__texto">
            Si compraste con <strong>{email}</strong>, te mandamos un código de 6 números. Escribilo acá:
          </label>
          <div className="reconocer__fila">
            <input
              ref={campo}
              id="codigo-acceso"
              className="reconocer__campo"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
              value={codigo}
              disabled={fase === "verificando"}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "codigo-acceso-error" : undefined}
              onChange={(e) => {
                const solo = e.target.value.replace(/\D/g, "").slice(0, 6);
                setCodigo(solo);
                setError(null);
                if (solo.length === 6) void verificar(solo);
              }}
              onKeyDown={(e) => {
                // Dentro del formulario de compra: Enter usa el código, no paga.
                if (e.key === "Enter") {
                  e.preventDefault();
                  void verificar();
                }
              }}
            />
            <button type="button" className="boton boton--fantasma reconocer__usar" onClick={() => verificar()} disabled={fase === "verificando"}>
              {fase === "verificando" ? "Buscando…" : "Usar código"}
            </button>
          </div>
          <p className="reconocer__ayuda">
            ¿No llegó? Mirá en correo no deseado o{" "}
            <button type="button" className="enlace-accion" onClick={pedirCodigo}>
              pedí otro
            </button>
            .
          </p>
        </div>
      )}
      {error ? (
        <small id="codigo-acceso-error" className="checkout__error" role="alert">
          {error}
        </small>
      ) : null}
    </div>
  );
}
