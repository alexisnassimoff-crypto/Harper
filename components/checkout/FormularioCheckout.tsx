"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useCarrito } from "@/components/carrito/CarritoContexto";
import { useCarritoResuelto } from "@/components/carrito/useCarritoResuelto";
import { cuotasActivas } from "@/lib/cuotas";
import { precio as formatearPrecio } from "@/lib/formato";
import { datosDeCompra, origenParaElPedido, trackPixel } from "@/lib/pixel";
import { desglosar } from "@/lib/resumen";
import type { DatosCliente, EleccionEnvio } from "@/lib/tipos";
import { emailValido, validarCliente, type ErroresCliente } from "@/lib/validacion";
import BarraPagar from "./BarraPagar";
import { PROVINCIAS } from "./provincias";
import { useCotizacionEnvio } from "./useEnvio";

const CLAVE_DATOS = "harper.datos.v1";
const ID_FORMULARIO = "formulario-checkout";

/** El orden en que aparecen los campos; también el del id de cada uno. */
const ORDEN_CAMPOS: (keyof DatosCliente)[] = [
  "email",
  "nombre",
  "telefono",
  "dni",
  "direccion",
  "ciudad",
  "cp",
  "provincia",
];

/** Lo que puede contestar /api/checkout. */
type RespuestaCheckout = {
  initPoint?: string;
  numero?: string;
  error?: string;
  errores?: ErroresCliente;
  descartados?: { varianteId: string; motivo: string }[];
  totalNuevo?: number;
};

const VACIO: DatosCliente = {
  email: "",
  nombre: "",
  telefono: "",
  dni: "",
  direccion: "",
  ciudad: "",
  provincia: "",
  cp: "",
  // Sin marcar: el consentimiento para promociones lo da el comprador.
  aceptaPromos: false,
};

/**
 * El checkout, pensado para el celular: los datos que la logística necesita
 * para entregar (y ninguno más), autocompletado del navegador en cada campo,
 * los datos guardados para la próxima compra, el pedido resumido en una
 * línea arriba y el botón de pagar siempre a mano.
 *
 * Solo hay envío a domicilio, a tarifa fija (o gratis desde el mínimo): no se
 * ofrecen sucursales ni servicios que todavía no existen.
 */
