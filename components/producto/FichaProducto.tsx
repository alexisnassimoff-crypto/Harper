"use client";

import MensajesConfianza from "@/components/MensajesConfianza";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useCarrito } from "@/components/carrito/CarritoContexto";
import { useCarritoResuelto } from "@/components/carrito/useCarritoResuelto";
import { useAvisoCookiesAbierto } from "@/components/AvisoCookies";
import CtaFija from "./CtaFija";
import Galeria from "./Galeria";
import ConsultaGraduados from "./ConsultaGraduados";
import CuponBienvenida from "./CuponBienvenida";
import { buscarCupon } from "@/lib/cupones";
import OfertaCantidad from "./OfertaCantidad";
import { caracteristicasDe } from "@/lib/caracteristicas";
import type { Confianza } from "@/lib/confianza";
import { NOMBRE_MARCAS, type CuotasVerificadas } from "@/lib/cuotas";
import { precio as formatearPrecio, precioConCentavos } from "@/lib/formato";
import { trackAgregarAlCarrito } from "@/lib/pixel";
import { indiceVarianteInicial } from "@/lib/variantes";
import type { Producto } from "@/lib/tipos";
import type { Tramo } from "@/lib/descuentos";

export default function FichaProducto({
  producto,
  tramos = [],
  varianteInicial,
  confianza = [],
  cuotas = null,
  precioSinImpuestos = null,
  whatsapp = null,
}: {
  producto: Producto;
  tramos?: Tramo[];
  /** Índice del color con el que abre. Lo decide el servidor según la URL. */
  varianteInicial?: number;
  confianza?: Confianza[];
  /** Cuotas sin interés confirmadas por Mercado Pago para este precio, o null. */
  cuotas?: CuotasVerificadas | null;
  /** El neto para la leyenda de la Res. SIyC 4/2025; null si no hay dato. */
  precioSinImpuestos?: number | null;
  /** WhatsApp de la tienda, para la consulta por cristales graduados. */
  whatsapp?: string | null;
}) {
  const router = useRouter();
  const { items, agregar, cupon } = useCarrito();
  // Cuántas unidades de cada color de este producto hay en el carrito.
  const enCarrito = new Map<string, number>();
  for (const item of items) enCarrito.set(item.varianteId, (enCarrito.get(item.varianteId) ?? 0) + item.cantidad);
  const [enTransicion, iniciarTransicion] = useTransition();

  const [indiceVariante, setIndiceVariante] = useState(
    () => varianteInicial ?? indiceVarianteInicial(producto)
  );
  const [agregado, setAgregado] = useState(false);
  // Sube con cada toque en un color: la galería vuelve a la primera foto.
  const [toquesDeColor, setToquesDeColor] = useState(0);

  const variante = producto.variantes[indiceVariante];
  const yaEnCarrito = items.some((i) => i.varianteId === variante.id);

  // Lo que ya hay en el carrito de esta categoría: la oferta pasa de "llevá
  // 2" a "sumá 1 más" y a "ya lo tenés" a medida que el visitante agrega.
  const { datos: carritoResuelto } = useCarritoResuelto();
  const enCategoria = (carritoResuelto?.items ?? []).filter((i) => i.categoria === producto.categoria);
  const unidadesEnCategoria = enCategoria.reduce((total, i) => total + i.cantidad, 0);
  // Lo que el servidor de verdad aplicó: "ya tenés el descuento" sale de acá.
  const descuentoAplicado = enCategoria.reduce((max, i) => Math.max(max, i.descuento), 0);
  // Con el cupón aplicado (y salvo que el carrito ya tenga algo mejor), la
  // promoción del segundo par no se anuncia: no se suman.
  const cuponPorcentaje =
    cupon && carritoResuelto?.cupon?.estado !== "no-conviene" ? (buscarCupon(cupon)?.porcentaje ?? 0) : 0;

  const fotos = useMemo(
    () => (variante.fotos.length > 0 ? variante.fotos : []),
    [variante]
  );

  // La barra fija de compra aparece cuando el bloque de botones sale de
  // pantalla, y se va cuando vuelve: nunca hay dos botones a la vista.
  const bloqueCompra = useRef<HTMLDivElement>(null);
  const [compraEnPantalla, setCompraEnPantalla] = useState(true);
  // Mientras el aviso de cookies tapa la parte de abajo, la barra se queda:
  // el botón real podría estar justo debajo del aviso.
  const avisoCookies = useAvisoCookiesAbierto();

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

  // Al cambiar de color NO se toca la URL. Se probó sincronizarla con
  // `history.replaceState` y el cambio de pathname remonta la página entera
  // (la transición de página se reinicia por ruta), lo que devolvía la ficha
  // al color inicial y mandaba al carrito un color distinto del elegido.
  function elegirColor(indice: number) {
    setIndiceVariante(indice);
    setToquesDeColor((n) => n + 1);
    setAgregado(false);
  }

  // Una sola función suma al carrito y avisa al píxel: así AddToCart se
  // dispara exactamente cuando el producto entra, desde cualquier botón.
  function sumarAlCarrito() {
    agregar({
      productoSlug: producto.slug,
      varianteId: variante.id,
      cantidad: 1,
    });
    trackAgregarAlCarrito({ sku: variante.sku, nombre: producto.nombre, precio: producto.precio });
  }

  function agregarAlCarrito() {
    sumarAlCarrito();
    setAgregado(true);
  }

  function comprarAhora() {
    // Si este color ya está en el carrito —porque tocó "Agregar" primero— no
    // se suma otra unidad: antes llegaba al checkout con dos pares sin querer.
    if (!yaEnCarrito) sumarAlCarrito();
    iniciarTransicion(() => router.push("/checkout"));
  }

  // Res. SIyC 4/2025, art. 2 inc. d: cantidad y monto de cada cuota (el de
  // Mercado Pago, con centavos), precio de contado y CFTEA.
  const cuotaTexto = cuotas
    ? `${cuotas.cuotas} cuotas sin interés de ${precioConCentavos(cuotas.montoCuota)}`
    : null;
  const cuotaCondiciones = cuotas
    ? `Precio de contado ${formatearPrecio(producto.precio)} · CFTEA ${cuotas.cftea} · ${NOMBRE_MARCAS}`
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

  // Qué se compra, dicho arriba: solo en los modelos con las características
  // confirmadas (lib/caracteristicas.ts).
  const caracteristicas = caracteristicasDe(producto);

  return (
    <div className="contenedor ficha-producto">
      {/* ---------- Galería ---------- */}
      <div className="pila surge" style={{ gap: "0.75rem" }}>
        <Galeria
          fotos={fotos}
          videos={producto.videos}
          poster={producto.fotoPrincipal}
          alt={`${producto.nombre} — ${variante.color}`}
          reinicio={toquesDeColor}
        />
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

          {precioSinImpuestos !== null ? (
            <small className="precio-sin-impuestos">
              Precio sin impuestos nacionales: {precioConCentavos(precioSinImpuestos)}
            </small>
          ) : null}

          {cuotaTexto ? (
            <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--verde)" }}>
              {cuotaTexto}
            </span>
          ) : null}
          {cuotaCondiciones ? <span className="cuotas-condiciones">{cuotaCondiciones}</span> : null}
        </div>

        {/* El beneficio de primera compra, junto al precio y antes de elegir:
            se ve sin buscarlo y se aplica con un toque. */}
        <CuponBienvenida precio={producto.precio} estadoServidor={carritoResuelto?.cupon ?? null} />

        {/* Qué se está comprando, justo debajo del precio y antes de elegir. */}
        {caracteristicas ? (
          <ul className="caracteristicas" aria-label="Características">
            {caracteristicas.lista.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        ) : null}

        {/* Selector de color. Arriba de cada color, cuántos de ese color hay
            en el carrito: se ve de un vistazo qué colores ya se pidieron. */}
        <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
          <legend className="label" style={{ marginBottom: "0.75rem" }}>
            Color: {variante.color}
          </legend>

          <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", paddingTop: "0.35rem" }}>
            {producto.variantes.map((v, i) => {
              const cantidad = enCarrito.get(v.id) ?? 0;
              const enElCarrito = cantidad > 0 ? `, ${cantidad} en el carrito` : "";
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => elegirColor(i)}
                  title={`${v.agotada ? `${v.color} — agotado` : v.color}${enElCarrito}`}
                  aria-label={`${v.agotada ? `${v.color}, agotado` : v.color}${enElCarrito}`}
                  aria-pressed={i === indiceVariante}
                  className="swatch"
                  style={{ background: v.colorHex, opacity: v.agotada ? 0.4 : 1 }}
                >
                  {cantidad > 0 ? (
                    <span className="swatch__cantidad" aria-hidden="true">
                      {cantidad}
                    </span>
                  ) : null}
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
              );
            })}
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

        {/* Solo en los modelos cuyo armazón admite cristales graduados
            (confirmados en lib/caracteristicas.ts): una consulta, no una venta. */}
        {caracteristicas ? <ConsultaGraduados modelo={producto.nombre} whatsapp={whatsapp} /> : null}

        <MensajesConfianza mensajes={confianza} variante="lista" />

        {/* La promoción del segundo par, en una línea y solo para anteojos.
            Sin tablas de tramos: los mayores se aplican en el servidor, pero
            no se publicitan. */}
        <OfertaCantidad
          tramos={tramos}
          categoria={producto.categoria}
          precioLista={producto.precio}
          cantidadEnCarrito={unidadesEnCategoria}
          descuentoAplicado={descuentoAplicado}
          cuponPorcentaje={cuponPorcentaje}
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
        visible={(!compraEnPantalla || avisoCookies) && !variante.agotada}
        nombre={`${producto.nombre} · ${variante.color}`}
        precio={formatearPrecio(producto.precio)}
        detalle={cuotas ? `${cuotas.cuotas} cuotas de ${precioConCentavos(cuotas.montoCuota)} · CFTEA ${cuotas.cftea}` : null}
        ocupado={enTransicion}
        alComprar={comprarAhora}
      />

    </div>
  );
}
