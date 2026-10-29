import { codigoEnviaDeProvincia } from "./provincias-envia";
import type { DatosCliente } from "./tipos";

/** Validación compartida entre el formulario y la API. */

export function emailValido(valor: string) {
  // Deliberadamente laxa: el objetivo es atajar errores de tipeo,
  // no rechazar direcciones raras pero válidas.
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(valor.trim());
}

export type ErroresCliente = Partial<Record<keyof DatosCliente, string>>;

export function validarCliente(datos: Partial<DatosCliente>): ErroresCliente {
  const errores: ErroresCliente = {};
  const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");

  if (!emailValido(texto(datos.email))) {
    errores.email = "Revisá el mail";
  }
  if (texto(datos.nombre).length < 3) {
    errores.nombre = "Ingresá nombre y apellido";
  }
  if (texto(datos.telefono).replace(/\D/g, "").length < 8) {
    errores.telefono = "Ingresá un teléfono de contacto";
  }
  // El DNI es obligatorio: lo pide la logística para entregar el paquete.
  const dni = texto(datos.dni).replace(/\D/g, "");
  if (dni.length < 7 || dni.length > 8) {
    errores.dni = dni.length === 0 ? "Ingresá tu DNI" : "Revisá el DNI: son 7 u 8 números";
  }
  if (texto(datos.direccion).length < 5) {
    errores.direccion = "Ingresá calle y número";
  }
  if (texto(datos.ciudad).length < 2) {
    errores.ciudad = "Ingresá la localidad";
  }
  // Una de las 24: el envío se cotiza con la provincia.
  if (!codigoEnviaDeProvincia(texto(datos.provincia))) {
    errores.provincia = "Elegí la provincia";
  }
  // Los cuatro números del código postal (con o sin las letras del CPA).
  if (!/\d{4}/.test(texto(datos.cp))) {
    errores.cp = "Ingresá el código postal";
  }
  // Mayoría de edad (o autorización del representante legal) y Términos:
  // tiene que ser un sí explícito, no un valor por defecto.
  if (datos.aceptaTerminos !== true) {
    errores.aceptaTerminos = "Para comprar, confirmá tu edad y aceptá los Términos y condiciones";
  }

  return errores;
}

/** Normaliza los datos ya validados a un objeto limpio. */
export function normalizarCliente(datos: Partial<DatosCliente>): DatosCliente {
  const t = (v: unknown) => (typeof v === "string" ? v.trim() : "");

  return {
    email: t(datos.email).toLowerCase(),
    nombre: t(datos.nombre),
    telefono: t(datos.telefono),
    dni: t(datos.dni).replace(/\D/g, ""),
    direccion: t(datos.direccion),
    ciudad: t(datos.ciudad),
    provincia: t(datos.provincia),
    cp: t(datos.cp),
    // Opcionales: solo llegan con el buscador de direcciones.
    ...(t(datos.calle) ? { calle: t(datos.calle).slice(0, 120) } : {}),
    ...(t(datos.numero) ? { numero: t(datos.numero).slice(0, 20) } : {}),
    ...(t(datos.piso) ? { piso: t(datos.piso).slice(0, 40) } : {}),
    aceptaPromos: Boolean(datos.aceptaPromos),
    aceptaTerminos: datos.aceptaTerminos === true,
  };
}
