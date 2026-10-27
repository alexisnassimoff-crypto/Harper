import Link from "next/link";
import type { ConfigTienda } from "@/lib/config";
import { leerDataFiscal } from "@/lib/data-fiscal";
import { EnlacePreferenciasCookies } from "./AvisoCookies";
import Logo from "./Logo";
import MediosDePago from "./MediosDePago";

/**
 * El pie: editorial y con Harper como protagonista. Abajo, los medios de pago,
 * el Data Fiscal de ARCA y una sola línea chica con los datos del vendedor.
 *
 * Esa línea no se saca: la Res. GMC 37/19 (Res. SCI 270/2020) pide razón
 * social, CUIT, domicilio y correo "en ubicación de fácil visualización" y
 * antes de la compra. Ale no quería el bloque grande de "Información legal"
 * (27/10/2026): quedan los mismos datos, en un renglón y sin títulos.
 */

const DEFENSA_CONSUMIDOR = "https://autogestion.produccion.gob.ar/consumidores";

export default function Footer({
  config,
  categorias = [],
}: {
  config: ConfigTienda;
  /** Las categorías con productos publicados (lib/categorias.ts). */
  categorias?: { nombre: string; slug: string }[];
}) {
  const whatsapp = config.whatsapp ? `https://wa.me/${config.whatsapp}` : null;
  const anio = new Date().getFullYear();
  const dataFiscal = leerDataFiscal(config.dataFiscal);

  return (
    <footer className="pie">
      <div className="contenedor pie__principal">
        <div className="pie__marca">
          <Logo alto={58} lockup claro />
          <p className="pie__lema">Diseño para todos los días.</p>
        </div>

        {categorias.length > 0 ? (
          <nav className="pie__columna" aria-label="Tienda">
            <span className="pie__titulo">Tienda</span>
            {categorias.map((c) => (
              <Link key={c.slug} href={`/${c.slug}`} className="pie__enlace">
                {c.nombre}
              </Link>
            ))}
          </nav>
        ) : null}

        <nav className="pie__columna" aria-label="Ayuda">
          <span className="pie__titulo">Ayuda</span>
          <Link href="/legales/devoluciones" className="pie__enlace">
            Cambios y devoluciones
          </Link>
          <Link href="/legales/arrepentimiento" className="pie__enlace">
            Botón de arrepentimiento
          </Link>
          {whatsapp ? (
            <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="pie__enlace">
              WhatsApp
            </a>
          ) : null}
          <a href={`mailto:${config.emailContacto}`} className="pie__enlace">
            Escribinos por mail
          </a>
        </nav>

        <nav className="pie__columna" aria-label="Legales">
          <span className="pie__titulo">Legales</span>
          <Link href="/legales/terminos" className="pie__enlace">
            Términos y condiciones
          </Link>
          <Link href="/legales/privacidad" className="pie__enlace">
            Política de privacidad
          </Link>
          <EnlacePreferenciasCookies className="pie__enlace" />
          <a href={DEFENSA_CONSUMIDOR} target="_blank" rel="noopener noreferrer" className="pie__enlace">
            Defensa de las y los Consumidores
          </a>
        </nav>
      </div>

      <section className="contenedor pie__legal" aria-label="Medios de pago y datos del vendedor">
        <div className="pie__sellos">
          <MediosDePago className="pie__pagos" />
          {dataFiscal ? (
            // Formulario 960/D de ARCA: el logo y el enlace son los que entrega
            // ARCA para harper.ar (Config.data_fiscal). Sin código, no se muestra.
            <a
              className="pie__data-fiscal"
              href={dataFiscal.enlace}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Data Fiscal (ARCA): información fiscal del vendedor"
            >
              {dataFiscal.imagen ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={dataFiscal.imagen} alt="Data Fiscal" loading="lazy" decoding="async" />
              ) : (
                "Data Fiscal"
              )}
            </a>
          ) : null}
        </div>
        <p className="pie__copy">
          © {anio} Harper, una marca de {config.razonSocial} ·{" "}
          <span className="pie__sin-corte">CUIT {config.cuit}</span>
          {config.domicilio ? <> · {config.domicilio}</> : null} ·{" "}
          <a href={`mailto:${config.emailContacto}`}>{config.emailContacto}</a> ·{" "}
          {/* Res. 424/2020: el botón de arrepentimiento, a la vista desde la
              página de inicio. Además del enlace de la columna Ayuda. */}
          <Link href="/legales/arrepentimiento" className="pie__arrepentimiento">
            Botón de arrepentimiento
          </Link>
        </p>
      </section>
    </footer>
  );
}
