import { infoCategoria, type Categoria } from "./categorias";

/**
 * Las líneas de anteojos Harper (Ale, 30/10/2026): los fotocromáticos que ya
 * se venden y las que vienen en camino (órdenes de compra HARPER 2610 y
 * 2610-2): de sol polarizados, de receta con filtro de luz azul y clip-on con
 * apliques que se ponen con imán.
 *
 * Una línea está «disponible» apenas tiene productos con stock en su
 * categoría de Airtable; hasta entonces, si tiene modelos anunciados acá, sale
 * como «Próximamente» en la portada. Acá van solo nombres y colores: nada de
 * precios, códigos de fábrica ni costos. Lo que se afirma de cada línea es lo
 * que dicen las órdenes y confirmó Ale el 30/10/2026: armazón de TR,
 * polarizados categoría 3 con ISO 12312-1, filtro de luz azul con ISO 12870,
 * tres apliques con imán, y que el clip-on se usa con graduación. El origen
 * no se publica.
 */

export type ModeloQueViene = {
  nombre: string;
  /** Un color por variante de armazón, para los puntitos. */
  colores: string[];
  /** Cuando los colores todavía no tienen nombre ni tono confirmado. */
  cantidadDeColores?: number;
};

export type Linea = {
  clave: "fotocromaticos" | "sol" | "receta" | "clip-on";
  nombre: string;
  /** Para la etiqueta de arriba de la portada: "Sol", "Receta". */
  corto: string;
  /** Una línea: qué tiene, sin adjetivos de más. */
  promesa: string;
  /** Material, cristales y norma, en una línea corta. */
  ficha: string;
  /** Verdadero si a la línea se le pueden poner cristales con aumento: se invita a consultar. */
  conAumento: boolean;
  categoria: Categoria;
  /** Los modelos en camino; vacío = la línea no se anuncia hasta tener productos. */
  enCamino: ModeloQueViene[];
};

// Tonos aproximados de cada armazón, según la descripción de la orden.
const C = {
  negro: "#151515",
  negroMate: "#2c2c2c",
  carey: "#6b3f1d",
  careyOscuro: "#45321f",
  marronTraslucido: "#b08a6a",
  marronClaro: "#c4a07a",
  naranja: "#d9822b",
  naranjaTraslucido: "#e3a35a",
  marronDegrade: "#8a5a3a",
  grisTraslucido: "#b9bcc0",
  gris: "#8c8f93",
  grisDegrade: "#9a9da1",
  grisCarey: "#a9a39a",
  verdeTraslucido: "#9fc2a3",
  verdePalido: "#cfe3c8",
  azulMate: "#4f6d9a",
  azulBrillante: "#2f5fa8",
  azulTraslucido: "#9cc0de",
  cristal: "#e6eaee",
  verdeOscuro: "#2f4f3a",
  metalOscuro: "#55585c",
};

