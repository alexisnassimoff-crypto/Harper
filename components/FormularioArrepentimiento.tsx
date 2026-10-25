"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  normalizarSolicitud,
  TEXTO_PROXIMO_PASO,
  validarSolicitud,
  type ErroresArrepentimiento,
  type SolicitudArrepentimiento,
} from "@/lib/arrepentimiento";

type Recibida = { codigo: string; recibida: string; mailEnviado: boolean; email: string };

const VACIA: SolicitudArrepentimiento = { nombre: "", email: "", pedido: "", producto: "", motivo: "" };

/**
 * El Botón de arrepentimiento: sin cuenta ni registro. Al enviarlo, el código
 * de recepción aparece en pantalla y llega por email (ver
 * app/api/arrepentimiento/route.ts).
 */
export default function FormularioArrepentimiento({ emailContacto, whatsapp }: { emailContacto: string; whatsapp: string }) {
  const [datos, setDatos] = useState(VACIA);
  const [errores, setErrores] = useState<ErroresArrepentimiento>({});
  const [enviando, setEnviando] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);
  const [recibida, setRecibida] = useState<Recibida | null>(null);
  const confirmacion = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (recibida) confirmacion.current?.focus();
  }, [recibida]);

  const cambiar = (clave: keyof SolicitudArrepentimiento) => (valor: string) => {
    setDatos((d) => ({ ...d, [clave]: valor }));
    if (errores[clave]) setErrores((e) => ({ ...e, [clave]: undefined }));
  };

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    if (enviando) return;
    setFallo(null);

    const solicitud = normalizarSolicitud(datos);
    const nuevos = validarSolicitud(solicitud);
    setErrores(nuevos);
    if (Object.keys(nuevos).length > 0) {
      document.getElementById(Object.keys(nuevos)[0])?.focus();
      return;
    }

    setEnviando(true);
    try {
      const respuesta = await fetch("/api/arrepentimiento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(solicitud),
      });
      const cuerpo = await respuesta.json().catch(() => ({}));
      if (respuesta.ok && typeof cuerpo.codigo === "string") {
        setRecibida({ codigo: cuerpo.codigo, recibida: cuerpo.recibida, mailEnviado: Boolean(cuerpo.mailEnviado), email: solicitud.email });
      } else if (respuesta.status === 400 && cuerpo.errores) {
        setErrores(cuerpo.errores);
      } else {
        setFallo(typeof cuerpo.error === "string" ? cuerpo.error : "No pudimos registrar tu solicitud.");
      }
    } catch {
      setFallo("No pudimos enviar tu solicitud: revisá tu conexión.");
    } finally {
      setEnviando(false);
    }
  }

  const contacto = (
    <>
      <a href={`mailto:${emailContacto}`} style={{ textDecoration: "underline" }}>
        {emailContacto}
      </a>
      {whatsapp ? (
        <>
          {" o por "}
          <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "underline" }}>
            WhatsApp
          </a>
        </>
      ) : null}
    </>
  );

  if (recibida) {
    return (
      // El margen deja la confirmación a la vista debajo del encabezado fijo al recibir el foco.
      <div ref={confirmacion} tabIndex={-1} role="status" className="pila" style={{ gap: "0.75rem", outline: "none", scrollMarginTop: "7rem" }}>
        <p style={{ fontSize: "1.125rem" }}>Recibimos tu solicitud de arrepentimiento.</p>
        <p style={{ fontSize: "0.9375rem" }}>Tu código de recepción es:</p>
        <p
          style={{
            fontSize: "1.25rem",
            letterSpacing: "0.1em",
            padding: "0.9rem 1.1rem",
            border: "1px solid var(--borde)",
            borderRadius: "var(--radio)",
            background: "#fff",
            userSelect: "all",
          }}
        >
          {recibida.codigo}
        </p>
        <p className="apagado" style={{ fontSize: "0.9375rem" }}>
          La recibimos el {recibida.recibida}.{" "}
          {recibida.mailEnviado
            ? `También te lo mandamos por email a ${recibida.email}.`
            : "No pudimos mandártelo por email: anotalo o sacale una captura."}
        </p>
        <p style={{ fontSize: "0.9375rem" }}>{TEXTO_PROXIMO_PASO}</p>
      </div>
    );
  }

  return (
    <form onSubmit={enviar} noValidate className="pila" style={{ gap: "1rem", width: "100%" }}>
      <p style={{ fontSize: "0.9375rem" }}>
        Completá tus datos y enviá la solicitud. Te damos el código de recepción en el momento.
      </p>

      <Campo id="nombre" etiqueta="Nombre y apellido" valor={datos.nombre} onChange={cambiar("nombre")} error={errores.nombre} autoComplete="name" />
      <Campo id="email" etiqueta="Email con el que compraste" tipo="email" valor={datos.email} onChange={cambiar("email")} error={errores.email} autoComplete="email" inputMode="email" />
      <Campo id="pedido" etiqueta="Número de pedido (si lo tenés)" valor={datos.pedido} onChange={cambiar("pedido")} error={errores.pedido} placeholder="HARPER-…" />
      <Campo id="producto" etiqueta="Qué devolvés (si no es todo el pedido)" valor={datos.producto} onChange={cambiar("producto")} error={errores.producto} />

      <label className="campo" htmlFor="motivo" data-error={Boolean(errores.motivo)}>
        <span>Motivo (opcional)</span>
        <textarea id="motivo" name="motivo" rows={3} value={datos.motivo} onChange={(e) => cambiar("motivo")(e.target.value)} aria-invalid={Boolean(errores.motivo)} />
        {errores.motivo ? <small>{errores.motivo}</small> : null}
      </label>

      <button type="submit" className="boton" disabled={enviando}>
        {enviando ? "Enviando…" : "Ejercer el arrepentimiento"}
      </button>

      {fallo ? (
        <p role="alert" style={{ fontSize: "0.9375rem", color: "var(--alerta)" }}>
          {fallo} Escribinos a {contacto}: tu solicitud vale igual.
        </p>
      ) : null}
    </form>
  );
}

function Campo({
  id,
  etiqueta,
  valor,
  onChange,
  error,
  tipo = "text",
  ...resto
}: {
  id: string;
  etiqueta: string;
  valor: string;
  onChange: (valor: string) => void;
  error?: string;
  tipo?: string;
  autoComplete?: string;
  inputMode?: "email" | "text";
  placeholder?: string;
}) {
  return (
    <label className="campo" htmlFor={id} data-error={Boolean(error)} style={{ width: "100%" }}>
      <span>{etiqueta}</span>
      <input id={id} name={id} type={tipo} value={valor} onChange={(e) => onChange(e.target.value)} aria-invalid={Boolean(error)} {...resto} />
      {error ? <small>{error}</small> : null}
    </label>
  );
}
