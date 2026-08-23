"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { useCarrito } from "@/components/carrito/CarritoContexto";
import { precio as formatearPrecio } from "@/lib/formato";
import type { Producto } from "@/lib/tipos";

export default function FichaProducto({ producto }: { producto: Producto }) {
  const router = useRouter();
  const { agregar } = useCarrito();
  const [enTransicion, iniciarTransicion] = useTransition();

  // Arranca en el primer color con stock; si están todos agotados, el primero.
  const indiceInicial = Math.max(
    0,
    producto.variantes.findIndex((v) => !v.agotada)
  );

  const [indiceVariante, setIndiceVariante] = useState(indiceInicial);
  const [indiceFoto, setIndiceFoto] = useState(0);
  const [agregado, setAgregado] = useState(false);

  const variante = producto.variantes[indiceVariante];

  const fotos = useMemo(
    () => (variante.fotos.length > 0 ? variante.fotos : []),
    [variante]
  );

  const fotoActual = fotos[Math.min(indiceFoto, fotos.length - 1)] ?? null;

  function elegirColor(indice: number) {
    setIndiceVariante(indice);
    setIndiceFoto(0);
    setAgregado(false);
  }

  function agregarAlCarrito() {
    agregar({
      productoSlug: producto.slug,
      varianteId: variante.id,
      cantidad: 1,
    });
    setAgregado(true);
  }

  function comprarAhora() {
    agregar({
      productoSlug: producto.slug,
      varianteId: variante.id,
      cantidad: 1,
    });
    iniciarTransicion(() => router.push("/checkout"));
  }

  return (
    <div
      className="contenedor"
      style={{
        display: "grid",
        gap: "2.5rem 3.5rem",
        gridTemplateColumns: "repeat(auto-fit, minmax(min(20rem, 100%), 1fr))",
        paddingBlock: "2.5rem 4rem",
        alignItems: "start",
      }}
    >
      {/* ---------- Galería ---------- */}
      <div className="pila surge" style={{ gap: "0.75rem" }}>
        <div className="tarjeta__marco" style={{ aspectRatio: "1 / 1" }}>
          {fotoActual ? (
            <Image
              src={fotoActual}
              alt={`${producto.nombre} — ${variante.color}`}
              fill
              sizes="(max-width: 1024px) 100vw, 50vw"
              style={{ objectFit: "cover" }}
              priority
            />
          ) : (
            <div
              className="label"
              style={{ display: "grid", placeItems: "center", height: "100%" }}
            >
              Sin foto
            </div>
          )}
        </div>

        {fotos.length > 1 ? (
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            {fotos.map((foto, i) => (
              <button
                key={foto}
                type="button"
                onClick={() => setIndiceFoto(i)}
                aria-label={`Ver foto ${i + 1} de ${fotos.length}`}
                aria-current={i === indiceFoto}
                className="mini"
              >
                <Image
                  src={foto}
                  alt=""
                  fill
                  sizes="72px"
                  style={{ objectFit: "cover" }}
                />
              </button>
            ))}
          </div>
        ) : null}

        {producto.video ? (
          <video
            src={producto.video}
            controls
            muted
            loop
            playsInline
            preload="none"
            style={{
              width: "100%",
              borderRadius: "var(--radio-tarjeta)",
              background: "var(--fondo-alt)",
            }}
          />
        ) : null}
      </div>

      {/* ---------- Datos y compra ---------- */}
      <div className="pila surge surge-1" style={{ gap: "1.75rem", position: "sticky", top: "6rem" }}>
        <div className="pila" style={{ gap: "0.6rem" }}>
          <span className="label">{producto.categoria}</span>
          <h1 style={{ fontSize: "clamp(2rem, 5vw, 2.75rem)" }}>
            {producto.nombre}
          </h1>

          <div style={{ display: "flex", alignItems: "baseline", gap: "0.75rem" }}>
            <span style={{ fontSize: "1.375rem" }}>
              {formatearPrecio(producto.precio)}
            </span>
            {producto.precioAnterior ? (
              <span
                className="apagado"
                style={{ fontSize: "1rem", textDecoration: "line-through" }}
              >
                {formatearPrecio(producto.precioAnterior)}
              </span>
            ) : null}
          </div>
        </div>

        {producto.descripcion ? (
          <p className="apagado" style={{ maxWidth: "34rem" }}>
            {producto.descripcion}
          </p>
        ) : null}

        {/* Selector de color */}
        <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
          <legend className="label" style={{ marginBottom: "0.75rem" }}>
            Color: {variante.color}
          </legend>

          <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
            {producto.variantes.map((v, i) => (
              <button
                key={v.id}
                type="button"
                onClick={() => elegirColor(i)}
                title={v.agotada ? `${v.color} — agotado` : v.color}
                aria-label={v.agotada ? `${v.color}, agotado` : v.color}
                aria-pressed={i === indiceVariante}
                className="swatch"
                style={{ background: v.colorHex, opacity: v.agotada ? 0.4 : 1 }}
              >
                {v.agotada ? (
                  <span
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "grid",
                      placeItems: "center",
                      fontSize: "1.5rem",
                      lineHeight: 1,
                      color: "var(--texto)",
                    }}
                  >
                    ⁄
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </fieldset>

        {/* Compra */}
        {variante.agotada ? (
          <button type="button" className="boton boton--bloque" disabled>
            Sin stock en este color
          </button>
        ) : (
          <div className="pila" style={{ gap: "0.75rem" }}>
            <button
              type="button"
              className="boton boton--bloque"
              onClick={comprarAhora}
              disabled={enTransicion}
            >
              {enTransicion ? "Un momento…" : "Comprar ahora"}
            </button>

            <button
              type="button"
              className="boton boton--fantasma boton--bloque"
              onClick={agregarAlCarrito}
            >
              {agregado ? "Agregado al carrito" : "Agregar al carrito"}
            </button>

            {variante.stock <= 5 ? (
              <p className="apagado" style={{ fontSize: "0.8125rem" }}>
                Quedan {variante.stock}{" "}
                {variante.stock === 1 ? "unidad" : "unidades"} de este color.
              </p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