export const LINEAS: Linea[] = [
  {
    clave: "fotocromaticos",
    nombre: "Fotocromáticos",
    corto: "Fotocromáticos",
    promesa: "Claros adentro, oscuros al sol, con filtro de luz azul. Te los ponés y listo.",
    ficha: "Fotocromáticos · Filtro de luz azul · UV400",
    conAumento: true,
    categoria: "Anteojos",
    enCamino: [],
  },
  {
    clave: "sol",
    nombre: "De sol polarizados",
    corto: "Sol",
    promesa: "Polarizados, categoría 3: menos reflejo. Más ganas de quedarte afuera.",
    ficha: "Armazón de TR · Polarizados cat. 3 · ISO 12312-1",
    conAumento: false,
    categoria: "Anteojos de sol",
    enCamino: [
      { nombre: "TURMALINA", colores: [C.negro, C.carey, C.marronTraslucido, C.naranja, C.marronDegrade] },
      { nombre: "TOPACIO", colores: [C.negro, C.grisTraslucido, C.marronTraslucido, C.carey, C.verdeTraslucido] },
      { nombre: "PIRITA", colores: [C.negro, C.grisTraslucido, C.verdeTraslucido, C.azulMate] },
      { nombre: "FLUORITA", colores: [C.negro, C.gris] },
      { nombre: "ÓPALO", colores: [C.negro, C.verdeTraslucido, C.naranjaTraslucido, C.grisCarey] },
      { nombre: "GRANATE", colores: [C.negro, C.marronTraslucido, C.grisTraslucido] },
      { nombre: "BERILO", colores: [C.marronTraslucido, C.carey, C.gris] },
      { nombre: "ADULARIA", colores: [C.grisTraslucido, C.carey] },
      { nombre: "LABRADORITA", colores: [C.negro, C.grisTraslucido, C.carey, C.naranjaTraslucido] },
      { nombre: "ESPINELA", colores: [C.negro, C.negroMate, C.careyOscuro, C.azulBrillante, C.verdeTraslucido] },
    ],
  },
  {
    clave: "receta",
    nombre: "De receta",
    corto: "Receta",
    promesa: "Para graduar, con filtro de luz azul. Dejan de ser obligación: los elegís.",
    ficha: "Armazón de TR o de metal · Filtro de luz azul · ISO 12870",
    conAumento: true,
    categoria: "Anteojos de receta",
    enCamino: [
      { nombre: "TURQUESA", colores: [C.cristal, C.verdeTraslucido, C.azulMate] },
      { nombre: "ALABASTRO", colores: [C.negroMate, C.cristal, C.grisTraslucido] },
      { nombre: "PERIDOTO", colores: [C.negro, C.verdePalido, C.grisTraslucido, C.verdeTraslucido] },
      {
        nombre: "SELENITA",
        colores: [C.negro, C.cristal, C.grisTraslucido, C.azulTraslucido, C.carey, C.naranjaTraslucido, C.verdeTraslucido],
      },
      { nombre: "DIAMANTE", colores: [C.negro, C.carey, C.grisTraslucido] },
      { nombre: "ANDESINA", colores: [C.negro, C.grisCarey, C.grisTraslucido, C.carey, C.azulTraslucido, C.naranjaTraslucido] },
      { nombre: "SARDÓNIX", colores: [C.negro, C.grisCarey, C.careyOscuro] },
      { nombre: "ÁMBAR", colores: [C.negro, C.carey, C.marronTraslucido, C.grisCarey, C.verdeOscuro] },
      // De metal.
      { nombre: "RUTILO", colores: [C.negro] },
      { nombre: "LAPISLÁZULI", colores: [C.negro, C.metalOscuro] },
    ],
  },
  {
    clave: "clip-on",
    nombre: "Clip-on",
    corto: "Clip-on",
    // El anteojo de uso diario, con graduación; los apliques van encima (Ale, 30/10/2026).
    promesa: "Tu anteojo de siempre, con tu graduación. Le apoyás un aplique con imán y son otros. Vienen tres.",
    ficha: "Filtro de luz azul · 3 apliques con imán · ISO 12312-1",
    conAumento: true,
    categoria: "Clip-On",
    enCamino: [
      { nombre: "AGUAMARINA", colores: [C.negro, C.verdeTraslucido, C.azulTraslucido, C.cristal, C.grisDegrade] },
      { nombre: "LARIMAR", colores: [C.negro, C.verdeTraslucido, C.azulTraslucido, C.cristal] },
      { nombre: "NÁCAR", colores: [C.negro, C.grisTraslucido, C.marronClaro, C.cristal] },
      { nombre: "JADE", colores: [C.verdeTraslucido, C.negroMate, C.cristal, C.grisTraslucido] },
      { nombre: "AMETRINO", colores: [], cantidadDeColores: 4 },
    ],
  },
];

export type LineaEnPortada = Linea & {
  estado: "disponible" | "proximamente";
  modelos: number;
  colores: number;
  /** La sección de la tienda de la línea, si ya tiene productos. */
  ruta: string | null;
};

/**
 * Las líneas que muestra la portada: las que tienen productos con stock
 * (disponibles) y las que tienen modelos anunciados (próximamente). Una línea
 * sin una cosa ni la otra no aparece.
 */
export function lineasDeLaPortada(productos: { categoria: Categoria; variantes: { agotada: boolean }[] }[]): LineaEnPortada[] {
  return LINEAS.flatMap((linea): LineaEnPortada[] => {
    const conStock = productos.filter((p) => p.categoria === linea.categoria && p.variantes.some((v) => !v.agotada));
    if (conStock.length > 0) {
      return [
        {
          ...linea,
          estado: "disponible",
          modelos: conStock.length,
          colores: conStock.reduce((n, p) => n + p.variantes.filter((v) => !v.agotada).length, 0),
          ruta: `/${infoCategoria(linea.categoria).slug}`,
        },
      ];
    }
    if (linea.enCamino.length === 0) return [];
    return [
      {
        ...linea,
        estado: "proximamente",
        modelos: linea.enCamino.length,
        colores: linea.enCamino.reduce((n, m) => n + (m.colores.length || m.cantidadDeColores || 0), 0),
        ruta: null,
      },
    ];
  });
}
