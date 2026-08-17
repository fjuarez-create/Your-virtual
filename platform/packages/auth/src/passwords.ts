/**
 * Contraseñas.
 *
 * Argon2id con los parámetros recomendados por OWASP. La verificación es de
 * tiempo constante y la comparación la hace la propia biblioteca.
 *
 * Este módulo lo comparten los dos perímetros —inversor y administrador— a
 * propósito: lo que está separado son las tablas de credenciales y las
 * sesiones, no la criptografía. Mantener dos implementaciones de hashing sería
 * duplicar el riesgo de equivocarse en una de ellas, sin ninguna ganancia.
 */

import { hash, verify } from '@node-rs/argon2';

/**
 * OWASP (2024) para Argon2id: 19 MiB de memoria, 2 iteraciones, paralelismo 1.
 * Subir `memoryCost` es la palanca más eficaz si el servidor lo permite.
 *
 * No se pasa `algorithm`: Argon2id es el valor por defecto de la biblioteca, y
 * su enumerado es un `const enum` ambiental que no se puede leer con
 * `verbatimModuleSyntax`. Que el algoritmo sea el correcto no queda al azar:
 * hay un test que comprueba que el hash resultante empieza por `$argon2id$`.
 */
const ARGON2_OPTIONS = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

/** Longitud mínima. El resto de reglas de composición hacen más mal que bien. */
export const MIN_PASSWORD_LENGTH = 12;

export class WeakPasswordError extends Error {
  constructor(readonly reasons: string[]) {
    super(`Contraseña no admitida: ${reasons.join(' ')}`);
    this.name = 'WeakPasswordError';
  }
}

/**
 * Comprueba la fortaleza mínima.
 *
 * Se exige longitud y se rechazan las contraseñas obviamente comunes. No se
 * exigen «una mayúscula, un número y un símbolo»: esas reglas empujan a
 * `Umaia2026!` y no aportan entropía real.
 */
export function checkPasswordStrength(password: string): string[] {
  const reasons: string[] = [];

  if (password.length < MIN_PASSWORD_LENGTH) {
    reasons.push(`Debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
  }
  if (/^(.)\1+$/.test(password)) {
    reasons.push('No puede ser un mismo carácter repetido.');
  }
  if (/^(0123456789|1234567890|abcdefghij)/i.test(password)) {
    reasons.push('No puede ser una secuencia obvia.');
  }
  const comunes = ['contraseña', 'password', 'qwerty', '123456', 'umaia', 'admin'];
  const normalizada = password.toLowerCase();
  if (comunes.some((c) => normalizada.includes(c) && password.length < 20)) {
    reasons.push('Contiene una palabra demasiado predecible.');
  }

  return reasons;
}

export async function hashPassword(password: string): Promise<string> {
  const reasons = checkPasswordStrength(password);
  if (reasons.length > 0) throw new WeakPasswordError(reasons);
  return hash(password, ARGON2_OPTIONS);
}

/**
 * Verifica una contraseña.
 *
 * Devuelve `false` ante un hash corrupto en vez de lanzar: un registro de
 * credenciales dañado no debe distinguirse, desde fuera, de una contraseña
 * incorrecta.
 */
export async function verifyPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  try {
    return await verify(passwordHash, password, ARGON2_OPTIONS);
  } catch {
    return false;
  }
}
