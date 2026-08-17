/**
 * Sesiones y testigos.
 *
 * Los dos perímetros —inversor y administrador— usan estas primitivas pero con
 * cookies, secretos y tablas DISTINTOS. La separación es de configuración y de
 * almacenamiento, no de algoritmo.
 *
 * Del testigo de sesión solo se guarda el hash. Si alguien se lleva una copia
 * de la base de datos, no se lleva sesiones utilizables.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export type AuthRealm = 'INVESTOR' | 'ADMIN';

export interface RealmConfig {
  realm: AuthRealm;
  cookieName: string;
  /** Vida de la sesión. Más corta en el panel de administración. */
  ttlHours: number;
  /** El panel admin no arranca sin 2FA. */
  requiresMfa: boolean;
  /** Ruta a la que se limita la cookie. */
  cookiePath: string;
}

export const INVESTOR_REALM: RealmConfig = {
  realm: 'INVESTOR',
  cookieName: '__Host-umaia_inv_sesion',
  ttlHours: 12,
  requiresMfa: false,
  cookiePath: '/',
};

export const ADMIN_REALM: RealmConfig = {
  realm: 'ADMIN',
  // Nombre distinto Y ámbito distinto: una cookie de inversor no puede
  // presentarse jamás como sesión de administración.
  cookieName: '__Host-umaia_adm_sesion',
  ttlHours: 4,
  requiresMfa: true,
  cookiePath: '/',
};

export interface IssuedSession {
  /** Valor en claro. Va a la cookie y no se guarda en ningún sitio más. */
  token: string;
  /** Lo que sí se almacena. */
  tokenHash: string;
  expiresAt: Date;
}

/** 256 bits de aleatoriedad criptográfica. */
export function issueSessionToken(config: RealmConfig, now = new Date()): IssuedSession {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(now.getTime() + config.ttlHours * 60 * 60 * 1000);
  return { token, tokenHash: hashToken(token), expiresAt };
}

/**
 * SHA-256 basta aquí, y es lo correcto: el testigo ya tiene 256 bits de
 * entropía, así que no hay nada que un hash lento aporte frente a fuerza
 * bruta. Argon2 es para contraseñas elegidas por personas.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Comparación en tiempo constante. */
export function tokenMatches(token: string, storedHash: string): boolean {
  const computed = Buffer.from(hashToken(token), 'hex');
  let stored: Buffer;
  try {
    stored = Buffer.from(storedHash, 'hex');
  } catch {
    return false;
  }
  if (computed.length !== stored.length) return false;
  return timingSafeEqual(computed, stored);
}

export interface SessionRecord {
  expiresAt: Date;
  revokedAt: Date | null;
  mfaSatisfiedAt: Date | null;
}

export type SessionRejection =
  | 'EXPIRED'
  | 'REVOKED'
  | 'MFA_REQUIRED';

/** Comprueba una sesión ya recuperada de la base de datos. */
export function validateSession(
  session: SessionRecord,
  config: RealmConfig,
  now = new Date(),
): { valid: true } | { valid: false; reason: SessionRejection } {
  if (session.revokedAt !== null) return { valid: false, reason: 'REVOKED' };
  if (session.expiresAt <= now) return { valid: false, reason: 'EXPIRED' };
  if (config.requiresMfa && session.mfaSatisfiedAt === null) {
    return { valid: false, reason: 'MFA_REQUIRED' };
  }
  return { valid: true };
}

/** Atributos de la cookie de sesión. Endurecidos por defecto. */
export function sessionCookieOptions(
  config: RealmConfig,
  isProduction: boolean,
): {
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax';
  path: string;
  maxAge: number;
} {
  return {
    httpOnly: true,
    // El prefijo __Host- exige secure; en local sobre http se degrada el
    // nombre, no la intención (ver `cookieNameFor`).
    secure: isProduction,
    sameSite: 'lax',
    path: config.cookiePath,
    maxAge: config.ttlHours * 60 * 60,
  };
}

/**
 * El prefijo `__Host-` solo es válido sobre HTTPS. En desarrollo local se cae
 * a un nombre sin prefijo para que la cookie funcione, conservando el resto de
 * atributos.
 */
export function cookieNameFor(config: RealmConfig, isProduction: boolean): string {
  return isProduction ? config.cookieName : config.cookieName.replace('__Host-', '');
}
