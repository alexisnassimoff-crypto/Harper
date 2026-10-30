import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import type { ColorDeADos } from "@/components/HojaPack";
import IngresoSocio from "@/components/socios/IngresoSocio";
import PanelSocio from "@/components/socios/PanelSocio";
import { getProductos } from "@/lib/catalogo";
import { getConfig } from "@/lib/config";
import { canjePendiente, socioDeLaSesion } from "@/lib/socios-cuenta";
import { COOKIE_SOCIO } from "@/lib/socios-sesion";
import { TEXTOS } from "@/lib/textos";
import { fotosDeVitrina } from "@/lib/vitrina";
import { enlaceWhatsApp } from "@/lib/whatsapp";
import { numeroDeSocio } from "@/lib/socios-alta";

/**
 * El área del socio (Ale, 30/10/2026): entra con su mail y el código que le
 * llega, ve su membresía y canjea su segundo par. Lo que puede hacer lo decide
 * la fila de la tabla Socios, leída de nuevo en cada visita.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: TEXTOS.socios.cuenta.titulo,
  robots: { index: false, follow: false },
};

const { cuenta: T } = TEXTOS.socios;

/** "2027-10-30" → "30/10/2027". */
const fecha = (iso: string) => iso.split("-").reverse().join("/");

export default async function MiCuenta() {
  const valor = (await cookies()).get(COOKIE_SOCIO)?.value ?? null;
  const socio = await socioDeLaSesion(valor).catch((error) => {
    console.error("[socios] no se pudo leer la sesión:", error instanceof Error ? error.message : error);
    return null;
  });

  if (!socio) {
    return (
      <section className="contenedor seccion cuenta-socio" aria-labelledby="cuenta-titulo">
        <p className="etiqueta-mono">{TEXTOS.socios.etiqueta}</p>
        <h1 id="cuenta-titulo" className="titulo-serif">
          {T.entrarTitulo}
        </h1>
        <p className="apagado cuenta-socio__bajada">{T.entrarBajada}</p>
        <IngresoSocio />
        <p className="cuenta-socio__pie">
          {T.noSocio} <Link href="/socios">{T.verPlanes}</Link>
        </p>
      </section>
    );
  }

  const [productos, config] = await Promise.all([getProductos(), getConfig()]);
  // Para elegir el segundo par: los colores con stock de la línea de siempre.
  const colores: ColorDeADos[] = productos
    .filter((p) => p.categoria === "Anteojos")
    .flatMap((p) =>
      p.variantes.map((v) => ({
        id: v.id,
        sku: v.sku,
        modeloSlug: p.slug,
        modeloNombre: p.nombre,
        precio: p.precio,
        color: v.color,
        foto: fotosDeVitrina(v, p.fotoPrincipal ?? "").adentro,
        agotada: v.agotada,
      }))
    );
  const numero = numeroDeSocio(socio.numero);

  return (
    <PanelSocio
      socio={{
        numero,
        nombre: socio.nombre.split(" ")[0] ?? "",
        plan: socio.plan,
        vence: fecha(socio.vence),
        canjePendiente: canjePendiente(socio),
        segundoParPedido: socio.segundoParPedido,
        reposicionDisponible: socio.reposicion !== "Usada",
      }}
      colores={colores}
      reposicion={enlaceWhatsApp(config.whatsapp, `Hola, Harper. Soy socio ${numero} y necesito la reposición de mis anteojos.`)}
    />
  );
}
