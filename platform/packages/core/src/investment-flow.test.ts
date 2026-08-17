import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  InvalidTransitionError,
  type InvestmentStatus,
  LIVE_STATUSES,
  allowedEvents,
  applyEvent,
  canWithdraw,
  coolingOffEndsAt,
  isTerminal,
  nextStatus,
  occupiesRoundCapacity,
} from './investment-flow.js';

const ALL_STATUSES: InvestmentStatus[] = [
  'DRAFT',
  'PENDING_KIIS',
  'PENDING_SIGNATURE',
  'COOLING_OFF',
  'PENDING_PAYMENT',
  'FUNDS_RECEIVED',
  'CONFIRMED',
  'WITHDRAWN',
  'CANCELLED',
  'EXPIRED',
  'REFUNDED',
];

describe('recorrido completo', () => {
  it('lleva una inversión de borrador a confirmada', () => {
    let status: InvestmentStatus = 'DRAFT';
    status = applyEvent(status, 'ELIGIBILITY_PASSED');
    assert.equal(status, 'PENDING_KIIS');
    status = applyEvent(status, 'KIIS_ACKNOWLEDGED');
    assert.equal(status, 'PENDING_SIGNATURE');
    status = applyEvent(status, 'CONTRACT_SIGNED');
    assert.equal(status, 'COOLING_OFF');
    status = applyEvent(status, 'COOLING_OFF_ELAPSED');
    assert.equal(status, 'PENDING_PAYMENT');
    status = applyEvent(status, 'PAYMENT_RECEIVED');
    assert.equal(status, 'FUNDS_RECEIVED');
    status = applyEvent(status, 'ROUND_CLOSED_SUCCESSFULLY');
    assert.equal(status, 'CONFIRMED');
    assert.ok(isTerminal(status));
  });

  it('devuelve el dinero cuando la ronda no alcanza el mínimo', () => {
    assert.equal(applyEvent('FUNDS_RECEIVED', 'ROUND_FAILED'), 'REFUNDED');
  });

  it('permite revocar durante la reflexión y luego devolver', () => {
    const revocada = applyEvent('COOLING_OFF', 'INVESTOR_WITHDREW');
    assert.equal(revocada, 'WITHDRAWN');
    assert.equal(applyEvent(revocada, 'REFUND_COMPLETED'), 'REFUNDED');
  });
});

describe('la ficha de datos fundamentales no se puede saltar', () => {
  it('no se firma sin haber confirmado la lectura de la FDFI', () => {
    // Es un requisito precontractual: si esta transición existiera, el
    // inversor podría firmar sin haber visto la ficha.
    assert.equal(nextStatus('PENDING_KIIS', 'CONTRACT_SIGNED'), null);
    assert.throws(
      () => applyEvent('PENDING_KIIS', 'CONTRACT_SIGNED'),
      InvalidTransitionError,
    );
  });

  it('no se paga sin haber firmado', () => {
    assert.equal(nextStatus('PENDING_SIGNATURE', 'PAYMENT_RECEIVED'), null);
    assert.equal(nextStatus('DRAFT', 'PAYMENT_RECEIVED'), null);
  });
});

describe('el periodo de reflexión no se puede acortar', () => {
  it('no se pasa a cobro sin que expire la reflexión', () => {
    assert.equal(nextStatus('COOLING_OFF', 'PAYMENT_RECEIVED'), null);
  });

  it('calcula el fin del plazo en días naturales, al final del día', () => {
    const firma = new Date('2026-03-10T23:50:00.000Z');
    const fin = coolingOffEndsAt(firma, 4);
    assert.equal(fin.toISOString(), '2026-03-14T23:59:59.999Z');
  });

  it('cuenta días naturales, no laborables', () => {
    // Viernes + 4 días naturales = martes, no jueves.
    const viernes = new Date('2026-03-13T10:00:00.000Z');
    const fin = coolingOffEndsAt(viernes, 4);
    assert.equal(fin.toISOString().slice(0, 10), '2026-03-17');
  });

  it('con cero días termina ese mismo día', () => {
    const fin = coolingOffEndsAt(new Date('2026-03-10T08:00:00.000Z'), 0);
    assert.equal(fin.toISOString(), '2026-03-10T23:59:59.999Z');
  });

  it('rechaza plazos absurdos', () => {
    assert.throws(() => coolingOffEndsAt(new Date(), -1), RangeError);
    assert.throws(() => coolingOffEndsAt(new Date(), 1.5), RangeError);
  });
});

describe('canWithdraw', () => {
  const fin = new Date('2026-03-14T23:59:59.999Z');

  it('permite revocar dentro del plazo, hasta el último instante', () => {
    assert.equal(canWithdraw('COOLING_OFF', fin, new Date('2026-03-12T00:00:00Z')), true);
    assert.equal(canWithdraw('COOLING_OFF', fin, fin), true);
  });

  it('no permite revocar pasado el plazo', () => {
    assert.equal(
      canWithdraw('COOLING_OFF', fin, new Date('2026-03-15T00:00:00.000Z')),
      false,
    );
  });

  it('no permite revocar desde otros estados', () => {
    for (const status of ALL_STATUSES.filter((s) => s !== 'COOLING_OFF')) {
      assert.equal(canWithdraw(status, fin, new Date('2026-03-12T00:00:00Z')), false);
    }
  });
});

describe('estados terminales', () => {
  it('no admiten ningún evento', () => {
    for (const status of ALL_STATUSES.filter(isTerminal)) {
      if (status === 'WITHDRAWN') continue; // WITHDRAWN no es terminal
      assert.deepEqual(
        allowedEvents(status),
        [],
        `${status} debería ser un callejón sin salida`,
      );
    }
  });

  it('CONFIRMED no se puede deshacer', () => {
    assert.deepEqual(allowedEvents('CONFIRMED'), []);
  });
});

describe('ocupación de cupo de la ronda', () => {
  it('coincide con el filtro de la vista funding_round_progress', () => {
    // Si estas dos listas divergen, el "% cubierto" que ve el inversor deja de
    // corresponderse con el cupo que la aplicación cree tener libre.
    const esperados = [
      'PENDING_KIIS',
      'PENDING_SIGNATURE',
      'COOLING_OFF',
      'PENDING_PAYMENT',
      'FUNDS_RECEIVED',
      'CONFIRMED',
    ];
    assert.deepEqual([...LIVE_STATUSES].sort(), [...esperados].sort());
  });

  it('las revocadas y caducadas liberan su importe', () => {
    for (const status of ['WITHDRAWN', 'CANCELLED', 'EXPIRED', 'REFUNDED'] as const) {
      assert.equal(occupiesRoundCapacity(status), false);
    }
  });

  it('un borrador todavía no ocupa cupo', () => {
    assert.equal(occupiesRoundCapacity('DRAFT'), false);
  });
});

describe('solo el cierre de ronda confirma', () => {
  it('ningún otro evento produce CONFIRMED', () => {
    for (const status of ALL_STATUSES) {
      for (const event of allowedEvents(status)) {
        if (event === 'ROUND_CLOSED_SUCCESSFULLY') continue;
        assert.notEqual(
          nextStatus(status, event),
          'CONFIRMED',
          `${event} desde ${status} no debería confirmar la inversión`,
        );
      }
    }
  });
});