export default function FormularioCheckout({
  reintento = false,
}: {
  /** Verdadero cuando vuelve de un pago rechazado: no es un checkout nuevo. */
  reintento?: boolean;
}) {
  const { items, quitar } = useCarrito();
  const {
    datos: carrito,
    cargando,
    actualizando,
    error: errorCarrito,
    recargar,
  } = useCarritoResuelto();

  const [form, setForm] = useState<DatosCliente>(VACIO);
  const [errores, setErrores] = useState<ErroresCliente>({});
  const [enviando, setEnviando] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);

  // Envío a domicilio. Si Correo Argentino cotiza (cuando esté configurado),
  // se toma la opción a domicilio más barata sin preguntar nada; si no, la
  // tarifa fija del carrito. Nunca se ofrecen sucursales ni servicios.
  const { cotizacion } = useCotizacionEnvio(form.cp);
  const opcionDomicilio =
    (cotizacion?.opciones ?? [])
      .filter((o) => o.modo === "D")
      .sort((a, b) => a.precio - b.precio)[0] ?? null;

  // El envío bonificado gana sobre cualquier cotización: el pedido llegó al
  // mínimo y lo paga Harper.
  const envio = cotizacion?.bonificado
    ? 0
    : (opcionDomicilio?.precio ?? cotizacion?.envio ?? carrito?.envio ?? 0);

  const resumen = desglosar({
    subtotal: carrito?.subtotal ?? 0,
    ahorro: carrito?.ahorro ?? 0,
    envio,
  });

  // Pre-carga los datos de una compra anterior: la comodidad de tener
  // cuenta, sin la fricción de crearla.
  const restaurado = useRef(false);

  useEffect(() => {
    try {
      const guardado = window.localStorage.getItem(CLAVE_DATOS);
      if (guardado) {
        const previos = JSON.parse(guardado) as Partial<DatosCliente>;
        // El consentimiento no se recuerda: se vuelve a preguntar cada vez.
        delete previos.aceptaPromos;
        setForm((f) => ({ ...f, ...previos }));
      }
    } catch {
      // Sin datos guardados se arranca en blanco, que es lo normal.
    } finally {
      restaurado.current = true;
    }
  }, []);

  // Y se van guardando mientras escribe: si abandona y vuelve, no empieza de
  // cero. Sin el consentimiento, que no se recuerda.
  useEffect(() => {
    if (!restaurado.current) return;

    const id = window.setTimeout(() => {
      try {
        const { aceptaPromos: _consentimiento, ...datos } = form;
        if (Object.values(datos).some((v) => v.trim() !== "")) {
          window.localStorage.setItem(CLAVE_DATOS, JSON.stringify(datos));
        }
      } catch {
        // Si no se puede guardar, la compra sigue igual.
      }
    }, 400);

    return () => window.clearTimeout(id);
  }, [form]);

  // Al volver de Mercado Pago con el botón "atrás", iOS Safari restaura la
  // página desde el cache con el estado anterior: el botón quedaba trabado en
  // "Redirigiendo…" para siempre. `pageshow` con `persisted` es ese caso.
  useEffect(() => {
    function alVolver(evento: PageTransitionEvent) {
      if (evento.persisted) setEnviando(false);
    }
    window.addEventListener("pageshow", alVolver);
    return () => window.removeEventListener("pageshow", alVolver);
  }, []);

  // Captura temprana del mail: si abandona a mitad, el contacto igual queda
  // registrado y se le puede escribir después. Sin el consentimiento de
  // promociones: eso se guarda recién al comprar, con lo que haya marcado.
  const mailAvisado = useRef<string>("");

  useEffect(() => {
    const email = form.email.trim().toLowerCase();

    if (!emailValido(email) || email === mailAvisado.current) return;

    const id = window.setTimeout(() => {
      mailAvisado.current = email;

      fetch("/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, nombre: form.nombre }),
        keepalive: true,
      }).catch(() => {
        // Es best-effort: nunca puede frenar ni romper la compra.
      });
    }, 1200);

    return () => window.clearTimeout(id);
  }, [form.email, form.nombre]);

  // InitiateCheckout: una vez por visita al checkout, con el carrito ya
  // resuelto (valor e ítems reales). Ni con carrito vacío ni al volver de un
  // pago rechazado, que no es un checkout nuevo.
  const checkoutAvisado = useRef(false);

  useEffect(() => {
    if (checkoutAvisado.current || reintento) return;
    if (!carrito || carrito.items.length === 0) return;

    checkoutAvisado.current = true;
    trackPixel("InitiateCheckout", datosDeCompra({ items: carrito.items, valor: carrito.subtotal }));
  }, [carrito, reintento]);

  // La barra fija de pagar aparece cuando el botón real sale de pantalla.
  const botonPagar = useRef<HTMLButtonElement>(null);
  const [botonEnPantalla, setBotonEnPantalla] = useState(true);

  useEffect(() => {
    const nodo = botonPagar.current;
    if (!nodo || typeof IntersectionObserver === "undefined") return;

    const observador = new IntersectionObserver(
      (entradas) => setBotonEnPantalla(entradas.some((e) => e.isIntersecting)),
      { threshold: 0.2 }
    );

    observador.observe(nodo);
    return () => observador.disconnect();
  }, [carrito]);

  function actualizar<K extends keyof DatosCliente>(campo: K, valor: DatosCliente[K]) {
    setForm((f) => ({ ...f, [campo]: valor }));
    setErrores((e) => ({ ...e, [campo]: undefined }));
  }

  function eleccion(): EleccionEnvio | undefined {
    if (!opcionDomicilio) return undefined;
    return { modo: opcionDomicilio.modo, servicio: opcionDomicilio.servicio };
  }

  /** Lleva el foco al primer campo con error, en el orden del formulario. */
  function enfocarPrimerError(encontrados: ErroresCliente) {
    const primero = ORDEN_CAMPOS.find((campo) => encontrados[campo]);
    if (primero) document.getElementById(primero)?.focus();
  }

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setFallo(null);

    const encontrados = validarCliente(form);

    if (Object.keys(encontrados).length > 0) {
      setErrores(encontrados);
      enfocarPrimerError(encontrados);
      return;
    }

    setEnviando(true);

    try {
      const { aceptaPromos: _consentimiento, ...datos } = form;
      window.localStorage.setItem(CLAVE_DATOS, JSON.stringify(datos));
    } catch {
      // Si no se puede guardar, la compra sigue igual.
    }

    try {
      const respuesta = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Solo QUÉ eligió. El precio lo vuelve a cotizar el servidor: si acá
        // viajara un monto, cualquiera podría pagar $0 de envío. `totalVisto`
        // es lo que se le mostró: si el servidor calcula otra cosa, frena.
        body: JSON.stringify({
          cliente: form,
          items,
          envio: eleccion(),
          totalVisto: resumen.total,
          // De qué anuncio vino, para el pedido y para la Conversions API.
          origen: origenParaElPedido(),
        }),
      });

      // Un 500 puede volver como página de error en HTML. Sin esta guarda,
      // `json()` explotaba y el cliente terminaba leyendo "Unexpected token '<'".
      const cuerpo: RespuestaCheckout = await respuesta.json().catch(() => ({}));

      // El servidor revalida con la misma función que el navegador, así que
      // si encontró algo que acá pasó, se pinta campo por campo.
      if (respuesta.status === 400 && cuerpo.errores) {
        setErrores(cuerpo.errores);
        setEnviando(false);
        enfocarPrimerError(cuerpo.errores);
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

      // El total cambió (un precio, un descuento, el envío): se vuelve a
      // resolver el carrito y el comprador ve el nuevo antes de pagar.
      if (respuesta.status === 409 && typeof cuerpo.totalNuevo === "number") {
        recargar();
        setFallo(cuerpo.error ?? "El total cambió: revisalo antes de pagar.");
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

  if (cargando && !carrito) return <p className="apagado">Cargando…</p>;

  // El carrito del comprador existe (está en su navegador); lo que falló es
  // ponerle precios. Antes esto decía "No hay nada para comprar", que es falso.
  if (errorCarrito && !carrito) {
    return (
      <div className="pila" style={{ gap: "1rem", alignItems: "flex-start" }}>
        <p className="apagado">No pudimos cargar tu carrito. Probá de nuevo en un momento.</p>
        <button type="button" className="boton boton--fantasma" onClick={recargar}>
          Reintentar
        </button>
      </div>
    );
  }

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

  const cantidadTotal = carrito.items.reduce((n, i) => n + i.cantidad, 0);
  const productos = `${cantidadTotal} ${cantidadTotal === 1 ? "producto" : "productos"}`;
  const envioTexto = resumen.envio === 0 ? "Gratis" : formatearPrecio(resumen.envio);
  const notaEnvio =
    carrito.envioGratisDesde > 0
      ? `Correo Argentino a domicilio. Gratis desde ${formatearPrecio(carrito.envioGratisDesde)}.`
      : "Correo Argentino a domicilio.";

  const listaItems = (
    <>
      {carrito.items.map((item) => (
        <li key={item.varianteId} style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
          <div className="tarjeta__marco" style={{ width: "2.75rem", aspectRatio: "1 / 1", flexShrink: 0 }}>
            {item.foto ? (
              <Image src={item.foto} alt="" fill sizes="44px" style={{ objectFit: "contain", padding: "4px" }} />
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
    </>
  );

  return (
    <form id={ID_FORMULARIO} className="checkout__form" onSubmit={enviar} noValidate>
      <div className="checkout__campos">
        {/* En celular el resumen queda abajo de todo: esta línea adelanta lo
            esencial y se despliega para ver el detalle. */}
        <details className="checkout__resumen-movil">
          <summary>
            <span>
              {productos} · <strong>{formatearPrecio(resumen.total)}</strong>
              {resumen.envio === 0 ? " · envío gratis" : " · envío incluido"}
            </span>
            <span className="checkout__ver">Ver detalle</span>
          </summary>
          <ul>{listaItems}</ul>
          <div className="fila">
            <span className="apagado">Envío a domicilio</span>
            <span>{envioTexto}</span>
          </div>
        </details>

        <Campo
          id="email"
          etiqueta="Email"
          tipo="email"
          autoComplete="email"
          inputMode="email"
          enterKeyHint="next"
          valor={form.email}
          error={errores.email}
          onChange={(v) => actualizar("email", v)}
        />

        <Campo
          id="nombre"
          etiqueta="Nombre y apellido"
          autoComplete="name"
          enterKeyHint="next"
          valor={form.nombre}
          error={errores.nombre}
          onChange={(v) => actualizar("nombre", v)}
        />

        <div className="checkout__par">
          <Campo
            id="telefono"
            etiqueta="Teléfono"
            tipo="tel"
            autoComplete="tel"
            inputMode="tel"
            enterKeyHint="next"
            valor={form.telefono}
            error={errores.telefono}
            onChange={(v) => actualizar("telefono", v)}
          />
          <Campo
            id="dni"
            etiqueta="DNI"
            inputMode="numeric"
            enterKeyHint="next"
            valor={form.dni}
            error={errores.dni}
            onChange={(v) => actualizar("dni", v)}
          />
        </div>

        <Campo
          id="direccion"
          etiqueta="Calle y número"
          autoComplete="address-line1"
          placeholder="Av. Cabildo 1234, 5° B"
          enterKeyHint="next"
          valor={form.direccion}
          error={errores.direccion}
          onChange={(v) => actualizar("direccion", v)}
        />

        <div className="checkout__par checkout__par--localidad">
          <Campo
            id="ciudad"
            etiqueta="Localidad"
            autoComplete="address-level2"
            enterKeyHint="next"
            valor={form.ciudad}
            error={errores.ciudad}
            onChange={(v) => actualizar("ciudad", v)}
          />
          <Campo
            id="cp"
            etiqueta="Código postal"
            autoComplete="postal-code"
            inputMode="numeric"
            enterKeyHint="done"
            valor={form.cp}
            error={errores.cp}
            onChange={(v) => actualizar("cp", v)}
          />
        </div>

        <label className="campo" data-error={Boolean(errores.provincia)}>
          <span>Provincia</span>
          <select
            id="provincia"
            name="provincia"
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

        <label className="checkout__promos">
          <input
            type="checkbox"
            name="aceptaPromos"
            checked={form.aceptaPromos}
            onChange={(e) => actualizar("aceptaPromos", e.target.checked)}
          />
          Quiero recibir novedades y promociones de Harper.
        </label>
      </div>

      <aside
        className="panel checkout__panel"
        style={{ position: "sticky", top: "6rem" }}
        aria-busy={actualizando}
        data-actualizando={actualizando || undefined}
      >
        {/* En celular la lista ya está arriba, en el resumen desplegable: acá
            quedan solo la cuenta y el botón. */}
        <h2 className="label checkout__panel-titulo">Tu pedido</h2>

        <ul className="pila checkout__panel-lista" style={{ gap: "0.85rem", listStyle: "none", margin: 0, padding: 0 }}>
          {listaItems}
        </ul>

        {/* La cuenta se lee de arriba abajo: lista − descuento + envío = total. */}
        <div className="fila">
          <span className="apagado">Subtotal</span>
          <span>{formatearPrecio(resumen.lista)}</span>
        </div>

        {resumen.descuento > 0 ? (
          <div className="fila" style={{ color: "var(--verde)" }}>
            <span>Descuento por cantidad</span>
            <span>−{formatearPrecio(resumen.descuento)}</span>
          </div>
        ) : null}

        <div className="fila">
          <span className="apagado">Envío a domicilio</span>
          <span>{envioTexto}</span>
        </div>
        <p className="apagado checkout__envio-nota">{notaEnvio}</p>

        <div className="fila fila--total">
          <span>Total</span>
          <strong style={{ fontWeight: 500 }}>{formatearPrecio(resumen.total)}</strong>
        </div>

        {fallo ? (
          <p role="alert" style={{ color: "var(--alerta)", fontSize: "0.8125rem" }}>
            {fallo}
          </p>
        ) : null}

        <button ref={botonPagar} type="submit" className="boton boton--bloque" disabled={enviando}>
          {enviando ? "Redirigiendo…" : "Pagar"}
        </button>

        <p className="apagado" style={{ fontSize: "0.75rem" }}>
          Pagás en Mercado Pago:{" "}
          {cuotasActivas()
            ? `${cuotasActivas()} cuotas sin interés con tarjeta, débito o`
            : "tarjeta en cuotas, débito o"}{" "}
          dinero en cuenta.
        </p>
      </aside>

      <BarraPagar
        visible={!botonEnPantalla}
        formulario={ID_FORMULARIO}
        total={formatearPrecio(resumen.total)}
        detalle={`${productos}${resumen.envio === 0 ? " · envío gratis" : " · envío incluido"}`}
        ocupado={enviando}
      />
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
  inputMode?: "numeric" | "text" | "tel" | "email";
  enterKeyHint?: "next" | "done";
  placeholder?: string;
}) {
  return (
    <label className="campo" htmlFor={id} data-error={Boolean(error)}>
      <span>{etiqueta}</span>
      <input
        id={id}
        name={id}
        type={tipo}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={Boolean(error)}
        {...resto}
      />
      {error ? <small>{error}</small> : null}
    </label>
  );
}
