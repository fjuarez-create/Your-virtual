import type { Understanding } from '@/lib/types';

/**
 * Intérprete heurístico de consultas en español. Es el modo sin coste y el
 * respaldo cuando la llamada a Claude no está configurada o falla: entiende
 * colores (con matices), rangos de precio y sinónimos habituales de compra.
 */

const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** color canónico → variantes que cuentan como ese color en los catálogos */
export const COLORS: Record<string, string[]> = {
  amarillo: ['amarillo', 'amarilla', 'mostaza', 'limon', 'dorado', 'ocre', 'mantequilla'],
  rojo: ['rojo', 'roja', 'granate', 'burdeos', 'carmesi', 'coral'],
  azul: ['azul', 'marino', 'celeste', 'turquesa', 'indigo', 'cobalto'],
  verde: ['verde', 'oliva', 'menta', 'esmeralda', 'kaki', 'caqui'],
  negro: ['negro', 'negra', 'antracita'],
  blanco: ['blanco', 'blanca', 'crudo', 'marfil', 'hueso'],
  rosa: ['rosa', 'fucsia', 'palo', 'salmon'],
  morado: ['morado', 'morada', 'violeta', 'lila', 'lavanda', 'purpura'],
  naranja: ['naranja', 'calabaza', 'teja'],
  gris: ['gris', 'plata', 'plateado', 'perla'],
  marron: ['marron', 'chocolate', 'camel', 'tostado', 'cuero'],
  beige: ['beige', 'arena', 'topo', 'nude'],
};

const COLOR_LOOKUP: Record<string, string> = {};
for (const [canon, list] of Object.entries(COLORS)) {
  for (const v of list) COLOR_LOOKUP[v] = canon;
}

const SYNONYMS: Record<string, string[]> = {
  camisa: ['blusa', 'camisola'],
  blusa: ['camisa'],
  camiseta: ['top', 'shirt'],
  sudadera: ['hoodie'],
  chaqueta: ['cazadora', 'americana'],
  abrigo: ['parka', 'plumifero'],
  pantalon: ['pantalones', 'chino'],
  vaquero: ['vaqueros', 'jeans', 'tejano'],
  vestido: ['vestidos'],
  zapatillas: ['deportivas', 'sneakers', 'bambas', 'tenis'],
  zapatos: ['calzado'],
  portatil: ['laptop', 'notebook', 'ordenador'],
  ordenador: ['pc', 'portatil', 'sobremesa'],
  movil: ['smartphone', 'telefono'],
  auriculares: ['cascos', 'earbuds', 'headphones'],
  television: ['tv', 'televisor', 'tele'],
  tele: ['televisor', 'tv'],
  tv: ['televisor', 'television'],
  altavoz: ['speaker', 'barra de sonido'],
  camara: ['camera', 'reflex', 'mirrorless'],
  consola: ['videoconsola'],
  teclado: ['keyboard'],
  raton: ['mouse'],
  monitor: ['pantalla'],
  cafetera: ['espresso', 'cafe'],
  aspiradora: ['aspirador', 'robot aspirador'],
  freidora: ['airfryer', 'freidora de aire'],
  taladro: ['percutor', 'atornillador'],
  destornillador: ['atornillador'],
  lampara: ['luz', 'flexo'],
  bicicleta: ['bici', 'mtb'],
  patinete: ['scooter'],
  mochila: ['bolso', 'bandolera'],
  perfume: ['colonia', 'fragancia', 'eau de parfum'],
  crema: ['hidratante', 'serum'],
  maquillaje: ['paleta', 'cosmetica'],
  pienso: ['comida perro', 'comida gato', 'alimento'],
  juguete: ['juguetes'],
  libro: ['novela', 'libros'],
  reloj: ['smartwatch'],
  funda: ['carcasa', 'cover'],
};

const STOPWORDS = new Set([
  'de', 'del', 'la', 'las', 'el', 'los', 'un', 'una', 'unos', 'unas', 'y', 'o', 'u',
  'para', 'con', 'sin', 'por', 'en', 'a', 'al', 'que', 'mi', 'tu', 'su', 'me',
  'busco', 'buscar', 'quiero', 'necesito', 'comprar', 'compra', 'barato', 'barata',
  'baratos', 'baratas', 'mejor', 'mejores', 'bueno', 'buena', 'algo', 'tipo', 'estilo',
]);

