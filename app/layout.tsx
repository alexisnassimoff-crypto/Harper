import type { Metadata } from "next";
import { Raleway } from "next/font/google";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import WhatsApp from "@/components/WhatsApp";
import { ProveedorCarrito } from "@/components/carrito/CarritoContexto";
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
  openGraph: {
    type: "website",
    locale: "es_AR",
    siteName: "Harper",
    url: SITIO,
  },
  robots: { index: true, follow: true },
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const config = await getConfig();

  return (
    <html lang="es" className={raleway.variable}>
      <head>
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
          <main id="contenido">{children}</main>
          <Footer config={config} />
          <WhatsApp numero={config.whatsapp} />
        </ProveedorCarrito>
      </body>
    </html>
  );
}
