import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { defaultComplianceConfig } from './compliance.js';
import {
  type BlockerCode,
  type EligibilityInput,
  assessEligibility,
} from './eligibility.js';

const AHORA = new Date('2026-06-01T12:00:00.000Z');
const FUTURO = new Date('2027-06-01T12:00:00.000Z');
const PASADO = new Date('2025-06-01T12:00:00.000Z');

/** Caso base: persona física verificada que puede invertir sin fricción. */
function caseBase(): EligibilityInput {
  return {
    now: AHORA,
    config: defaultComplianceConfig(),
    user: {
      status: 'ACTIVE',
      kyc: { status: 'APPROVED', levelReached: 2, expiresAt: FUTURO },
    },
    account: {
      type: 'NATURAL',
      status: 'ACTIVE',
      classification: 'NON_SOPHISTICATED',
      classificationValidUntil: null,
      kyb: null,
      beneficialOwnersPendingScreening: 0,
    },
    membership: { role: 'OWNER', status: 'ACTIVE', validUntil: null },
    round: {
      status: 'OPEN',
      opensAt: PASADO,
      closesAt: FUTURO,
      targetAmountCents: 100_000_000n, // 1.000.000 €
      minTicketCents: 50_000n, // 500 €
      maxTicketPerInvestorCents: 5_000_000n, // 50.000 €
      committedCents: 0n,
    },
    suitability: {
      outcome: 'PASSED',
      validUntil: FUTURO,
      declaredNetWorthCents: 20_000_000n, // 200.000 €
    },
    alreadyCommittedByAccountCents: 0n,
    lifetimeCommittedCents: 0n,
    amountCents: 100_000n, // 1.000 €
  };
}

function codes(input: EligibilityInput): BlockerCode[] {
  return assessEligibility(input).blockers.map((b) => b.code);
}

describe('caso base', () => {
  it('deja invertir a un inversor verificado', () => {
    const result = assessEligibility(caseBase());
    assert.equal(result.allowed, true, `bloqueos inesperados: ${JSON.stringify(result.blockers)}`);
    assert.deepEqual(result.blockers, []);
  });

  it('informa del cupo restante', () => {
    const result = assessEligibility(caseBase());
    assert.equal(result.remainingCapacityCents, 5_000_000n);
  });
});

describe('la identidad no es negociable', () => {
  it('bloquea si no hay verificación', () => {
    const input = caseBase();
    input.user.kyc = null;
    assert.ok(codes(input).includes('IDENTITY_NOT_VERIFIED'));
    assert.equal(assessEligibility(input).allowed, false);
  });

  it('bloquea si está en revisión', () => {
    const input = caseBase();
    input.user.kyc = { status: 'IN_REVIEW', levelReached: 0, expiresAt: null };
    assert.ok(codes(input).includes('IDENTITY_NOT_VERIFIED'));
  });

  it('bloquea si ha caducado, aunque figure aprobada', () => {
    const input = caseBase();
    input.user.kyc = { status: 'APPROVED', levelReached: 2, expiresAt: PASADO };
    assert.ok(codes(input).includes('IDENTITY_EXPIRED'));
  });

  it('bloquea si el expediente está suspendido', () => {
    const input = caseBase();
    input.user.kyc = { status: 'SUSPENDED', levelReached: 2, expiresAt: FUTURO };
    assert.equal(assessEligibility(input).allowed, false);
  });
});

describe('personas jurídicas', () => {
  function caseSociedad(): EligibilityInput {
    const input = caseBase();
    input.account.type = 'LEGAL';
    input.account.kyb = { status: 'APPROVED', levelReached: 2, expiresAt: FUTURO };
    input.membership = { role: 'REPRESENTATIVE', status: 'ACTIVE', validUntil: FUTURO };
    return input;
  }

  it('deja invertir a una sociedad verificada por su apoderado', () => {
    const result = assessEligibility(caseSociedad());
    assert.equal(result.allowed, true, JSON.stringify(result.blockers));
  });

  it('exige verificar también al apoderado, no solo a la sociedad', () => {
    const input = caseSociedad();
    input.user.kyc = null;
    assert.ok(codes(input).includes('IDENTITY_NOT_VERIFIED'));
  });

  it('exige verificar la sociedad, no solo al apoderado', () => {
    const input = caseSociedad();
    input.account.kyb = null;
    assert.ok(codes(input).includes('COMPANY_NOT_VERIFIED'));
  });

  it('bloquea mientras queden titulares reales sin cribar', () => {
    const input = caseSociedad();
    input.account.beneficialOwnersPendingScreening = 1;
    assert.ok(codes(input).includes('BENEFICIAL_OWNERS_PENDING'));
  });

  it('bloquea si el poder de representación ha caducado', () => {
    const input = caseSociedad();
    input.membership = { role: 'REPRESENTATIVE', status: 'ACTIVE', validUntil: PASADO };
    assert.ok(codes(input).includes('MEMBERSHIP_EXPIRED'));
  });

  it('bloquea mientras el poder está pendiente de aprobación', () => {
    const input = caseSociedad();
    input.membership = { role: 'REPRESENTATIVE', status: 'PENDING_APPROVAL', validUntil: null };
    assert.ok(codes(input).includes('MEMBERSHIP_NOT_ACTIVE'));
  });
});

