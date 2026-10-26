/**
 * Datos de facturación del checkout.
 *
 * Por defecto se compra como consumidor final. Quien necesita la factura a
 * nombre de una empresa u otro titular con CUIT carga razón social o nombre,
 * CUIT, condición frente al IVA y domicilio fiscal: datos propios de la
 * factura, independientes del comprador y de la dirección de entrega.
 *
 * La clase de la factura sale de las dos condiciones frente al IVA, la de
 * Harper y la de quien la recibe, nunca de que el comprador sea una empresa:
 *  - Harper responsable inscripto: A a responsables inscriptos y a
 *    monotributistas (RG 5003/2021, con la leyenda de la Ley 27.618); B a
 *    exentos, no alcanzados y consumidores finales.
 *  - Harper monotributista o exento: siempre C.
 * La condición de Harper se carga en Config (`condicion_iva`). Sin ese dato la
 * clase queda "A confirmar": no se supone.
 *
 * No se emite nada automáticamente: los datos quedan en el pedido para hacer
 * la factura desde el sistema contable. La condición del receptor tiene que
 * figurar en la factura (RG 5616/2024).
 *
 * Este archivo lo usan el formulario y el servidor: sin nada de servidor.
 */

/** Las condiciones frente al IVA que se ofrecen, con el nombre que usa ARCA. */
export const CONDICIONES_IVA = [
  "IVA Responsable Inscripto",
  "Responsable Monotributo",
  "Monotributista Social",
  "Monotributo Trabajador Independiente Promovido",
  "IVA Sujeto Exento",
  "IVA No Alcanzado",
  "IVA Liberado – Ley N° 19.640",
  "Sujeto No Categorizado",
  "Consumidor Final",
] as const;

export type CondicionIva = (typeof CONDICIONES_IVA)[number];

/** Lo que viaja del checkout al servidor. */
export type Facturacion =
  | { tipo: "consumidor_final" }
  | {
      tipo: "cuit";
      razonSocial: string;
      /** Solo los 11 dígitos. */
      cuit: string;
      condicionIva: string;
      domicilioFiscal: string;
    };

export const CONSUMIDOR_FINAL: Facturacion = { tipo: "consumidor_final" };

export type ErroresFacturacion = Partial<
  Record<"facturaRazonSocial" | "facturaCuit" | "facturaCondicionIva" | "facturaDomicilio", string>
>;

/** Lo que llega del formulario. Cualquier cosa que no sea "cuit" es consumidor final. */
export function normalizarFacturacion(datos: unknown): Facturacion {
  const d = (datos && typeof datos === "object" ? datos : {}) as Record<string, unknown>;
  if (d.tipo !== "cuit") return CONSUMIDOR_FINAL;
  const linea = (clave: string) => (typeof d[clave] === "string" ? (d[clave] as string).trim().replace(/\s+/g, " ") : "");
  return {
    tipo: "cuit",
    razonSocial: linea("razonSocial"),
    cuit: linea("cuit").replace(/\D/g, ""),
    condicionIva: linea("condicionIva"),
    domicilioFiscal: linea("domicilioFiscal"),
  };
}

/** Prefijos que asigna ARCA: personas (20 a 27), empresas (30, 33, 34) y otros (50, 51, 55). */
const PREFIJOS_CUIT = ["20", "23", "24", "25", "26", "27", "30", "33", "34", "50", "51", "55"];
const PESOS_CUIT = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

/** CUIT de 11 dígitos con prefijo válido y dígito verificador correcto (módulo 11). */
export function cuitValido(cuit: string): boolean {
  const d = cuit.replace(/\D/g, "");
  if (d.length !== 11 || !PREFIJOS_CUIT.includes(d.slice(0, 2))) return false;
  const suma = PESOS_CUIT.reduce((s, peso, i) => s + peso * Number(d[i]), 0);
  const resto = 11 - (suma % 11);
  const verificador = resto === 11 ? 0 : resto;
  return verificador !== 10 && verificador === Number(d[10]);
}

/** "30718023161" → "30-71802316-1". */
export function formatearCuit(cuit: string): string {
  const d = cuit.replace(/\D/g, "");
  return d.length === 11 ? `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}` : cuit;
}

export function esCondicionIva(valor: string): valor is CondicionIva {
  return (CONDICIONES_IVA as readonly string[]).includes(valor);
}

export function validarFacturacion(f: Facturacion): ErroresFacturacion {
  const errores: ErroresFacturacion = {};
  if (f.tipo !== "cuit") return errores;

  if (f.razonSocial.length < 2) errores.facturaRazonSocial = "Escribí la razón social o el nombre del titular";
  else if (f.razonSocial.length > 120) errores.facturaRazonSocial = "Usá menos de 120 caracteres";

  if (f.cuit.length !== 11) errores.facturaCuit = "Revisá el CUIT: son 11 números";
  else if (!cuitValido(f.cuit)) errores.facturaCuit = "Ese CUIT no es válido: revisá los números";

  if (!esCondicionIva(f.condicionIva)) errores.facturaCondicionIva = "Elegí la condición frente al IVA";

  if (f.domicilioFiscal.length < 8) errores.facturaDomicilio = "Escribí el domicilio fiscal completo";
  else if (f.domicilioFiscal.length > 200) errores.facturaDomicilio = "Usá menos de 200 caracteres";

  return errores;
}

/** La condición de quien recibe la factura. */
export function condicionDelReceptor(f: Facturacion): CondicionIva {
  return f.tipo === "cuit" && esCondicionIva(f.condicionIva) ? f.condicionIva : "Consumidor Final";
}

