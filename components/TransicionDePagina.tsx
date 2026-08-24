"use client";

import { usePathname } from "next/navigation";

/**
 * Fundido de entrada al cambiar de pantalla.
 *
 * La clave por ruta hace que React vuelva a montar el envoltorio en cada
 * navegación y la animación se dispare de nuevo. Con "reducir movimiento"
 * activado el CSS la anula.
 */
export default function TransicionDePagina({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div key={pathname} className="pagina">
      {children}
    </div>
  );
}
