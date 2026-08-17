/**
 * Máquina de estados de una inversión.
 *
 * Es la pieza que decide qué puede pasarle a un compromiso de inversión y
 * cuándo. Está aquí, en lógica pura, y no repartida por controladores HTTP,
 * porque es lo que hay que poder enseñarle a un auditor sin abrir el navegador.
 *
 * Dos decisiones que conviene tener presentes:
 *
 *   1. El periodo de reflexión ocurre ANTES del pago. El inversor firma, se
 *      abre la ventana de revocación, y solo cuando expira se le pide el
 *      dinero. Es más protector que cobrar y devolver, y elimina toda una
 *      familia de estados intermedios en los que hay dinero de alguien que
 *      todavía puede echarse atrás.
 *
 *      Si en el futuro se quiere cobrar durante la reflexión (lo hacen otras
 *      plataformas), la transición que hay que abrir es COOLING_OFF →
 *      FUNDS_RECEIVED, y hay que añadir la de FUNDS_RECEIVED → WITHDRAWN.
 *      Está anotado en la tabla de abajo.
 *
 *   2. CONFIRMED solo lo produce el cierre de ronda, que comprueba el mínimo.
 *      Ninguna acción del inversor lleva a CONFIRMED directamente.
 */

export type InvestmentStatus =
  | 'DRAFT'
  | 'PENDING_KIIS'
  | 'PENDING_SIGNATURE'
  | 'COOLING_OFF'
  | 'PENDING_PAYMENT'
  | 'FUNDS_RECEIVED'
  | 'CONFIRMED'
  | 'WITHDRAWN'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'REFUNDED';

export type InvestmentEvent =
  | 'ELIGIBILITY_PASSED'
  | 'KIIS_ACKNOWLEDGED'
  | 'CONTRACT_SIGNED'
  | 'COOLING_OFF_ELAPSED'
  | 'INVESTOR_WITHDREW'
  | 'PAYMENT_RECEIVED'
  | 'ROUND_CLOSED_SUCCESSFULLY'
  | 'ROUND_FAILED'
  | 'REFUND_COMPLETED'
  | 'RESERVATION_EXPIRED'
  | 'CANCELLED_BY_PLATFORM';

interface Transition {
  from: InvestmentStatus;
  event: InvestmentEvent;
  to: InvestmentStatus;
}

const TRANSITIONS: readonly Transition[] = [
  { from: 'DRAFT', event: 'ELIGIBILITY_PASSED', to: 'PENDING_KIIS' },

  // La ficha de datos fundamentales se presenta y se confirma su lectura
  // ANTES de que exista contrato que firmar.
  { from: 'PENDING_KIIS', event: 'KIIS_ACKNOWLEDGED', to: 'PENDING_SIGNATURE' },

  { from: 'PENDING_SIGNATURE', event: 'CONTRACT_SIGNED', to: 'COOLING_OFF' },

  // Ventana de revocación: sin motivo y sin penalización.
  { from: 'COOLING_OFF', event: 'INVESTOR_WITHDREW', to: 'WITHDRAWN' },
  { from: 'COOLING_OFF', event: 'COOLING_OFF_ELAPSED', to: 'PENDING_PAYMENT' },

  { from: 'PENDING_PAYMENT', event: 'PAYMENT_RECEIVED', to: 'FUNDS_RECEIVED' },

  // Solo el cierre de ronda confirma.
  { from: 'FUNDS_RECEIVED', event: 'ROUND_CLOSED_SUCCESSFULLY', to: 'CONFIRMED' },
  { from: 'FUNDS_RECEIVED', event: 'ROUND_FAILED', to: 'REFUNDED' },

  // Revocada con el dinero ya en la cuenta de garantía: primero WITHDRAWN,
  // y REFUNDED cuando la devolución se completa de verdad.
  { from: 'WITHDRAWN', event: 'REFUND_COMPLETED', to: 'REFUNDED' },

  // Caducidad de la reserva mientras el inversor no avanza.
  { from: 'DRAFT', event: 'RESERVATION_EXPIRED', to: 'EXPIRED' },
  { from: 'PENDING_KIIS', event: 'RESERVATION_EXPIRED', to: 'EXPIRED' },
  { from: 'PENDING_SIGNATURE', event: 'RESERVATION_EXPIRED', to: 'EXPIRED' },
  { from: 'PENDING_PAYMENT', event: 'RESERVATION_EXPIRED', to: 'EXPIRED' },

  // Cancelación por la plataforma (impago, incumplimiento sobrevenido).
  { from: 'DRAFT', event: 'CANCELLED_BY_PLATFORM', to: 'CANCELLED' },
  { from: 'PENDING_KIIS', event: 'CANCELLED_BY_PLATFORM', to: 'CANCELLED' },
  { from: 'PENDING_SIGNATURE', event: 'CANCELLED_BY_PLATFORM', to: 'CANCELLED' },
  { from: 'COOLING_OFF', event: 'CANCELLED_BY_PLATFORM', to: 'CANCELLED' },
  { from: 'PENDING_PAYMENT', event: 'CANCELLED_BY_PLATFORM', to: 'CANCELLED' },
];

