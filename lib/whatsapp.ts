/**
 * Enlaces de WhatsApp con mensaje predeterminado.
 *
 * Por ahora sirven para una sola cosa: invitar a consultar por cristales
 * graduados. Harper no vende ni cobra ese servicio desde la tienda; esto es
 * una consulta comercial. El mensaje lleva solo el modelo o el número de
 * pedido: nunca nombre, DNI, email, dirección ni datos de una receta.
 */

/** wa.me exige el número con código de país y sin signos. */
function numeroValido(numero: string | undefined | null): string | null {
  const digitos = (numero ?? "").replace(/\D/g, "");
  return digitos.length >= 10 && digitos.length <= 15 ? digitos : null;
}

/** El enlace, o null si no hay un número de WhatsApp configurado. */
export function enlaceWhatsApp(numero: string | undefined | null, mensaje: string): string | null {
  const destino = numeroValido(numero);
  if (!destino) return null;
  return `https://wa.me/${destino}?text=${encodeURIComponent(mensaje)}`;
}

/** Solo letras, números, espacios y guiones: el texto del enlace no lleva nada más. */
function limpio(texto: string, largo: number) {
  return texto
    .normalize("NFC")
    .replace(/[^\p{L}\p{N} \-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, largo);
}

/** Desde la ficha: "…para el modelo AMATISTA." */
export function mensajeGraduadosModelo(modelo: string): string {
  const nombre = limpio(modelo, 40);
  return nombre
    ? `Hola, Harper. Quiero consultar por cristales graduados para el modelo ${nombre}.`
    : "Hola, Harper. Quiero consultar por cristales graduados.";
}

/** Desde la confirmación del pedido y el mail: con el número de pedido si lo hay. */
export function mensajeGraduadosPedido(numeroPedido?: string | null): string {
  const numero = limpio(numeroPedido ?? "", 30).replace(/ /g, "");
  return numero
    ? `Hola, Harper. Quiero consultar por cristales graduados para mi pedido ${numero}.`
    : "Hola, Harper. Quiero consultar por cristales graduados para mi nuevo Harper.";
}

/** Los textos aprobados, en un solo lugar. */
export const TEXTO_GRADUADOS_FICHA = {
  pregunta: "¿Usás aumento?",
  explicacion: "Te ponemos los cristales oftálmicos en este armazón.",
  accion: "Consultanos por WhatsApp.",
} as const;

export const TEXTO_GRADUADOS_PEDIDO =
  "¿Querés consultar por cristales graduados para tu nuevo Harper? Escribinos y te asesoramos.";
