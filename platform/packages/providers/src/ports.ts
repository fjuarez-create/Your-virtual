/**
 * Puertos de los proveedores externos.
 *
 * Cada integración con el mundo exterior pasa por una de estas interfaces.
 * Enchufar el proveedor real es escribir un adaptador y cambiar una variable
 * de entorno; no se toca ni el flujo de inversión ni el de verificación.
 *
 * Tres reglas atraviesan todos los puertos:
 *
 *   1. **Ningún proveedor decide.** Devuelven hechos («el documento parece
 *      auténtico», «hay 3 coincidencias en listas de sanciones»), no veredictos
 *      sobre el expediente. Aprobar o rechazar es competencia de un revisor.
 *
 *   2. **La respuesta cruda se conserva.** Se guarda tal cual llega, cifrada.
 *      El día que haya que justificar una decisión ante la CNMV, la prueba es
 *      lo que dijo el proveedor, no nuestro resumen.
 *
 *   3. **Los webhooks se verifican y se persisten antes de procesarse.** Un
 *      callback no autenticado es una instrucción de un desconocido.
 */

// -----------------------------------------------------------------------------
// Común
// -----------------------------------------------------------------------------

export interface ProviderIdentity {
  /** Se graba en la fila correspondiente y no se borra jamás. */
  readonly name: string;
  /** `true` en los adaptadores simulados. Se muestra en el panel admin. */
  readonly isMock: boolean;
}

export interface VerifiedWebhook<TPayload = unknown> {
  /** Identificador del proveedor: da idempotencia ante reenvíos. */
  eventId: string;
  eventType: string;
  payload: TPayload;
  signatureVerified: boolean;
}

export class WebhookVerificationError extends Error {
  constructor(provider: string, reason: string) {
    super(`Webhook de ${provider} rechazado: ${reason}`);
    this.name = 'WebhookVerificationError';
  }
}

// -----------------------------------------------------------------------------
// Verificación de identidad (KYC) y de sociedades (KYB)
// -----------------------------------------------------------------------------

export type VerificationSubject = 'INDIVIDUAL' | 'COMPANY';

export interface StartVerificationInput {
  subject: VerificationSubject;
  /** Referencia interna. Nunca se envía el identificador de base de datos. */
  externalReference: string;
  locale: string;
  redirectUrl?: string;
}

export interface VerificationSession {
  providerReference: string;
  /** URL a la que se envía al usuario para completar la verificación. */
  hostedUrl: string;
  expiresAt: Date;
}

/**
 * Resultado de una comprobación.
 *
 * Nótese lo que NO hay aquí: ningún campo `approved`. El proveedor informa de
 * si sus comprobaciones técnicas pasaron; que el expediente quede aprobado es
 * una decisión posterior y humana.
 */
export interface VerificationResult {
  providerReference: string;
  /** Estado técnico de la comprobación en el proveedor. */
  outcome: 'PENDING' | 'CHECKS_PASSED' | 'CHECKS_FAILED' | 'NEEDS_HUMAN_REVIEW' | 'ERROR';
  /** Motivos legibles que el revisor verá junto al expediente. */
  reasons: string[];
  /** Respuesta íntegra del proveedor. Se archiva cifrada, sin interpretar. */
  rawPayload: unknown;
  completedAt: Date | null;
}

export interface KycProvider extends ProviderIdentity {
  startVerification(input: StartVerificationInput): Promise<VerificationSession>;
  getResult(providerReference: string): Promise<VerificationResult>;
  verifyWebhook(rawBody: string, signature: string): VerifiedWebhook;
}

// -----------------------------------------------------------------------------
// Cribado de PEP, sanciones y medios adversos
// -----------------------------------------------------------------------------

export interface ScreeningQuery {
  fullName: string;
  birthDate?: Date | undefined;
  nationality?: string | undefined;
  /** Para el cribado de sociedades. */
  entityType: 'INDIVIDUAL' | 'COMPANY';
}

export interface ScreeningHit {
  matchType: 'PEP' | 'SANCTION' | 'ADVERSE_MEDIA' | 'RCA';
  matchedName: string;
  listSource: string;
  /**
   * Puntuación TAL COMO la da el proveedor. No se recalcula ni se umbraliza
   * aquí: inventarse un criterio de scoring propio es exactamente lo que no
   * debe hacer una plataforma que no es una agencia de cribado.
   */
  score: number;
  raw: unknown;
}

