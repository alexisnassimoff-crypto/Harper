import { TEXTOS } from "@/lib/textos";

/**
 * «¿Dudas antes de pagar? Escribinos por WhatsApp», junto al botón de comprar
 * del carrito y al total del checkout (recorrido móvil, Ale, 08/11/2026).
 *
 * Solo en celular (globals.css, .ayuda-wsp): ahí el botón flotante de WhatsApp
 * se guarda en esas dos páginas porque tapaba «Finalizar compra», campos y
 * opciones de pago. En escritorio sigue el flotante. Sin número, nada.
 */
export default function AyudaWhatsApp({ numero }: { numero: string }) {
  if (!numero) return null;
  return (
    <p className="ayuda-wsp">
      {TEXTOS.checkout.dudas}{" "}
      <a href={`https://wa.me/${numero}`} target="_blank" rel="noopener noreferrer" className="checkout__enlace">
        {TEXTOS.checkout.escribinos}
        <span className="visualmente-oculto"> (se abre en otra pestaña)</span>
      </a>
    </p>
  );
}
