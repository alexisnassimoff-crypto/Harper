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
  alto?: number;
  lockup?: boolean;
  /** Invierte el logo a blanco, para fondos oscuros. */
  claro?: boolean;
}) {
  const proporcion = lockup ? 1200 / 443 : 1200 / 260;

  return (
    <Image
      src={lockup ? "/logo-harper-lockup.png" : "/logo-harper.png"}
      alt="Harper"
      width={Math.round(alto * proporcion)}
      height={alto}
      priority
      style={{
        height: `${alto}px`,
        width: "auto",
        // El logo es verde sólido: invertirlo y desaturarlo lo deja blanco puro.
        filter: claro ? "brightness(0) invert(1)" : undefined,
      }}
    />
  );
}
