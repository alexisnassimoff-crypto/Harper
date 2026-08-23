import Link from "next/link";
import Logo from "@/components/Logo";
import GrillaProductos from "@/components/GrillaProductos";
import { getProductos } from "@/lib/catalogo";

export const revalidate = 60;

export default async function Home() {
  const productos = await getProductos();
  const estuches = productos.filter((p) => p.categoria === "Estuches");
  const anteojos = productos.filter((p) => p.categoria === "Anteojos");
  const panos = productos.filter((p) => p.categoria === "Paños");

  // El video del primer anteojo hace de portada.
  const portada = anteojos.find((p) => p.video)?.video ?? null;

  return (
    <>
      <section
        style={{
          position: "relative",
          minHeight: "min(78svh, 44rem)",
          display: "grid",
          placeItems: "center",
          overflow: "hidden",
          background: "var(--fondo-alt)",
        }}
      >
        {portada ? (
          <video
            src={portada}
            autoPlay
            muted
            loop
            playsInline
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        ) : null}

        <div
          className="contenedor pila"
          style={{
            position: "relative",
            gap: "1.75rem",
            alignItems: "center",
            textAlign: "center",
            paddingBlock: "5rem",
            // Mantiene el texto legible cuando corre el video detrás.
            textShadow: portada ? "0 1px 24px rgb(0 0 0 / 0.35)" : undefined,
            color: portada ? "#fff" : undefined,
          }}
        >
          <h1 style={{ margin: 0 }}>
            <Logo alto={portada ? 132 : 116} lockup claro={Boolean(portada)} />
            <span className="solo-lectores">Harper — cases &amp; eyewear</span>
          </h1>
          <p style={{ fontSize: "1.0625rem", maxWidth: "30rem" }}>
            Estuches rígidos de ecocuero premium y anteojos. Envíos a todo el país.
          </p>
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", justifyContent: "center" }}>
            <Link
              href="/estuches"
              className="boton"
              style={portada ? { background: "#fff", borderColor: "#fff", color: "var(--verde)" } : undefined}
            >
              Ver estuches
            </Link>
            <Link
              href="/anteojos"
              className="boton boton--fantasma"
              style={portada ? { color: "#fff", borderColor: "rgb(255 255 255 / 0.55)" } : undefined}
            >
              Ver anteojos
            </Link>
          </div>
        </div>
      </section>

      {estuches.length > 0 ? (
        <section className="contenedor" style={{ paddingBlock: "4.5rem 0" }}>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              marginBottom: "2rem",
            }}
          >
            <h2 className="titulo">Estuches</h2>
            <Link href="/estuches" className="label enlace-verde">
              Ver todo
            </Link>
          </div>
          <GrillaProductos productos={estuches} />
        </section>
      ) : null}

      {anteojos.length > 0 ? (
        <section className="contenedor" style={{ paddingBlock: "4.5rem 0" }}>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              marginBottom: "2rem",
            }}
          >
            <h2 className="titulo">Anteojos</h2>
            <Link href="/anteojos" className="label enlace-verde">
              Ver todo
            </Link>
          </div>
          <GrillaProductos productos={anteojos} />
        </section>
      ) : null}

      {panos.length > 0 ? (
        <section className="contenedor" style={{ paddingBlock: "4.5rem 0" }}>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              marginBottom: "2rem",
            }}
          >
            <h2 className="titulo">Paños</h2>
            <Link href="/panos" className="label enlace-verde">
              Ver todo
            </Link>
          </div>
          <GrillaProductos productos={panos} />
        </section>
      ) : null}

      {productos.length === 0 ? (
        <section className="contenedor" style={{ paddingBlock: "5rem" }}>
          <h2 className="titulo">Catálogo en preparación</h2>
          <p className="apagado" style={{ marginTop: "1rem", maxWidth: "34rem" }}>
            Cargá los productos y sus colores en Airtable y aparecen acá
            automáticamente.
          </p>
        </section>
      ) : null}
    </>
  );
}
