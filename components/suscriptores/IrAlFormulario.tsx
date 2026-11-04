"use client";

import { TEXTOS } from "@/lib/textos";
import { useSuscriptor } from "./useSuscriptor";

/**
 * «Suscribirme gratis» (Ale, 04/11/2026): en el celular, el formulario de la
 * portada queda debajo de los beneficios. Este botón lleva directo y deja el
 * cursor en el mail. Sin JavaScript es un enlace común a #suscribirme. A quien
 * ya es suscriptor no se lo muestra: la tarjeta de abajo ya se lo dice.
 */
export default function IrAlFormulario({ destino = "suscribirme" }: { destino?: string }) {
  const { suscriptor } = useSuscriptor();
  if (suscriptor && suscriptor.activo !== false) return null;

  return (
    <a
      href={`#${destino}`}
      className="boton boton--claro suscriptores-portada__cta"
      onClick={(e) => {
        const formulario = document.getElementById(destino);
        if (!formulario) return;
        e.preventDefault();
        formulario.scrollIntoView({ behavior: "smooth", block: "start" });
        // Cuando termina de bajar, el cursor en el primer campo.
        window.setTimeout(() => {
          formulario.querySelector<HTMLInputElement>("input:not([type=checkbox]):not([type=hidden])")?.focus({ preventScroll: true });
        }, 500);
      }}
    >
      {TEXTOS.suscriptores.portada.cta}
    </a>
  );
}