describe('representación', () => {
  it('un observador no puede comprometer dinero', () => {
    const input = caseBase();
    input.membership = { role: 'VIEWER', status: 'ACTIVE', validUntil: null };
    assert.ok(codes(input).includes('MEMBERSHIP_READ_ONLY'));
  });

  it('sin vínculo no se opera por cuenta ajena', () => {
    const input = caseBase();
    input.membership = null;
    assert.ok(codes(input).includes('NO_MEMBERSHIP'));
  });
});

describe('idoneidad y clasificación', () => {
  it('exige el test a los no sofisticados', () => {
    const input = caseBase();
    input.suitability = null;
    assert.ok(codes(input).includes('SUITABILITY_MISSING'));
  });

  it('bloquea si el test ha caducado', () => {
    const input = caseBase();
    input.suitability = {
      outcome: 'PASSED',
      validUntil: PASADO,
      declaredNetWorthCents: 20_000_000n,
    };
    assert.ok(codes(input).includes('SUITABILITY_EXPIRED'));
  });

  it('no exige el test a un sofisticado con clasificación vigente', () => {
    const input = caseBase();
    input.account.classification = 'SOPHISTICATED';
    input.account.classificationValidUntil = FUTURO;
    input.suitability = null;
    const result = assessEligibility(input);
    assert.equal(result.allowed, true, JSON.stringify(result.blockers));
  });

  it('bloquea al sofisticado cuya clasificación caducó', () => {
    const input = caseBase();
    input.account.classification = 'SOPHISTICATED';
    input.account.classificationValidUntil = PASADO;
    input.suitability = null;
    assert.ok(codes(input).includes('SOPHISTICATION_EXPIRED'));
  });

  it('un test no superado avisa pero no impide invertir', () => {
    const input = caseBase();
    input.suitability = {
      outcome: 'FAILED_WARNING_ACKNOWLEDGED',
      validUntil: FUTURO,
      declaredNetWorthCents: 20_000_000n,
    };
    const result = assessEligibility(input);
    assert.equal(result.allowed, true);
    const aviso = result.warnings.find((w) => w.code === 'SUITABILITY_TEST_FAILED');
    assert.ok(aviso, 'debería avisar de que el producto puede no ser adecuado');
    assert.equal(aviso.requiresAcknowledgement, true);
  });
});

describe('aviso por inversión relevante', () => {
  it('no avisa por debajo del umbral absoluto', () => {
    const input = caseBase();
    input.amountCents = 100_000n; // 1.000 €, justo el umbral
    const result = assessEligibility(input);
    assert.equal(
      result.warnings.some((w) => w.code === 'RELEVANT_INVESTMENT_WARNING'),
      false,
    );
  });

  it('avisa al superar el 5 % del patrimonio declarado', () => {
    const input = caseBase();
    // 5 % de 200.000 € = 10.000 €; invierte 10.000,01 €
    input.amountCents = 1_000_001n;
    const result = assessEligibility(input);
    assert.ok(result.warnings.some((w) => w.code === 'RELEVANT_INVESTMENT_WARNING'));
  });

  it('aplica el mayor de los dos umbrales', () => {
    const input = caseBase();
    // Patrimonio pequeño: el 5 % (50 €) es menor que el umbral absoluto (1.000 €).
    input.suitability = {
      outcome: 'PASSED',
      validUntil: FUTURO,
      declaredNetWorthCents: 100_000n, // 1.000 €
    };
    input.amountCents = 90_000n; // 900 € — por encima del 5 %, por debajo de 1.000 €
    const result = assessEligibility(input);
    assert.equal(
      result.warnings.some((w) => w.code === 'RELEVANT_INVESTMENT_WARNING'),
      false,
      'con el umbral absoluto por delante, 900 € no debería disparar el aviso',
    );
  });

  it('no avisa a un inversor sofisticado', () => {
    const input = caseBase();
    input.account.classification = 'SOPHISTICATED';
    input.account.classificationValidUntil = FUTURO;
    input.amountCents = 4_000_000n;
    const result = assessEligibility(input);
    assert.equal(
      result.warnings.some((w) => w.code === 'RELEVANT_INVESTMENT_WARNING'),
      false,
    );
  });
});

