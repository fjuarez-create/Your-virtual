/**
 * Cascada de retornos y simulador de inversión.
 *
 * El simulador de la web pública y la documentación del proyecto consumen ESTA
 * función. No hay una fórmula en el frontend y otra en el contrato: la cifra
 * que ve el inversor sale del mismo sitio que la que se le liquida.
 *
 * Modelo de cascada: cada tramo cubre una BANDA de rentabilidad sobre el
 * capital aportado, delimitada por su `hurdlePct` acumulado. El beneficio
 * recorre las bandas en orden y dentro de cada una se reparte según los
 * porcentajes del tramo. El último tramo no tiene techo.
 *
 * Ejemplo típico:
 *   Tramo 1 — hasta el 8 % sobre capital ....... 100 % inversores / 0 % promotor
 *   Tramo 2 — resto ............................  80 % inversores / 20 % promotor
 */

import { type Cents, applyPercentage, divideRounded } from './money.js';

export type ReturnType = 'TIR' | 'MULTIPLE' | 'FIXED_COUPON';

export interface ReturnTier {
  tierOrder: number;
  label: string;
  /**
   * Techo acumulado de la banda, en % sobre el capital aportado.
   * `null` en el último tramo: sin techo.
   */
  hurdlePct: number | null;
  splitInvestorsPct: number;
  splitSponsorPct: number;
}

export interface TierAllocation {
  tierOrder: number;
  label: string;
  profitInTierCents: Cents;
  investorCents: Cents;
  sponsorCents: Cents;
}

export interface WaterfallResult {
  allocations: TierAllocation[];
  investorProfitCents: Cents;
  sponsorProfitCents: Cents;
  /** Beneficio que no cupo en ningún tramo. Debe ser cero. */
  unallocatedCents: Cents;
}

export class WaterfallError extends Error {}

function assertTiersAreCoherent(tiers: readonly ReturnTier[]): void {
  if (tiers.length === 0) {
    throw new WaterfallError('La cascada no tiene tramos definidos');
  }

  let previousHurdle = 0;
  tiers.forEach((tier, index) => {
    const isLast = index === tiers.length - 1;

    if (Math.abs(tier.splitInvestorsPct + tier.splitSponsorPct - 100) > 1e-9) {
      throw new WaterfallError(
        `El tramo "${tier.label}" reparte ${tier.splitInvestorsPct + tier.splitSponsorPct} %, no 100 %`,
      );
    }

    if (tier.hurdlePct === null) {
      if (!isLast) {
        throw new WaterfallError(
          `Solo el último tramo puede no tener techo; "${tier.label}" no lo es`,
        );
      }
      return;
    }

    if (tier.hurdlePct <= previousHurdle) {
      throw new WaterfallError(
        `Los techos de la cascada deben crecer: "${tier.label}" tiene ${tier.hurdlePct} % tras ${previousHurdle} %`,
      );
    }
    previousHurdle = tier.hurdlePct;
  });

  const last = tiers[tiers.length - 1];
  if (last !== undefined && last.hurdlePct !== null) {
    throw new WaterfallError(
      'El último tramo de la cascada debe ser abierto (hurdlePct = null): si no, hay beneficio sin repartir',
    );
  }
}

/** Reparte un beneficio bruto entre inversores y promotor según la cascada. */
export function applyWaterfall(
  capitalCents: Cents,
  grossProfitCents: Cents,
  tiers: readonly ReturnTier[],
): WaterfallResult {
  if (capitalCents <= 0n) throw new WaterfallError('El capital debe ser positivo');
  if (grossProfitCents < 0n) throw new WaterfallError('El beneficio no puede ser negativo');

  const ordered = [...tiers].sort((a, b) => a.tierOrder - b.tierOrder);
  assertTiersAreCoherent(ordered);

  const allocations: TierAllocation[] = [];
  let remaining = grossProfitCents;
  let previousHurdle = 0;
  let investorTotal = 0n;
  let sponsorTotal = 0n;

  for (const tier of ordered) {
    if (remaining <= 0n) {
      allocations.push({
        tierOrder: tier.tierOrder,
        label: tier.label,
        profitInTierCents: 0n,
        investorCents: 0n,
        sponsorCents: 0n,
      });
      continue;
    }

    const bandCap =
      tier.hurdlePct === null
        ? remaining
        : applyPercentage(capitalCents, tier.hurdlePct - previousHurdle);

    const profitInTier = remaining < bandCap ? remaining : bandCap;

    // El promotor se calcula por diferencia para que no se pierda ni un
    // céntimo por doble redondeo.
    const investorCents = applyPercentage(profitInTier, tier.splitInvestorsPct);
    const sponsorCents = profitInTier - investorCents;

    allocations.push({
      tierOrder: tier.tierOrder,
      label: tier.label,
      profitInTierCents: profitInTier,
      investorCents,
      sponsorCents,
    });

    investorTotal += investorCents;
    sponsorTotal += sponsorCents;
    remaining -= profitInTier;
    if (tier.hurdlePct !== null) previousHurdle = tier.hurdlePct;
  }

  return {
    allocations,
    investorProfitCents: investorTotal,
    sponsorProfitCents: sponsorTotal,
    unallocatedCents: remaining,
  };
}

