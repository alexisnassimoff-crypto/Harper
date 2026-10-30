import { codigoEnviaDeProvincia } from "./provincias-envia";

/**
 * El reparto de AMBA con la tarifa directa de Rueddo (el tarifario que le
 * pasó Rueddo a Harper, octubre de 2026), sin preguntarle a Envia.
 *
 * La zona sale del mapa de cobertura de Rueddo, por partido: la Ciudad
 * entera, GBA 1, GBA 2 y las zonas lejanas (GBA 3). La Matanza está partida
 * en el mapa: los barrios pegados a la Ciudad son GBA 1 y el resto GBA 2.
 *
 * Lo que paga el comprador (sin envío gratis) es la tarifa con IVA más un
 * recargo (Config `envio_amba_recargo`, hoy 20 %), redondeado hacia arriba al
 * peso. Así, cuando el envío es gratis, el precio tachado vale lo que vale el
 * servicio (decisión de Ale, 30/10/2026). Las tarifas sin IVA están en Config
 * (`envio_amba_tarifas`) porque Rueddo las ajusta cada tres meses.
 */

export type ZonaRueddo = "CABA" | "GBA 1" | "GBA 2" | "GBA 3";

export const ZONAS_RUEDDO: readonly ZonaRueddo[] = ["CABA", "GBA 1", "GBA 2", "GBA 3"];

/** La tarifa plana por paquete, SIN IVA, del tarifario de Rueddo. */
export type TarifasRueddo = Record<ZonaRueddo, number>;

export const TARIFAS_RUEDDO_POR_DEFECTO: TarifasRueddo = { CABA: 3709, "GBA 1": 5370, "GBA 2": 7500, "GBA 3": 7500 };

/** Lo que se suma a la tarifa con IVA, en %. */
export const RECARGO_AMBA_POR_DEFECTO = 20;

/** El IVA del servicio, en %: las tarifas de Rueddo no lo incluyen. */
export const IVA_ENVIO = 21;

/** La tarifa plana vale hasta este paquete: 5 kg y 40 × 40 × 40 cm. */
export const PESO_MAXIMO_KG = 5;
export const LADO_MAXIMO_CM = 40;

/** El plazo del reparto, como lo dice Envia: entrega al día hábil siguiente (corte a las 12 h). */
export const PLAZO_REPARTO = "Día siguiente";

