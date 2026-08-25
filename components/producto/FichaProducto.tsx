"use client";

import Image from "next/image";
import FotoCruzada from "@/components/FotoCruzada";
import VisorFoto from "@/components/VisorFoto";
import { useDeslizar } from "@/components/useDeslizar";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useCarrito } from "@/components/carrito/CarritoContexto";
import { precio as formatearPrecio } from "@/lib/formato";
import {
  armarGaleria,
  indiceEntreFotos,
  posicionDeFoto,
} from "@/lib/galeria";
import type { Producto } from "@/lib/tipos";
import type { Tramo } from "@/lib/descuentos";

export default function FichaProducto({
  producto,
  tramos = [],
}: {
  producto: Producto;
  tramos?: Tramo[];
}) {
  const router = useRouter();
  const { agregar } = useCarrito();
  const [enTransicion, iniciarTransicion] = useTransition();

  // Arranca en el primer color con stock; si están todos agotados, el primero.
  const indiceInicial = Math.max(
    0,
    producto.variantes.findIndex((v) => !v.agotada)
  );

  const [indiceVariante, setIndiceVariante] = useState(indiceInicial);
  const [indiceMedio, setIndiceMedio] = useState(0);
  const [agregado, setAgregado] = useState(false);
  const [visorAbierto, setVisorAbierto] = useState(false);

  const variante = producto.variantes[indiceVariante];

  // El escalón más bajo de la categoría: es el que engancha, porque es el que
  // está a una unidad de distancia.
  const primerTramo = tramos
    .filter((t) => t.categoria === producto.categoria)
    .sort((a, b) => a.desdeUnidades - b.desdeUnidades)[0];

  const fotos = useMemo(
    () => (variante.fotos.length > 0 ? variante.fotos : []),
    [variante]
  );

  // El video es del producto y las fotos son de la variante: la lista se arma
  // acá, con el video en tercer lugar.
  const medios = useMemo(
    () => armarGaleria(fotos, producto.videos, producto.fotoPrincipal),
    [fotos, producto.videos, producto.fotoPrincipal]
  );

  const medioActual = medios[Math.min(indiceMedio, medios.length - 1)] ?? null;
  const esFoto = medioActual?.tipo === "foto";

  function pasarMedio(paso: number) {
    if (medios.length < 2) return;
    setIndiceMedio((n) => (n + paso + medios.length) % medios.length);
  }

  // Las flechas del teclado funcionan en toda la página, sin tener que hacer
  // click en la galería primero. Con el visor abierto se apaga: el visor tiene
  // sus propias flechas y las dos escuchas juntas pasarían dos fotos por tecla.
  useEffect(() => {
    if (visorAbierto || medios.length < 2) return;

    function alTeclear(e: KeyboardEvent) {
      const objetivo = e.target as HTMLElement | null;
      if (objetivo && /^(INPUT|TEXTAREA|SELECT)$/.test(objetivo.tagName)) return;

      if (e.key === "ArrowRight") pasarMedio(1);
      else if (e.key === "ArrowLeft") pasarMedio(-1);
    }

    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visorAbierto, medios.length]);

  // El estilo del gesto se combina con el del marco; el resto son manejadores.
  const { style: estiloDeslizar, ...gestos } = useDeslizar({
    alSiguiente: () => pasarMedio(1),
    alAnterior: () => pasarMedio(-1),
  });

  function elegirColor(indice: number) {
    setIndiceVariante(indice);
    setIndiceMedio(0);
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
        <div
          // El cursor de lupa solo corresponde sobre una foto: el video no se
          // amplía, se reproduce donde está.
          className={esFoto ? "tarjeta__marco galeria" : "tarjeta__marco"}
          style={{ aspectRatio: "1 / 1", ...estiloDeslizar }}
          role={esFoto ? "button" : undefined}
          tabIndex={medioActual ? 0 : undefined}
          aria-label={esFoto ? "Ampliar la foto" : undefined}
          onClick={() => esFoto && setVisorAbierto(true)}
          onKeyDown={(e) => {
            if (!medioActual) return;
            if (esFoto && (e.key === "Enter" || e.key === " ")) {
              e.preventDefault();
              setVisorAbierto(true);
            } else if (e.key === "ArrowRight") pasarMedio(1);
            else if (e.key === "ArrowLeft") pasarMedio(-1);
          }}
          {...gestos}
        >
          {medioActual?.tipo === "video" ? (
            // Arranca solo, sin sonido —la única forma en que los navegadores
            // permiten el autoplay—. Como el video recién se monta cuando el
            // visitante llega a su lugar en la galería, la descarga también
            // empieza ahí y no antes: la ficha sigue sin gastarle datos a
            // quien nunca pasa de las fotos.
            <video
              key={medioActual.src}
              src={medioActual.src}
              poster={medioActual.poster ?? undefined}
              autoPlay
              controls
              muted
              loop
              playsInline
              style={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
                background: "var(--fondo)",
              }}
            />
          ) : medioActual ? (
            <FotoCruzada
              src={medioActual.src}
              alt={`${producto.nombre} — ${variante.color}`}
              sizes="(max-width: 1024px) 100vw, 50vw"
              prioridad
            />
          ) : (
            <div
              className="label"
              style={{ display: "grid", placeItems: "center", height: "100%" }}
            >
              Sin foto
            </div>
          )}

          {medios.length > 1 ? (
            <>
              {/* El stopPropagation evita que el click abra el visor de zoom. */}
              <button
                type="button"
                className="galeria__flecha galeria__flecha--izq"
                aria-label="Anterior"
                onClick={(e) => {
                  e.stopPropagation();
                  pasarMedio(-1);
                }}
              >
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M15 5l-7 7 7 7" />
                </svg>
              </button>
              <button
                type="button"
                className="galeria__flecha galeria__flecha--der"
                aria-label="Siguiente"
                onClick={(e) => {
                  e.stopPropagation();
                  pasarMedio(1);
                }}
              >
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </>
          ) : null}
        </div>

        {medios.length > 1 ? (
          <span className="galeria__puntos" aria-hidden="true">
            {medios.map((m, i) => (
              <span
                key={m.src}
                className="ficha__punto"
                data-activo={i === indiceMedio || undefined}
              />
            ))}
          </span>
        ) : null}

        {medios.length > 1 ? (
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            {medios.map((medio, i) => (
              <button
                key={medio.src}
                type="button"
                onClick={() => setIndiceMedio(i)}
                aria-label={
                  medio.tipo === "video"
                    ? "Ver el video"
                    : `Ver foto ${indiceEntreFotos(medios, i) + 1} de ${fotos.length}`
                }
                aria-current={i === indiceMedio}
                className="mini"
              >
                {medio.tipo === "video" ? (
                  <>
                    {medio.poster ? (
                      <Image
                        src={medio.poster}
                        alt=""
                        fill
                        sizes="72px"
                        style={{ objectFit: "contain", padding: "6px" }}
                      />
                    ) : null}
                    <span className="mini__play" aria-hidden="true">
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                        <path d="M8 5.5v13l11-6.5z" />
                      </svg>
                    </span>
                  </>
                ) : (
                  <Image
                    src={medio.src}
                    alt=""
                    fill
                    sizes="72px"
                    style={{ objectFit: "contain", padding: "6px" }}
                  />
                )}
              </button>
            ))}
          </div>
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

          {/* El descuento por cantidad se muestra acá y no recién en el carrito:
              si la idea aparece después de decidir, ya es tarde. */}
          {primerTramo ? (
            <p style={{ fontSize: "0.875rem", color: "var(--verde)", margin: 0 }}>
              Llevando {primerTramo.desdeUnidades} o más, {primerTramo.porcentaje}% off
              {" · "}
              <span className="apagado">
                {formatearPrecio(
                  Math.round(producto.precio * (1 - primerTramo.porcentaje / 100))
                )}{" "}
                cada uno
              </span>
            </p>
          ) : null}
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

      {visorAbierto && esFoto ? (
        <VisorFoto
          fotos={fotos}
          // El visor cuenta solo fotos; la galería cuenta también el video.
          indice={indiceEntreFotos(medios, indiceMedio)}
          alt={`${producto.nombre} — ${variante.color}`}
          alCambiar={(i) => setIndiceMedio(posicionDeFoto(medios, i))}
          alCerrar={() => setVisorAbierto(false)}
        />
      ) : null}
    </div>
  );
}
