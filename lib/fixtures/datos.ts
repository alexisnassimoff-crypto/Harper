import { TABLAS } from "../airtable";
import { TABLA_IMPORTACION_ML } from "../ml-resenas";

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

/** Dos renglones: la ficha y la portada los muestran como dos párrafos. */
const DESCRIPCION_ANTEOJOS =
  "Anteojos con filtro de luz azul y cristales fotocromáticos.\nMarco liviano con el logo Harper en hot printing plata. Incluyen estuche rígido Harper con paño de microfibra.";

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

/**
 * Los colores con foto de portada (al sol y adentro, con el estuche y el
 * paño), como en Airtable (Variantes.Foto_portada).
 */
const CON_PORTADA = new Set([
  "AMATISTA-NEGRO", "AMATISTA-AMBAR", "AMATISTA-GRIS",
  "OBSIDIANA-NEGRO", "OBSIDIANA-AMBAR", "OBSIDIANA-GRIS",
  "CUARZO-NEGRO", "CUARZO-AMBAR",
  "CITRINO-NEGRO", "CITRINO-AMBAR", "CITRINO-GRIS", "CITRINO-CAREY",
]);

function conPortada(registro: RegistroFixture): RegistroFixture {
  const sku = String(registro.fields.SKU);
  if (!CON_PORTADA.has(sku)) return registro;
  const archivo = sku.toLowerCase().replace(/-(\w+)$/, (_, color: string) => `-${color}-portada.webp`);
  return { ...registro, fields: { ...registro.fields, Foto_portada: `/productos/anteojos/${archivo}` } };
}

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
].map(conPortada);

function config(clave: string, valor: string): RegistroFixture {
  return { id: `recCFG${clave}`, createdTime: CREADO, fields: { Clave: clave, Valor: valor } };
}

export const CONFIG: RegistroFixture[] = [
  config("costo_envio", "10100"),
  // Una prueba puede usar el mínimo de producción (HARPER_FIXTURES_ENVIO_GRATIS_DESDE=150000)
  // para que 1 par pague envío y 2 pares no.
  config("envio_gratis_desde", process.env.HARPER_FIXTURES_ENVIO_GRATIS_DESDE || "80000"),
  // Envío gratis en AMBA (donde llega el reparto de 24 h): más bajo que el del país.
  config("envio_gratis_amba_desde", process.env.HARPER_FIXTURES_ENVIO_GRATIS_AMBA_DESDE ?? "60000"),
  config("banner_texto", "Envio gratis en compras superiores a $80.000"),
  config("plazo_entrega", "3 a 7 dias habiles"),
  config("whatsapp", "5491173555065"),
  config("email_contacto", "harpercaseseyewear@gmail.com"),
  config("email_pedidos", "harpercaseseyewear@gmail.com"),
  config("razon_social", "FOCUS VISION SRL"),
  config("cuit", "30-71802316-1"),
  config("domicilio", "Núñez 2422, Ciudad Autónoma de Buenos Aires"),
  config("cp_origen", "1429"),
  config("embalaje_margen_cm", "1"),
  config("embalaje_peso_g", "30"),
  // El despacho, como en Airtable (Ale, 28/10/2026). Envia solo cotiza si la
  // prueba levanta un Envia de mentira (ENVIA_API_URL y ENVIA_TOKEN).
  config("envio_origen_nombre", "FOCUS VISION SRL"),
  config("envio_origen_telefono", "1173555065"),
  config("envio_origen_calle", "Gorostiaga"),
  config("envio_origen_numero", "1635"),
  config("envio_origen_piso", "5"),
  config("envio_origen_ciudad", "Ciudad Autónoma de Buenos Aires"),
  config("envio_origen_provincia", "Ciudad Autónoma de Buenos Aires"),
  config("envio_origen_cp", "1426"),
  config("envio_peso_kg", "0.5"),
  config("envio_transportistas", "rueddo, andreani, correoArgentino"),
  // Solo para probar cómo se ven. NO son datos reales: el código de Data
  // Fiscal lo entrega ARCA y la alícuota la define el contador.
  config("data_fiscal", "https://qr.afip.gob.ar/?qr=PRUEBA-NO-ES-REAL"),
  config("impuestos_nacionales", "21"),
  // Solo para probar la clase de factura. La condición real de FOCUS VISION
  // SRL frente al IVA la confirma el contador.
  config("condicion_iva", "Responsable Inscripto"),
  // La conexión con Mercado Libre, de mentira: solo se usa si la prueba de
  // punta a punta levanta un Mercado Libre falso (ML_API_URL, ML_APP_ID y
  // ML_APP_SECRET). Sin esas variables, la portada ni la mira.
  config("ml_access_token", "TOKEN-DE-PRUEBA"),
  config("ml_token_vence", "4102444800000"),
];

/**
 * La tabla "Importacion ML" (las publicaciones de Mercado Libre de cada
 * color), con los ID reales de las publicaciones de anteojos al 26/10/2026.
 */
function publicacionML(mlId: string, varianteId: string): RegistroFixture {
  return { id: `recML${mlId}`, createdTime: CREADO, fields: { ML_id: mlId, Variante: [varianteId], Estado: "importado" } };
}

export const IMPORTACION_ML: RegistroFixture[] = [
  publicacionML("MLA1951232513", "recq8UJEw6R0tYfQJ"), // CUARZO-NEGRO
  publicacionML("MLA1951206617", "recb2RMRRnEwan2W5"), // CUARZO-AMBAR
  publicacionML("MLA1951651985", "recLvS1Rce368QVeX"), // AMATISTA-NEGRO
  publicacionML("MLA1951664871", "rec30C9Sgrhdtf2Kx"), // AMATISTA-AMBAR
  publicacionML("MLA1951639359", "recKVFPGABlmfBNbk"), // AMATISTA-GRIS
  publicacionML("MLA3731593484", "rect8rgXzLjIGbTge"), // OBSIDIANA-NEGRO
  publicacionML("MLA3731541800", "rec93LwdHggqabwCq"), // OBSIDIANA-AMBAR
  publicacionML("MLA3731593486", "recdMidk2XWxUf8fp"), // OBSIDIANA-GRIS
  publicacionML("MLA3731603192", "rec5h3kW0JBY8Wd7y"), // CITRINO-NEGRO
  publicacionML("MLA3731564450", "recYgPCGGRFSSYqo8"), // CITRINO-AMBAR
  publicacionML("MLA3731564452", "recZOL5BGuIChtYo1"), // CITRINO-GRIS
  publicacionML("MLA3731603194", "recOVWC0S1rbDJADU"), // CITRINO-CAREY
  publicacionML("MLA3326800704", "recMyVTEzcVtTh64g"), // M500-MARRON: no es un anteojo
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
    [TABLA_IMPORTACION_ML, estructurar(IMPORTACION_ML)],
  ]);
}

/** Copia profunda: lo que se escriba en una corrida no contamina la siguiente. */
function estructurar(registros: RegistroFixture[]): RegistroFixture[] {
  return registros.map((r) => ({ ...r, fields: { ...r.fields } }));
}
