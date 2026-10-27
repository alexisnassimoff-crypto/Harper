/**
 * Cinco estrellas con la parte llena según el puntaje (4,6 → cuatro y un
 * poco más de media). Es decorativo: el puntaje va siempre escrito al lado,
 * y el lector de pantalla lee la etiqueta.
 */
export default function Estrellas({ puntaje, tamano = 15 }: { puntaje: number; tamano?: number }) {
  const lleno = Math.max(0, Math.min(5, puntaje)) * 20;
  const fila = (
    <>
      {[0, 1, 2, 3, 4].map((i) => (
        <svg key={i} viewBox="0 0 24 24" width={tamano} height={tamano} aria-hidden="true" focusable="false">
          <path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z" fill="currentColor" />
        </svg>
      ))}
    </>
  );

  return (
    <span className="estrellas" role="img" aria-label={`${formatearPuntaje(puntaje)} de 5 estrellas`}>
      <span className="estrellas__fondo">{fila}</span>
      <span className="estrellas__lleno" style={{ width: `${lleno}%` }}>
        {fila}
      </span>
    </span>
  );
}

/** 4.8 → "4,8"; 5 → "5". */
export function formatearPuntaje(puntaje: number): string {
  return puntaje.toLocaleString("es-AR", { maximumFractionDigits: 1 });
}
