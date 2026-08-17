import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  MoneyError,
  applyPercentage,
  distributeProportionally,
  divideRounded,
  formatEuros,
  parseEuros,
  sum,
} from './money.js';

describe('parseEuros', () => {
  it('lee el formato español', () => {
    assert.equal(parseEuros('1.234,56'), 123456n);
    assert.equal(parseEuros('1.234,56 €'), 123456n);
    assert.equal(parseEuros('50'), 5000n);
    assert.equal(parseEuros('0,07'), 7n);
    assert.equal(parseEuros('-12,30'), -1230n);
  });

  it('rechaza lo que no sabe interpretar en vez de adivinar', () => {
    // Adivinar aquí significa aceptar un importe distinto del que el inversor
    // creía estar escribiendo.
    for (const malo of ['', '1,234', 'mil euros', '1.2.3', '12,', '1e5', '1.23', '12.3456']) {
      assert.throws(() => parseEuros(malo), MoneyError, `debería rechazar "${malo}"`);
    }
  });

  it('distingue el separador de miles del decimal', () => {
    // Es el error más caro de este parser: confundir 1.234 € con 1,234 €.
    assert.equal(parseEuros('1.234'), 123_400n);
    assert.equal(parseEuros('1.234.567'), 123_456_700n);
    assert.throws(() => parseEuros('1,234'), MoneyError);
  });

  it('va y vuelve sin perder nada', () => {
    for (const cents of [0n, 1n, 99n, 100n, 123456789n]) {
      assert.equal(parseEuros(formatEuros(cents, { symbol: false })), cents);
    }
  });
});

describe('formatEuros', () => {
  it('agrupa los miles y siempre pone dos decimales', () => {
    assert.equal(formatEuros(123456n), '1.234,56 €');
    assert.equal(formatEuros(100n), '1,00 €');
    assert.equal(formatEuros(7n), '0,07 €');
    assert.equal(formatEuros(250000000n), '2.500.000,00 €');
    assert.equal(formatEuros(-4250n), '-42,50 €');
  });
});

describe('divideRounded', () => {
  it('redondea el medio hacia arriba', () => {
    assert.equal(divideRounded(5n, 2n), 3n);
    assert.equal(divideRounded(4n, 2n), 2n);
    assert.equal(divideRounded(1n, 3n), 0n);
    assert.equal(divideRounded(2n, 3n), 1n);
  });

  it('mantiene la simetría con negativos', () => {
    assert.equal(divideRounded(-5n, 2n), -3n);
    assert.equal(divideRounded(5n, -2n), -3n);
  });

  it('no divide por cero', () => {
    assert.throws(() => divideRounded(1n, 0n), MoneyError);
  });
});

describe('applyPercentage', () => {
  it('calcula porcentajes exactos', () => {
    assert.equal(applyPercentage(100000n, 10), 10000n);
    assert.equal(applyPercentage(100000n, 8.5), 8500n);
    assert.equal(applyPercentage(100000n, 0), 0n);
  });

  it('redondea al céntimo', () => {
    // 3,33 % de 10,00 € = 0,333 € → 0,33 €
    assert.equal(applyPercentage(1000n, 3.33), 33n);
    // 0,005 € redondea hacia arriba
    assert.equal(applyPercentage(1000n, 0.5), 5n);
  });

  it('no se apoya en la coma flotante para totales grandes', () => {
    // 7,35 % de 12.345.678,90 € — el resultado tiene que ser exacto al céntimo.
    const capital = 1_234_567_890n;
    assert.equal(applyPercentage(capital, 7.35), 90_740_740n);
  });
});

describe('distributeProportionally', () => {
  it('reparte sin perder ni inventar céntimos', () => {
    const partes = distributeProportionally(100n, [1n, 1n, 1n]);
    assert.equal(sum(partes), 100n);
    assert.deepEqual(partes, [34n, 33n, 33n]);
  });

  it('cuadra siempre, con cualquier combinación', () => {
    const casos: Array<[bigint, bigint[]]> = [
      [1n, [1n, 1n, 1n]],
      [999999n, [7n, 11n, 13n, 17n]],
      [100000n, [1n]],
      [7n, [5n, 3n, 1n, 1n]],
      [1_000_000_00n, [333n, 333n, 334n]],
    ];
    for (const [total, pesos] of casos) {
      const partes = distributeProportionally(total, pesos);
      assert.equal(
        sum(partes),
        total,
        `el reparto de ${total} entre [${pesos}] no cuadra: [${partes}]`,
      );
      assert.equal(partes.length, pesos.length);
    }
  });

  it('da el resto a las participaciones mayores, de forma determinista', () => {
    const partes = distributeProportionally(10n, [7n, 2n, 1n]);
    assert.equal(sum(partes), 10n);
    // 7,0 / 2,0 / 1,0 exactos: no hay resto que repartir.
    assert.deepEqual(partes, [7n, 2n, 1n]);

    const conResto = distributeProportionally(100n, [50n, 25n, 25n, 1n]);
    assert.equal(sum(conResto), 100n);
    assert.ok((conResto[0] ?? 0n) >= (conResto[3] ?? 0n));
  });

  it('rechaza un reparto sin peso', () => {
    assert.throws(() => distributeProportionally(100n, [0n, 0n]), MoneyError);
  });

  it('devuelve vacío si no hay participantes', () => {
    assert.deepEqual(distributeProportionally(100n, []), []);
  });
});
