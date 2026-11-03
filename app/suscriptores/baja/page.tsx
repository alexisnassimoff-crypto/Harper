import type { Metadata } from "next";
import Link from "next/link";
import BotonBaja from "@/components/suscriptores/BotonBaja";
import { leerTokenDeBaja } from "@/lib/suscriptores-sesion";
import { TEXTOS } from "@/lib/textos";

/**
 * A donde lleva «darte de baja» de los mails de Suscriptores Harper (Ale,
 * 03/11/2026). El enlace está firmado y no vence (lib/suscriptores-sesion.ts);
 * la página no da de baja sola: confirma con un botón, que llama a
 * /api/suscriptores/baja. No muestra de quién es el enlace.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Darte de baja",
  robots: { index: false, follow: false },
};

const { baja: T } = TEXTOS.suscriptores;

export default async function Baja({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams;
  const token = typeof t === "string" && leerTokenDeBaja(t) !== null ? t : null;

  return (
    <section className="contenedor seccion baja-suscriptor" aria-labelledby="baja-titulo">
      <p className="etiqueta-mono">{TEXTOS.suscriptores.etiqueta}</p>
      <h1 id="baja-titulo" className="titulo-serif">
        {T.titulo}
      </h1>
      {token ? (
        <>
          <p className="baja-suscriptor__texto">{T.texto}</p>
          <BotonBaja token={token} />
        </>
      ) : (
        <>
          <p className="baja-suscriptor__texto">{t ? T.invalido : T.sinEnlace}</p>
          <p>
            <Link href="/suscriptores/mi-cuenta" className="suscripcion__enlace">
              {TEXTOS.suscriptores.verCuenta}
            </Link>
          </p>
        </>
      )}
    </section>
  );
}
