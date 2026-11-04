"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { CLAVE_NAVEGADOR_DEL_PANEL } from "@/lib/medir";

/** Marca este navegador como el del panel: desde acá no se cuentan visitas (lib/medir.ts). */
function marcarNavegador() {
  try {
    window.localStorage.setItem(CLAVE_NAVEGADOR_DEL_PANEL, "1");
  } catch {
    // Sin almacenamiento igual se entra; la cookie del panel ya frena los contadores propios.
  }
}

/** Entrar al panel con el mail y el código que llega a ese mail. */
export function EntrarAlPanel() {
  const router = useRouter();
  const id = useId();
  const [email, setEmail] = useState("");
  const [codigo, setCodigo] = useState("");
  const [desafio, setDesafio] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");

  async function pedir<T>(ruta: string, cuerpo: unknown): Promise<T> {
    const r = await fetch(ruta, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
    const datos = (await r.json().catch(() => ({}))) as T & { error?: string };
    if (!r.ok) throw new Error(datos.error ?? "Algo falló. Probá en un rato.");
    return datos;
  }

  async function pedirCodigo() {
    setOcupado(true);
    setError("");
    try {
      const { desafio: nuevo } = await pedir<{ desafio: string }>("/api/panel/codigo", { email });
      setDesafio(nuevo);
      setCodigo("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos mandar el código.");
    } finally {
      setOcupado(false);
    }
  }

  async function entrar() {
    setOcupado(true);
    setError("");
    try {
      await pedir("/api/panel/entrar", { email, codigo, desafio });
      marcarNavegador();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos entrar.");
      setOcupado(false);
    }
  }

  return (
    <form
      className="panel-entrar"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void (desafio ? entrar() : pedirCodigo());
      }}
    >
      {desafio ? (
        <>
          <p className="apagado" role="status">
            Si {email} puede entrar, le llegó un código de 6 números.
          </p>
          <label className="campo" htmlFor={`${id}-codigo`}>
            <span>Código</span>
            <input
              id={`${id}-codigo`}
              name="codigo"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              required
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))}
            />
          </label>
          <button type="submit" className="boton" disabled={ocupado || codigo.length !== 6}>
            {ocupado ? "Entrando…" : "Entrar"}
          </button>
          <button type="button" className="suscripcion__enlace" onClick={() => (setDesafio(null), setError(""))}>
            Pedir otro código
          </button>
        </>
      ) : (
        <>
          <label className="campo" htmlFor={`${id}-email`}>
            <span>Mail</span>
            <input
              id={`${id}-email`}
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <button type="submit" className="boton" disabled={ocupado || !email.trim()}>
            {ocupado ? "Mandando…" : "Mandarme el código"}
          </button>
        </>
      )}
      {error ? (
        <p className="suscripcion__error" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}

/** Cerrar la sesión del panel en este navegador. */
export function SalirDelPanel() {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  return (
    <button
      type="button"
      className="enlace-accion"
      disabled={ocupado}
      onClick={async () => {
        setOcupado(true);
        await fetch("/api/panel/salir", { method: "POST" }).catch(() => null);
        router.refresh();
      }}
    >
      {ocupado ? "Saliendo…" : "Salir"}
    </button>
  );
}
