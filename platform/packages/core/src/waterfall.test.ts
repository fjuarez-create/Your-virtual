import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { sum } from './money.js';
import {
  type ReturnTier,
  WaterfallError,
  applyWaterfall,
  projectedGrossProfit,
  simulateInvestment,
} from './waterfall.js';

/** Cascada típica: 8 % preferente para el inversor, luego 80/20. */
const CASCADA: ReturnTier[] = [
  {
    tierOrder: 1,
    label: 'Retorno preferente',
    hurdlePct: 8,
    splitInvestorsPct: 100,
    splitSponsorPct: 0,
  },
  {
    tierOrder: 2,
    label: 'Reparto de plusvalía',
    hurdlePct: null,
    splitInvestorsPct: 80,
    splitSponsorPct: 20,
  },
];

const CAPITAL = 10_000_00n; // 10.000 €

describe('applyWaterfall', () => {
  it('da todo al inversor por debajo del preferente', () => {
    const r = applyWaterfall(CAPITAL, 50_000n, CASCADA); // 500 € = 5 %
    assert.equal(r.investorProfitCents, 50_000n);
    assert.equal(r.sponsorProfitCents, 0n);
    assert.equal(r.unallocatedCents, 0n);
  });

  it('reparte el exceso por encima del preferente', () => {
    // 8 % de 10.000 € = 800 €. Beneficio 1.800 € → 800 € al tramo 1,
    // 1.000 € al tramo 2 (800 inversor / 200 promotor).
    const r = applyWaterfall(CAPITAL, 180_000n, CASCADA);
    assert.equal(r.allocations[0]?.investorCents, 80_000n);
    assert.equal(r.allocations[1]?.investorCents, 80_000n);
    assert.equal(r.allocations[1]?.sponsorCents, 20_000n);
    assert.equal(r.investorProfitCents, 160_000n);
    assert.equal(r.sponsorProfitCents, 20_000n);
  });

  it('justo en el techo del preferente aún no reparte con el promotor', () => {
    const r = applyWaterfall(CAPITAL, 80_000n, CASCADA);
    assert.equal(r.sponsorProfitCents, 0n);
  });

  it('sin beneficio no reparte nada', () => {
    const r = applyWaterfall(CAPITAL, 0n, CASCADA);
    assert.equal(r.investorProfitCents, 0n);
    assert.equal(r.sponsorProfitCents, 0n);
  });

  it('nunca pierde ni inventa un céntimo', () => {
    // La propiedad que de verdad importa: inversor + promotor = bruto, siempre.
    for (let profit = 0n; profit <= 500_000n; profit += 7_777n) {
      const r = applyWaterfall(CAPITAL, profit, CASCADA);
      assert.equal(
        r.investorProfitCents + r.sponsorProfitCents,
        profit,
        `descuadre con beneficio ${profit}`,
      );
      assert.equal(r.unallocatedCents, 0n, `beneficio sin repartir con ${profit}`);
      assert.equal(
        sum(r.allocations.map((a) => a.profitInTierCents)),
        profit,
        `los tramos no suman el bruto con ${profit}`,
      );
    }
  });

  it('funciona con tres tramos', () => {
    const tres: ReturnTier[] = [
      { tierOrder: 1, label: 'Preferente', hurdlePct: 6, splitInvestorsPct: 100, splitSponsorPct: 0 },
      { tierOrder: 2, label: 'Recuperación', hurdlePct: 10, splitInvestorsPct: 50, splitSponsorPct: 50 },
      { tierOrder: 3, label: 'Resto', hurdlePct: null, splitInvestorsPct: 70, splitSponsorPct: 30 },
    ];
    // Beneficio 2.000 € sobre 10.000 €:
    //   tramo 1: 600 € → 600/0
    //   tramo 2: 400 € → 200/200
    //   tramo 3: 1.000 € → 700/300
    const r = applyWaterfall(CAPITAL, 200_000n, tres);
    assert.equal(r.investorProfitCents, 60_000n + 20_000n + 70_000n);
    assert.equal(r.sponsorProfitCents, 20_000n + 30_000n);
  });

  it('ordena los tramos aunque lleguen desordenados', () => {
    const desordenada = [CASCADA[1]!, CASCADA[0]!];
    const r = applyWaterfall(CAPITAL, 180_000n, desordenada);
    assert.equal(r.investorProfitCents, 160_000n);
  });
});

