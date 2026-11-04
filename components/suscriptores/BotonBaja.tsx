"use client";

import Link from "next/link";
import { useState } from "react";
import { TEXTOS } from "@/lib/textos";
import { refrescarSuscriptor } from "./useSuscriptor";

const { baja: T } = TEXTOS.suscriptores;

/**
 * La baja desde el enlace de un mail: abrir la página no da de baja (los
 * antivirus de los mails abren los enlaces solos), hace falta tocar el botón.
 */
export default function BotonBaja({ token }: { token: string }) {
  const [estado, setEstado] = useState<"listo" | "ocupado" | null>(null);
  const [error, setError] = useState("");

  async function darDeBaja() {
    setEstado("ocupado");
    setError("");
    try {
      const r = await fetch("/api/suscriptores/baja", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const cuerpo = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!r.ok || !cuerpo.ok) throw new Error(cuerpo.error ?? "No pudimos darte de baja. Probá en un rato.");
      setEstado("listo");
      void refrescarSuscriptor();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos darte de baja.");
      setEstado(null);
    }
  }

  if (estado === "listo") {
    return (
      <div className="baja-suscriptor__listo" role="status">
        <p className="suscripcion__listo">{T.listo}</p>
        <p className="apagado">{T.listoDetalle}</p>
        <Link href="/" className="suscripcion__enlace">
          Ir a harper.ar
        </Link>
      </div>
    );
  }

  return (
    <>
      <button type="button" className="boton" onClick={darDeBaja} disabled={estado === "ocupado"}>
        {estado === "ocupado" ? "Un momento…" : T.boton}
      </button>
      {error ? (
        <p className="suscripcion__error" role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}
