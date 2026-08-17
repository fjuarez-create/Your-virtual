import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  MIN_PASSWORD_LENGTH,
  WeakPasswordError,
  checkPasswordStrength,
  hashPassword,
  verifyPassword,
} from './passwords.js';
import {
  ADMIN_LOGIN_POLICY,
  type AttemptRecord,
  DEFAULT_LOGIN_POLICY,
  evaluateRateLimit,
} from './rate-limit.js';
import {
  ADMIN_REALM,
  INVESTOR_REALM,
  cookieNameFor,
  hashToken,
  issueSessionToken,
  sessionCookieOptions,
  tokenMatches,
  validateSession,
} from './sessions.js';

describe('contraseñas', () => {
  it('va y vuelve', async () => {
    const hash = await hashPassword('una contraseña larga y decente');
    assert.equal(await verifyPassword('una contraseña larga y decente', hash), true);
    assert.equal(await verifyPassword('otra cosa distinta del todo', hash), false);
  });

  it('usa argon2id', async () => {
    const hash = await hashPassword('una contraseña larga y decente');
    assert.match(hash, /^\$argon2id\$/);
  });

  it('sala cada hash: dos iguales no se parecen', async () => {
    const a = await hashPassword('la misma contraseña de siempre');
    const b = await hashPassword('la misma contraseña de siempre');
    assert.notEqual(a, b);
    assert.equal(await verifyPassword('la misma contraseña de siempre', a), true);
    assert.equal(await verifyPassword('la misma contraseña de siempre', b), true);
  });

  it('rechaza las demasiado cortas', async () => {
    await assert.rejects(() => hashPassword('corta1!'), WeakPasswordError);
    assert.ok(checkPasswordStrength('a'.repeat(MIN_PASSWORD_LENGTH - 1)).length > 0);
  });

  it('rechaza las predecibles aunque sean largas', () => {
    assert.ok(checkPasswordStrength('aaaaaaaaaaaaaaaa').length > 0);
    assert.ok(checkPasswordStrength('umaia2026!!!').length > 0);
    assert.ok(checkPasswordStrength('0123456789012').length > 0);
  });

  it('acepta una frase larga sin exigir símbolos raros', () => {
    // Las reglas de composición empujan a `Umaia2026!`, que es peor.
    assert.deepEqual(checkPasswordStrength('cuatro caballos comen hierba'), []);
  });

  it('ante un hash corrupto responde que no, sin reventar', async () => {
    assert.equal(await verifyPassword('cualquier cosa larga', 'basura'), false);
    assert.equal(await verifyPassword('cualquier cosa larga', ''), false);
  });
});

describe('testigos de sesión', () => {
  it('solo se almacena el hash', () => {
    const { token, tokenHash } = issueSessionToken(INVESTOR_REALM);
    assert.notEqual(token, tokenHash);
    assert.equal(tokenHash, hashToken(token));
    assert.equal(tokenHash.length, 64);
  });

  it('cada testigo es distinto', () => {
    const emitidos = new Set(
      Array.from({ length: 200 }, () => issueSessionToken(INVESTOR_REALM).token),
    );
    assert.equal(emitidos.size, 200);
  });

  it('compara en tiempo constante y sin romperse ante basura', () => {
    const { token, tokenHash } = issueSessionToken(ADMIN_REALM);
    assert.equal(tokenMatches(token, tokenHash), true);
    assert.equal(tokenMatches('otro', tokenHash), false);
    assert.equal(tokenMatches(token, 'no-es-hexadecimal'), false);
    assert.equal(tokenMatches(token, ''), false);
  });

  it('la sesión de administración caduca antes que la de inversor', () => {
    assert.ok(ADMIN_REALM.ttlHours < INVESTOR_REALM.ttlHours);
  });
});

describe('los dos perímetros están separados de verdad', () => {
  it('usan cookies con nombres distintos', () => {
    assert.notEqual(INVESTOR_REALM.cookieName, ADMIN_REALM.cookieName);
  });

  it('el panel de administración exige 2FA y el área de inversor no', () => {
    assert.equal(ADMIN_REALM.requiresMfa, true);
    assert.equal(INVESTOR_REALM.requiresMfa, false);
  });

  it('una sesión de administración sin 2FA no vale', () => {
    const sesion = {
      expiresAt: new Date(Date.now() + 3_600_000),
      revokedAt: null,
      mfaSatisfiedAt: null,
    };
    const resultado = validateSession(sesion, ADMIN_REALM);
    assert.equal(resultado.valid, false);
    assert.equal(resultado.valid === false && resultado.reason, 'MFA_REQUIRED');

    // La misma sesión sí sirve en el área de inversor.
    assert.equal(validateSession(sesion, INVESTOR_REALM).valid, true);
  });
});

