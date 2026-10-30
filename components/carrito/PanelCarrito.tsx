"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import CodigoDescuento from "@/components/checkout/CodigoDescuento";
import OfertaCantidad from "@/components/producto/OfertaCantidad";
import { buscarCupon } from "@/lib/cupones";
import { envioEnElCarrito } from "@/lib/envio-gratis";
import { precio as formatearPrecio } from "@/lib/formato";
import { desglosar } from "@/lib/resumen";
import type { Categoria } from "@/lib/tipos";
import { useCarrito } from "./CarritoContexto";
import LineaCarrito from "./LineaCarrito";
import { useCarritoResuelto } from "./useCarritoResuelto";
import { Fila } from "./VistaCarrito";

/**
 * El carrito como panel lateral, en escritorio: se abre al agregar un
 * producto o aplicar el cupón (y desde el ícono del carrito), con los
 * productos, el resumen y «Finalizar compra».
 *
 * Vive en el layout, fuera de la página: se cierra solo al navegar. Su
 * contenido se monta únicamente mientras está abierto, así no suma consultas
 * de precios mientras nadie lo mira.
 */
export default function PanelCarrito() {
  const { panelAbierto, cerrarPanel } = useCarrito();
  const ruta = usePathname();

  useEffect(() => {
    cerrarPanel();
  }, [ruta, cerrarPanel]);

  // Solo se abre después de un toque del comprador: para entonces ya hay
  // `document`. Va por portal: adentro de la página, la animación de entrada
  // (transform) le cambiaría la referencia a `position: fixed`.
  if (!panelAbierto) return null;
  return createPortal(<Contenido alCerrar={cerrarPanel} />, document.body);
}

function Contenido({ alCerrar }: { alCerrar: () => void }) {
  const { cupon, unidades } = useCarrito();
  const { datos, cargando, actualizando, error, recargar } = useCarritoResuelto();
  const idTitulo = useId();
  const caja = useRef<HTMLDivElement>(null);
  const cerrar = useRef<HTMLButtonElement>(null);

  // Modal mientras está abierto: sin scroll de fondo (compensando la barra,
  // para que la página no salte), con el foco adentro y Escape para cerrar.
  // Al cerrarse, el foco vuelve a donde estaba (el botón que lo abrió).
  useEffect(() => {
    const activo = document.activeElement;
    const previo = activo instanceof HTMLElement && activo !== document.body ? activo : null;
    const cuerpo = document.body;
    const antes = { overflow: cuerpo.style.overflow, padding: cuerpo.style.paddingRight };
    const barra = window.innerWidth - document.documentElement.clientWidth;
    cuerpo.style.overflow = "hidden";
    if (barra > 0) cuerpo.style.paddingRight = `${barra}px`;
    cuerpo.dataset.carritoLateral = "";
    cerrar.current?.focus();

    function alTeclado(evento: KeyboardEvent) {
      if (evento.key === "Escape") {
        evento.preventDefault();
        alCerrar();
        return;
      }
      if (evento.key !== "Tab" || !caja.current) return;
      const enfocables = [
        ...caja.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ),
      ].filter((n) => n.offsetParent !== null);
      if (enfocables.length === 0) return;
      const primero = enfocables[0];
      const ultimo = enfocables[enfocables.length - 1];
      const actual = document.activeElement;
      if (evento.shiftKey && (actual === primero || !caja.current.contains(actual))) {
        evento.preventDefault();
        ultimo.focus();
      } else if (!evento.shiftKey && (actual === ultimo || !caja.current.contains(actual))) {
        evento.preventDefault();
        primero.focus();
      }
    }
    window.addEventListener("keydown", alTeclado);

    return () => {
      window.removeEventListener("keydown", alTeclado);
      cuerpo.style.overflow = antes.overflow;
      cuerpo.style.paddingRight = antes.padding;
      delete cuerpo.dataset.carritoLateral;
      if (previo?.isConnected) previo.focus({ preventScroll: true });
    };
  }, [alCerrar]);

  // Si lo que tenía el foco desaparece (quitó un producto o el cupón), el
  // foco vuelve al panel: en un diálogo modal nunca queda afuera.
  useEffect(() => {
    const activo = document.activeElement;
    if (caja.current && (!activo || activo === document.body)) caja.current.focus({ preventScroll: true });
  });

  const hayProductos = Boolean(datos && datos.items.length > 0);

  return (
    <div className="carrito-lateral">
      <div className="carrito-lateral__fondo" onClick={alCerrar} aria-hidden="true" />
      {/* Cualquier enlace de adentro (un producto, Finalizar compra) cierra el
          panel: si lleva a la misma página, la ruta no cambia y quedaría abierto. */}
      <div
        ref={caja}
        className="carrito-lateral__caja"
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        tabIndex={-1}
        onClick={(evento) => {
          if ((evento.target as Element).closest("a[href]")) alCerrar();
        }}
      >
        <div className="carrito-lateral__cabecera">
          <h2 id={idTitulo} className="label">
            Tu carrito{unidades > 0 ? ` · ${unidades} ${unidades === 1 ? "producto" : "productos"}` : ""}
          </h2>
          <button ref={cerrar} type="button" className="carrito-lateral__cerrar" onClick={alCerrar} aria-label="Cerrar el carrito">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="carrito-lateral__cuerpo">
          {cargando && !datos ? (
            <p className="apagado">Cargando el carrito…</p>
          ) : error && !datos ? (
            <div className="pila" style={{ gap: "1rem", alignItems: "flex-start" }}>
              <p className="apagado">No pudimos cargar los precios de tu carrito.</p>
              <button type="button" className="boton boton--fantasma" onClick={recargar}>
                Reintentar
              </button>
            </div>
          ) : !hayProductos ? (
            <div className="pila" style={{ gap: "1.5rem", alignItems: "flex-start" }}>
              <p className="apagado">Tu carrito está vacío.</p>
              <button type="button" className="boton" onClick={alCerrar}>
                Seguir comprando
              </button>
            </div>
          ) : (
            <>
              {error ? (
                <p className="aviso-carrito" role="status" style={{ marginBottom: "1rem" }}>
                  No pudimos actualizar los precios. Mostramos lo último que vimos.{" "}
                  <button type="button" className="enlace-verde aviso-carrito__accion" onClick={recargar}>
                    Reintentar
                  </button>
                </p>
              ) : null}
              <ul
                className="pila"
                style={{ gap: "1.25rem", listStyle: "none", margin: 0, padding: 0 }}
                aria-busy={actualizando}
                data-actualizando={actualizando || undefined}
              >
                {datos!.items.map((item) => (
                  <LineaCarrito key={item.varianteId} item={item} actualizando={actualizando} compacta />
                ))}
              </ul>
            </>
          )}
        </div>

        {hayProductos && datos ? (
          <Resumen datos={datos} actualizando={actualizando} conCupon={Boolean(cupon)} alSeguir={alCerrar} />
        ) : null}
      </div>
    </div>
  );
}

