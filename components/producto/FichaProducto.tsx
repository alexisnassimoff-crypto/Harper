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
import { buscarCupon, HAY_CUPONES } from "@/lib/cupones";
import OfertaCantidad from "./OfertaCantidad";
import OpcionesPares, { type OpcionPares } from "./OpcionesPares";
import HojaPack, { type ColorDeADos, type HojaPackControl } from "@/components/HojaPack";
import { caracteristicasDe } from "@/lib/caracteristicas";
import { parrafosDe } from "@/lib/descripcion";
import type { Confianza } from "@/lib/confianza";
import { NOMBRE_MARCAS, type CuotasVerificadas } from "@/lib/cuotas";
import { precio as formatearPrecio, precioConCentavos } from "@/lib/formato";
import { trackAgregarAlCarrito } from "@/lib/pixel";
import { fotosDeGaleria } from "@/lib/galeria";
import { indiceVarianteInicial } from "@/lib/variantes";
import type { Producto } from "@/lib/tipos";
import type { Tramo } from "@/lib/descuentos";
import Estrellas, { formatearPuntaje } from "@/components/portada/Estrellas";

export default function FichaProducto({
  producto,
  tramos = [],
  varianteInicial,
  confianza = [],
  cuotas = null,
  precioSinImpuestos = null,
  whatsapp = null,
  calificacion = null,
  pares = null,
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
  /** El promedio y la cantidad de opiniones de todos los productos Harper; null si no hay. */
  calificacion?: { promedio: number; total: number } | null;
  /**
   * «Llevá 3, pagá 2 · Llevá 5, pagá 3»: las opciones y los colores de todos
   * los anteojos para armar el pack. Null si la categoría no tiene escala.
   */
  pares?: { opciones: OpcionPares[]; colores: ColorDeADos[]; totales: Record<number, string> } | null;
}) {
  const router = useRouter();
  const { items, agregar, cupon, abrirPanel } = useCarrito();
  // Cuántas unidades de cada color de este producto hay en el carrito.
  const enCarrito = new Map<string, number>();
  for (const item of items) enCarrito.set(item.varianteId, (enCarrito.get(item.varianteId) ?? 0) + item.cantidad);
  const [enTransicion, iniciarTransicion] = useTransition();

  const [indiceVariante, setIndiceVariante] = useState(
    () => varianteInicial ?? indiceVarianteInicial(producto)
  );
  const [agregado, setAgregado] = useState(false);
  // Abre con el primer pack elegido, como las tiendas de un solo producto;
  // 1 par queda a un toque.
  const [paresElegidos, setParesElegidos] = useState(() => pares?.opciones.find((o) => o.cantidad > 1)?.cantidad ?? 1);
  const hoja = useRef<HojaPackControl>(null);
  const conPack = Boolean(pares) && paresElegidos > 1;
  const opcionElegida = pares?.opciones.find((o) => o.cantidad === paresElegidos) ?? null;
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

  // La foto de portada del color (al sol y adentro) va primera.
  const fotos = useMemo(() => fotosDeGaleria(variante), [variante]);

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
    // En escritorio, el carrito se abre al costado con lo que lleva.
    abrirPanel();
  }

  // El pack arranca con este color y se completa en la hoja.
  function armarPack() {
    hoja.current?.abrir(paresElegidos, variante.agotada ? {} : { [variante.id]: 1 });
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
  // Primero el anteojo mismo, y después lo que viene con él (Ale, 30/10/2026).
  const incluye = caracteristicas ? [caracteristicas.incluido, ...producto.incluye] : producto.incluye;
  const parrafos = parrafosDe(producto.descripcion);

  // Selector de color. Arriba de cada color, cuántos de ese color hay en el
  // carrito: se ve de un vistazo qué colores ya se pidieron.
  // Sale dos veces y el CSS muestra uno solo: en el celular, pegado a la foto
  // (al tocar un color se ve cómo cambia sin subir); en escritorio, en la
  // columna de los datos, después del precio. Junto a la foto, el nombre del
  // color va al lado de los círculos (como en la portada) para que entren
  // arriba de la barra de compra; la leyenda queda para los lectores.
  const selectorDeColor = (donde: "foto" | "datos") => (
    <fieldset className={`ficha-producto__colores ficha-producto__colores--${donde}`}>
      <legend className={donde === "foto" ? "solo-lectores" : "label"}>Color: {variante.color}</legend>

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
                <span className="swatch__agotado" aria-hidden="true">
                  ⁄
                </span>
              ) : null}
            </button>
          );
        })}
        {donde === "foto" ? (
          <span className="ficha-producto__color-elegido" aria-hidden="true">
            {variante.color}
          </span>
        ) : null}
      </div>
    </fieldset>
  );

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
        {selectorDeColor("foto")}
      </div>

      {/* ---------- Datos y compra ----------
          Orden pensado para el celular: el cupón; nombre, precio, color,
          botón; después lo que da confianza; después lo que da más
          información. */}
      <div className="pila surge surge-1 ficha-producto__datos">
        {/* El beneficio de primera compra, arriba de todo (Ale, 30/10/2026):
            se ve sin buscarlo, se aplica con un toque y no se mete entre el
            modelo, el precio, el color y las características. */}
        {HAY_CUPONES ? <CuponBienvenida precio={producto.precio} estadoServidor={carritoResuelto?.cupon ?? null} /> : null}

        <div className="pila" style={{ gap: "0.6rem" }}>
          {calificacion ? (
            <a href="#opiniones" className="calificacion">
              <Estrellas puntaje={calificacion.promedio} />
              <span>
                {formatearPuntaje(calificacion.promedio)} · {calificacion.total.toLocaleString("es-AR")}{" "}
                {calificacion.total === 1 ? "opinión" : "opiniones"} de clientes Harper
              </span>
            </a>
          ) : null}
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

        {/* Qué se está comprando, justo debajo del precio y antes de elegir. */}
        {caracteristicas ? (
          <ul className="caracteristicas" aria-label="Características">
            {caracteristicas.lista.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        ) : null}

        {selectorDeColor("datos")}

        {pares ? <OpcionesPares opciones={pares.opciones} elegida={paresElegidos} alElegir={setParesElegidos} /> : null}

        {/* Compra */}
        <div ref={bloqueCompra} className="pila" style={{ gap: "0.75rem" }}>
          {conPack ? (
            // Con un pack elegido, el botón abre la hoja para completar los pares
            // (este color ya va adentro): se pueden mezclar modelos y colores.
            <button type="button" className="boton boton--bloque" onClick={armarPack}>
              Elegir mis {paresElegidos} pares
            </button>
          ) : variante.agotada ? (
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

        {/* Sin escala, la promoción del segundo par en una línea (solo
            anteojos); con la escala, las opciones de arriba ya la cuentan. */}
        {pares ? null : (
          <OfertaCantidad
            tramos={tramos}
            categoria={producto.categoria}
            precioLista={producto.precio}
            cantidadEnCarrito={unidadesEnCategoria}
            descuentoAplicado={descuentoAplicado}
            cuponPorcentaje={cuponPorcentaje}
          />
        )}

        {incluye.length > 0 ? (
          <section className="pila ficha-producto__bloque">
            <h2 className="label">Incluye</h2>
            <ul className="lista-incluye">
              {incluye.map((item) => (
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

        {parrafos.length > 0 ? (
          <section className="pila ficha-producto__bloque">
            <h2 className="label">Descripción</h2>
            <div className="descripcion">
              {parrafos.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          </section>
        ) : null}
      </div>

      <CtaFija
        visible={(!compraEnPantalla || avisoCookies) && (conPack || !variante.agotada)}
        nombre={conPack && opcionElegida ? opcionElegida.titulo : `${producto.nombre} · ${variante.color}`}
        precio={conPack && opcionElegida ? opcionElegida.total : formatearPrecio(producto.precio)}
        detalle={
          conPack
            ? (opcionElegida?.cuota ?? null)
            : cuotas
              ? `${cuotas.cuotas} cuotas de ${precioConCentavos(cuotas.montoCuota)} · CFTEA ${cuotas.cftea}`
              : null
        }
        ocupado={enTransicion}
        alComprar={conPack ? armarPack : comprarAhora}
        textoBoton={conPack ? `Elegir mis ${paresElegidos}` : "Comprar ahora"}
      />

      {pares ? <HojaPack ref={hoja} colores={pares.colores} totales={pares.totales} /> : null}

    </div>
  );
}
