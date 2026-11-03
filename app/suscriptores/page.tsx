import type { Metadata } from "next";
import Link from "next/link";
import BeneficiosSuscriptor from "@/components/suscriptores/BeneficiosSuscriptor";
import CajaSuscripcion from "@/components/suscriptores/CajaSuscripcion";
import { getProductos } from "@/lib/catalogo";
import { esCategoriaDeAnteojos } from "@/lib/categorias";
import { cuotasDeTodosYSuscriptores } from "@/lib/cuotas-servidor";
import { precio as formatearPrecio } from "@/lib/formato";
import { CASHBACK_PORCENTAJE, CUPON_BIENVENIDA, DIAS_PARA_USAR_CASHBACK } from "@/lib/suscriptores";
import { TEXTOS } from "@/lib/textos";

/**
 * Suscriptores Harper (Ale, 03/11/2026: en lugar de la membresía paga, una
 * suscripción gratis con el mail para armar la base de compradores). Los
 * cuatro beneficios, el formulario y cómo funciona. Las reglas están en
 * lib/suscriptores.ts y las condiciones completas en /legales/suscriptores.
 * Las cuotas de suscriptor se nombran solo si Mercado Pago las confirma.
 */

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Suscriptores Harper",
  description: `Suscribite gratis con tu mail: ${formatearPrecio(CUPON_BIENVENIDA)} de descuento en tu primera compra, el ${CASHBACK_PORCENTAJE}% de vuelta como saldo y envío gratis siempre.`,
  alternates: { canonical: "/suscriptores" },
};

const T = TEXTOS.suscriptores;

export default async function Suscriptores() {
  const productos = await getProductos();
  const precios = productos.filter((p) => esCategoriaDeAnteojos(p.categoria)).map((p) => p.precio);
  const cuotas = await cuotasDeTodosYSuscriptores(precios, 3_000);

  const pasos = [
    "Te suscribís con tu mail y lo confirmás con el código que te mandamos.",
    "Comprás en harper.ar con ese mail: el cupón, el saldo y el envío gratis se aplican solos en el carrito.",
    `Con cada compra te vuelve el ${CASHBACK_PORCENTAJE}% como saldo, y a los ${DIAS_PARA_USAR_CASHBACK} días lo podés usar.`,
  ];

  return (
    <>
      <section className="suscriptores-portada" aria-labelledby="suscriptores-titulo">
        <div className="contenedor suscriptores-portada__grilla">
          <div className="suscriptores-portada__texto">
            <p className="etiqueta-mono">{T.etiqueta} · Es gratis</p>
            <h1 id="suscriptores-titulo" className="suscriptores-portada__titulo">
              {T.titulo}
            </h1>
            <p className="suscriptores-portada__bajada">{T.bajada}</p>
            <BeneficiosSuscriptor cuotas={cuotas.suscriptores} cuotasTodos={cuotas.todos?.cuotas ?? null} />
          </div>
          <div className="suscriptores-portada__form">
            <CajaSuscripcion origen="Suscriptores" />
          </div>
        </div>
      </section>

      <section className="contenedor seccion suscriptores-pasos" aria-labelledby="suscriptores-pasos-titulo">
        <h2 id="suscriptores-pasos-titulo" className="titulo-serif">
          Cómo funciona
        </h2>
        <ol className="suscriptores-pasos__lista">
          {pasos.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ol>
        <p className="suscriptores-pasos__pie">
          <Link href="/legales/suscriptores">Condiciones de Suscriptores Harper</Link>
          {" · "}
          <Link href="/suscriptores/mi-cuenta">{T.verCuenta}</Link>
        </p>
      </section>
    </>
  );
}
