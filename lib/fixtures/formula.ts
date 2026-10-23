/**
 * Evaluador mínimo de `filterByFormula` para el modo de datos de prueba.
 *
 * Cubre exactamente las fórmulas que usa la tienda, nada más:
 *
 *   {Activo}
 *   AND({Activo}, {Slug} = 'amatista')
 *   {Numero} = "HP-0001"
 *   LOWER({Email}) = 'ale@…'
 *   {Clave} = 'costo_envio'
 *   OR(…), NOT(…)
 *
 * Si aparece algo que no entiende, tira error: preferible a devolver todos los
 * registros y que una prueba pase por casualidad.
 */

type Campos = Record<string, unknown>;

type Token =
  | { tipo: "campo"; valor: string }
  | { tipo: "texto"; valor: string }
  | { tipo: "numero"; valor: number }
  | { tipo: "nombre"; valor: string }
  | { tipo: "simbolo"; valor: "(" | ")" | "," | "=" | "!=" };

function tokenizar(fuente: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < fuente.length) {
    const c = fuente[i];

    if (/\s/.test(c)) {
      i += 1;
      continue;
    }

    if (c === "{") {
      const fin = fuente.indexOf("}", i);
      if (fin === -1) throw new Error(`Campo sin cerrar en: ${fuente}`);
      tokens.push({ tipo: "campo", valor: fuente.slice(i + 1, fin) });
      i = fin + 1;
      continue;
    }

    if (c === "'" || c === '"') {
      let j = i + 1;
      let valor = "";
      while (j < fuente.length && fuente[j] !== c) {
        if (fuente[j] === "\\" && j + 1 < fuente.length) {
          valor += fuente[j + 1];
          j += 2;
          continue;
        }
        valor += fuente[j];
        j += 1;
      }
      if (j >= fuente.length) throw new Error(`Texto sin cerrar en: ${fuente}`);
      tokens.push({ tipo: "texto", valor });
      i = j + 1;
      continue;
    }

    if (/[0-9]/.test(c) || (c === "-" && /[0-9]/.test(fuente[i + 1] ?? ""))) {
      const m = /^-?[0-9]+(\.[0-9]+)?/.exec(fuente.slice(i));
      if (!m) throw new Error(`Número inválido en: ${fuente}`);
      tokens.push({ tipo: "numero", valor: Number(m[0]) });
      i += m[0].length;
      continue;
    }

    if (c === "!" && fuente[i + 1] === "=") {
      tokens.push({ tipo: "simbolo", valor: "!=" });
      i += 2;
      continue;
    }

    if (c === "(" || c === ")" || c === "," || c === "=") {
      tokens.push({ tipo: "simbolo", valor: c });
      i += 1;
      continue;
    }

    const nombre = /^[A-Za-z_]+/.exec(fuente.slice(i));
    if (nombre) {
      tokens.push({ tipo: "nombre", valor: nombre[0].toUpperCase() });
      i += nombre[0].length;
      continue;
    }

    throw new Error(`No sé leer "${c}" en la fórmula: ${fuente}`);
  }

  return tokens;
}

/** Cómo Airtable decide si un valor "es verdadero": vacío, 0 y false no lo son. */
function verdadero(valor: unknown): boolean {
  if (valor === null || valor === undefined || valor === false || valor === 0) return false;
  if (typeof valor === "string") return valor.length > 0;
  if (Array.isArray(valor)) return valor.length > 0;
  return true;
}

/** Comparación laxa, como la de Airtable: "10" = 10 es verdadero. */
function iguales(a: unknown, b: unknown): boolean {
  if (typeof a === "number" || typeof b === "number") {
    return Number(a ?? 0) === Number(b ?? 0);
  }
  if (typeof a === "boolean" || typeof b === "boolean") return verdadero(a) === verdadero(b);
  return String(a ?? "") === String(b ?? "");
}

class Analizador {
  private pos = 0;

  constructor(private tokens: Token[], private campos: Campos) {}

  private mirar(): Token | undefined {
    return this.tokens[this.pos];
  }

  private tomar(): Token {
    const t = this.tokens[this.pos];
    if (!t) throw new Error("La fórmula termina antes de tiempo");
    this.pos += 1;
    return t;
  }

  private esperar(simbolo: string) {
    const t = this.tomar();
    if (t.tipo !== "simbolo" || t.valor !== simbolo) {
      throw new Error(`Esperaba "${simbolo}" y encontré ${JSON.stringify(t)}`);
    }
  }

  evaluar(): unknown {
    const resultado = this.comparacion();
    if (this.pos !== this.tokens.length) {
      throw new Error(`Sobra texto al final de la fórmula`);
    }
    return resultado;
  }

  private comparacion(): unknown {
    const izquierda = this.atomo();
    const siguiente = this.mirar();

    if (siguiente?.tipo === "simbolo" && (siguiente.valor === "=" || siguiente.valor === "!=")) {
      this.tomar();
      const derecha = this.atomo();
      const resultado = iguales(izquierda, derecha);
      return siguiente.valor === "=" ? resultado : !resultado;
    }

    return izquierda;
  }

  private atomo(): unknown {
    const t = this.tomar();

    switch (t.tipo) {
      case "campo":
        return this.campos[t.valor];
      case "texto":
        return t.valor;
      case "numero":
        return t.valor;
      case "nombre":
        return this.llamada(t.valor);
      case "simbolo":
        if (t.valor === "(") {
          const interior = this.comparacion();
          this.esperar(")");
          return interior;
        }
        throw new Error(`Símbolo inesperado "${t.valor}"`);
    }
  }

  private argumentos(): unknown[] {
    this.esperar("(");
    const valores: unknown[] = [];

    if (this.mirar()?.tipo === "simbolo" && this.mirar()?.valor === ")") {
      this.tomar();
      return valores;
    }

    for (;;) {
      valores.push(this.comparacion());
      const t = this.tomar();
      if (t.tipo === "simbolo" && t.valor === ")") return valores;
      if (!(t.tipo === "simbolo" && t.valor === ",")) {
        throw new Error(`Esperaba "," o ")" en los argumentos`);
      }
    }
  }

  private llamada(nombre: string): unknown {
    switch (nombre) {
      case "TRUE":
        return true;
      case "FALSE":
        return false;
      case "AND":
        return this.argumentos().every(verdadero);
      case "OR":
        return this.argumentos().some(verdadero);
      case "NOT": {
        const [valor] = this.argumentos();
        return !verdadero(valor);
      }
      case "LOWER": {
        const [valor] = this.argumentos();
        return String(valor ?? "").toLowerCase();
      }
      case "UPPER": {
        const [valor] = this.argumentos();
        return String(valor ?? "").toUpperCase();
      }
      default:
        throw new Error(`Función no soportada en el modo de prueba: ${nombre}`);
    }
  }
}

/** Verdadero si el registro pasa la fórmula. */
export function cumpleFormula(formula: string, campos: Campos): boolean {
  const limpia = formula.trim();
  if (!limpia) return true;
  return verdadero(new Analizador(tokenizar(limpia), campos).evaluar());
}
