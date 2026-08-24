import Image from "next/image";

/**
 * Logo oficial de Harper, extraído del catálogo de marca.
 *
 * `lockup` incluye el tagline "cases & eyewear" y se usa en el pie y en piezas
 * grandes; sin él queda solo la marca denominativa, que es lo que va en el header.
 */
export default function Logo({
  alto = 22,
  lockup = false,
  claro = false,
}: {
  /**
   * Alto en px, o cualquier medida CSS (`clamp(...)`, `10vw`) para que el logo
   * acompañe al viewport. Con medida CSS el ancho se calcula solo.
   */
  alto?: number | string;
  lockup?: boolean;
  /** Invierte el logo a blanco, para fondos oscuros. */
  claro?: boolean;
}) {
  const proporcion = lockup ? 1200 / 443 : 1200 / 260;
  const fijo = typeof alto === "number";
  // Next necesita el tamaño intrínseco; el estilo manda por encima.
  const altoBase = fijo ? alto : lockup ? 443 : 260;
  const ancho = Math.round(altoBase * proporcion);

  return (
    <Image
      src={lockup ? "/logo-harper-lockup.png" : "/logo-harper.png"}
      alt="Harper"
      width={ancho}
      height={altoBase}
      priority
      // El PNG ya está optimizado; reprocesarlo lo reescala a la medida CSS
      // y en pantallas retina se ve borroso.
      unoptimized
      style={{
        height: fijo ? `${alto}px` : alto,
        // Ancho explícito y `alignSelf`: dentro de un contenedor flex en
        // columna, un `width: auto` se estira al ancho de la columna y deforma
        // el logo. `objectFit` lo protege si la pantalla lo obliga a achicarse.
        width: fijo ? `${ancho}px` : "auto",
        maxWidth: "100%",
        alignSelf: fijo ? "start" : "center",
        flex: "0 0 auto",
        objectFit: "contain",
        // El logo es verde sólido: invertirlo y desaturarlo lo deja blanco puro.
        filter: claro ? "brightness(0) invert(1)" : undefined,
      }}
    />
  );
}
