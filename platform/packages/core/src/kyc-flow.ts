/**
 * Estados del expediente de verificación.
 *
 * Regla que atraviesa todo este fichero: **ninguna transición a APPROVED puede
 * originarse en un proveedor**. Un proveedor aporta el resultado de una
 * comprobación; quien aprueba un expediente es siempre un revisor humano o una
 * política explícita de la plataforma. Es lo que hace que el sistema siga
 * siendo defendible el día que un proveedor se equivoque.
 */

export type KycStatus =
  | 'NOT_STARTED'
  | 'PENDING_DOCUMENTS'
  | 'IN_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'SUSPENDED';

export type KycEvent =
  | 'DOCUMENTS_REQUESTED'
  | 'DOCUMENTS_SUBMITTED'
  | 'REVIEWER_APPROVED'
  | 'REVIEWER_REJECTED'
  | 'REVIEWER_REQUESTED_MORE'
  | 'VERIFICATION_EXPIRED'
  | 'COMPLIANCE_SUSPENDED'
  | 'COMPLIANCE_REINSTATED'
  | 'RENEWAL_STARTED';

/** Quién puede provocar cada evento. */
export type KycActor = 'INVESTOR' | 'REVIEWER' | 'SYSTEM';

interface KycTransition {
  from: KycStatus;
  event: KycEvent;
  to: KycStatus;
  actor: KycActor;
}

const TRANSITIONS: readonly KycTransition[] = [
  { from: 'NOT_STARTED', event: 'DOCUMENTS_REQUESTED', to: 'PENDING_DOCUMENTS', actor: 'SYSTEM' },
  { from: 'PENDING_DOCUMENTS', event: 'DOCUMENTS_SUBMITTED', to: 'IN_REVIEW', actor: 'INVESTOR' },

  // Solo un revisor humano aprueba o rechaza. Ni el proveedor, ni el sistema.
  { from: 'IN_REVIEW', event: 'REVIEWER_APPROVED', to: 'APPROVED', actor: 'REVIEWER' },
  { from: 'IN_REVIEW', event: 'REVIEWER_REJECTED', to: 'REJECTED', actor: 'REVIEWER' },
  { from: 'IN_REVIEW', event: 'REVIEWER_REQUESTED_MORE', to: 'PENDING_DOCUMENTS', actor: 'REVIEWER' },

  { from: 'APPROVED', event: 'VERIFICATION_EXPIRED', to: 'EXPIRED', actor: 'SYSTEM' },
  { from: 'EXPIRED', event: 'RENEWAL_STARTED', to: 'PENDING_DOCUMENTS', actor: 'INVESTOR' },
  { from: 'REJECTED', event: 'RENEWAL_STARTED', to: 'PENDING_DOCUMENTS', actor: 'INVESTOR' },

  // Suspensión cautelar de cumplimiento, p. ej. tras una coincidencia de
  // sanciones que resulta ser verdadera.
  { from: 'APPROVED', event: 'COMPLIANCE_SUSPENDED', to: 'SUSPENDED', actor: 'REVIEWER' },
  { from: 'IN_REVIEW', event: 'COMPLIANCE_SUSPENDED', to: 'SUSPENDED', actor: 'REVIEWER' },
  { from: 'SUSPENDED', event: 'COMPLIANCE_REINSTATED', to: 'IN_REVIEW', actor: 'REVIEWER' },
];

export class InvalidKycTransitionError extends Error {
  constructor(from: KycStatus, event: KycEvent) {
    super(`Transición de KYC no permitida: ${event} desde ${from}`);
    this.name = 'InvalidKycTransitionError';
  }
}

export class UnauthorisedKycActorError extends Error {
  constructor(event: KycEvent, actor: KycActor, required: KycActor) {
    super(
      `El evento ${event} solo puede provocarlo ${required}; se recibió ${actor}. ` +
        'Ningún proveedor externo puede aprobar un expediente por su cuenta.',
    );
    this.name = 'UnauthorisedKycActorError';
  }
}

export function nextKycStatus(from: KycStatus, event: KycEvent): KycStatus | null {
  return TRANSITIONS.find((t) => t.from === from && t.event === event)?.to ?? null;
}

/**
 * Aplica un evento comprobando también QUIÉN lo provoca. La comprobación de
 * actor es la que impide que un webhook de proveedor apruebe un expediente.
 */
export function applyKycEvent(
  from: KycStatus,
  event: KycEvent,
  actor: KycActor,
): KycStatus {
  const transition = TRANSITIONS.find((t) => t.from === from && t.event === event);
  if (transition === undefined) throw new InvalidKycTransitionError(from, event);
  if (transition.actor !== actor) {
    throw new UnauthorisedKycActorError(event, actor, transition.actor);
  }
  return transition.to;
}

export function allowedKycEvents(from: KycStatus): KycEvent[] {
  return TRANSITIONS.filter((t) => t.from === from).map((t) => t.event);
}

/** Nivel de verificación exigible según el importe acumulado. */
export function requiredKycLevel(
  lifetimeCommittedCents: bigint,
  sourceOfFundsThresholdCents: bigint,
  hasCompletedSuitability: boolean,
): 1 | 2 | 3 {
  if (lifetimeCommittedCents > sourceOfFundsThresholdCents) return 3;
  return hasCompletedSuitability ? 2 : 1;
}

/** Fecha de caducidad de una verificación aprobada. */
export function verificationExpiresAt(approvedAt: Date, validityMonths: number): Date {
  const expiry = new Date(approvedAt.getTime());
  expiry.setUTCMonth(expiry.getUTCMonth() + validityMonths);
  return expiry;
}