/** La condición de Harper frente al IVA, tal como se carga en Config. */
export type CondicionEmisor = "Responsable Inscripto" | "Monotributo" | "Exento";

/**
 * Lee `condicion_iva` de Config. Lo que no se reconoce, `null`: no se supone.
 * Monotributo y exento se miran primero, y "no inscripto" nunca cuenta como
 * responsable inscripto.
 */
export function leerCondicionEmisor(valor: string): CondicionEmisor | null {
  const v = valor.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/monotribut/.test(v)) return "Monotributo";
  if (/exent/.test(v)) return "Exento";
  if (/inscript/.test(v) && !/\bno\s+inscript/.test(v)) return "Responsable Inscripto";
  return null;
}

export type ClaseFactura = "A" | "B" | "C";

const MONOTRIBUTISTAS: CondicionIva[] = [
  "Responsable Monotributo",
  "Monotributista Social",
  "Monotributo Trabajador Independiente Promovido",
];
const RECIBEN_A: CondicionIva[] = ["IVA Responsable Inscripto", ...MONOTRIBUTISTAS];

/** La clase según las dos condiciones. Sin la de Harper, `null`. */
export function claseDeFactura(emisor: CondicionEmisor | null, receptor: CondicionIva): ClaseFactura | null {
  if (!emisor) return null;
  if (emisor !== "Responsable Inscripto") return "C";
  return RECIBEN_A.includes(receptor) ? "A" : "B";
}

/** Lo que el sistema contable tiene que tener en cuenta además de la clase. */
export function notaDeClase(clase: ClaseFactura | null, receptor: CondicionIva): string | null {
  if (!clase) return "Clase a confirmar: falta cargar en Config la condición de Harper frente al IVA (condicion_iva).";
  if (clase === "A" && MONOTRIBUTISTAS.includes(receptor)) return "A monotributista: con la leyenda de la Ley 27.618.";
  return null;
}

/** Los datos de facturación de un pedido, como se guardan y se leen en Airtable. */
export type FacturacionPedido = {
  condicionIva: string;
  /** "A", "B", "C" o "A confirmar". */
  clase: string;
  razonSocial: string;
  cuit: string;
  domicilioFiscal: string;
};

export const SIN_CLASE = "A confirmar";

export function facturacionDelPedido(f: Facturacion, emisor: CondicionEmisor | null): FacturacionPedido {
  const receptor = condicionDelReceptor(f);
  return {
    condicionIva: receptor,
    clase: claseDeFactura(emisor, receptor) ?? SIN_CLASE,
    razonSocial: f.tipo === "cuit" ? f.razonSocial : "",
    cuit: f.tipo === "cuit" ? formatearCuit(f.cuit) : "",
    domicilioFiscal: f.tipo === "cuit" ? f.domicilioFiscal : "",
  };
}

/** Los campos del pedido en Airtable. Los vacíos no se mandan. */
export function camposDeFacturacion(p: FacturacionPedido): Record<string, string> {
  const campos: Record<string, string> = {
    Factura_condicion_IVA: p.condicionIva,
    Factura_clase: p.clase,
    Factura_razon_social: p.razonSocial,
    Factura_CUIT: p.cuit,
    Factura_domicilio: p.domicilioFiscal,
  };
  return Object.fromEntries(Object.entries(campos).filter(([, v]) => v !== ""));
}

/** Lo inverso: del pedido de Airtable. Sin condición guardada (pedidos viejos), `null`. */
export function facturacionDeFila(fila: Record<string, unknown>): FacturacionPedido | null {
  const t = (clave: string) => (typeof fila[clave] === "string" ? (fila[clave] as string) : "");
  if (!t("Factura_condicion_IVA")) return null;
  return {
    condicionIva: t("Factura_condicion_IVA"),
    clase: t("Factura_clase") || SIN_CLASE,
    razonSocial: t("Factura_razon_social"),
    cuit: t("Factura_CUIT"),
    domicilioFiscal: t("Factura_domicilio"),
  };
}

/** Cómo empieza la constancia en Notas cuando el pedido no tiene los campos Factura_. */
export const ENCABEZADO_NOTAS = "DATOS DE FACTURACIÓN";

/** Las líneas de facturación guardadas en Notas, si las hay. */
export function lineasDeNotas(notas: unknown): string[] | null {
  if (typeof notas !== "string" || !notas.startsWith(ENCABEZADO_NOTAS)) return null;
  // El bloque de facturación termina en la primera línea vacía (después puede
  // venir el cupón).
  const bloque = notas.split("\n\n")[0];
  const lineas = bloque.split("\n").slice(1).map((l) => l.trim()).filter(Boolean);
  return lineas.length > 0 ? lineas : null;
}

/** Las líneas para el aviso interno y para dejar constancia en texto. */
export function lineasDeFacturacion(p: FacturacionPedido): string[] {
  const clase = p.clase === SIN_CLASE ? "Factura: clase a confirmar" : `Factura ${p.clase}`;
  const nota = notaDeClase(
    p.clase === SIN_CLASE ? null : (p.clase as ClaseFactura),
    esCondicionIva(p.condicionIva) ? p.condicionIva : "Consumidor Final"
  );
  const lineas = p.cuit
    ? [
        `${clase} a nombre de un titular con CUIT`,
        `Razón social o titular: ${p.razonSocial}`,
        `CUIT: ${p.cuit}`,
        `Condición frente al IVA: ${p.condicionIva}`,
        `Domicilio fiscal: ${p.domicilioFiscal}`,
      ]
    : [`${clase} · Consumidor final, a nombre de quien compra`];
  return nota ? [...lineas, nota] : lineas;
}
