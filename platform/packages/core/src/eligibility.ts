/**
 * ¿Puede esta cuenta comprometer este importe en esta ronda?
 *
 * Función pura: recibe una foto del estado y devuelve la lista de impedimentos
 * y de avisos. No consulta la base de datos ni conoce HTTP, así que se puede
 * probar exhaustivamente y —lo que importa de verdad— se puede LEER, que es lo
 * que hará el asesor legal cuando pregunte «¿dónde comprobáis esto?».
 *
 * La regla de diseño: ante la duda, bloquear. Un falso bloqueo es una llamada
 * de un inversor molesto; un falso permiso es un expediente sancionador.
 */

import type { ComplianceConfig } from './compliance.js';
import type { KycStatus } from './kyc-flow.js';
import { type Cents, max } from './money.js';

export type InvestorClassification = 'NON_SOPHISTICATED' | 'SOPHISTICATED';

export interface KycSnapshot {
  status: KycStatus;
  levelReached: number;
  expiresAt: Date | null;
}

export interface EligibilityInput {
  now: Date;
  config: ComplianceConfig;

  /** El humano que cursa la operación. */
  user: {
    status: 'ACTIVE' | 'LOCKED' | 'SUSPENDED' | 'CLOSED';
    kyc: KycSnapshot | null;
  };

  /** La parte que invierte. */
  account: {
    type: 'NATURAL' | 'LEGAL';
    status: 'ACTIVE' | 'LOCKED' | 'SUSPENDED' | 'CLOSED';
    classification: InvestorClassification;
    classificationValidUntil: Date | null;
    /** Solo para cuentas LEGAL: verificación de la sociedad. */
    kyb: KycSnapshot | null;
    /** Titulares reales pendientes de cribar. Bloquea si hay alguno. */
    beneficialOwnersPendingScreening: number;
  };

  /** Vínculo entre el humano y la cuenta. */
  membership: {
    role: 'OWNER' | 'REPRESENTATIVE' | 'VIEWER';
    status: 'PENDING_APPROVAL' | 'ACTIVE' | 'REVOKED' | 'EXPIRED';
    validUntil: Date | null;
  } | null;

  round: {
    status: 'DRAFT' | 'OPEN' | 'CLOSED_SUCCESS' | 'CLOSED_FAILED' | 'CANCELLED';
    opensAt: Date | null;
    closesAt: Date | null;
    targetAmountCents: Cents;
    minTicketCents: Cents;
    maxTicketPerInvestorCents: Cents | null;
    /** Ya comprometido en la ronda por todos los inversores. */
    committedCents: Cents;
  };

  /** Test de idoneidad vigente de la cuenta, si lo hay. */
  suitability: {
    outcome: 'PASSED' | 'FAILED_WARNING_ACKNOWLEDGED' | 'NOT_REQUIRED_SOPHISTICATED';
    validUntil: Date;
    declaredNetWorthCents: Cents | null;
  } | null;

  /** Lo que esta cuenta ya tiene comprometido en ESTA ronda. */
  alreadyCommittedByAccountCents: Cents;
  /** Lo que esta cuenta acumula en TODA la plataforma (para el nivel 3). */
  lifetimeCommittedCents: Cents;

  amountCents: Cents;
}

export type BlockerCode =
  | 'USER_NOT_ACTIVE'
  | 'ACCOUNT_NOT_ACTIVE'
  | 'NO_MEMBERSHIP'
  | 'MEMBERSHIP_NOT_ACTIVE'
  | 'MEMBERSHIP_EXPIRED'
  | 'MEMBERSHIP_READ_ONLY'
  | 'IDENTITY_NOT_VERIFIED'
  | 'IDENTITY_EXPIRED'
  | 'COMPANY_NOT_VERIFIED'
  | 'BENEFICIAL_OWNERS_PENDING'
  | 'SUITABILITY_MISSING'
  | 'SUITABILITY_EXPIRED'
  | 'SOPHISTICATION_EXPIRED'
  | 'SOURCE_OF_FUNDS_REQUIRED'
  | 'ROUND_NOT_OPEN'
  | 'ROUND_NOT_STARTED'
  | 'ROUND_CLOSED'
  | 'BELOW_MIN_TICKET'
  | 'ABOVE_MAX_TICKET'
  | 'EXCEEDS_ROUND_TARGET'
  | 'AMOUNT_NOT_POSITIVE';

export type WarningCode =
  | 'RELEVANT_INVESTMENT_WARNING'
  | 'SUITABILITY_TEST_FAILED';

