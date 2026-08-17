/**
 * Limitación de intentos de autenticación.
 *
 * Dos ventanas a la vez, porque frenan ataques distintos:
 *   · por cuenta → alguien probando contraseñas contra un inversor concreto;
 *   · por IP     → alguien barriendo muchas cuentas desde un mismo origen.
 *
 * La decisión es pura y se prueba con relojes ficticios. Quién almacena los
 * intentos (Redis en caliente, `auth_attempt` para la traza) es problema de
 * quien la llama.
 */

export interface RateLimitPolicy {
  /** Intentos fallidos consecutivos antes de bloquear la cuenta. */
  maxFailuresPerAccount: number;
  accountWindowMinutes: number;
  accountLockoutMinutes: number;

  maxFailuresPerIp: number;
  ipWindowMinutes: number;
  ipLockoutMinutes: number;
}

export const DEFAULT_LOGIN_POLICY: RateLimitPolicy = {
  maxFailuresPerAccount: 5,
  accountWindowMinutes: 15,
  accountLockoutMinutes: 15,
  // Más holgado: tras una IP corporativa puede haber muchos inversores.
  maxFailuresPerIp: 30,
  ipWindowMinutes: 15,
  ipLockoutMinutes: 30,
};

/** Política endurecida para el panel de administración. */
export const ADMIN_LOGIN_POLICY: RateLimitPolicy = {
  maxFailuresPerAccount: 3,
  accountWindowMinutes: 15,
  accountLockoutMinutes: 60,
  maxFailuresPerIp: 10,
  ipWindowMinutes: 15,
  ipLockoutMinutes: 60,
};

export interface AttemptRecord {
  at: Date;
  successful: boolean;
}

export type RateLimitDecision =
  | { allowed: true }
  | { allowed: false; reason: 'ACCOUNT_LOCKED' | 'IP_LOCKED'; retryAfterSeconds: number };

function failuresWithin(
  attempts: readonly AttemptRecord[],
  windowMinutes: number,
  now: Date,
): AttemptRecord[] {
  const since = new Date(now.getTime() - windowMinutes * 60 * 1000);
  const recent = attempts.filter((a) => a.at > since);

  // Solo cuentan los fallos POSTERIORES al último acierto: un inicio de sesión
  // correcto limpia el historial.
  const lastSuccess = recent.reduce<Date | null>(
    (latest, a) => (a.successful && (latest === null || a.at > latest) ? a.at : latest),
    null,
  );

  return recent.filter(
    (a) => !a.successful && (lastSuccess === null || a.at > lastSuccess),
  );
}

export function evaluateRateLimit(
  policy: RateLimitPolicy,
  accountAttempts: readonly AttemptRecord[],
  ipAttempts: readonly AttemptRecord[],
  now: Date,
): RateLimitDecision {
  const accountFailures = failuresWithin(accountAttempts, policy.accountWindowMinutes, now);
  if (accountFailures.length >= policy.maxFailuresPerAccount) {
    const last = accountFailures.reduce((a, b) => (a.at > b.at ? a : b));
    const unlockAt = new Date(last.at.getTime() + policy.accountLockoutMinutes * 60 * 1000);
    if (unlockAt > now) {
      return {
        allowed: false,
        reason: 'ACCOUNT_LOCKED',
        retryAfterSeconds: Math.ceil((unlockAt.getTime() - now.getTime()) / 1000),
      };
    }
  }

  const ipFailures = failuresWithin(ipAttempts, policy.ipWindowMinutes, now);
  if (ipFailures.length >= policy.maxFailuresPerIp) {
    const last = ipFailures.reduce((a, b) => (a.at > b.at ? a : b));
    const unlockAt = new Date(last.at.getTime() + policy.ipLockoutMinutes * 60 * 1000);
    if (unlockAt > now) {
      return {
        allowed: false,
        reason: 'IP_LOCKED',
        retryAfterSeconds: Math.ceil((unlockAt.getTime() - now.getTime()) / 1000),
      };
    }
  }

  return { allowed: true };
}
