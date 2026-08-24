"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useCarrito } from "@/components/carrito/CarritoContexto";
import { useCarritoResuelto } from "@/components/carrito/useCarritoResuelto";
import { precio as formatearPrecio } from "@/lib/formato";
import type { DatosCliente } from "@/lib/tipos";
import { emailValido, validarCliente, type ErroresCliente } from "@/lib/validacion";
import { PROVINCIAS } from "./provincias";

const CLAVE_DATOS = "harper.datos.v1";

const VACIO: DatosCliente = {
  email: "",
  nombre: "",
  telefono: "",
  dni: "",
  direccion: "",
  ciudad: "",
  provincia: "",
  cp: "",
  aceptaPromos: true,
};

export default function FormularioCheckout() {
  const { items } = useCarrito();
  const { datos: carrito, cargando } = useCarritoResuelto();

  const [form, setForm] = useState<DatosCliente>(VACIO);
  const [errores, setErrores] = useState<ErroresCliente>({});
  const [enviando, setEnviando] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);

  // Pre-carga los datos de una compra anterior: la comodidad de tener
  // cuenta, sin la fricción de crearla.
  useEffect(() => {
    try {
      const guardado = window.localStorage.getItem(CLAVE_DATOS);
      if (guardado) setForm((f) => ({ ...f, ...JSON.parse(guardado) }));
    } catch {
      // Sin datos guardados se arranca en blanco, que es lo normal.
    }
  }, []);

  // Captura temprana del mail: si abandona a mitad, el contacto igual queda
  // registrado y se le puede escribir después.
  const mailAvisado = useRef<string>("");

  useEffect(() => {
    const email = form.email.trim().toLowerCase();

    if (!emailValido(email) || email === mailAvisado.current) return;

    const id = window.setTimeout(() => {
      mailAvisado.current = email;

      fetch("/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          nombre: form.nombre,
          aceptaPromos: form.aceptaPromos,
        }),
        keepalive: true,
      }).catch(() => {
        // Es best-effort: nunca puede frenar ni romper la compra.
      });
    }, 1200);

    return () => window.clearTimeout(id);
  }, [form.email, form.nombre, form.aceptaPromos]);

  function actualizar<K extends keyof DatosCliente>(campo: K, valor: DatosCliente[K]) {
    setForm((f) => ({ ...f, [campo]: valor }));
    setErrores((e) => ({ ...e, [campo]: undefined }));
  }

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setFallo(null);

    const encontrados = validarCliente(form);

    if (Object.keys(encontrados).length > 0) {
      setErrores(encontrados);
      document
        .querySelector<HTMLElement>('[data-error="true"] input, [data-error="true"] select')
        ?.focus();
      return;
    }

    setEnviando(true);

    try {
      window.localStorage.setItem(CLAVE_DATOS, JSON.stringify(form));
    } catch {
      // Si no se puede guardar, la compra sigue igual.
    }

    try {
      const respuesta = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cliente: form, items }),
      });

      const cuerpo = await respuesta.json();

      if (!respuesta.ok || !cuerpo.initPoint) {
        throw new Error(cuerpo.error ?? "No pudimos iniciar el pago");
      }

      // A partir de acá manda Mercado Pago.
      window.location.href = cuerpo.initPoint;
    } catch (error) {
      setFallo(
        error instanceof Error
          ? error.message
          : "No pudimos iniciar el pago. Probá de nuevo."
      );
      setEnviando(false);
    }
  }

  if (cargando) return <p className="apagado">Cargando…</p>;

  if (!carrito || carrito.items.length === 0) {
    return (
      <div className="pila" style={{ gap: "1.5rem", alignItems: "flex-start" }}>
        <p className="apagado">No hay nada para comprar todavía.</p>
        <Link href="/" className="boton">
          Ver productos
        </Link>
      </div>
    );
  }

  return (
    <form
      onSubmit={enviar}
      noValidate
      style={{
        display: "grid",
        gap: "3rem",
        gridTemplateColumns: "repeat(auto-fit, minmax(min(19rem, 100%), 1fr))",
        alignItems: "start",
      }}
    >
      <div className="pila" style={{ gap: "1.25rem" }}>
        <Campo
          id="email"
          etiqueta="Email"
          tipo="email"
          autoComplete="email"
          valor={form.email}
          error={errores.email}
          onChange={(v) => actualizar("email", v)}
          ayuda="Te mandamos la confirmación de la compra acá."
        />

        <Campo
          id="nombre"
          etiqueta="Nombre y apellido"
          autoComplete="name"
          valor={form.nombre}
          error={errores.nombre}
          onChange={(v) => actualizar("nombre", v)}
        />

        <div style={{ display: "grid", gap: "1.25rem", gridTemplateColumns: "1fr 1fr" }}>
          <Campo
            id="telefono"
            etiqueta="Teléfono"
            tipo="tel"
            autoComplete="tel"
            valor={form.telefono}
            error={errores.telefono}
            onChange={(v) => actualizar("telefono", v)}
          />
          <Campo
            id="dni"
            etiqueta="DNI"
            inputMode="numeric"
            valor={form.dni}
            error={errores.dni}
            onChange={(v) => actualizar("dni", v)}
          />
        </div>

        <Campo
          id="direccion"
          etiqueta="Calle y número"
          autoComplete="street-address"
          valor={form.direccion}
          error={errores.direccion}
          onChange={(v) => actualizar("direccion", v)}
        />

        <div style={{ display: "grid", gap: "1.25rem", gridTemplateColumns: "2fr 1fr" }}>
          <Campo
            id="ciudad"
            etiqueta="Localidad"
            autoComplete="address-level2"
            valor={form.ciudad}
            error={errores.ciudad}
            onChange={(v) => actualizar("ciudad", v)}
          />
          <Campo
            id="cp"
            etiqueta="Código postal"
            autoComplete="postal-code"
            inputMode="numeric"
            valor={form.cp}
            error={errores.cp}
            onChange={(v) => actualizar("cp", v)}
          />
        </div>

        <label className="campo" data-error={Boolean(errores.provincia)}>
          <span>Provincia</span>
          <select
            value={form.provincia}
            onChange={(e) => actualizar("provincia", e.target.value)}
            autoComplete="address-level1"
          >
            <option value="">Elegí una provincia</option>
            {PROVINCIAS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          {errores.provincia ? <small>{errores.provincia}</small> : null}
        </label>

        <label
          style={{
            display: "flex",
            gap: "0.65rem",
            alignItems: "flex-start",
            fontSize: "0.875rem",
            color: "var(--texto-suave)",
          }}
        >
          <input
            type="checkbox"
            checked={form.aceptaPromos}
            onChange={(e) => actualizar("aceptaPromos", e.target.checked)}
            style={{ marginTop: "0.2rem", width: "1rem", height: "1rem" }}
          />
          Quiero enterarme de novedades y promociones de Harper.
        </label>
      </div>

      <aside className="panel" style={{ position: "sticky", top: "6rem" }}>
        <h2 className="label">Tu pedido</h2>

        <ul className="pila" style={{ gap: "0.85rem", listStyle: "none", margin: 0, padding: 0 }}>
          {carrito.items.map((item) => (
            <li key={item.varianteId} style={{ display: "flex", gap: "0.75rem" }}>
              <div
                className="tarjeta__marco"
                style={{ width: "3rem", aspectRatio: "1 / 1", flexShrink: 0 }}
              >
                {item.foto ? (
                  <Image src={item.foto} alt="" fill sizes="48px" style={{ objectFit: "contain", padding: "4px" }} />
                ) : null}
              </div>
              <div style={{ flex: 1, fontSize: "0.8125rem" }}>
                <div>
                  {item.cantidad}× {item.nombre}
                </div>
                <div className="apagado">{item.color}</div>
              </div>
              <span style={{ fontSize: "0.8125rem" }}>{formatearPrecio(item.subtotal)}</span>
            </li>
          ))}
        </ul>

        <div className="fila">
          <span className="apagado">Subtotal</span>
          <span>{formatearPrecio(carrito.subtotal)}</span>
        </div>
        <div className="fila">
          <span className="apagado">Envío por Correo Argentino</span>
          <span>{carrito.envio === 0 ? "Gratis" : formatearPrecio(carrito.envio)}</span>
        </div>

        <div className="fila fila--total">
          <span>Total</span>
          <strong style={{ fontWeight: 500 }}>{formatearPrecio(carrito.total)}</strong>
        </div>

        {fallo ? (
          <p role="alert" style={{ color: "var(--alerta)", fontSize: "0.8125rem" }}>
            {fallo}
          </p>
        ) : null}

        <button type="submit" className="boton boton--bloque" disabled={enviando}>
          {enviando ? "Redirigiendo…" : "Pagar"}
        </button>

        <p className="apagado" style={{ fontSize: "0.75rem" }}>
          Pagás con Mercado Pago. Aceptamos tarjetas en cuotas, débito y
          transferencia. Entrega por Correo Argentino en {carrito.plazoEntrega}.
        </p>
      </aside>
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
  ayuda,
  ...resto
}: {
  id: string;
  etiqueta: string;
  valor: string;
  onChange: (valor: string) => void;
  error?: string;
  tipo?: string;
  ayuda?: string;
  autoComplete?: string;
  inputMode?: "numeric" | "text" | "tel";
}) {
  return (
    <label className="campo" htmlFor={id} data-error={Boolean(error)}>
      <span>{etiqueta}</span>
      <input
        id={id}
        type={tipo}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={Boolean(error)}
        {...resto}
      />
      {error ? <small>{error}</small> : null}
      {!error && ayuda ? (
        <small style={{ color: "var(--texto-suave)" }}>{ayuda}</small>
      ) : null}
    </label>
  );
}
