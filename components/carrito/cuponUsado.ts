/**
 * Si en este navegador ya se sabe que quien compra no es nuevo (el checkout
 * rechazó el cupón de bienvenida por eso, o se completaron sus datos de una
 * compra anterior con el código del mail): entonces la ficha y la portada
 * dejan de ofrecerle HARPER10, que es solo para la primera compra. Así no
 * queda aplicándolo una y otra vez para que se lo saquen al pagar.
 */
const CLAVE = "harper.cupon-bienvenida-usado.v1";

export function cuponBienvenidaUsado(): boolean {
  try {
    return window.localStorage.getItem(CLAVE) === "1";
  } catch {
    return false;
  }
}

export function marcarCuponBienvenidaUsado() {
  try {
    window.localStorage.setItem(CLAVE, "1");
  } catch {
    // Sin almacenamiento, se le sigue ofreciendo: el servidor igual lo valida.
  }
}
