import fs from "node:fs";
import path from "node:path";

/**
 * Diseño de las miniaturas que se ven al compartir un link.
 *
 * Vive una sola vez y lo usan la ficha de producto y las tres categorías. La
 * carpeta arranca con guión bajo, así que el App Router no la publica como ruta.
 *
 * Dos cosas condicionan cómo está escrito:
 *
 *  - Lo dibuja satori, que solo entiende un subconjunto de CSS. Todo contenedor
 *    con más de un hijo lleva `display: flex` explícito.
 *  - Satori no rasteriza WebP de forma confiable, así que las fotos entran como
 *    el `.jpg` hermano —mismo encuadre, fondo blanco— embebido en la propia
 *    imagen. Nada de pedirle la foto a la red: durante el build el sitio
 *    todavía no está publicado.
 */

export const TAMANO = { width: 1200, height: 630 };
export const contentType = "image/png";

const VERDE = "#004226";
const TINTA = "#16150f";
const APAGADO = "#78756c";
const LINEA = "#e3e0d8";

const RAIZ = process.cwd();

/** Las dos instancias de Raleway que usa la tarjeta. */
export function fuentes() {
  const leer = (archivo: string) =>
    fs.readFileSync(path.join(RAIZ, "app/_og/fuentes", archivo));

  return [
    { name: "Raleway", data: leer("Raleway-Regular.ttf"), weight: 400 as const, style: "normal" as const },
    { name: "Raleway", data: leer("Raleway-Medium.ttf"), weight: 500 as const, style: "normal" as const },
  ];
}

/**
 * Convierte una ruta del catálogo en una imagen embebida.
 * Devuelve `null` si el archivo no está, para que la tarjeta caiga al respaldo
 * en vez de romperse.
 */
export function fotoIncrustada(ruta: string | null | undefined) {
  if (!ruta) return null;

  const jpg = ruta.replace(/\.webp$/i, ".jpg");
  if (!jpg.startsWith("/productos/")) return null;

  try {
    const datos = fs.readFileSync(path.join(RAIZ, "public", jpg));
    return `data:image/jpeg;base64,${datos.toString("base64")}`;
  } catch {
    return null;
  }
}

function precioArgentino(valor: number) {
  return `$ ${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 }).format(valor)}`;
}

/**
 * El nombre de la marca, compuesto en Raleway con versalitas espaciadas.
 *
 * Se probó incrustar el PNG del logotipo —que es un serif de alto contraste que
 * Raleway no imita— y satori lo dibuja mal en todas sus variantes: como <img>
 * suelto lo achica a cero al competir con el bloque que se lleva el `flex: 1`,
 * envuelto en un div lo recorta al alto de la caja, en posición absoluta lo
 * corta al 25%, y como `backgroundImage` no lo dibuja. Raleway es la tipografía
 * del resto del sitio, así que la tarjeta queda coherente igual.
 */
function Marca({ tamano = 30, tono = TINTA }: { tamano?: number; tono?: string }) {
  return (
    <div
      style={{
        fontSize: tamano,
        fontWeight: 500,
        letterSpacing: tamano * 0.34,
        // El tracking suma aire a la derecha de la última letra; se compensa
        // para que el conjunto quede centrado de verdad.
        marginLeft: tamano * 0.34,
        color: tono,
        // Sin esto, si el conjunto pasa de los 630 de alto yoga aplasta al
        // primer hijo hasta hacerlo desaparecer, sin avisar.
        flexShrink: 0,
      }}
    >
      HARPER
    </div>
  );
}

function Filete() {
  return { position: "absolute" as const, bottom: 0, left: 0, right: 0, height: 10, background: VERDE };
}

const BASE = {
  width: "100%",
  height: "100%",
  display: "flex",
  flexDirection: "column" as const,
  alignItems: "center",
  background: "#ffffff",
  fontFamily: "Raleway",
  position: "relative" as const,
};

/** Respaldo: sirve cuando no hay producto, no hay foto, o Airtable no respondió. */
export function TarjetaMarca() {
  return (
    <div style={{ ...BASE, justifyContent: "center" }}>
      <Marca tamano={72} />
      <div style={{ marginTop: 26, fontSize: 30, color: APAGADO, letterSpacing: 2 }}>
        ~ cases &amp; eyewear ~
      </div>
      <div style={{ marginTop: 46, fontSize: 24, color: VERDE, letterSpacing: 3 }}>harper.ar</div>
      <div style={Filete()} />
    </div>
  );
}

export function TarjetaProducto({
  nombre,
  precio,
  colores,
  foto,
}: {
  nombre: string;
  precio: number;
  colores: string[];
  foto: string | null;
}) {
  if (!foto) return <TarjetaMarca />;

  return (
    <div style={{ ...BASE, justifyContent: "flex-start", paddingTop: 42 }}>
      <Marca />

      <div
        style={{
          display: "flex",
          flex: 1,
          width: "100%",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={foto} width={396} height={396} style={{ objectFit: "contain" }} alt="" />
      </div>

      <div
        style={{
          display: "flex",
          width: "100%",
          alignItems: "flex-end",
          justifyContent: "space-between",
          padding: "0 64px 46px",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 52, fontWeight: 500, letterSpacing: -1.4, color: TINTA }}>
            {nombre}
          </div>
          <div style={{ display: "flex", alignItems: "center", marginTop: 16 }}>
            {colores.slice(0, 5).map((hex, i) => (
              <div
                key={i}
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 10,
                  marginRight: 9,
                  background: hex,
                  border: `1px solid ${LINEA}`,
                }}
              />
            ))}
            <div style={{ fontSize: 22, color: APAGADO, marginLeft: 6 }}>
              {colores.length === 1 ? "1 color" : `${colores.length} colores`}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
          <div style={{ fontSize: 52, fontWeight: 500, letterSpacing: -1.4, color: TINTA }}>
            {precioArgentino(precio)}
          </div>
          <div style={{ fontSize: 22, color: VERDE, letterSpacing: 2, marginTop: 16 }}>
            harper.ar
          </div>
        </div>
      </div>

      <div style={Filete()} />
    </div>
  );
}

export function TarjetaCategoria({ titulo, fotos }: { titulo: string; fotos: string[] }) {
  if (fotos.length === 0) return <TarjetaMarca />;

  return (
    <div style={{ ...BASE, justifyContent: "flex-start", paddingTop: 42 }}>
      <Marca />

      <div
        style={{
          display: "flex",
          flex: 1,
          width: "100%",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 40px",
        }}
      >
        {fotos.slice(0, 3).map((f, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={i} src={f} width={300} height={300} style={{ objectFit: "contain" }} alt="" />
        ))}
      </div>

      <div
        style={{
          display: "flex",
          width: "100%",
          alignItems: "flex-end",
          justifyContent: "space-between",
          padding: "0 64px 46px",
        }}
      >
        <div style={{ fontSize: 56, fontWeight: 500, letterSpacing: -1.6, color: TINTA }}>
          {titulo}
        </div>
        <div style={{ fontSize: 22, color: VERDE, letterSpacing: 2 }}>harper.ar</div>
      </div>

      <div style={Filete()} />
    </div>
  );
}