describe('validación de sesión', () => {
  const viva = { expiresAt: new Date(Date.now() + 3_600_000), revokedAt: null, mfaSatisfiedAt: new Date() };

  it('acepta una sesión viva', () => {
    assert.equal(validateSession(viva, ADMIN_REALM).valid, true);
  });

  it('rechaza una caducada', () => {
    const r = validateSession({ ...viva, expiresAt: new Date(Date.now() - 1000) }, ADMIN_REALM);
    assert.equal(r.valid === false && r.reason, 'EXPIRED');
  });

  it('rechaza una revocada aunque no haya caducado', () => {
    // El cierre de sesión tiene que surtir efecto de inmediato.
    const r = validateSession({ ...viva, revokedAt: new Date() }, ADMIN_REALM);
    assert.equal(r.valid === false && r.reason, 'REVOKED');
  });
});

describe('atributos de la cookie', () => {
  it('siempre httpOnly y sameSite', () => {
    const opciones = sessionCookieOptions(INVESTOR_REALM, true);
    assert.equal(opciones.httpOnly, true);
    assert.equal(opciones.sameSite, 'lax');
    assert.equal(opciones.secure, true);
  });

  it('en local afloja el nombre, no la intención', () => {
    assert.match(cookieNameFor(ADMIN_REALM, true), /^__Host-/);
    assert.doesNotMatch(cookieNameFor(ADMIN_REALM, false), /^__Host-/);
    assert.equal(sessionCookieOptions(ADMIN_REALM, false).httpOnly, true);
  });
});

describe('limitación de intentos', () => {
  const ahora = new Date('2026-06-01T12:00:00Z');
  const haceMinutos = (m: number): Date => new Date(ahora.getTime() - m * 60_000);

  function fallos(cuantos: number, minutosAtras = 1): AttemptRecord[] {
    return Array.from({ length: cuantos }, () => ({
      at: haceMinutos(minutosAtras),
      successful: false,
    }));
  }

  it('deja pasar por debajo del límite', () => {
    const d = evaluateRateLimit(DEFAULT_LOGIN_POLICY, fallos(4), [], ahora);
    assert.equal(d.allowed, true);
  });

  it('bloquea la cuenta al alcanzarlo', () => {
    const d = evaluateRateLimit(DEFAULT_LOGIN_POLICY, fallos(5), [], ahora);
    assert.equal(d.allowed, false);
    assert.equal(d.allowed === false && d.reason, 'ACCOUNT_LOCKED');
    assert.ok(d.allowed === false && d.retryAfterSeconds > 0);
  });

  it('un inicio de sesión correcto limpia el historial', () => {
    const intentos: AttemptRecord[] = [
      ...fallos(5, 10),
      { at: haceMinutos(5), successful: true },
      { at: haceMinutos(1), successful: false },
    ];
    assert.equal(evaluateRateLimit(DEFAULT_LOGIN_POLICY, intentos, [], ahora).allowed, true);
  });

  it('los fallos antiguos salen de la ventana', () => {
    const d = evaluateRateLimit(DEFAULT_LOGIN_POLICY, fallos(10, 120), [], ahora);
    assert.equal(d.allowed, true);
  });

  it('bloquea también por IP, con umbral más holgado', () => {
    // Detrás de una IP corporativa puede haber muchos inversores legítimos.
    assert.equal(evaluateRateLimit(DEFAULT_LOGIN_POLICY, [], fallos(29), ahora).allowed, true);
    const d = evaluateRateLimit(DEFAULT_LOGIN_POLICY, [], fallos(30), ahora);
    assert.equal(d.allowed === false && d.reason, 'IP_LOCKED');
  });

  it('el panel de administración aguanta menos intentos y castiga más', () => {
    assert.ok(ADMIN_LOGIN_POLICY.maxFailuresPerAccount < DEFAULT_LOGIN_POLICY.maxFailuresPerAccount);
    assert.ok(ADMIN_LOGIN_POLICY.accountLockoutMinutes > DEFAULT_LOGIN_POLICY.accountLockoutMinutes);
    const d = evaluateRateLimit(ADMIN_LOGIN_POLICY, fallos(3), [], ahora);
    assert.equal(d.allowed, false);
  });

  it('el bloqueo expira solo', () => {
    const antiguos: AttemptRecord[] = Array.from({ length: 5 }, () => ({
      at: haceMinutos(14),
      successful: false,
    }));
    // A los 14 minutos sigue bloqueado (bloqueo de 15).
    assert.equal(evaluateRateLimit(DEFAULT_LOGIN_POLICY, antiguos, [], ahora).allowed, false);
    // Un minuto después, ya no.
    const despues = new Date(ahora.getTime() + 2 * 60_000);
    assert.equal(evaluateRateLimit(DEFAULT_LOGIN_POLICY, antiguos, [], despues).allowed, true);
  });
});
