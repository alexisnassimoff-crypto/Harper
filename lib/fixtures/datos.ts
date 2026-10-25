import { TABLAS } from "../airtable";

/**
 * Catálogo de prueba: una copia del contenido real de Airtable al 22/10/2026.
 *
 * Sirve para levantar la tienda sin red —en una máquina sin credenciales, en
 * una captura de pantalla, en una prueba— y ver exactamente lo que ve el
 * comprador. Las fotos son las mismas rutas locales de /public que usa
 * producción.
 *
 * Es solo para desarrollo: en producción este archivo nunca se carga (ver
 * `modoFixtures` en lib/airtable.ts).
 *
 * Los campos nuevos de la ficha (Incluye, Medidas, Material, Lentes) vienen
 * cargados con valores DE EJEMPLO para poder ver cómo se renderizan. En
 * Airtable están vacíos hasta que Ale los confirme.
 */

export type RegistroFixture = {
  id: string;
  createdTime: string;
  fields: Record<string, unknown>;
};

const CREADO = "2026-08-23T21:35:20.000Z";

const DESCRIPCION_ANTEOJOS =
  "Anteojos con filtro de luz azul y cristales fotocromáticos. Marco liviano con el logo Harper en hot printing plata. Incluyen estuche rígido Harper con paño de microfibra.";

function producto(
  id: string,
  campos: Record<string, unknown>
): RegistroFixture {
  return { id, createdTime: CREADO, fields: { Activo: true, ...campos } };
}

const ANTEOJO = {
  Categoria: "Anteojos",
  Descripcion: DESCRIPCION_ANTEOJOS,
  Precio: 89900,
  Peso_g: 160,
  Largo_cm: 17.6,
  Ancho_cm: 6,
  Alto_cm: 4.2,
  Incluye: "Estuche rígido Harper\nPaño de microfibra",
};

const ESTUCHE = {
  Categoria: "Estuches",
  Peso_g: 140,
  Largo_cm: 16.2,
  Ancho_cm: 7,
  Alto_cm: 4.2,
  Incluye: "Paño de microfibra de alta densidad",
};

export const PRODUCTOS: RegistroFixture[] = [
  producto("recPJzzJFhyEF0DMw", {
    ...ANTEOJO,
    Nombre: "AMATISTA",
    Slug: "amatista",
    Orden: 1,
    // Medidas de ejemplo, solo para ver la ficha. No son datos confirmados.
    Frente_mm: 140,
    Puente_mm: 19,
    Patilla_mm: 145,
    Material: "Acetato",
    Lentes: "Fotocromáticos con filtro de luz azul",
  }),
  producto("recekcq1kK8TJFp4h", { ...ANTEOJO, Nombre: "OBSIDIANA", Slug: "obsidiana", Orden: 2 }),
  producto("rec73rErj59hTNnz8", { ...ANTEOJO, Nombre: "CUARZO", Slug: "cuarzo", Orden: 3 }),
  producto("recywEhXkR8g53yDD", { ...ANTEOJO, Nombre: "CITRINO", Slug: "citrino", Orden: 4 }),

  producto("rec1OLrInalgRigKf", {
    ...ESTUCHE,
    Nombre: "R100",
    Slug: "r100",
    Orden: 1,
    Precio: 6990,
    Descripcion:
      "Estuche rígido rectangular de ecocuero premium reforzado. Bisagras reforzadas de apertura suave, interior en símil gamuza que protege los cristales. Incluye paño de microfibra de alta densidad.",
  }),
  producto("recuwV528wmBEONh6", {
    ...ESTUCHE,
    Nombre: "O300",
    Slug: "o300",
    Orden: 2,
    Precio: 6990,
    Descripcion:
      "Estuche rígido de forma redondeada en ecocuero premium reforzado. Bisagras reforzadas de apertura suave, interior en símil gamuza que protege los cristales. Incluye paño de microfibra de alta densidad.",
  }),
  producto("reciqwodWWhuku73b", {
    ...ESTUCHE,
    Nombre: "M500",
    Slug: "m500",
    Orden: 3,
    Precio: 8990,
    Largo_cm: 17,
    Ancho_cm: 5.4,
    Alto_cm: 3.4,
    Descripcion:
      "Estuche rígido con cierre magnético en ecocuero premium. Estructura reforzada, interior en símil gamuza que protege los cristales. Incluye paño de microfibra de alta densidad.",
  }),

  producto("recSq5CS0vGVRrx4y", {
    Nombre: "Paño Premium Alta Densidad",
    Slug: "pano-alta-densidad",
    Categoria: "Paños",
    Orden: 1,
    Precio: 29900,
    Peso_g: 500,
    Largo_cm: 18.2,
    Ancho_cm: 15.6,
    Alto_cm: 5,
    Descripcion:
      "Pack de 100 paños de microfibra premium de 15x18 cm. Limpieza profesional de cristales: no raya, no deja pelusa ni vetas. Ideal para tratamientos antirreflejo, blue cut y polarizados.",
  }),
  producto("recggN3YeAWONkJ81", {
    Nombre: "Paño Premium Media Densidad",
    Slug: "pano-media-densidad",
    Categoria: "Paños",
    Orden: 2,
    Precio: 24900,
    Peso_g: 500,
    Largo_cm: 18.2,
    Ancho_cm: 15.6,
    Alto_cm: 5,
    Descripcion:
      "Pack de 100 paños de microfibra premium de 15x18 cm, en calidad superior. Limpieza profesional de cristales: no raya, no deja pelusa ni vetas. Ideal para tratamientos antirreflejo, blue cut y polarizados.",
  }),
  producto("recjg70hw6KEjeukr", {
    Nombre: "Paño de Mostrador 30x45",
    Slug: "pano-mostrador-30x45",
    Categoria: "Paños",
    Orden: 3,
    Precio: 15900,
    Descripcion:
      "Paño de microfibra de mostrador de 30x45 cm. El formato grande para el punto de venta: limpia cristales, vitrinas y exhibidores sin rayar ni dejar pelusa. Misma microfibra premium que los paños de 15x18.",
  }),
  // Inactivo a propósito: la tienda tiene que ignorarlo.
  { id: "recw48umh58sZl3D6", createdTime: CREADO, fields: { Nombre: "PRUEBA - NO COMPRAR", Slug: "prueba-cobro", Categoria: "Paños", Precio: 100, Orden: 999 } },
];

