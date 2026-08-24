"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useCarrito } from "@/components/carrito/CarritoContexto";
import { useCarritoResuelto } from "@/components/carrito/useCarritoResuelto";
import { precio as formatearPrecio } from "@/lib/formato";
import type { DatosCliente, EleccionEnvio, OpcionEnvio } from "@/lib/tipos";
import { emailValido, validarCliente, type ErroresCliente } from "@/lib/validacion";
import { PROVINCIAS } from "./provincias";
import { useCotizacionEnvio, useSucursales } from "./useEnvio";

const CLAVE_DATOS = "harper.datos.v1";

/** Lo que puede contestar /api/checkout. */
type RespuestaCheckout = {
  initPoint?: string;
  numero?: string;
  error?: string;
  errores?: ErroresCliente;
  descartados?: { varianteId: string; motivo: string }[];
};

/** Identifica una opción de envío en el grupo de radios. */
function claveOpcion(o: OpcionEnvio) {
  return `${o.modo}-${o.servicio}`;
}

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
  const { items, quitar } = useCarrito();
  const { datos: carrito, cargando } = useCarritoResuelto();

  const [form, setForm] = useState<DatosCliente>(VACIO);
  const [errores, setErrores] = useState<ErroresCliente>({});
  const [enviando, setEnviando] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);

  // Envío: se cotiza contra Correo Argentino apenas hay código postal.
  const { cotizacion, cargando: cotizando } = useCotizacionEnvio(form.cp);
  const [elegido, setElegido] = useState<string | null>(null);
  const [sucursal, setSucursal] = useState("");

  const opciones = cotizacion?.opciones ?? [];
  const opcion = opciones.find((o) => claveOpcion(o) === elegido) ?? opciones[0] ?? null;
  const necesitaSucursal = opcion?.modo === "S";

  const { sucursales } = useSucursales(form.provincia, necesitaSucursal);

  // Cuando cambian las opciones (otro CP, otro carrito), se preselecciona la
  // más barata: es la que más gente elegiría y evita una decisión de más.
  useEffect(() => {
    if (opciones.length === 0) {
      setElegido(null);
      return;
    }

    setElegido((actual) => {
      if (actual && opciones.some((o) => claveOpcion(o) === actual)) return actual;
      const barata = opciones.reduce((a, b) => (b.precio < a.precio ? b : a));
      return claveOpcion(barata);
    });
  }, [opciones]);

  // Al dejar de retirar en sucursal, la sucursal elegida deja de tener sentido.
  useEffect(() => {
    if (!necesitaSucursal) setSucursal("");
  }, [necesitaSucursal]);

  // El envío bonificado gana sobre cualquier cotización: el pedido llegó al
  // mínimo y lo paga Harper.
  const envio = cotizacion?.bonificado
    ? 0
    : (opcion?.precio ?? cotizacion?.envio ?? carrito?.envio ?? 0);

  const subtotal = carrito?.subtotal ?? 0;
  const total = subtotal + envio;

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

  function eleccion(): EleccionEnvio | undefined {
    if (!opcion) return undefined;

    return {
      modo: opcion.modo,
      servicio: opcion.servicio,
      ...(opcion.modo === "S" && sucursal ? { sucursal } : {}),
    };
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

    // Sin sucursal elegida no hay dónde mandar el paquete.
    if (necesitaSucursal && sucursales.length > 0 && !sucursal) {
      setFallo("Elegí en qué sucursal querés retirar.");
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
        // Solo QUÉ eligió. El precio lo vuelve a cotizar el servidor: si acá
        // viajara un monto, cualquiera podría pagar $0 de envío.
        body: JSON.stringify({ cliente: form, items, envio: eleccion() }),
      });

      // Un 500 puede volver como página de error en HTML. Sin esta guarda,
      // `json()` explotaba y el cliente terminaba leyendo "Unexpected token '<'".
      const cuerpo: RespuestaCheckout = await respuesta.json().catch(() => ({}));

      // El servidor revalida con la misma función que el navegador, así que
      // si encontró algo que acá pasó, se pinta campo por campo.
      if (respuesta.status === 400 && cuerpo.errores) {
        setErrores(cuerpo.errores);
        setEnviando(false);
        document
          .querySelector<HTMLElement>('[data-error="true"] input, [data-error="true"] select')
          ?.focus();
        return;
      }

      // Algo se agotó mientras completaba los datos: se saca del carrito y se
      // le muestra el total nuevo antes de mandarlo a pagar.
      if (respuesta.status === 409 && cuerpo.descartados) {
        for (const d of cuerpo.descartados) quitar(d.varianteId);
        setFallo(cuerpo.error ?? "Tu carrito cambió: revisalo antes de pagar.");
        setEnviando(false);
        return;
      }

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
          <span>{formatearPrecio(subtotal)}</span>
        </div>

        {/* Envío. Hasta que no hay código postal no se puede cotizar, así que
            se muestra el precio de referencia y se aclara por qué. */}
        {opciones.length > 0 ? (
          <fieldset
            style={{ border: 0, margin: 0, padding: "0.25rem 0 0", display: "grid", gap: "0.5rem" }}
          >
            <legend className="label" style={{ padding: 0, marginBottom: "0.35rem" }}>
              Cómo lo recibís
            </legend>

            {opciones.map((o) => {
              const clave = claveOpcion(o);

              return (
                <label
                  key={clave}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.6rem",
                    fontSize: "0.8125rem",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="radio"
                    name="envio"
                    value={clave}
                    checked={elegido === clave}
                    onChange={() => setElegido(clave)}
                    style={{ width: "1rem", height: "1rem", flexShrink: 0 }}
                  />
                  <span style={{ flex: 1 }}>{o.nombre}</span>
                  <span>
                    {cotizacion?.bonificado ? "Gratis" : formatearPrecio(o.precio)}
                  </span>
                </label>
              );
            })}

            {necesitaSucursal && sucursales.length > 0 ? (
              <label className="campo" style={{ marginTop: "0.35rem" }}>
                <span>Sucursal donde retirás</span>
                <select value={sucursal} onChange={(e) => setSucursal(e.target.value)}>
                  <option value="">Elegí una sucursal</option>
                  {sucursales.map((s) => (
                    <option key={s.id} value={`${s.nombre} — ${s.direccion}`}>
                      {s.nombre} — {s.direccion}
                      {s.localidad ? `, ${s.localidad}` : ""}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </fieldset>
        ) : (
          <div className="fila">
            <span className="apagado">
              Envío por Correo Argentino
              {cotizando ? " · calculando…" : ""}
            </span>
            <span>{envio === 0 ? "Gratis" : formatearPrecio(envio)}</span>
          </div>
        )}

        {opciones.length === 0 && !cotizando && form.cp.replace(/\D/g, "").length < 4 ? (
          <p className="apagado" style={{ fontSize: "0.75rem", marginTop: "-0.25rem" }}>
            Poné tu código postal y calculamos el envío exacto.
          </p>
        ) : null}

        <div className="fila fila--total">
          <span>Total</span>
          <strong style={{ fontWeight: 500 }}>{formatearPrecio(total)}</strong>
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
