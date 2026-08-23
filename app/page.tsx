import Image from "next/image";
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

  return (
    <>
      <section
        style={{
          position: "relative",
          minHeight: "min(82svh, 46rem)",
          display: "grid",
          placeItems: "center",
          overflow: "hidden",
          background: "var(--tinta)",
        }}
      >
        <Image
          src="/hero.webp"
          alt=""
          fill
          priority
          sizes="100vw"
          style={{ objectFit: "cover", objectPosition: "center 30%" }}
        />
        {/* Velo para que el logo y los botones lean sobre cualquier zona de la foto. */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(to top, rgb(12 12 8 / 0.62) 0%, rgb(12 12 8 / 0.18) 45%, rgb(12 12 8 / 0.25) 100%)",
          }}
        />

        <div
          className="contenedor pila"
          style={{
            position: "relative",
            gap: "1.75rem",
            alignItems: "center",
            textAlign: "center",
            paddingBlock: "5rem",
            color: "#fff",
            textShadow: "0 1px 24px rgb(0 0 0 / 0.35)",
          }}
        >
          <h1 style={{ margin: 0 }}>
            <Logo alto={120} lockup claro />
            <span className="solo-lectores">Harper — cases &amp; eyewear</span>
          </h1>
          <p style={{ fontSize: "1.0625rem", maxWidth: "30rem" }}>
            Estuches rígidos de ecocuero premium y anteojos. Envíos a todo el país.
          </p>
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", justifyContent: "center" }}>
            <Link
              href="/estuches"
              className="boton"
              style={{ background: "#fff", borderColor: "#fff", color: "var(--verde)" }}
            >
              Ver estuches
            </Link>
            <Link
              href="/anteojos"
              className="boton boton--fantasma"
              style={{ color: "#fff", borderColor: "rgb(255 255 255 / 0.55)" }}
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