describe('origen de fondos', () => {
  it('bloquea al superar el umbral acumulado sin nivel 3', () => {
    const input = caseBase();
    input.lifetimeCommittedCents = 4_900_000n; // 49.000 €
    input.amountCents = 200_000n; // +2.000 € → 51.000 €, supera 50.000 €
    input.round.maxTicketPerInvestorCents = null;
    assert.ok(codes(input).includes('SOURCE_OF_FUNDS_REQUIRED'));
  });

  it('deja pasar si ya alcanzó el nivel 3', () => {
    const input = caseBase();
    input.lifetimeCommittedCents = 4_900_000n;
    input.amountCents = 200_000n;
    input.round.maxTicketPerInvestorCents = null;
    input.user.kyc = { status: 'APPROVED', levelReached: 3, expiresAt: FUTURO };
    assert.equal(codes(input).includes('SOURCE_OF_FUNDS_REQUIRED'), false);
  });

  it('en el umbral exacto todavía no lo exige', () => {
    const input = caseBase();
    input.lifetimeCommittedCents = 4_900_000n;
    input.amountCents = 100_000n; // exactamente 50.000 €
    assert.equal(codes(input).includes('SOURCE_OF_FUNDS_REQUIRED'), false);
  });
});

describe('estado de la ronda', () => {
  it('bloquea si no está abierta', () => {
    const input = caseBase();
    input.round.status = 'CLOSED_SUCCESS';
    assert.ok(codes(input).includes('ROUND_NOT_OPEN'));
  });

  it('bloquea antes de la apertura', () => {
    const input = caseBase();
    input.round.opensAt = FUTURO;
    assert.ok(codes(input).includes('ROUND_NOT_STARTED'));
  });

  it('bloquea pasada la fecha de cierre', () => {
    const input = caseBase();
    input.round.closesAt = PASADO;
    assert.ok(codes(input).includes('ROUND_CLOSED'));
  });
});

describe('límites de importe', () => {
  it('rechaza por debajo del ticket mínimo', () => {
    const input = caseBase();
    input.amountCents = 49_999n;
    assert.ok(codes(input).includes('BELOW_MIN_TICKET'));
  });

  it('rechaza importe cero o negativo', () => {
    const input = caseBase();
    input.amountCents = 0n;
    assert.ok(codes(input).includes('AMOUNT_NOT_POSITIVE'));
    input.amountCents = -100n;
    assert.ok(codes(input).includes('AMOUNT_NOT_POSITIVE'));
  });

  it('cuenta lo ya comprometido para el máximo por inversor', () => {
    const input = caseBase();
    input.alreadyCommittedByAccountCents = 4_900_000n; // 49.000 €
    input.amountCents = 200_000n; // +2.000 € → 51.000 € > 50.000 €
    assert.ok(codes(input).includes('ABOVE_MAX_TICKET'));
  });

  it('no deja sobrepasar el objetivo de la ronda', () => {
    const input = caseBase();
    input.round.committedCents = 99_900_000n; // faltan 1.000 €
    input.amountCents = 200_000n; // pide 2.000 €
    assert.ok(codes(input).includes('EXCEEDS_ROUND_TARGET'));
  });

  it('el cupo restante refleja el límite más estricto de los dos', () => {
    const input = caseBase();
    input.round.committedCents = 99_800_000n; // quedan 2.000 € en la ronda
    // El máximo por inversor son 50.000 €, así que manda la ronda.
    assert.equal(assessEligibility(input).remainingCapacityCents, 200_000n);
  });

  it('nunca informa de cupo negativo', () => {
    const input = caseBase();
    input.round.committedCents = 100_000_000n;
    assert.equal(assessEligibility(input).remainingCapacityCents, 0n);
  });
});

describe('acumulación de impedimentos', () => {
  it('devuelve todos los problemas a la vez, no solo el primero', () => {
    // Un inversor al que solo se le dice un problema cada vez abandona.
    const input = caseBase();
    input.user.kyc = null;
    input.suitability = null;
    input.round.status = 'DRAFT';
    input.amountCents = 1n;

    const result = assessEligibility(input);
    assert.equal(result.allowed, false);
    assert.ok(result.blockers.length >= 4, `solo detectó ${result.blockers.length}`);
    for (const blocker of result.blockers) {
      assert.ok(blocker.message.length > 0, `${blocker.code} no explica nada al inversor`);
    }
  });
});
