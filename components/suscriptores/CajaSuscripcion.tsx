"use client";

import Link from "next/link";
import { useState } from "react";
import { precio as formatearPrecio } from "@/lib/formato";
import type { OrigenSuscripcion } from "@/lib/suscriptores";
import { TEXTOS } from "@/lib/textos";
import FormularioSuscripcion from "./FormularioSuscripcion";
import { useSuscriptor } from "./useSuscriptor";

/**
 * El formulario de suscripción de las páginas con cache (la portada y
 * /suscriptores): a quien ya es suscriptor en este navegador no se lo invita,
 * se le dice que ya lo es y se lo lleva a su cuenta.
 */
export default function CajaSuscripcion({
  origen,
  conNombre = true,
  encabezado = null,
}: {
  origen: OrigenSuscripcion;
  conNombre?: boolean;
  /** Un título arriba del formulario (la portada); no sale si ya es suscriptor. */
  encabezado?: { titulo: string; bajada: string } | null;
}) {
  const { suscriptor } = useSuscriptor();
  // Recién suscripto acá: el formulario muestra su propio «¡Listo!».
  const [aca, setAca] = useState(false);

  if (suscriptor && suscriptor.activo !== false && !aca) {
    return (
      <div className="suscripcion suscripcion--listo">
        <p className="suscripcion__listo">{TEXTOS.suscriptores.ficha.suscripto}</p>
        <p className="suscripcion__nota">
          {suscriptor.email}
          {suscriptor.saldoDisponible > 0 ? ` · ${TEXTOS.suscriptores.ficha.saldo(formatearPrecio(suscriptor.saldoDisponible))}` : ""}
        </p>
        <div className="suscripcion__acciones">
          <Link href="/#los-modelos" className="boton">
            {TEXTOS.suscriptores.elegir}
          </Link>
          <Link href="/suscriptores/mi-cuenta" className="suscripcion__enlace">
            {TEXTOS.suscriptores.verCuenta}
          </Link>
        </div>
      </div>
    );
  }

  const formulario = <FormularioSuscripcion origen={origen} conNombre={conNombre} alListo={() => setAca(true)} />;
  if (!encabezado || aca) return formulario;
  return (
    <>
      <div className="caja-suscripcion__encabezado">
        <h3 className="caja-suscripcion__titulo">{encabezado.titulo}</h3>
        <p className="caja-suscripcion__bajada">{encabezado.bajada}</p>
      </div>
      {formulario}
    </>
  );
}