export interface Blocker {
  code: BlockerCode;
  /** Mensaje para el inversor: dice qué falta y cómo resolverlo. */
  message: string;
}

export interface Warning {
  code: WarningCode;
  message: string;
  /** Exige confirmación explícita del inversor antes de continuar. */
  requiresAcknowledgement: boolean;
}

export interface EligibilityResult {
  allowed: boolean;
  blockers: Blocker[];
  warnings: Warning[];
  /** Cupo que aún admite la ronda para esta cuenta. */
  remainingCapacityCents: Cents;
}

function isVerified(kyc: KycSnapshot | null, now: Date, minLevel: number): boolean {
  if (kyc === null) return false;
  if (kyc.status !== 'APPROVED') return false;
  if (kyc.levelReached < minLevel) return false;
  if (kyc.expiresAt !== null && kyc.expiresAt <= now) return false;
  return true;
}

export function assessEligibility(input: EligibilityInput): EligibilityResult {
  const blockers: Blocker[] = [];
  const warnings: Warning[] = [];
  const { now, config, user, account, membership, round, amountCents } = input;

  // --- Estado de las partes ---------------------------------------------
  if (user.status !== 'ACTIVE') {
    blockers.push({
      code: 'USER_NOT_ACTIVE',
      message: 'Tu cuenta de acceso no está activa. Contacta con la plataforma.',
    });
  }

  if (account.status !== 'ACTIVE') {
    blockers.push({
      code: 'ACCOUNT_NOT_ACTIVE',
      message: 'La cuenta inversora no está activa.',
    });
  }

  // --- Representación ----------------------------------------------------
  if (membership === null) {
    blockers.push({
      code: 'NO_MEMBERSHIP',
      message: 'No estás autorizado a operar por cuenta de este inversor.',
    });
  } else {
    if (membership.role === 'VIEWER') {
      blockers.push({
        code: 'MEMBERSHIP_READ_ONLY',
        message: 'Tu acceso a esta cuenta es de solo lectura: no puedes comprometer inversiones.',
      });
    }
    if (membership.status !== 'ACTIVE') {
      blockers.push({
        code: 'MEMBERSHIP_NOT_ACTIVE',
        message:
          membership.status === 'PENDING_APPROVAL'
            ? 'Tu poder de representación está pendiente de aprobación por cumplimiento.'
            : 'Tu autorización para operar por cuenta de este inversor ya no está vigente.',
      });
    }
    if (membership.validUntil !== null && membership.validUntil <= now) {
      blockers.push({
        code: 'MEMBERSHIP_EXPIRED',
        message: 'Tu poder de representación ha caducado. Aporta uno vigente para continuar.',
      });
    }
  }

  // --- Identidad del humano ---------------------------------------------
  // No negociable, y por eso no depende de ninguna bandera de configuración
  // que se pueda apagar: `kycLevel1Required` está bloqueado a `true`.
  if (!isVerified(user.kyc, now, 1)) {
    const expired =
      user.kyc?.status === 'EXPIRED' ||
      (user.kyc?.expiresAt !== null && user.kyc !== null && user.kyc.expiresAt <= now);
    blockers.push(
      expired
        ? {
            code: 'IDENTITY_EXPIRED',
            message: 'Tu verificación de identidad ha caducado. Renuévala para poder invertir.',
          }
        : {
            code: 'IDENTITY_NOT_VERIFIED',
            message: 'Necesitas completar la verificación de identidad antes de invertir.',
          },
    );
  }

  // --- Verificación de la sociedad --------------------------------------
  if (account.type === 'LEGAL') {
    if (!isVerified(account.kyb, now, 1)) {
      blockers.push({
        code: 'COMPANY_NOT_VERIFIED',
        message: 'La sociedad todavía no ha superado la verificación societaria.',
      });
    }
    if (account.beneficialOwnersPendingScreening > 0) {
      blockers.push({
        code: 'BENEFICIAL_OWNERS_PENDING',
        message:
          'Quedan titulares reales pendientes de comprobación. No podemos aceptar la inversión hasta completarla.',
      });
    }
  }

  // --- Clasificación e idoneidad ----------------------------------------
  if (account.classification === 'SOPHISTICATED') {
    if (
      account.classificationValidUntil !== null &&
      account.classificationValidUntil <= now
    ) {
      blockers.push({
        code: 'SOPHISTICATION_EXPIRED',
        message:
          'Tu clasificación como inversor sofisticado ha caducado. Renuévala o completa el test de idoneidad.',
      });
    }
  } else {
    if (input.suitability === null) {
      blockers.push({
        code: 'SUITABILITY_MISSING',
        message: 'Completa el test de idoneidad antes de invertir.',
      });
    } else if (input.suitability.validUntil <= now) {
      blockers.push({
        code: 'SUITABILITY_EXPIRED',
        message: 'Tu test de idoneidad ha caducado. Vuelve a completarlo.',
      });
    } else if (input.suitability.outcome === 'FAILED_WARNING_ACKNOWLEDGED') {
      // No bloquea: la norma prevé que se pueda invertir tras el aviso, pero
      // el aviso tiene que constar.
      warnings.push({
        code: 'SUITABILITY_TEST_FAILED',
        message:
          'El test indica que este producto puede no ser adecuado para ti. Puedes continuar, pero asumes el riesgo de pérdida total.',
        requiresAcknowledgement: true,
      });
    }
  }

  // --- Origen de fondos --------------------------------------------------
  const lifetimeAfter = input.lifetimeCommittedCents + amountCents;
  if (
    lifetimeAfter > config.kycLevel3ThresholdCents &&
    !isVerified(user.kyc, now, 3) &&
    !(account.type === 'LEGAL' && isVerified(account.kyb, now, 3))
  ) {
    blockers.push({
      code: 'SOURCE_OF_FUNDS_REQUIRED',
      message:
        'Superas el umbral a partir del cual necesitamos acreditar el origen de los fondos. Aporta la documentación para continuar.',
    });
  }

  // --- Estado de la ronda ------------------------------------------------
  if (round.status !== 'OPEN') {
    blockers.push({
      code: 'ROUND_NOT_OPEN',
      message: 'Esta ronda de captación no está abierta.',
    });
  }
  if (round.opensAt !== null && now < round.opensAt) {
    blockers.push({
      code: 'ROUND_NOT_STARTED',
      message: 'La captación de este proyecto aún no ha comenzado.',
    });
  }
  if (round.closesAt !== null && now > round.closesAt) {
    blockers.push({
      code: 'ROUND_CLOSED',
      message: 'El plazo de captación de este proyecto ya ha finalizado.',
    });
  }

  // --- Importe -----------------------------------------------------------
  const roundRemaining = round.targetAmountCents - round.committedCents;
  const accountRemaining =
    round.maxTicketPerInvestorCents === null
      ? roundRemaining
      : round.maxTicketPerInvestorCents - input.alreadyCommittedByAccountCents;
  const remainingCapacityCents =
    roundRemaining < accountRemaining ? roundRemaining : accountRemaining;

  if (amountCents <= 0n) {
    blockers.push({
      code: 'AMOUNT_NOT_POSITIVE',
      message: 'El importe debe ser mayor que cero.',
    });
  } else {
    if (amountCents < round.minTicketCents) {
      blockers.push({
        code: 'BELOW_MIN_TICKET',
        message: 'El importe no alcanza la inversión mínima de este proyecto.',
      });
    }
    if (
      round.maxTicketPerInvestorCents !== null &&
      input.alreadyCommittedByAccountCents + amountCents > round.maxTicketPerInvestorCents
    ) {
      blockers.push({
        code: 'ABOVE_MAX_TICKET',
        message: 'Superas el importe máximo que un mismo inversor puede comprometer en este proyecto.',
      });
    }
    if (round.committedCents + amountCents > round.targetAmountCents) {
      blockers.push({
        code: 'EXCEEDS_ROUND_TARGET',
        message: 'El importe supera lo que queda por captar en esta ronda.',
      });
    }
  }

  // --- Aviso por inversión relevante -------------------------------------
  // Se aplica el MAYOR de los dos umbrales: el absoluto y el porcentaje del
  // patrimonio declarado.
  if (account.classification === 'NON_SOPHISTICATED' && amountCents > 0n) {
    const netWorth = input.suitability?.declaredNetWorthCents ?? null;
    const pctThreshold =
      netWorth === null
        ? 0n
        : (netWorth * BigInt(Math.round(config.warningNetWorthPct * 100))) / 10_000n;
    const threshold = max(config.warningThresholdCents, pctThreshold);

    if (amountCents > threshold) {
      warnings.push({
        code: 'RELEVANT_INVESTMENT_WARNING',
        message:
          'Esta inversión supera el umbral que consideramos relevante para tu perfil. Puedes perder la totalidad del capital invertido y no existe garantía de recuperación.',
        requiresAcknowledgement: true,
      });
    }
  }

  return {
    allowed: blockers.length === 0,
    blockers,
    warnings,
    remainingCapacityCents:
      remainingCapacityCents > 0n ? remainingCapacityCents : 0n,
  };
}
