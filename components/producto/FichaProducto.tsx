"use client";

import Image from "next/image";
import FotoCruzada from "@/components/FotoCruzada";
import VisorFoto from "@/components/VisorFoto";
import MensajesConfianza from "@/components/MensajesConfianza";
import { useDeslizar } from "@/components/useDeslizar";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useCarrito } from "@/components/carrito/CarritoContexto";
import { useCarritoResuelto } from "@/components/carrito/useCarritoResuelto";
import EscaleraPrecios from "@/components/EscaleraPrecios";
import CtaFija from "./CtaFija";
import type { Confianza } from "@/lib/confianza";
import { importeCuota } from "@/lib/cuotas";
import { precio as formatearPrecio } from "@/lib/formato";
import {
  armarGaleria,
  indiceEntreFotos,
  posicionDeFoto,
} from "@/lib/galeria";
import { indiceVarianteInicial } from "@/lib/variantes";
import type { Producto } from "@/lib/tipos";
import type { Tramo } from "@/lib/descuentos";

export default function FichaProducto({
  producto,
  tramos = [],
  varianteInicial,
  confianza = [],
  cuotas = null,
}: {
  producto: Producto;
  tramos?: Tramo[];
  /** Índice del color con el que abre. Lo decide el servidor según la URL. */
  varianteInicial?: number;
  confianza?: Confianza[];
  /** Cuotas sin interés activas en Mercado Pago, o null si no hay. */
  cuotas?: number | null;
}) {
  const router = useRouter();
  const { items, agregar } = useCarrito();
  const [enTransicion, iniciarTransicion] = useTransition();

  const [indiceVariante, setIndiceVariante] = useState(
    () => varianteInicial ?? indiceVarianteInicial(producto)
  );
  const [indiceMedio, setIndiceMedio] = useState(0);
  const [agregado, setAgregado] = useState(false);
  const [visorAbierto, setVisorAbierto] = useState(false);

  const variante = producto.variantes[indiceVariante];
  const yaEnCarrito = items.some((i) => i.varianteId === variante.id);

  // Lo que ya hay en el carrito de esta categoría: la escalera de precios se
  // va llenando a medida que el visitante agrega, que es todo el chiste.
  const { datos: carritoResuelto } = useCarritoResuelto();
  const unidadesEnCategoria = (carritoResuelto?.items ?? [])
    .filter((i) => i.categoria === producto.categoria)
    .reduce((total, i) => total + i.cantidad, 0);

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

  // La barra fija de compra aparece cuando el bloque de botones sale de
  // pantalla, y se va cuando vuelve: nunca hay dos botones a la vista.
  const bloqueCompra = useRef<HTMLDivElement>(null);
  const [compraEnPantalla, setCompraEnPantalla] = useState(true);

  useEffect(() => {
    const nodo = bloqueCompra.current;
    if (!nodo || typeof IntersectionObserver === "undefined") return;

    const observador = new IntersectionObserver(
      (entradas) => setCompraEnPantalla(entradas.some((e) => e.isIntersecting)),
      { threshold: 0.2 }
    );

    observador.observe(nodo);
    return () => observador.disconnect();
  }, []);

  // El estilo del gesto se combina con el del marco; el resto son manejadores.
  const { style: estiloDeslizar, ...gestos } = useDeslizar({
    alSiguiente: () => pasarMedio(1),
    alAnterior: () => pasarMedio(-1),
  });

  // Al cambiar de color NO se toca la URL. Se probó sincronizarla con
  // `history.replaceState` y el cambio de pathname remonta la página entera
  // (la transición de página se reinicia por ruta), lo que devolvía la ficha
  // al color inicial y mandaba al carrito un color distinto del elegido.
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
    // Si este color ya está en el carrito —porque tocó "Agregar" primero— no
    // se suma otra unidad: antes llegaba al checkout con dos pares sin querer.
    if (!yaEnCarrito) {
      agregar({
        productoSlug: producto.slug,
        varianteId: variante.id,
        cantidad: 1,
      });
    }
    iniciarTransicion(() => router.push("/checkout"));
  }

  const cuotaTexto =
    cuotas && cuotas > 1
      ? `${cuotas} cuotas sin interés de ${formatearPrecio(importeCuota(producto.precio, cuotas))}`
      : null;

  const medidas = producto.medidas
    ? [
        producto.medidas.frenteMm ? { nombre: "Frente", valor: producto.medidas.frenteMm } : null,
        producto.medidas.puenteMm ? { nombre: "Puente", valor: producto.medidas.puenteMm } : null,
        producto.medidas.patillaMm ? { nombre: "Patilla", valor: producto.medidas.patillaMm } : null,
      ].filter((m): m is { nombre: string; valor: number } => m !== null)
    : [];

  const detalles = [
    producto.material ? { nombre: "Armazón", valor: producto.material } : null,
    producto.lentes ? { nombre: "Lentes", valor: producto.lentes } : null,
  ].filter((d): d is { nombre: string; valor: string } => d !== null);

  return (
    <div className="contenedor ficha-producto">
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
                <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
                <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
          <div className="galeria__minis">
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

      {/* ---------- Datos y compra ----------
          Orden pensado para el celular: nombre, precio, color, botón; después
          lo que da confianza; después lo que da más información. */}
      <div className="pila surge surge-1 ficha-producto__datos">
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

          {cuotaTexto ? (
            <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--verde)" }}>
              {cuotaTexto}
            </span>
          ) : null}
        </div>

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
        <div ref={bloqueCompra} className="pila" style={{ gap: "0.75rem" }}>
          {variante.agotada ? (
            <button type="button" className="boton boton--bloque" disabled>
              Sin stock en este color
            </button>
          ) : (
            <>
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
            </>
          )}
        </div>

        <MensajesConfianza mensajes={confianza} variante="lista" />

        {/* El descuento por cantidad se muestra acá y no recién en el carrito:
            si la idea aparece después de decidir, ya es tarde. */}
        <EscaleraPrecios
          tramos={tramos}
          categoria={producto.categoria}
          precioLista={producto.precio}
          cantidadActual={unidadesEnCategoria}
        />

        {producto.incluye.length > 0 ? (
          <section className="pila ficha-producto__bloque">
            <h2 className="label">Incluye</h2>
            <ul className="lista-incluye">
              {producto.incluye.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        ) : null}

        {medidas.length > 0 || detalles.length > 0 ? (
          <section className="pila ficha-producto__bloque">
            <h2 className="label">Detalles</h2>
            {medidas.length > 0 ? (
              <ul className="medidas" aria-label="Medidas en milímetros">
                {medidas.map((m) => (
                  <li key={m.nombre} className="medidas__item">
                    <span className="medidas__nombre">{m.nombre}</span>
                    <span className="medidas__valor">{m.valor} mm</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {detalles.length > 0 ? (
              <dl className="detalles">
                {detalles.map((d) => (
                  <div key={d.nombre} className="detalles__fila">
                    <dt>{d.nombre}</dt>
                    <dd>{d.valor}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </section>
        ) : null}

        {producto.descripcion ? (
          <section className="pila ficha-producto__bloque">
            <h2 className="label">Descripción</h2>
            <p style={{ maxWidth: "34rem", fontSize: "0.9375rem" }}>{producto.descripcion}</p>
          </section>
        ) : null}
      </div>

      <CtaFija
        visible={!compraEnPantalla && !variante.agotada}
        nombre={`${producto.nombre} · ${variante.color}`}
        precio={formatearPrecio(producto.precio)}
        detalle={cuotaTexto}
        ocupado={enTransicion}
        alComprar={comprarAhora}
      />

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
