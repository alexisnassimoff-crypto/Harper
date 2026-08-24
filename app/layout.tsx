import type { Metadata } from "next";
import { Raleway } from "next/font/google";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import WhatsApp from "@/components/WhatsApp";
import { ProveedorCarrito } from "@/components/carrito/CarritoContexto";
import TransicionDePagina from "@/components/TransicionDePagina";
import { getConfig } from "@/lib/config";
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
    default: "Harper — Cases & Eyewear",
    template: "%s · Harper",
  },
  description:
    "Estuches rígidos de ecocuero premium y anteojos Harper. Comprá online con envíos a todo el país.",
  applicationName: "Harper",
  keywords: [
    "anteojos",
    "estuches para anteojos",
    "paños de microfibra",
    "ecocuero",
    "Harper",
    "Argentina",
  ],
  alternates: { canonical: "/" },
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
      description:
        "Anteojos y estuches rígidos de ecocuero premium. Entrega por Correo Argentino a todo el país.",
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
