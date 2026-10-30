import Link from "next/link";
import type { ConfigTienda } from "@/lib/config";
import { leerDataFiscal } from "@/lib/data-fiscal";
import { EnlacePreferenciasCookies } from "./AvisoCookies";
import Logo from "./Logo";
import MediosDePago from "./MediosDePago";

/**
 * El pie: editorial y con Harper como protagonista. Debajo del logo, los
 * accesos directos (Instagram, WhatsApp y mail). Arriba de la línea, los
 * medios de pago, centrados; abajo, solo el Data Fiscal de ARCA, centrado.
 *
 * Sin la línea del © con los datos del vendedor (pedido de Ale, 30/10/2026):
 * la razón social, el CUIT, el domicilio y el correo que pide la Res. GMC
 * 37/19 (Res. SCI 270/2020) están al principio de los Términos, enlazados
 * desde acá.
 *
 * El Botón de arrepentimiento (Res. 424/2020) va una sola vez, en Legales,
 * debajo de Defensa de las y los Consumidores (pedido de Ale, 30/10/2026).
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
  const dataFiscal = leerDataFiscal(config.dataFiscal);

  return (
    <footer className="pie">
      <div className="contenedor pie__principal">
        <div className="pie__marca">
          <Logo alto={58} lockup claro />
          <p className="pie__lema">Diseño para todos los días.</p>
          <Link href="/quienes-somos" className="pie__enlace">
            Quiénes somos
          </Link>
          <ul className="pie__contacto" aria-label="Contacto">
            {config.instagram ? (
              <li>
                <a href={config.instagram} target="_blank" rel="noopener noreferrer" aria-label="Instagram de Harper">
                  <IconoInstagram />
                </a>
              </li>
            ) : null}
            {whatsapp ? (
              <li>
                <a href={whatsapp} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp de Harper">
                  <IconoWhatsApp />
                </a>
              </li>
            ) : null}
            <li>
              <a href={`mailto:${config.emailContacto}`} aria-label="Escribinos por mail">
                <IconoMail />
              </a>
            </li>
          </ul>
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
          <Link href="/legales/devoluciones#garantia" className="pie__enlace">
            Garantía
          </Link>
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
          <Link href="/legales/arrepentimiento" className="pie__enlace">
            Botón de arrepentimiento
          </Link>
        </nav>
      </div>

      {/* Los medios de pago, centrados, arriba de la línea. */}
      <div className="contenedor pie__medios">
        <MediosDePago className="pie__pagos" />
      </div>

      <div className="contenedor pie__legal">
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
    </footer>
  );
}

function IconoInstagram() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4.2" />
      <circle cx="17.4" cy="6.6" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconoWhatsApp() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 18.15h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.19 8.19 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.83 2.42a8.19 8.19 0 0 1 2.41 5.83c0 4.54-3.7 8.23-8.24 8.23Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.78.97-.15.16-.29.18-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.24-1.47-1.38-1.72-.15-.25-.02-.38.11-.5.11-.11.25-.29.37-.44.13-.15.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.35-.77-1.84-.2-.49-.4-.42-.56-.43h-.47c-.17 0-.43.06-.66.31-.23.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.47-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.06-.1-.23-.16-.48-.28Z" />
    </svg>
  );
}

function IconoMail() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3.5 6 8.5 7 8.5-7" />
    </svg>
  );
}
