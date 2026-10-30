"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useCarrito } from "@/components/carrito/CarritoContexto";
import { trackAgregarAlCarrito } from "@/lib/pixel";
import type { ItemDePlan, Planes } from "@/lib/socios";
import { TEXTOS } from "@/lib/textos";

/**
 * En la ficha de un anteojo: hacerse socio con el par que se está mirando.
 * La membresía y este color entran juntos al carrito y se va al checkout; el
 * par va incluido (lo resuelve el servidor, lib/socios.ts).
 */
export default function SocioEnLaFicha({
  planes,
  par,
}: {
  planes: Planes;
  /** El color elegido en la ficha; null si está agotado. */
  par: { productoSlug: string; varianteId: string; sku: string; nombre: string; precio: number } | null;
}) {
  const router = useRouter();
  const { agregar } = useCarrito();
  const [yendo, setYendo] = useState(false);
  if (planes.quedan <= 0 || !par) return null;

  function hacerme(extras: ItemDePlan[]) {
    if (!par || yendo) return;
    setYendo(true);
    for (const e of [...extras, par]) {
      agregar({ productoSlug: e.productoSlug, varianteId: e.varianteId, cantidad: 1 });
      trackAgregarAlCarrito({ sku: e.sku, nombre: e.nombre, precio: e.precio });
    }
    router.push("/checkout");
  }

  return (
    <section className="socio-ficha" aria-labelledby="socio-ficha-titulo">
      <p className="etiqueta-mono">
        {TEXTOS.socios.etiqueta} · {TEXTOS.socios.cupos(planes.quedan, planes.cupos)}
      </p>
      <h2 id="socio-ficha-titulo" className="socio-ficha__titulo">
        {TEXTOS.socios.ficha.titulo}
      </h2>
      <p className="socio-ficha__texto">{TEXTOS.socios.ficha.texto}</p>
      <div className="socio-ficha__botones">
        <button type="button" className="boton boton--chico" onClick={() => hacerme([planes.socio])} disabled={yendo}>
          {TEXTOS.socios.planSocio.titulo} · {planes.socio.precioTexto}
        </button>
        {planes.aumento ? (
          <button
            type="button"
            className="boton boton--chico boton--contorno"
            onClick={() => hacerme([planes.socio, planes.aumento!])}
            disabled={yendo}
          >
            {TEXTOS.socios.planAumento.titulo} · {planes.aumento.totalTexto}
          </button>
        ) : null}
      </div>
      <Link href="/socios" className="socio-ficha__enlace">
        {TEXTOS.socios.enlace}
      </Link>
    </section>
  );
}