describe('la cascada tiene que estar bien definida', () => {
  it('rechaza tramos que no suman 100 %', () => {
    assert.throws(
      () =>
        applyWaterfall(CAPITAL, 100_000n, [
          { tierOrder: 1, label: 'Malo', hurdlePct: null, splitInvestorsPct: 80, splitSponsorPct: 30 },
        ]),
      WaterfallError,
    );
  });

  it('rechaza que el último tramo tenga techo: dejaría beneficio sin repartir', () => {
    assert.throws(
      () =>
        applyWaterfall(CAPITAL, 100_000n, [
          { tierOrder: 1, label: 'Cerrado', hurdlePct: 8, splitInvestorsPct: 100, splitSponsorPct: 0 },
        ]),
      WaterfallError,
    );
  });

  it('rechaza techos que no crecen', () => {
    assert.throws(
      () =>
        applyWaterfall(CAPITAL, 100_000n, [
          { tierOrder: 1, label: 'A', hurdlePct: 10, splitInvestorsPct: 100, splitSponsorPct: 0 },
          { tierOrder: 2, label: 'B', hurdlePct: 8, splitInvestorsPct: 100, splitSponsorPct: 0 },
          { tierOrder: 3, label: 'C', hurdlePct: null, splitInvestorsPct: 80, splitSponsorPct: 20 },
        ]),
      WaterfallError,
    );
  });

  it('rechaza una cascada vacía', () => {
    assert.throws(() => applyWaterfall(CAPITAL, 100n, []), WaterfallError);
  });

  it('rechaza capital o beneficio imposibles', () => {
    assert.throws(() => applyWaterfall(0n, 100n, CASCADA), WaterfallError);
    assert.throws(() => applyWaterfall(CAPITAL, -1n, CASCADA), WaterfallError);
  });
});

describe('projectedGrossProfit', () => {
  it('prorratea el cupón fijo al plazo', () => {
    // 6 % anual durante 18 meses = 9 % sobre capital
    assert.equal(projectedGrossProfit(CAPITAL, 6, 18, 'FIXED_COUPON'), 90_000n);
  });

  it('capitaliza la TIR', () => {
    // 10 % durante 24 meses = 21 % compuesto
    assert.equal(projectedGrossProfit(CAPITAL, 10, 24, 'TIR'), 210_000n);
  });

  it('interpreta el múltiplo sobre capital', () => {
    // 1,5x sobre 10.000 € = 5.000 € de beneficio
    assert.equal(projectedGrossProfit(CAPITAL, 150, 24, 'MULTIPLE'), 500_000n);
  });

  it('rechaza plazos no positivos', () => {
    assert.throws(() => projectedGrossProfit(CAPITAL, 6, 0, 'TIR'), WaterfallError);
  });
});

describe('simulateInvestment', () => {
  it('devuelve el retorno DEL INVERSOR, no el bruto del proyecto', () => {
    const r = simulateInvestment({
      amountCents: CAPITAL,
      targetReturnPct: 12,
      termMonths: 24,
      returnType: 'FIXED_COUPON',
      tiers: CASCADA,
    });

    // Bruto: 24 % de 10.000 € = 2.400 €
    assert.equal(r.projectGrossProfitCents, 240_000n);
    // Tras la cascada: 800 € + 80 % de 1.600 € = 2.080 €
    assert.equal(r.investorProfitCents, 208_000n);
    assert.ok(
      r.investorProfitCents < r.projectGrossProfitCents,
      'enseñar el bruto como si fuera del inversor sería engañoso',
    );
    assert.equal(r.totalReturnedCents, CAPITAL + 208_000n);
  });

  it('calcula la rentabilidad total y la anualizada', () => {
    const r = simulateInvestment({
      amountCents: CAPITAL,
      targetReturnPct: 12,
      termMonths: 24,
      returnType: 'FIXED_COUPON',
      tiers: CASCADA,
    });
    assert.equal(r.investorReturnPct, 20.8);
    // (1,208)^(1/2) - 1 ≈ 9,91 %
    assert.ok(Math.abs(r.investorAnnualisedPct - 9.91) < 0.05);
  });

  it('el capital siempre vuelve entero en el total', () => {
    const r = simulateInvestment({
      amountCents: 500_00n,
      targetReturnPct: 0.0001,
      termMonths: 12,
      returnType: 'FIXED_COUPON',
      tiers: CASCADA,
    });
    assert.ok(r.totalReturnedCents >= r.capitalCents);
  });

  it('escala a tickets grandes sin perder exactitud', () => {
    const r = simulateInvestment({
      amountCents: 250_000_00n, // 250.000 €
      targetReturnPct: 12,
      termMonths: 24,
      returnType: 'FIXED_COUPON',
      tiers: CASCADA,
    });
    assert.equal(r.projectGrossProfitCents, 6_000_000n); // 60.000 €
    assert.equal(r.investorProfitCents, 5_200_000n); // 52.000 €
  });
});
