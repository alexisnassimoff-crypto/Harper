import type { Metadata } from "next";
import { Archivo_Narrow, Roboto_Mono } from "next/font/google";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import WhatsApp from "@/components/WhatsApp";
import { ProveedorCarrito } from "@/components/carrito/CarritoContexto";
import TransicionDePagina from "@/components/TransicionDePagina";
import MetaPixel from "@/components/MetaPixel";
import Medicion from "@/components/Medicion";
import CapturaOrigen from "@/components/CapturaOrigen";
import { getConfig } from "@/lib/config";
import { DESCRIPCION_SITIO, TITULO_SITIO } from "@/lib/portada";
import "./globals.css";
import AvisoCookies from "@/components/AvisoCookies";
import PanelCarrito from "@/components/carrito/PanelCarrito";
import { getProductos } from "@/lib/catalogo";
import { categoriasConProductos, esCategoriaDeAnteojos } from "@/lib/categorias";
import { anunciosDelHeader } from "@/lib/anuncios";
import { escalaDe, getTramos } from "@/lib/descuentos";
import { cuotasDeTodosYSuscriptores } from "@/lib/cuotas-servidor";

// La tipografía, definitiva (Ale, 05/11/2026): solo dos en toda la web, las
// dos de Google Fonts (gratis y servidas desde harper.ar por next/font).
// - Archivo Narrow Bold para los títulos, los nombres de los modelos y los
//   botones: angosta y en mayúsculas, como la referencia de D.Franklin.
// - Roboto Mono para todo lo demás (textos, descripciones, mensajes, precios y
//   etiquetas), como la de MOSCOT.
const texto = Roboto_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--fuente-texto",
});
const titulos = Archivo_Narrow({
  subsets: ["latin"],
  weight: ["700"],
  display: "swap",
  variable: "--fuente-titulos",
});

const SITIO = process.env.NEXT_PUBLIC_SITE_URL ?? "https://harper.ar";

export const metadata: Metadata = {
  metadataBase: new URL(SITIO),
  title: {
    default: TITULO_SITIO,
    template: "%s · Harper",
  },
  description: DESCRIPCION_SITIO,
  applicationName: "Harper",
  keywords: [
    "anteojos",
    "anteojos Harper",
    "comprar anteojos online",
    "estuches para anteojos",
    "paños de microfibra",
    "Harper",
    "Argentina",
  ],
  // Sin canonical acá: cada página declara el suyo. Heredar "/" hacía que
  // legales, carrito y checkout se presentaran como la portada.
  openGraph: {
    type: "website",
    locale: "es_AR",
    siteName: "Harper",
    url: SITIO,
  },
  // Sin esto X/Twitter muestra la miniatura chica y al costado; con
  // `summary_large_image` ocupa el ancho, que es para lo que están diseñadas.
  twitter: { card: "summary_large_image" },
  appleWebApp: { capable: true, title: "Harper", statusBarStyle: "default" },
  // Evita que iOS convierta en link los números que parecen teléfono.
  formatDetection: { telephone: false },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const [config, productos, tramos] = await Promise.all([getConfig(), getProductos(), getTramos()]);
  // El menú y el pie muestran solo las categorías con productos publicados:
  // las previstas (sol, Clip-On, receta) aparecen solas cuando tengan.
  const categorias = categoriasConProductos(productos).map((c) => ({ nombre: c.nombre, slug: c.slug }));
  // La barra de arriba anuncia las cuotas solo si Mercado Pago las confirma
  // para el anteojo más barato; si tarda, sale sin ellas. Las de todos (3) y
  // las de suscriptor (6), cada una confirmada aparte.
  const cuotas = await cuotasDeTodosYSuscriptores(
    productos.filter((p) => esCategoriaDeAnteojos(p.categoria)).map((p) => p.precio),
    2_000
  );

  // Identidad del negocio para Google: es de donde sale el panel de marca en
  // los resultados, y el buscador interno del sitio.
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      "@id": `${SITIO}#organizacion`,
      name: "Harper",
      legalName: config.razonSocial,
      url: SITIO,
      logo: `${SITIO}/icono-512.png`,
      image: `${SITIO}/opengraph-image.jpg`,
      description: DESCRIPCION_SITIO,
      taxID: config.cuit,
      address: {
        "@type": "PostalAddress",
        addressCountry: "AR",
        ...(config.domicilio ? { streetAddress: config.domicilio } : {}),
      },
      contactPoint: {
        "@type": "ContactPoint",
        contactType: "customer service",
        email: config.emailContacto,
        areaServed: "AR",
        availableLanguage: "Spanish",
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "@id": `${SITIO}#sitio`,
      name: "Harper",
      url: SITIO,
      inLanguage: "es-AR",
      publisher: { "@id": `${SITIO}#organizacion` },
    },
  ];

  return (
    <html lang="es" className={`${texto.variable} ${titulos.variable}`}>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {/* Sin JavaScript nadie dispara la aparición al scrollear: el
            contenido tiene que verse igual. */}
        <noscript>
          <style>{".revelar{opacity:1;transform:none}"}</style>
        </noscript>
      </head>
      <body>
        <ProveedorCarrito>
        <MetaPixel />
        <Medicion />
        <CapturaOrigen />
          <a className="saltar-al-contenido" href="#contenido">
            Saltar al contenido
          </a>
          <Header
            anuncios={anunciosDelHeader({
              banner: config.bannerTexto,
              cuotas: cuotas.todos,
              cuotasSuscriptor: cuotas.suscriptores,
              escala: escalaDe(tramos, "Anteojos"),
              suscriptores: true,
            })}
            categorias={categorias}
          />
          <main id="contenido" tabIndex={-1}>
            <TransicionDePagina>{children}</TransicionDePagina>
          </main>
          <Footer config={config} categorias={categorias} />
          <WhatsApp numero={config.whatsapp} />
          <AvisoCookies />
          <PanelCarrito />
        </ProveedorCarrito>
      </body>
    </html>
  );
}
