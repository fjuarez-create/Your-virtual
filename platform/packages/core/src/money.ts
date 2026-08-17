/**
 * Dinero.
 *
 * Todo importe vive en céntimos enteros (`bigint`). Nunca en coma flotante:
 * `0.1 + 0.2 !== 0.3` es una curiosidad en una calculadora y un descuadre en
 * una cuenta de garantía.
 *
 * La conversión a texto ocurre solo en el borde (interfaz, informes). Hacia
 * dentro circulan céntimos.
 */

export type Cents = bigint;

export class MoneyError extends Error {}

/**
 * Formato español válido: o los miles van agrupados de tres en tres, o no hay
 * separador de miles en absoluto. La validación ocurre ANTES de quitar los
 * puntos — quitarlos primero convertiría "1.2.3" en "123", aceptando en
 * silencio un importe que el inversor no escribió.
 */
const EUROS_PATTERN = /^-?(\d{1,3}(\.\d{3})+|\d+)(,\d{1,2})?$/;

/** Importe legible («1.234,56 €») a céntimos. Estricto a propósito. */
export function parseEuros(input: string): Cents {
  const cleaned = input.trim().replace(/\s/g, '').replace(/€/g, '');

  if (!EUROS_PATTERN.test(cleaned)) {
    throw new MoneyError(`Importe no reconocido: "${input}"`);
  }

  const negative = cleaned.startsWith('-');
  const [whole = '0', fraction = ''] = cleaned
    .replace('-', '')
    .replace(/\./g, '')
    .split(',');

  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  return negative ? -cents : cents;
}

/** Céntimos a texto en formato español. */
export function formatEuros(
  cents: Cents,
  options: { symbol?: boolean } = {},
): string {
  const { symbol = true } = options;
  const negative = cents < 0n;
  const absolute = negative ? -cents : cents;

  const whole = absolute / 100n;
  const fraction = absolute % 100n;

  const groupedWhole = whole
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  const text = `${groupedWhole},${fraction.toString().padStart(2, '0')}`;
  return `${negative ? '-' : ''}${text}${symbol ? ' €' : ''}`;
}

/**
 * Aplica un porcentaje a un importe, redondeando al céntimo más próximo
 * (medio hacia arriba). El redondeo se hace UNA vez, sobre el resultado
 * completo, para que sumar los porcentajes de las partes dé el total.
 */
export function applyPercentage(cents: Cents, percentage: number): Cents {
  if (!Number.isFinite(percentage)) {
    throw new MoneyError(`Porcentaje no válido: ${percentage}`);
  }
  // Escalado a entero para no arrastrar el binario del `number`.
  const scaled = BigInt(Math.round(percentage * 1_000_000));
  const numerator = cents * scaled;
  const denominator = 100_000_000n;
  return divideRounded(numerator, denominator);
}

/** División entera con redondeo al más próximo, medio hacia arriba. */
export function divideRounded(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new MoneyError('División por cero');
  const negative = numerator < 0n !== denominator < 0n;
  const absNum = numerator < 0n ? -numerator : numerator;
  const absDen = denominator < 0n ? -denominator : denominator;
  const quotient = absNum / absDen;
  const remainder = absNum % absDen;
  const rounded = remainder * 2n >= absDen ? quotient + 1n : quotient;
  return negative ? -rounded : rounded;
}

/**
 * Reparte un importe entre varios pesos SIN perder ni inventar céntimos.
 *
 * El resto del redondeo se asigna a las participaciones mayores, de forma
 * determinista. Que la suma de las partes sea exactamente el total no es un
 * detalle estético: es la diferencia entre una distribución que cuadra y una
 * que deja un céntimo huérfano en la cuenta de garantía cada trimestre.
 */
export function distributeProportionally(
  total: Cents,
  weights: readonly Cents[],
): Cents[] {
  if (weights.length === 0) return [];

  const totalWeight = weights.reduce((sum, w) => sum + w, 0n);
  if (totalWeight <= 0n) {
    throw new MoneyError('El peso total del reparto debe ser positivo');
  }

  const shares = weights.map((w) => (total * w) / totalWeight);
  const distributed = shares.reduce((sum, s) => sum + s, 0n);
  let remainder = total - distributed;

  // Orden de reparto del resto: primero los pesos mayores; a igualdad, el
  // índice menor. Determinista, y por tanto reproducible en una auditoría.
  const order = weights
    .map((weight, index) => ({ weight, index }))
    .sort((a, b) => (b.weight === a.weight ? a.index - b.index : b.weight > a.weight ? 1 : -1));

  let position = 0;
  const step = remainder >= 0n ? 1n : -1n;
  while (remainder !== 0n && order.length > 0) {
    const target = order[position % order.length];
    if (target === undefined) break;
    shares[target.index] = (shares[target.index] ?? 0n) + step;
    remainder -= step;
    position += 1;
  }

  return shares;
}

export const ZERO: Cents = 0n;

export function sum(amounts: readonly Cents[]): Cents {
  return amounts.reduce((total, amount) => total + amount, 0n);
}

export function max(a: Cents, b: Cents): Cents {
  return a > b ? a : b;
}

export function min(a: Cents, b: Cents): Cents {
  return a < b ? a : b;
}
