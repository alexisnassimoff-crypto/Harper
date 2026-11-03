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

  if (suscriptor && !aca) {
    return (
      <aside className="suscriptor-ficha suscriptor-ficha--suscripto" aria-label={T.etiqueta}>
        <p className="suscriptor-ficha__texto">
          {T.ficha.suscripto}
          {suscriptor.saldoDisponible > 0 ? ` ${T.ficha.saldo(formatearPrecio(suscriptor.saldoDisponible))}` : ""}
        </p>
      </aside>
    );
  }

  const puntos = [
    T.tarjetas.envio.titulo,
    T.tarjetas.cashback(CASHBACK_PORCENTAJE, DIAS_PARA_USAR_CASHBACK).titulo,
    ...(cuotas ? [`${cuotas.cuotas} cuotas sin interés (${NOMBRE_MARCAS} · CFTEA ${cfteaSinCortar(cuotas.cftea)})`] : []),
  ];

  return (
    <aside className="suscriptor-ficha" aria-labelledby="suscriptor-ficha-titulo">
      <p className="etiqueta-mono">{T.etiqueta}</p>
      <p id="suscriptor-ficha-titulo" className="suscriptor-ficha__titulo">
        {T.ficha.titulo(formatearPrecio(CUPON_BIENVENIDA))}
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
          <button type="button" className="boton boton--chico" onClick={() => setAbierta(true)}>
            {T.ficha.suscribirme}
          </button>
          <Link href="/suscriptores" className="suscripcion__enlace">
            Ver los beneficios
          </Link>
        </div>
      )}
    </aside>
  );
}