function variante(
  id: string,
  productoId: string,
  sku: string,
  color: string,
  hex: string,
  stock: number,
  orden: number,
  fotos: string[]
): RegistroFixture {
  return {
    id,
    createdTime: CREADO,
    fields: {
      SKU: sku,
      Producto: [productoId],
      Color: color,
      Color_hex: hex,
      Stock: stock,
      Orden: orden,
      Activo: true,
      Fotos_url: fotos.join("\n"),
    },
  };
}

const ESTUCHE_INCLUIDO = [1, 2, 3].map((n) => `/productos/anteojos/estuche-incluido-${n}.webp`);

function fotosAnteojo(modelo: string, color: string) {
  return [1, 2, 3].map((n) => `/productos/anteojos/${modelo}-${color}-${n}.webp`).concat(ESTUCHE_INCLUIDO);
}

function fotosEstuche(modelo: string, color: string) {
  return [1, 2, 3, 4].map((n) => `/productos/estuches/${modelo}-${color}-${n}.webp`);
}

const NEGRO = "#1D1D1B";
const AMBAR = "#C98F45";
const GRIS_TRASLUCIDO = "#9DA2A6";

export const VARIANTES: RegistroFixture[] = [
  variante("recLvS1Rce368QVeX", "recPJzzJFhyEF0DMw", "AMATISTA-NEGRO", "Negro", NEGRO, 12, 1, fotosAnteojo("amatista", "negro")),
  variante("rec30C9Sgrhdtf2Kx", "recPJzzJFhyEF0DMw", "AMATISTA-AMBAR", "Ámbar traslúcido", AMBAR, 12, 2, fotosAnteojo("amatista", "ambar")),
  variante("recKVFPGABlmfBNbk", "recPJzzJFhyEF0DMw", "AMATISTA-GRIS", "Gris traslúcido", GRIS_TRASLUCIDO, 12, 3, fotosAnteojo("amatista", "gris")),

  variante("rect8rgXzLjIGbTge", "recekcq1kK8TJFp4h", "OBSIDIANA-NEGRO", "Negro", NEGRO, 12, 1, fotosAnteojo("obsidiana", "negro")),
  variante("rec93LwdHggqabwCq", "recekcq1kK8TJFp4h", "OBSIDIANA-AMBAR", "Ámbar traslúcido", AMBAR, 12, 2, fotosAnteojo("obsidiana", "ambar")),
  variante("recdMidk2XWxUf8fp", "recekcq1kK8TJFp4h", "OBSIDIANA-GRIS", "Gris traslúcido", GRIS_TRASLUCIDO, 12, 3, fotosAnteojo("obsidiana", "gris")),

  variante("recq8UJEw6R0tYfQJ", "rec73rErj59hTNnz8", "CUARZO-NEGRO", "Negro", NEGRO, 12, 1, fotosAnteojo("cuarzo", "negro")),
  variante("recb2RMRRnEwan2W5", "rec73rErj59hTNnz8", "CUARZO-AMBAR", "Ámbar traslúcido", AMBAR, 12, 2, fotosAnteojo("cuarzo", "ambar")),

  variante("rec5h3kW0JBY8Wd7y", "recywEhXkR8g53yDD", "CITRINO-NEGRO", "Negro", NEGRO, 12, 1, fotosAnteojo("citrino", "negro")),
  variante("recYgPCGGRFSSYqo8", "recywEhXkR8g53yDD", "CITRINO-AMBAR", "Ámbar traslúcido", AMBAR, 12, 2, fotosAnteojo("citrino", "ambar")),
  variante("recZOL5BGuIChtYo1", "recywEhXkR8g53yDD", "CITRINO-GRIS", "Gris traslúcido", GRIS_TRASLUCIDO, 12, 3, fotosAnteojo("citrino", "gris")),
  // Stock bajo a propósito, para ver el aviso de "quedan pocas".
  variante("recOVWC0S1rbDJADU", "recywEhXkR8g53yDD", "CITRINO-CAREY", "Carey", "#7A4A26", 3, 4, fotosAnteojo("citrino", "carey")),

  variante("recUt2E9B8CnymzJ4", "rec1OLrInalgRigKf", "R100-MARRON", "Marrón", "#713519", 1000, 1, fotosEstuche("r100", "marron")),
  variante("recUhcR8wlI7J8ycV", "rec1OLrInalgRigKf", "R100-GRIS", "Gris", "#7C7C7A", 1000, 2, fotosEstuche("r100", "gris")),
  variante("recs2sCE4NGqhN30D", "rec1OLrInalgRigKf", "R100-NEGRO", "Negro", NEGRO, 1000, 3, fotosEstuche("r100", "negro")),
  variante("recNUSj9Tzm6x4Iup", "rec1OLrInalgRigKf", "R100-AZUL", "Azul petróleo", "#01425E", 1000, 4, fotosEstuche("r100", "azul")),

  variante("recxRZzI79EyGjTn8", "recuwV528wmBEONh6", "O300-MARRON", "Marrón", "#713519", 1000, 1, fotosEstuche("o300", "marron")),
  variante("recVrqYywSfdeMFzC", "recuwV528wmBEONh6", "O300-ROJO", "Rojo", "#C23B37", 1000, 2, fotosEstuche("o300", "rojo")),
  variante("recK8MNGn2D0O9EDg", "recuwV528wmBEONh6", "O300-NEGRO", "Negro", NEGRO, 1000, 3, fotosEstuche("o300", "negro")),
  variante("recPDSmRdPy4G4J2u", "recuwV528wmBEONh6", "O300-AZUL", "Azul petróleo", "#01425E", 1000, 4, fotosEstuche("o300", "azul")),

  variante("recMyVTEzcVtTh64g", "reciqwodWWhuku73b", "M500-MARRON", "Marrón", "#713519", 1000, 1, fotosEstuche("m500", "marron")),
  variante("recO5RQKeydWUda86", "reciqwodWWhuku73b", "M500-GRIS", "Gris", "#7C7C7A", 1000, 2, fotosEstuche("m500", "gris")),
  variante("rec594e3IIRZUA1Il", "reciqwodWWhuku73b", "M500-CAMEL", "Camel", "#DD9658", 1000, 3, fotosEstuche("m500", "camel")),
  variante("rec7nfs8eu6k0EOFX", "reciqwodWWhuku73b", "M500-NEGRO", "Negro", "#0A0A0A", 1000, 4, fotosEstuche("m500", "negro")),

  variante("recV4xRvPsQ7iVMKu", "recSq5CS0vGVRrx4y", "PANO-ALTA-NEGRO", "Negro", "#0A0A0A", 100, 1, [5, 4, 3, 1, 2].map((n) => `/productos/panos/pano-${n}.webp`)),
  variante("recxeVU4Tza1ZbuRM", "recggN3YeAWONkJ81", "PANO-MEDIA-NEGRO", "Negro", "#0A0A0A", 100, 1, [4, 3, 5, 1, 2].map((n) => `/productos/panos/pano-${n}.webp`)),
  variante("recjv246Wi15lGAFP", "recjg70hw6KEjeukr", "PANO-MOSTRADOR-NEGRO", "Negro", "#0A0A0A", 100, 1, ["/productos/panos/mostrador-1.webp"]),
];

