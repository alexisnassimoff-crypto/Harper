/**
 * El encabezado de una colección (Anteojos, Estuches, Paños y las categorías
 * que vengan): el título centrado y, abajo, cuántos modelos hay. El mismo en
 * el celular y en la computadora (estilos en app/globals.css,
 * «Encabezado de las colecciones»).
 */
export default function CabeceraColeccion({ titulo, cantidad }: { titulo: string; cantidad: number }) {
  return (
    <header className="cabecera-coleccion">
      <h1 className="titulo cabecera-coleccion__titulo">{titulo}</h1>
      {cantidad > 0 ? (
        <p className="cabecera-coleccion__cantidad">
          {cantidad} {cantidad === 1 ? "modelo" : "modelos"}
        </p>
      ) : null}
    </header>
  );
}