const normalizar = (texto: string | undefined) =>
  (texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/^partido de /, "")
    .replace(/[.'´`]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Los partidos del mapa de Rueddo, por zona. La Matanza va aparte. */
const PARTIDOS: Record<string, ZonaRueddo> = {
  // GBA 1
  "san fernando": "GBA 1",
  "san isidro": "GBA 1",
  "vicente lopez": "GBA 1",
  "general san martin": "GBA 1",
  "san martin": "GBA 1",
  hurlingham: "GBA 1",
  "tres de febrero": "GBA 1",
  ituzaingo: "GBA 1",
  moron: "GBA 1",
  avellaneda: "GBA 1",
  lanus: "GBA 1",
  "lomas de zamora": "GBA 1",
  // GBA 2
  tigre: "GBA 2",
  "malvinas argentinas": "GBA 2",
  "jose c paz": "GBA 2",
  "jose clemente paz": "GBA 2",
  "san miguel": "GBA 2",
  moreno: "GBA 2",
  merlo: "GBA 2",
  ezeiza: "GBA 2",
  "esteban echeverria": "GBA 2",
  "almirante brown": "GBA 2",
  "florencio varela": "GBA 2",
  quilmes: "GBA 2",
  berazategui: "GBA 2",
  // Zonas lejanas (GBA 3)
  escobar: "GBA 3",
  pilar: "GBA 3",
  "general rodriguez": "GBA 3",
  "la plata": "GBA 3",
  ensenada: "GBA 3",
  berisso: "GBA 3",
};

/**
 * Las localidades de cada partido, para cuando no viene el partido (la
 * dirección cargada a mano, o la que se recuerda de una compra anterior):
 * Google y la gente escriben "Martínez", no "San Isidro".
 */
const LOCALIDADES: Record<string, string> = Object.fromEntries(
  Object.entries({
    "vicente lopez": ["florida", "florida oeste", "olivos", "la lucila", "munro", "villa martelli", "carapachay"],
    "san isidro": ["martinez", "acassuso", "beccar", "boulogne", "boulogne sur mer", "villa adelina"],
    "san fernando": ["victoria", "virreyes"],
    "general san martin": ["villa ballester", "jose leon suarez", "san andres", "villa lynch", "villa maipu", "billinghurst", "chilavert"],
    "tres de febrero": [
      "caseros", "ciudadela", "santos lugares", "saenz pena", "villa bosch", "martin coronado", "ciudad jardin lomas del palomar",
      "ciudad jardin", "loma hermosa", "pablo podesta", "churruca", "villa raffo", "jose ingenieros", "once de septiembre",
    ],
    hurlingham: ["william c morris", "william morris", "villa tesei"],
    ituzaingo: ["villa udaondo"],
    moron: ["castelar", "haedo", "el palomar", "villa sarmiento"],
    avellaneda: ["sarandi", "wilde", "dock sud", "gerli", "pineyro", "villa dominico"],
    lanus: ["lanus este", "lanus oeste", "remedios de escalada", "valentin alsina", "monte chingolo"],
    "lomas de zamora": ["banfield", "temperley", "turdera", "llavallol", "fiorito", "villa fiorito", "ingeniero budge", "villa centenario"],
    tigre: [
      "don torcuato", "general pacheco", "el talar", "benavidez", "rincon de milberg", "dique lujan", "nordelta", "troncos del talar",
      "ricardo rojas",
    ],
    "malvinas argentinas": [
      "los polvorines", "grand bourg", "pablo nogues", "ingeniero pablo nogues", "villa de mayo", "adolfo sourdeaux",
      "ingeniero adolfo sourdeaux", "tierras altas", "tortuguitas",
    ],
    "san miguel": ["bella vista", "muniz"],
    moreno: ["paso del rey", "francisco alvarez", "la reja", "trujui", "cuartel v"],
    merlo: ["san antonio de padua", "padua", "parque san martin", "libertad", "pontevedra", "mariano acosta"],
    ezeiza: ["tristan suarez", "carlos spegazzini", "la union", "canning"],
    "esteban echeverria": ["monte grande", "luis guillon", "el jaguel", "9 de abril", "nueve de abril"],
    "almirante brown": [
      "adrogue", "burzaco", "longchamps", "jose marmol", "rafael calzada", "claypole", "glew", "ministro rivadavia", "don orione",
      "san francisco solano",
    ],
    "florencio varela": ["bosques", "zeballos", "ingeniero allan", "la capilla", "villa vatteone", "gobernador costa"],
    quilmes: ["bernal", "bernal oeste", "don bosco", "ezpeleta", "quilmes oeste"],
    berazategui: [
      "ranelagh", "sourigues", "platanos", "hudson", "guillermo enrique hudson", "pereyra", "villa espana", "juan maria gutierrez",
    ],
    escobar: ["belen de escobar", "garin", "ingeniero maschwitz", "maquinista savio", "matheu", "loma verde"],
    pilar: [
      "del viso", "presidente derqui", "derqui", "villa rosa", "manuel alberti", "fatima", "manzanares", "zelaya", "la lonja",
      "villa astolfi",
    ],
    "la plata": [
      "city bell", "gonnet", "manuel b gonnet", "villa elisa", "tolosa", "los hornos", "ringuelet", "gorina", "joaquin gorina",
      "abasto", "melchor romero", "villa elvira", "arturo segui", "lisandro olmos",
    ],
    ensenada: ["punta lara"],
    "la matanza": [
      "ramos mejia", "lomas del mirador", "san justo", "villa luzuriaga", "la tablada", "tapiales", "aldo bonzi", "villa madero",
      "isidro casanova", "gregorio de laferrere", "laferrere", "rafael castillo", "gonzalez catan", "virrey del pino", "20 de junio",
      "veinte de junio", "ciudad evita",
    ],
  }).flatMap(([partido, localidades]) => localidades.map((l) => [l, partido]))
);

/** La parte de La Matanza que el mapa pinta como GBA 1 (la pegada a la Ciudad). El resto es GBA 2. */
const LA_MATANZA_GBA1 = new Set([
  "ramos mejia",
  "lomas del mirador",
  "san justo",
  "villa luzuriaga",
  "la tablada",
  "tapiales",
  "aldo bonzi",
  "villa madero",
]);

/**
 * La zona de Rueddo de un destino, o null si no está en su mapa (o no se
 * reconoce el partido ni la localidad). `partido` es el que trae Google
 * (administrative_area_level_2); sin él, se busca la localidad.
 */
export function zonaDeRueddo(destino: { provincia: string; ciudad: string; partido?: string }): ZonaRueddo | null {
  const provincia = codigoEnviaDeProvincia(destino.provincia);
  if (provincia === "DF") return "CABA";
  if (provincia !== "BA") return null;

  const esPartido = (nombre: string) => nombre in PARTIDOS || nombre === "la matanza";
  const ciudad = normalizar(destino.ciudad);
  const deGoogle = normalizar(destino.partido);
  const partido = esPartido(deGoogle) ? deGoogle : esPartido(ciudad) ? ciudad : (LOCALIDADES[ciudad] ?? "");

  // La Matanza sin un barrio de los pegados a la Ciudad: GBA 2, la tarifa de la parte más lejana.
  if (partido === "la matanza") return LA_MATANZA_GBA1.has(ciudad) ? "GBA 1" : "GBA 2";
  return PARTIDOS[partido] ?? null;
}

/** Si el paquete entra en la tarifa plana (5 kg, 40 × 40 × 40 cm). Sin medidas, se asume que sí: son anteojos. */
export function entraEnLaTarifa(paquete: { pesoKg: number; largoCm: number; anchoCm: number; altoCm: number } | null): boolean {
  if (!paquete) return true;
  return (
    paquete.pesoKg <= PESO_MAXIMO_KG &&
    paquete.largoCm <= LADO_MAXIMO_CM &&
    paquete.anchoCm <= LADO_MAXIMO_CM &&
    paquete.altoCm <= LADO_MAXIMO_CM
  );
}

/**
 * Cuánto sale el envío en esa zona: `costo` es lo que cobra Rueddo con IVA
 * (con centavos); `precio`, lo que paga el comprador: el costo más el
 * recargo, en pesos enteros y hacia arriba. Null si la zona no tiene tarifa.
 */
export function precioDeRueddo(
  zona: ZonaRueddo,
  tarifas: TarifasRueddo,
  recargo: number
): { tarifa: number; costo: number; precio: number } | null {
  const tarifa = tarifas[zona];
  if (!(tarifa > 0)) return null;
  const pct = Number.isFinite(recargo) && recargo >= 0 ? recargo : RECARGO_AMBA_POR_DEFECTO;
  // En centésimos de peso, con enteros: 3709 × 1,21 × 1,20 = 5385,47 → $ 5.386.
  const costoCentavos = Math.round(tarifa * (100 + IVA_ENVIO));
  const precio = Math.ceil((costoCentavos * (100 + pct)) / 10_000 - 1e-9);
  return { tarifa, costo: costoCentavos / 100, precio };
}

/**
 * Las tarifas de Config (`envio_amba_tarifas`), sin IVA: "CABA 3709 · GBA 1
 * 5370 · GBA 2 7500 · GBA 3 7500". Separadas por "·", coma, punto y coma o
 * renglón; "Zonas lejanas" vale por GBA 3; "7.500" o "$ 7500" también. La
 * zona que falta o no se entiende queda con la tarifa del tarifario.
 */
export function leerTarifasRueddo(texto: string | undefined): TarifasRueddo {
  const tarifas = { ...TARIFAS_RUEDDO_POR_DEFECTO };
  for (const parte of (texto ?? "").split(/[·;,\n|]+/)) {
    const m = normalizar(parte.replace(/\$/g, " ").replace(/(\d)\.(\d{3})(?!\d)/g, "$1$2")).match(
      /^(caba|gba ?([123])|zonas? lejanas?)\s*[:=-]?\s*(\d{3,6})$/
    );
    if (!m) continue;
    const zona: ZonaRueddo = m[1] === "caba" ? "CABA" : m[2] ? (`GBA ${m[2]}` as ZonaRueddo) : "GBA 3";
    tarifas[zona] = Number(m[3]);
  }
  return tarifas;
}

/** "CABA $ 3.709 · GBA 1 $ 5.370 · …", para el health y las notas. */
export function textoTarifasRueddo(tarifas: TarifasRueddo): string {
  return ZONAS_RUEDDO.map((z) => `${z} ${tarifas[z]}`).join(" · ");
}