function extractPrices(text: string): { maxPrice?: number; minPrice?: number; rest: string } {
  let maxPrice: number | undefined;
  let minPrice: number | undefined;
  let rest = text;

  const between = rest.match(/entre\s+(\d+(?:[.,]\d+)?)\s*(?:€|eur(?:os)?)?\s+y\s+(\d+(?:[.,]\d+)?)\s*(?:€|eur(?:os)?)?/);
  if (between) {
    minPrice = parseFloat(between[1].replace(',', '.'));
    maxPrice = parseFloat(between[2].replace(',', '.'));
    rest = rest.replace(between[0], ' ');
  }

  const max = rest.match(/(?:por\s+)?(?:menos\s+de|debajo\s+de|maximo|max\.?|hasta|<=?)\s*(\d+(?:[.,]\d+)?)\s*(?:€|eur(?:os)?)?/);
  if (max) {
    maxPrice = parseFloat(max[1].replace(',', '.'));
    rest = rest.replace(max[0], ' ');
  }

  const min = rest.match(/(?:mas\s+de|a\s+partir\s+de|minimo|min\.?|>=?)\s*(\d+(?:[.,]\d+)?)\s*(?:€|eur(?:os)?)?/);
  if (min) {
    minPrice = parseFloat(min[1].replace(',', '.'));
    rest = rest.replace(min[0], ' ');
  }

  // "camisa 20€" suelto → tope de precio
  const bare = rest.match(/(\d+(?:[.,]\d+)?)\s*(?:€|eur(?:os)?)\b/);
  if (bare && maxPrice === undefined && minPrice === undefined) {
    maxPrice = parseFloat(bare[1].replace(',', '.'));
    rest = rest.replace(bare[0], ' ');
  }

  return { maxPrice, minPrice, rest };
}

const CATEGORIES: Record<string, string[]> = {
  moda: ['camisa', 'blusa', 'camiseta', 'vestido', 'pantalon', 'vaquero', 'falda', 'sudadera', 'chaqueta', 'abrigo', 'jersey', 'top', 'bikini', 'traje'],
  calzado: ['zapatillas', 'zapatos', 'botas', 'sandalias', 'deportivas', 'sneakers'],
  tecnologia: ['portatil', 'ordenador', 'movil', 'smartphone', 'auriculares', 'television', 'tv', 'tele', 'monitor', 'teclado', 'raton', 'consola', 'camara', 'tablet', 'ssd', 'altavoz', 'dron', 'reloj', 'smartwatch'],
  deporte: ['bicicleta', 'bici', 'running', 'patinete', 'esterilla', 'mancuernas', 'tienda de campana', 'futbol', 'padel'],
  hogar: ['sofa', 'lampara', 'cafetera', 'aspiradora', 'freidora', 'sarten', 'colchon', 'manta', 'cortina'],
  bricolaje: ['taladro', 'destornillador', 'pintura', 'estanteria', 'cortacesped', 'caseta', 'herramienta'],
  belleza: ['perfume', 'colonia', 'crema', 'serum', 'maquillaje', 'paleta', 'champu', 'labial'],
  mascotas: ['pienso', 'perro', 'gato', 'rascador', 'correa', 'arena'],
  libros: ['libro', 'novela', 'comic', 'manga'],
  bebe: ['bebe', 'panales', 'carrito', 'cuna'],
};

export function heuristicUnderstand(raw: string): Understanding {
  const normalized = norm(raw);
  const { maxPrice, minPrice, rest } = extractPrices(normalized);

  const words = rest.split(/[^a-z0-9ñ]+/).filter(w => w.length > 1 && !STOPWORDS.has(w));

  let color: string | undefined;
  const keywords: string[] = [];
  for (const w of words) {
    if (COLOR_LOOKUP[w] && !color) {
      color = COLOR_LOOKUP[w];
    } else {
      keywords.push(w);
    }
  }

  let category: string | undefined;
  outer: for (const [cat, list] of Object.entries(CATEGORIES)) {
    for (const kw of keywords) {
      if (list.includes(kw)) { category = cat; break outer; }
    }
  }

  const terms = new Set<string>(keywords);
  for (const kw of keywords) {
    for (const syn of SYNONYMS[kw] ?? []) terms.add(syn);
  }
  const colorTerms = color ? COLORS[color] : undefined;
  if (colorTerms) for (const c of colorTerms) terms.add(c);

  return {
    raw,
    keywords,
    terms: [...terms],
    color,
    colorTerms,
    maxPrice,
    minPrice,
    category,
    engine: 'heuristica',
  };
}