function config(clave: string, valor: string): RegistroFixture {
  return { id: `recCFG${clave}`, createdTime: CREADO, fields: { Clave: clave, Valor: valor } };
}

export const CONFIG: RegistroFixture[] = [
  config("costo_envio", "10100"),
  config("envio_gratis_desde", "80000"),
  config("banner_texto", "Envio gratis en compras superiores a $80.000"),
  config("plazo_entrega", "3 a 7 dias habiles"),
  config("whatsapp", "5491149172061"),
  config("email_contacto", "harpercaseseyewear@gmail.com"),
  config("email_pedidos", "harpercaseseyewear@gmail.com"),
  config("razon_social", "FOCUS VISION SRL"),
  config("cuit", "30-71802316-1"),
  config("domicilio", "Núñez 2422, Ciudad Autónoma de Buenos Aires"),
  config("cp_origen", "1429"),
  config("embalaje_margen_cm", "1"),
  config("embalaje_peso_g", "30"),
  // Solo para probar cómo se ven. NO son datos reales: el código de Data
  // Fiscal lo entrega ARCA y la alícuota la define el contador.
  config("data_fiscal", "https://qr.afip.gob.ar/?qr=PRUEBA-NO-ES-REAL"),
  config("impuestos_nacionales", "21"),
];