export interface ScreeningResult {
  providerReference: string;
  hits: ScreeningHit[];
  screenedAt: Date;
  rawPayload: unknown;
}

export interface ScreeningProvider extends ProviderIdentity {
  screen(query: ScreeningQuery): Promise<ScreeningResult>;
}

// -----------------------------------------------------------------------------
// Firma electrónica
// -----------------------------------------------------------------------------

export interface SignatureRequestInput {
  externalReference: string;
  documentBytes: Uint8Array;
  documentName: string;
  signer: { fullName: string; email: string };
  locale: string;
}

export interface SignatureEnvelope {
  providerEnvelopeId: string;
  /** URL de firma para el inversor. */
  signingUrl: string;
  expiresAt: Date;
}

export interface SignatureOutcome {
  providerEnvelopeId: string;
  status: 'CREATED' | 'SENT' | 'SIGNED' | 'DECLINED' | 'EXPIRED' | 'ERROR';
  signedDocument: Uint8Array | null;
  /**
   * Acta de evidencias del proveedor. Es la pieza que sostiene la firma ante un
   * tribunal; sin ella, la firma es un botón que alguien pulsó.
   */
  evidencePackage: Uint8Array | null;
  signerIp: string | null;
  signedAt: Date | null;
}

export interface SignatureProvider extends ProviderIdentity {
  createEnvelope(input: SignatureRequestInput): Promise<SignatureEnvelope>;
  getOutcome(providerEnvelopeId: string): Promise<SignatureOutcome>;
  verifyWebhook(rawBody: string, signature: string): VerifiedWebhook;
}

// -----------------------------------------------------------------------------
// Cobros
// -----------------------------------------------------------------------------

export interface PaymentIntentInput {
  externalReference: string;
  amountCents: bigint;
  currency: string;
  method: 'CARD' | 'SEPA_CREDIT_TRANSFER' | 'SEPA_DIRECT_DEBIT';
  /** Obligatoria: impide el cobro duplicado ante un reintento. */
  idempotencyKey: string;
  description: string;
}

export interface PaymentIntent {
  providerReference: string;
  status: 'INITIATED' | 'PENDING' | 'SUCCEEDED' | 'FAILED';
  /** Para tarjeta: la URL donde el inversor completa el pago. */
  checkoutUrl: string | null;
  /** Para transferencia: las instrucciones que se le muestran. */
  transferInstructions: {
    iban: string;
    holder: string;
    concept: string;
  } | null;
}

export interface RefundInput {
  originalProviderReference: string;
  amountCents: bigint;
  reason: string;
  idempotencyKey: string;
}

export interface RefundOutcome {
  providerReference: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
}

export interface PaymentProvider extends ProviderIdentity {
  createIntent(input: PaymentIntentInput): Promise<PaymentIntent>;
  getIntent(providerReference: string): Promise<PaymentIntent>;
  refund(input: RefundInput): Promise<RefundOutcome>;
  verifyWebhook(rawBody: string, signature: string): VerifiedWebhook;
}

// -----------------------------------------------------------------------------
// Almacenamiento de documentos
// -----------------------------------------------------------------------------

export interface StoredObject {
  storageKey: string;
  contentSha256: string;
  sizeBytes: number;
}

export interface StorageProvider extends ProviderIdentity {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<StoredObject>;
  get(key: string): Promise<Uint8Array>;
  /**
   * URL firmada de vida corta. Nunca se expone un objeto de forma pública:
   * quien llame a esto ya ha comprobado que el solicitante tiene derecho al
   * documento, y la llamada queda en el log de auditoría.
   */
  signedUrl(key: string, ttlSeconds: number): Promise<string>;
  delete(key: string): Promise<void>;
}

// -----------------------------------------------------------------------------
// Correo
// -----------------------------------------------------------------------------

export interface EmailMessage {
  to: string;
  subject: string;
  /** Plantilla y versión: quedan registradas en `communication_log`. */
  template: string;
  templateVersion: string;
  variables: Record<string, string>;
}

export interface EmailProvider extends ProviderIdentity {
  send(message: EmailMessage): Promise<{ providerMessageId: string }>;
}
