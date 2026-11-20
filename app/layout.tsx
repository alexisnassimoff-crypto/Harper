import type { Metadata } from "next";
import { Barlow_Condensed, Rethink_Sans } from "next/font/google";
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
import AvisoFavoritos from "@/components/suscriptores/AvisoFavoritos";
import { getProductos } from "@/lib/catalogo";
import { categoriasConProductos, esCategoriaDeAnteojos } from "@/lib/categorias";
import { anunciosDelHeader } from "@/lib/anuncios";
import { escalaDe, getTramos } from "@/lib/descuentos";
import { conEspera, verificarCuotasPara } from "@/lib/cuotas-servidor";
import { porcentajeDelDuo } from "@/lib/pedidos";
import { creditoActivo, PORCENTAJE_CREDITO_UN_ANTEOJO, PORCENTAJE_CREDITO_VARIOS } from "@/lib/credito-harper";

// La tipografía (Ale, 07/11/2026 y 17/11/2026): los títulos y los botones
// son de Google Fonts, gratis y servidas desde harper.ar por next/font, solo
// con los pesos que se usan (cada peso de más es un archivo más que baja el
// celular).
// - Títulos: Barlow Condensed SemiBold 600, en mayúsculas.
// - Botones: Rethink Sans 500, en mayúsculas y con espaciado amplio.
// - Textos (descripciones, mensajes, precios y etiquetas): Arial Unicode. No
//   se declara acá: usa la fuente que ya trae cada dispositivo, y está en
//   app/globals.css («Texto Harper»).
const titulos = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["600"],
  display: "swap",
  variable: "--fuente-titulos",
});
const botones = Rethink_Sans({
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
  variable: "--fuente-botones",
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
  // para el anteojo más barato; si tarda, sale sin ellas. Son las mismas para
  // todos (Ale, 18/11/2026: hasta 3; nadie tiene más).
  const cuotas = await conEspera(
    verificarCuotasPara(productos.filter((p) => esCategoriaDeAnteojos(p.categoria)).map((p) => p.precio)),
    2_000,
    null
  );
  // El Dúo se anuncia solo si el servidor lo tiene prendido (HARPER_DUO_ACTIVO):
  // apagado, la barra no lo nombra. Se pregunta acá, en el servidor, por la
  // misma puerta que la ficha y la portada (lib/pedidos.ts), y viaja como dato.
  const duo = porcentajeDelDuo();
  // El Crédito Harper (Ale, 18/11/2026), igual: solo con HARPER_CREDITO_ACTIVO
  // prendido, con los porcentajes del motor (lib/credito-harper.ts). Apagado,
  // null y la barra no lo nombra.
  const credito = creditoActivo() ? { unAnteojo: PORCENTAJE_CREDITO_UN_ANTEOJO, varios: PORCENTAJE_CREDITO_VARIOS } : null;

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
    <html lang="es" className={`${titulos.variable} ${botones.variable}`}>
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
              cuotas,
              escala: escalaDe(tramos, "Anteojos"),
              duo,
              credito,
              // El envío gratis de la barra sale de los dos mínimos de Config.
              envioGratisDesde: config.envioGratisDesde,
              envioGratisAmbaDesde: config.envioGratisAmbaDesde,
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
          <AvisoFavoritos />
        </ProveedorCarrito>
      </body>
    </html>
  );
}
