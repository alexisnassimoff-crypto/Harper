import type { Metadata } from "next";
import { Raleway } from "next/font/google";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import WhatsApp from "@/components/WhatsApp";
import { ProveedorCarrito } from "@/components/carrito/CarritoContexto";
import TransicionDePagina from "@/components/TransicionDePagina";
import MetaPixel from "@/components/MetaPixel";
import CapturaOrigen from "@/components/CapturaOrigen";
import { getConfig } from "@/lib/config";
import { DESCRIPCION_SITIO, TITULO_SITIO } from "@/lib/portada";
import "./globals.css";

const raleway = Raleway({
  subsets: ["latin"],
  display: "swap",
  variable: "--fuente-raleway",
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
  const config = await getConfig();

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
    <html lang="es" className={raleway.variable}>
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
        <CapturaOrigen />
          <a className="saltar-al-contenido" href="#contenido">
            Saltar al contenido
          </a>
          <Header banner={config.bannerTexto} />
          <main id="contenido">
            <TransicionDePagina>{children}</TransicionDePagina>
          </main>
          <Footer config={config} />
          <WhatsApp numero={config.whatsapp} />
        </ProveedorCarrito>
      </body>
    </html>
  );
}
