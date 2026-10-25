import Link from "next/link";
import type { ConfigTienda } from "@/lib/config";
import { EnlacePreferenciasCookies } from "./AvisoCookies";
import Logo from "./Logo";

/**
 * El pie: editorial y con Harper como protagonista. La información legal
 * obligatoria (razón social, CUIT, domicilio, contactos, enlace a Defensa de
 * las y los Consumidores) está siempre a la vista en "Información legal", en
 * un tono más chico, sin esconderse detrás de un clic.
 */

/** "+54 9 11 4917-2061" a partir de "5491149172061"; si no es de ese formato, tal cual. */
export function telefonoLegible(numero: string): string {
  const d = numero.replace(/\D/g, "");
  if (/^54911\d{8}$/.test(d)) return `+54 9 11 ${d.slice(5, 9)}-${d.slice(9)}`;
  return d ? `+${d}` : "";
}

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
  const telefono = config.whatsapp ? telefonoLegible(config.whatsapp) : "";
  const anio = new Date().getFullYear();

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

      {/* Información legal del vendedor: obligatoria y siempre visible. */}
      <section className="contenedor pie__legal" aria-labelledby="pie-informacion-legal">
        <h2 id="pie-informacion-legal" className="pie__titulo">
          Información legal
        </h2>
        <dl className="pie__datos">
          <div>
            <dt>Razón social</dt>
            <dd>{config.razonSocial}</dd>
          </div>
          <div>
            <dt>CUIT</dt>
            <dd>{config.cuit}</dd>
          </div>
          {config.domicilio ? (
            <div>
              <dt>Domicilio</dt>
              <dd>{config.domicilio}</dd>
            </div>
          ) : null}
          <div>
            <dt>Email</dt>
            <dd>
              <a href={`mailto:${config.emailContacto}`}>{config.emailContacto}</a>
            </dd>
          </div>
          {whatsapp ? (
            <div>
              <dt>WhatsApp</dt>
              <dd>
                <a href={whatsapp} target="_blank" rel="noopener noreferrer">
                  {telefono}
                </a>
              </dd>
            </div>
          ) : null}
        </dl>
        <p className="pie__copy">
          © {anio} Harper. Harper es una marca de {config.razonSocial}.
        </p>
      </section>
    </footer>
  );
}
