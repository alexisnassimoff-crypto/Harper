"use client";

import Link from "next/link";
import { useState } from "react";
import { cfteaSinCortar, NOMBRE_MARCAS, type CuotasVerificadas } from "@/lib/cuotas";
import { precio as formatearPrecio } from "@/lib/formato";
import { CASHBACK_PORCENTAJE, CUPON_BIENVENIDA, DIAS_PARA_USAR_CASHBACK } from "@/lib/suscriptores";
import { TEXTOS } from "@/lib/textos";
import FormularioSuscripcion from "./FormularioSuscripcion";
import { useSuscriptor } from "./useSuscriptor";

const T = TEXTOS.suscriptores;

/**
 * Suscriptores Harper en la ficha (Ale, 03/11/2026), donde estaba la tarjeta
 * de socios: una caja chica con los beneficios y el formulario a un toque. A
 * quien ya es suscriptor en este navegador se le dice que sus beneficios se
 * aplican solos (y cuánto saldo tiene). Las cuotas, solo confirmadas.
 */
export default function SuscriptoresEnLaFicha({ cuotas }: { cuotas: CuotasVerificadas | null }) {
  const { suscriptor } = useSuscriptor();
  const [abierta, setAbierta] = useState(false);
  const [aca, setAca] = useState(false);

  if (suscriptor && suscriptor.activo !== false && !aca) {
    return (
      <aside className="suscriptor-ficha suscriptor-ficha--suscripto" aria-label={T.etiqueta}>
        <p className="suscriptor-ficha__texto">
          {T.ficha.suscripto}
          {suscriptor.saldoDisponible > 0 ? ` ${T.ficha.saldo(formatearPrecio(suscriptor.saldoDisponible))}` : ""}
        </p>
      </aside>
    );
  }

  // La misma voz que la portada (Ale, 05/11/2026): «Ser parte tiene sus
  // ventajas.», y los beneficios a la vista, la bienvenida primero.
  const puntos = [
    T.tarjetas.cupon(formatearPrecio(CUPON_BIENVENIDA)).titulo,
    T.tarjetas.envio.titulo,
    T.tarjetas.cashback(CASHBACK_PORCENTAJE, DIAS_PARA_USAR_CASHBACK).titulo,
    ...(cuotas ? [`${cuotas.cuotas} cuotas sin interés (${NOMBRE_MARCAS} · CFTEA ${cfteaSinCortar(cuotas.cftea)})`] : []),
  ];

  return (
    <aside className="suscriptor-ficha" aria-labelledby="suscriptor-ficha-titulo">
      <p className="etiqueta-mono">{T.etiqueta}</p>
      <p id="suscriptor-ficha-titulo" className="suscriptor-ficha__titulo">
        {TEXTOS.inicio.suscripcion.titulo}
      </p>
      <ul className="suscriptor-ficha__puntos">
        {puntos.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
      {abierta ? (
        <FormularioSuscripcion origen="Ficha" conNombre={false} alListo={() => setAca(true)} />
      ) : (
        <div className="suscriptor-ficha__acciones">
          {/* De contorno: en la ficha, el botón lleno es solo el de comprar (Ale, 08/11/2026). */}
          <button type="button" className="boton boton--chico boton--fantasma" onClick={() => setAbierta(true)}>
            {TEXTOS.inicio.suscripcion.boton}
          </button>
          <Link href="/legales/suscriptores" className="suscripcion__enlace">
            {TEXTOS.inicio.suscripcion.condiciones}
          </Link>
        </div>
      )}
    </aside>
  );
}
