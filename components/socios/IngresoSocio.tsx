"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { TEXTOS } from "@/lib/textos";

const { cuenta: T } = TEXTOS.socios;

/**
 * Entrar como socio: el mail, el código de 6 números que le llega y listo
 * (app/api/socios/codigo e ingresar). La sesión queda en una cookie que solo
 * lee el servidor; acá no se guarda nada.
 */
export default function IngresoSocio() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [codigo, setCodigo] = useState("");
  const [desafio, setDesafio] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);

  async function pedir(evento: FormEvent) {
    evento.preventDefault();
    setError("");
    setOcupado(true);
    try {
      const r = await fetch("/api/socios/codigo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const cuerpo = (await r.json().catch(() => ({}))) as { desafio?: string; error?: string };
      if (!r.ok || !cuerpo.desafio) throw new Error(cuerpo.error ?? "No pudimos mandar el código. Probá en un rato.");
      setDesafio(cuerpo.desafio);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos mandar el código.");
    } finally {
      setOcupado(false);
    }
  }

  async function entrar(evento: FormEvent) {
    evento.preventDefault();
    setError("");
    setOcupado(true);
    try {
      const r = await fetch("/api/socios/ingresar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, codigo: codigo.trim(), desafio }),
      });
      const cuerpo = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(cuerpo.error ?? "No pudimos entrar. Probá de nuevo.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos entrar.");
      setOcupado(false);
    }
  }

  if (!desafio) {
    return (
      <form className="cuenta-socio__form" onSubmit={pedir}>
        <label className="campo">
          <span className="campo__etiqueta">Mail</span>
          <input
            id="socio-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        {error ? (
          <p className="campo__error" role="alert">
            {error}
          </p>
        ) : null}
        <button type="submit" className="boton" disabled={ocupado}>
          {ocupado ? "Mandando…" : T.pedirCodigo}
        </button>
      </form>
    );
  }

  return (
    <form className="cuenta-socio__form" onSubmit={entrar}>
      <p className="apagado" role="status">
        {T.codigoEnviado(email)}
      </p>
      <label className="campo">
        <span className="campo__etiqueta">Código</span>
        <input
          id="socio-codigo"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          required
          value={codigo}
          onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))}
        />
      </label>
      {error ? (
        <p className="campo__error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" className="boton" disabled={ocupado || codigo.length !== 6}>
        {ocupado ? "Entrando…" : T.entrar}
      </button>
      <button
        type="button"
        className="enlace-accion"
        onClick={() => {
          setDesafio(null);
          setCodigo("");
          setError("");
        }}
      >
        {T.otroMail}
      </button>
    </form>
  );
}
