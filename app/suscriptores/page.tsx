import type { Metadata } from "next";
import Link from "next/link";
import CajaSuscripcion from "@/components/suscriptores/CajaSuscripcion";
import LoQueDaLaCuenta from "@/components/suscriptores/LoQueDaLaCuenta";
import { TEXTOS } from "@/lib/textos";

/**
 * La cuenta Harper y las novedades por mail. Nació el 03/11/2026 como
 * Suscriptores Harper, una suscripción gratis con beneficios en plata.
 *
 * Ale, 18/11/2026: esos beneficios terminaron para todos (lib/suscriptores.ts).
 * La página ya no promete cupón, saldo, envío gratis ni cuotas, y por eso no
 * consulta precios ni cuotas a Mercado Pago: dice lo que queda. Con el mail
 * confirmado, Harper avisa cuando salen modelos y colores nuevos, y ese mismo
 * mail abre la cuenta (compras, favoritos, datos y direcciones). Las
 * condiciones completas están en /legales/suscriptores. La dirección de la
 * página no cambió.
 */

const T = TEXTOS.suscriptores;

export const metadata: Metadata = {
  title: T.paginaTitulo,
  description: T.paginaDescripcion,
  alternates: { canonical: "/suscriptores" },
};

export default function Suscriptores() {
  return (
    <>
      <section className="suscriptores-portada" aria-labelledby="suscriptores-titulo">
        <div className="contenedor suscriptores-portada__grilla">
          <div className="suscriptores-portada__texto">
            <p className="etiqueta-mono">{TEXTOS.inicio.suscripcion.etiqueta}</p>
            <h1 id="suscriptores-titulo" className="suscriptores-portada__titulo">
              {T.titulo}
            </h1>
            <p className="suscriptores-portada__bajada">{T.bajada}</p>
            <LoQueDaLaCuenta />
          </div>
          <div className="suscriptores-portada__form">
            <CajaSuscripcion origen="Suscriptores" />
          </div>
        </div>
      </section>

      <section className="contenedor seccion suscriptores-pasos" aria-labelledby="suscriptores-pasos-titulo">
        <h2 id="suscriptores-pasos-titulo" className="titulo-serif">
          {T.pasosTitulo}
        </h2>
        <ol className="suscriptores-pasos__lista">
          {T.pasos.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ol>
        <p className="suscriptores-pasos__pie">
          <Link href="/legales/suscriptores">{T.condicionesCuenta}</Link>
          {" · "}
          <Link href="/suscriptores/mi-cuenta">{T.verCuenta}</Link>
        </p>
      </section>
    </>
  );
}