function descuento(categoria: string, desde: number, porcentaje: number): RegistroFixture {
  return {
    id: `recDESC${categoria}${desde}`,
    createdTime: CREADO,
    fields: { Nombre: `${categoria} ${desde}+`, Categoria: categoria, Desde_unidades: desde, Porcentaje: porcentaje, Activo: true },
  };
}

export const DESCUENTOS: RegistroFixture[] = ["Anteojos", "Estuches", "Paños"].flatMap((c) => [
  descuento(c, 2, 5),
  descuento(c, 4, 10),
  descuento(c, 8, 15),
  descuento(c, 15, 20),
]);

/**
 * Un pedido ya pagado, para ver la página de gracias confirmada (y el evento
 * Purchase) sin pagar nada. Dos anteojos con el 5%, envío gratis.
 */
export const PEDIDOS: RegistroFixture[] = [
  {
    id: "recPEDIDOPRUEBA01",
    createdTime: CREADO,
    fields: {
      Numero: "HARPER-PRUEBA",
      Estado: "pagado",
      Items: JSON.stringify([
        { productoId: "recywEhXkR8g53yDD", productoSlug: "citrino", nombre: "CITRINO", categoria: "Anteojos", varianteId: "recOVWC0S1rbDJADU", sku: "CITRINO-CAREY", color: "Carey", foto: "/productos/anteojos/citrino-carey-1.webp", precioLista: 89900, precioUnitario: 85405, descuento: 5, cantidad: 1, subtotal: 85405, stockDisponible: 3 },
        { productoId: "recPJzzJFhyEF0DMw", productoSlug: "amatista", nombre: "AMATISTA", categoria: "Anteojos", varianteId: "recLvS1Rce368QVeX", sku: "AMATISTA-NEGRO", color: "Negro", foto: "/productos/anteojos/amatista-negro-1.webp", precioLista: 89900, precioUnitario: 85405, descuento: 5, cantidad: 1, subtotal: 85405, stockDisponible: 12 },
      ]),
      Subtotal: 170810,
      Envio: 0,
      Total: 170810,
      MP_payment_id: "999999",
      MP_status: "approved",
      Origen: JSON.stringify({ utm_source: "ig", utm_medium: "paid", utm_campaign: "prueba", fbclid: "abc123", landing: "/anteojos", ts: 1761000000000 }),
    },
  },
];

/** Las tablas tal como las espera `lib/airtable.ts`, por su ID. */
export function tablasIniciales(): Map<string, RegistroFixture[]> {
  return new Map<string, RegistroFixture[]>([
    [TABLAS.productos, estructurar(PRODUCTOS)],
    [TABLAS.variantes, estructurar(VARIANTES)],
    [TABLAS.config, estructurar(CONFIG)],
    [TABLAS.descuentos, estructurar(DESCUENTOS)],
    [TABLAS.pedidos, estructurar(PEDIDOS)],
    [TABLAS.clientes, []],
    [TABLAS.arrepentimientos, []],
  ]);
}

/** Copia profunda: lo que se escriba en una corrida no contamina la siguiente. */
function estructurar(registros: RegistroFixture[]): RegistroFixture[] {
  return registros.map((r) => ({ ...r, fields: { ...r.fields } }));
}