/**
 * La cuenta del carrito, como en /carrito. El envío se cotiza en el checkout
 * con la dirección (Envia): acá no se anuncia un precio que puede cambiar,
 * salvo cuando ya es gratis (en todo el país, o en AMBA).
 */
function Resumen({
  datos,
  actualizando,
  conCupon,
  alSeguir,
}: {
  datos: NonNullable<ReturnType<typeof useCarritoResuelto>["datos"]>;
  actualizando: boolean;
  conCupon: boolean;
  alSeguir: () => void;
}) {
  const resumen = desglosar(datos);
  // El envío gratis se mide sin el cupón, como en el servidor, y depende de
  // la zona: acá todavía no hay dirección.
  const envio = envioEnElCarrito(datos.subtotalSinCupon ?? datos.subtotal, resumen.envio, {
    amba: datos.envioGratisAmbaDesde ?? 0,
    nacional: datos.envioGratisDesde,
  });

  const porCategoria = new Map<Categoria, { unidades: number; precioLista: number; descuento: number }>();
  for (const item of datos.items) {
    const actual = porCategoria.get(item.categoria) ?? { unidades: 0, precioLista: item.precioLista, descuento: 0 };
    actual.unidades += item.cantidad;
    actual.precioLista = Math.min(actual.precioLista, item.precioLista);
    actual.descuento = Math.max(actual.descuento, item.descuento);
    porCategoria.set(item.categoria, actual);
  }

  return (
    <div className="carrito-lateral__pie" aria-busy={actualizando} data-actualizando={actualizando || undefined}>
      {conCupon ? <CodigoDescuento estado={datos.cupon ?? null} /> : null}

      <Fila etiqueta="Subtotal" valor={formatearPrecio(resumen.lista)} />
      {resumen.descuento > 0 ? (
        <div className="fila" style={{ color: "var(--verde)" }}>
          <span>{datos.cupon?.estado === "aplicado" ? `Cupón ${datos.cupon.codigo}` : "Descuento"}</span>
          <span>−{formatearPrecio(resumen.descuento)}</span>
        </div>
      ) : null}
      <Fila etiqueta="Envío a domicilio" valor={envio.valor} />

      {[...porCategoria.entries()].map(([categoria, info]) => (
        <OfertaCantidad
          key={categoria}
          tramos={datos.tramos}
          categoria={categoria}
          precioLista={info.precioLista}
          cantidadEnCarrito={info.unidades}
          descuentoAplicado={info.descuento}
          variante="carrito"
          cuponPorcentaje={datos.cupon?.estado === "aplicado" ? (buscarCupon(datos.cupon.codigo)?.porcentaje ?? 0) : 0}
        />
      ))}

      {envio.nota ? (
        <p className="apagado" style={{ fontSize: "0.8125rem" }}>
          {envio.nota}
        </p>
      ) : null}

      <div className="fila fila--total">
        <span>{envio.total}</span>
        <strong style={{ fontWeight: 500 }}>{formatearPrecio(resumen.total - resumen.envio)}</strong>
      </div>

      <Link href="/checkout" className="boton boton--bloque">
        Finalizar compra
      </Link>
      <button type="button" className="enlace-suave carrito-lateral__seguir" onClick={alSeguir}>
        Seguir comprando
      </button>
    </div>
  );
}