export const TERMINAL_STATUSES: ReadonlySet<InvestmentStatus> = new Set([
  'CONFIRMED',
  'CANCELLED',
  'EXPIRED',
  'REFUNDED',
]);

/**
 * Estados en los que el compromiso ocupa cupo de la ronda.
 * Debe coincidir con el filtro de la vista `funding_round_progress`.
 */
export const LIVE_STATUSES: ReadonlySet<InvestmentStatus> = new Set([
  'PENDING_KIIS',
  'PENDING_SIGNATURE',
  'COOLING_OFF',
  'PENDING_PAYMENT',
  'FUNDS_RECEIVED',
  'CONFIRMED',
]);

export class InvalidTransitionError extends Error {
  constructor(
    readonly from: InvestmentStatus,
    readonly event: InvestmentEvent,
  ) {
    super(`Transición no permitida: ${event} desde ${from}`);
    this.name = 'InvalidTransitionError';
  }
}

/** Estado resultante, o `null` si el evento no aplica en ese estado. */
export function nextStatus(
  from: InvestmentStatus,
  event: InvestmentEvent,
): InvestmentStatus | null {
  const match = TRANSITIONS.find((t) => t.from === from && t.event === event);
  return match?.to ?? null;
}

/** Igual que `nextStatus`, pero falla en vez de devolver `null`. */
export function applyEvent(
  from: InvestmentStatus,
  event: InvestmentEvent,
): InvestmentStatus {
  const to = nextStatus(from, event);
  if (to === null) throw new InvalidTransitionError(from, event);
  return to;
}

export function allowedEvents(from: InvestmentStatus): InvestmentEvent[] {
  return TRANSITIONS.filter((t) => t.from === from).map((t) => t.event);
}

export function isTerminal(status: InvestmentStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

export function occupiesRoundCapacity(status: InvestmentStatus): boolean {
  return LIVE_STATUSES.has(status);
}

/**
 * Fin del periodo de reflexión.
 *
 * Se cuenta en días NATURALES desde la firma, no laborables, y se lleva al
 * final del día para no penalizar a quien firmó a las 23:50. Ante la duda, el
 * plazo se resuelve a favor del inversor.
 */
export function coolingOffEndsAt(signedAt: Date, days: number): Date {
  if (!Number.isInteger(days) || days < 0) {
    throw new RangeError(`Días de reflexión no válidos: ${days}`);
  }
  const end = new Date(signedAt.getTime());
  end.setUTCDate(end.getUTCDate() + days);
  end.setUTCHours(23, 59, 59, 999);
  return end;
}

/** ¿Sigue el inversor dentro de la ventana de revocación? */
export function canWithdraw(
  status: InvestmentStatus,
  coolingOffEnd: Date | null,
  now: Date,
): boolean {
  if (status !== 'COOLING_OFF') return false;
  if (coolingOffEnd === null) return true;
  return now <= coolingOffEnd;
}
