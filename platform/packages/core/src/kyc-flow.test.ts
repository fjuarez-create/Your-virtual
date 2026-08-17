import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  InvalidKycTransitionError,
  type KycStatus,
  UnauthorisedKycActorError,
  allowedKycEvents,
  applyKycEvent,
  nextKycStatus,
  requiredKycLevel,
  verificationExpiresAt,
} from './kyc-flow.js';

const ALL: KycStatus[] = [
  'NOT_STARTED',
  'PENDING_DOCUMENTS',
  'IN_REVIEW',
  'APPROVED',
  'REJECTED',
  'EXPIRED',
  'SUSPENDED',
];

describe('recorrido normal', () => {
  it('va de no iniciado a aprobado pasando por revisión humana', () => {
    let status: KycStatus = 'NOT_STARTED';
    status = applyKycEvent(status, 'DOCUMENTS_REQUESTED', 'SYSTEM');
    assert.equal(status, 'PENDING_DOCUMENTS');
    status = applyKycEvent(status, 'DOCUMENTS_SUBMITTED', 'INVESTOR');
    assert.equal(status, 'IN_REVIEW');
    status = applyKycEvent(status, 'REVIEWER_APPROVED', 'REVIEWER');
    assert.equal(status, 'APPROVED');
  });

  it('el revisor puede pedir más documentación', () => {
    assert.equal(
      applyKycEvent('IN_REVIEW', 'REVIEWER_REQUESTED_MORE', 'REVIEWER'),
      'PENDING_DOCUMENTS',
    );
  });

  it('un rechazo no es definitivo: se puede volver a intentar', () => {
    assert.equal(
      applyKycEvent('REJECTED', 'RENEWAL_STARTED', 'INVESTOR'),
      'PENDING_DOCUMENTS',
    );
  });
});

describe('nadie aprueba un expediente por su cuenta', () => {
  it('el sistema no puede aprobar', () => {
    // Esta es la garantía que impide que un webhook de proveedor apruebe.
    assert.throws(
      () => applyKycEvent('IN_REVIEW', 'REVIEWER_APPROVED', 'SYSTEM'),
      UnauthorisedKycActorError,
    );
  });

  it('el propio inversor no puede aprobarse', () => {
    assert.throws(
      () => applyKycEvent('IN_REVIEW', 'REVIEWER_APPROVED', 'INVESTOR'),
      UnauthorisedKycActorError,
    );
  });

  it('tampoco puede rechazar ni suspender', () => {
    assert.throws(
      () => applyKycEvent('IN_REVIEW', 'REVIEWER_REJECTED', 'SYSTEM'),
      UnauthorisedKycActorError,
    );
    assert.throws(
      () => applyKycEvent('APPROVED', 'COMPLIANCE_SUSPENDED', 'SYSTEM'),
      UnauthorisedKycActorError,
    );
  });

  it('ninguna transición hacia APPROVED la puede provocar el sistema', () => {
    for (const from of ALL) {
      for (const event of allowedKycEvents(from)) {
        if (nextKycStatus(from, event) !== 'APPROVED') continue;
        assert.throws(
          () => applyKycEvent(from, event, 'SYSTEM'),
          UnauthorisedKycActorError,
          `${event} desde ${from} no debería poder aprobarse automáticamente`,
        );
      }
    }
  });

  it('no se salta la revisión: de documentos pendientes no se pasa a aprobado', () => {
    assert.equal(nextKycStatus('PENDING_DOCUMENTS', 'REVIEWER_APPROVED'), null);
    assert.throws(
      () => applyKycEvent('NOT_STARTED', 'REVIEWER_APPROVED', 'REVIEWER'),
      InvalidKycTransitionError,
    );
  });
});

describe('caducidad y suspensión', () => {
  it('una verificación aprobada caduca', () => {
    assert.equal(applyKycEvent('APPROVED', 'VERIFICATION_EXPIRED', 'SYSTEM'), 'EXPIRED');
  });

  it('una verificación caducada se renueva', () => {
    assert.equal(
      applyKycEvent('EXPIRED', 'RENEWAL_STARTED', 'INVESTOR'),
      'PENDING_DOCUMENTS',
    );
  });

  it('un expediente suspendido vuelve a revisión, no directo a aprobado', () => {
    assert.equal(
      applyKycEvent('SUSPENDED', 'COMPLIANCE_REINSTATED', 'REVIEWER'),
      'IN_REVIEW',
    );
    assert.equal(nextKycStatus('SUSPENDED', 'REVIEWER_APPROVED'), null);
  });

  it('calcula la caducidad en meses', () => {
    const aprobado = new Date('2026-01-15T10:00:00.000Z');
    assert.equal(
      verificationExpiresAt(aprobado, 24).toISOString(),
      '2028-01-15T10:00:00.000Z',
    );
  });
});

describe('nivel exigible según el importe', () => {
  const umbral = 5_000_000n; // 50.000 €

  it('pide origen de fondos al superar el umbral', () => {
    assert.equal(requiredKycLevel(5_000_001n, umbral, true), 3);
  });

  it('en el umbral exacto todavía no lo pide', () => {
    assert.equal(requiredKycLevel(umbral, umbral, true), 2);
  });

  it('sin test de idoneidad se queda en nivel 1', () => {
    assert.equal(requiredKycLevel(100_000n, umbral, false), 1);
  });
});