/**
 * Beneficio bruto proyectado del proyecto sobre un capital, según el tipo de
 * retorno objetivo. Es una PROYECCIÓN, no una promesa: la web debe decirlo
 * junto a la cifra.
 */
export function projectedGrossProfit(
  capitalCents: Cents,
  targetReturnPct: number,
  termMonths: number,
  returnType: ReturnType,
): Cents {
  if (termMonths <= 0) throw new WaterfallError('El plazo debe ser positivo');

  switch (returnType) {
    case 'FIXED_COUPON': {
      // Cupón simple, prorrateado al plazo.
      const years = termMonths / 12;
      return applyPercentage(capitalCents, targetReturnPct * years);
    }
    case 'TIR': {
      // Capitalización compuesta a la tasa objetivo.
      const years = termMonths / 12;
      const growth = Math.pow(1 + targetReturnPct / 100, years) - 1;
      return applyPercentage(capitalCents, growth * 100);
    }
    case 'MULTIPLE': {
      // targetReturnPct expresa el múltiplo sobre capital (200 = 2,0x).
      return applyPercentage(capitalCents, targetReturnPct - 100);
    }
  }
}

export interface SimulationInput {
  amountCents: Cents;
  targetReturnPct: number;
  termMonths: number;
  returnType: ReturnType;
  tiers: readonly ReturnTier[];
}

export interface SimulationResult {
  capitalCents: Cents;
  projectGrossProfitCents: Cents;
  investorProfitCents: Cents;
  /** Capital + beneficio del inversor. */
  totalReturnedCents: Cents;
  /** Rentabilidad total del inversor sobre su capital, en %. */
  investorReturnPct: number;
  /** La misma, anualizada. */
  investorAnnualisedPct: number;
  allocations: TierAllocation[];
}

/**
 * Simulación completa para la web pública.
 *
 * Devuelve el retorno DEL INVERSOR después de la cascada, no el bruto del
 * proyecto. Enseñar el bruto sería engañoso: el promotor se lleva su parte.
 */
export function simulateInvestment(input: SimulationInput): SimulationResult {
  const { amountCents, targetReturnPct, termMonths, returnType, tiers } = input;

  const grossProfit = projectedGrossProfit(
    amountCents,
    targetReturnPct,
    termMonths,
    returnType,
  );

  const waterfall = applyWaterfall(amountCents, grossProfit, tiers);
  const totalReturned = amountCents + waterfall.investorProfitCents;

  // En puntos básicos para no perder precisión al pasar por `number`.
  const returnBps = Number(divideRounded(waterfall.investorProfitCents * 10_000n, amountCents));
  const investorReturnPct = returnBps / 100;

  const years = termMonths / 12;
  const investorAnnualisedPct =
    years <= 0 ? 0 : (Math.pow(1 + investorReturnPct / 100, 1 / years) - 1) * 100;

  return {
    capitalCents: amountCents,
    projectGrossProfitCents: grossProfit,
    investorProfitCents: waterfall.investorProfitCents,
    totalReturnedCents: totalReturned,
    investorReturnPct: Number(investorReturnPct.toFixed(2)),
    investorAnnualisedPct: Number(investorAnnualisedPct.toFixed(2)),
    allocations: waterfall.allocations,
  };
}
