/**
 * Adaptadores simulados.
 *
 * Sirven para desarrollar el flujo completo sin proveedor contratado. Simulan
 * la MECÁNICA del proveedor —sesión, redirección, callback, estados— pero
 * nunca su CRITERIO.
 *
 * Dos invariantes que no se negocian, y que están cubiertas por tests:
 *
 *   1. El adaptador de identidad **jamás devuelve una comprobación superada**.
 *      Siempre deja el expediente en NEEDS_HUMAN_REVIEW, de modo que aprobar
 *      exige que un revisor entre en el panel y lo apruebe con su nombre. Un
 *      mock que aprobase solo convertiría el entorno de pruebas en una puerta
 *      trasera para saltarse la verificación de identidad.
 *
 *   2. `isMock` es `true` y el nombre del proveedor empieza por `mock`. Ese
 *      valor se graba en `kyc_check.provider` y no se borra, así que siempre se
 *      puede responder a «¿qué expedientes se resolvieron sin proveedor real?».
 */

import { createHash, randomUUID } from 'node:crypto';

import type {
  EmailMessage,
  EmailProvider,
  KycProvider,
  PaymentIntent,
  PaymentIntentInput,
  PaymentProvider,
  RefundInput,
  RefundOutcome,
  ScreeningProvider,
  ScreeningQuery,
  ScreeningResult,
  SignatureEnvelope,
  SignatureOutcome,
  SignatureProvider,
  SignatureRequestInput,
  StartVerificationInput,
  StorageProvider,
  StoredObject,
  VerificationResult,
  VerificationSession,
  VerifiedWebhook,
} from './ports.js';

const HORA = 60 * 60 * 1000;

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

// -----------------------------------------------------------------------------
// Identidad
// -----------------------------------------------------------------------------

export class MockKycProvider implements KycProvider {
  readonly name = 'mock';
  readonly isMock = true;

  private readonly sessions = new Map<string, StartVerificationInput>();

  async startVerification(input: StartVerificationInput): Promise<VerificationSession> {
    const providerReference = `mock-kyc-${randomUUID()}`;
    this.sessions.set(providerReference, input);
    return {
      providerReference,
      hostedUrl: `/desarrollo/kyc-simulado/${providerReference}`,
      expiresAt: new Date(Date.now() + 24 * HORA),
    };
  }

  /**
   * SIEMPRE devuelve NEEDS_HUMAN_REVIEW.
   *
   * No es una limitación por implementar: es el comportamiento correcto. El
   * simulador no puede leer un DNI ni comprobar que la cara de la foto es la
   * del titular, así que no tiene nada que afirmar. Deja el expediente donde
   * debe estar: en la cola de un revisor.
   */
  async getResult(providerReference: string): Promise<VerificationResult> {
    const session = this.sessions.get(providerReference);
    return {
      providerReference,
      outcome: 'NEEDS_HUMAN_REVIEW',
      reasons: [
        'Verificación simulada: no se ha comprobado ningún documento real.',
        'Requiere revisión manual antes de aprobar el expediente.',
        session === undefined
          ? 'Sesión desconocida para el simulador.'
          : `Sujeto declarado: ${session.subject}.`,
      ],
      rawPayload: {
        provider: 'mock',
        note: 'Sin proveedor de identidad contratado. Este expediente NO ha sido verificado.',
        providerReference,
      },
      completedAt: new Date(),
    };
  }

  verifyWebhook(rawBody: string, signature: string): VerifiedWebhook {
    // El simulador no firma nada, y lo dice: `signatureVerified` es false, de
    // modo que el código que procese webhooks trate el caso real desde el día
    // uno en lugar de descubrirlo al integrar el proveedor de verdad.
    return {
      eventId: signature || `mock-evt-${sha256(Buffer.from(rawBody)).slice(0, 16)}`,
      eventType: 'verification.updated',
      payload: JSON.parse(rawBody) as unknown,
      signatureVerified: false,
    };
  }
}

// -----------------------------------------------------------------------------
// Cribado
// -----------------------------------------------------------------------------

export class MockScreeningProvider implements ScreeningProvider {
  readonly name = 'mock';
  readonly isMock = true;

  /**
   * Devuelve siempre una coincidencia a disponer.
   *
   * Un simulador que no devolviera nada dejaría la cola de disposición vacía y
   * el flujo de coincidencias sin ejercitar, que es justo el que hay que tener
   * probado antes de conectar el proveedor real.
   */
  async screen(query: ScreeningQuery): Promise<ScreeningResult> {
    return {
      providerReference: `mock-scr-${randomUUID()}`,
      hits: [
        {
          matchType: 'PEP',
          matchedName: query.fullName,
          listSource: 'SIMULADO — sin fuente real',
          score: 0.5,
          raw: {
            provider: 'mock',
            note: 'Coincidencia ficticia. Requiere disposición manual.',
          },
        },
      ],
      screenedAt: new Date(),
      rawPayload: { provider: 'mock', query: { ...query, birthDate: undefined } },
    };
  }
}

// -----------------------------------------------------------------------------
// Firma
// -----------------------------------------------------------------------------

export class MockSignatureProvider implements SignatureProvider {
  readonly name = 'mock';
  readonly isMock = true;

  private readonly envelopes = new Map<string, SignatureRequestInput>();

  async createEnvelope(input: SignatureRequestInput): Promise<SignatureEnvelope> {
    const providerEnvelopeId = `mock-sig-${randomUUID()}`;
    this.envelopes.set(providerEnvelopeId, input);
    return {
      providerEnvelopeId,
      signingUrl: `/desarrollo/firma-simulada/${providerEnvelopeId}`,
      expiresAt: new Date(Date.now() + 72 * HORA),
    };
  }

  async getOutcome(providerEnvelopeId: string): Promise<SignatureOutcome> {
    const envelope = this.envelopes.get(providerEnvelopeId);
    if (envelope === undefined) {
      return {
        providerEnvelopeId,
        status: 'ERROR',
        signedDocument: null,
        evidencePackage: null,
        signerIp: null,
        signedAt: null,
      };
    }

    // El simulador sí completa la firma —hace falta para poder recorrer el
    // flujo de inversión de principio a fin—, pero el acta de evidencias dice
    // en texto claro que no tiene valor probatorio.
    const evidence = Buffer.from(
      JSON.stringify(
        {
          provider: 'mock',
          aviso:
            'FIRMA SIMULADA. Este documento no tiene valor probatorio alguno. ' +
            'No debe utilizarse fuera del entorno de desarrollo.',
          documento: envelope.documentName,
          firmante: envelope.signer.email,
          sha256Documento: sha256(envelope.documentBytes),
        },
        null,
        2,
      ),
    );

    return {
      providerEnvelopeId,
      status: 'SIGNED',
      signedDocument: envelope.documentBytes,
      evidencePackage: new Uint8Array(evidence),
      signerIp: '127.0.0.1',
      signedAt: new Date(),
    };
  }

  verifyWebhook(rawBody: string, signature: string): VerifiedWebhook {
    return {
      eventId: signature || `mock-sig-evt-${sha256(Buffer.from(rawBody)).slice(0, 16)}`,
      eventType: 'signature.completed',
      payload: JSON.parse(rawBody) as unknown,
      signatureVerified: false,
    };
  }
}

// -----------------------------------------------------------------------------
// Cobros
// -----------------------------------------------------------------------------

export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock';
  readonly isMock = true;

  private readonly intents = new Map<string, PaymentIntent>();
  /** Reproduce la idempotencia del proveedor real. */
  private readonly byIdempotencyKey = new Map<string, string>();

  async createIntent(input: PaymentIntentInput): Promise<PaymentIntent> {
    const existing = this.byIdempotencyKey.get(input.idempotencyKey);
    if (existing !== undefined) {
      const intent = this.intents.get(existing);
      if (intent !== undefined) return intent;
    }

    const providerReference = `mock-pay-${randomUUID()}`;
    const intent: PaymentIntent =
      input.method === 'SEPA_CREDIT_TRANSFER'
        ? {
            providerReference,
            status: 'PENDING',
            checkoutUrl: null,
            transferInstructions: {
              iban: 'ES00 0000 0000 0000 0000 0000',
              holder: 'CUENTA SIMULADA — no realizar transferencias reales',
              concept: input.externalReference,
            },
          }
        : {
            providerReference,
            status: 'PENDING',
            checkoutUrl: `/desarrollo/pago-simulado/${providerReference}`,
            transferInstructions: null,
          };

    this.intents.set(providerReference, intent);
    this.byIdempotencyKey.set(input.idempotencyKey, providerReference);
    return intent;
  }

  async getIntent(providerReference: string): Promise<PaymentIntent> {
    const intent = this.intents.get(providerReference);
    if (intent === undefined) {
      return {
        providerReference,
        status: 'FAILED',
        checkoutUrl: null,
        transferInstructions: null,
      };
    }
    return intent;
  }

  /** Solo para desarrollo: marca un cobro simulado como recibido. */
  markSucceeded(providerReference: string): void {
    const intent = this.intents.get(providerReference);
    if (intent !== undefined) {
      this.intents.set(providerReference, { ...intent, status: 'SUCCEEDED' });
    }
  }

  async refund(input: RefundInput): Promise<RefundOutcome> {
    return {
      providerReference: `mock-ref-${sha256(Buffer.from(input.idempotencyKey)).slice(0, 16)}`,
      status: 'COMPLETED',
    };
  }

  verifyWebhook(rawBody: string, signature: string): VerifiedWebhook {
    return {
      eventId: signature || `mock-pay-evt-${sha256(Buffer.from(rawBody)).slice(0, 16)}`,
      eventType: 'payment.updated',
      payload: JSON.parse(rawBody) as unknown,
      signatureVerified: false,
    };
  }
}

// -----------------------------------------------------------------------------
// Almacenamiento y correo
// -----------------------------------------------------------------------------

/** Almacenamiento en memoria. En desarrollo real se usa MinIO. */
export class MockStorageProvider implements StorageProvider {
  readonly name = 'mock';
  readonly isMock = true;

  private readonly objects = new Map<string, { bytes: Uint8Array; contentType: string }>();

  async put(key: string, bytes: Uint8Array, contentType: string): Promise<StoredObject> {
    this.objects.set(key, { bytes, contentType });
    return { storageKey: key, contentSha256: sha256(bytes), sizeBytes: bytes.byteLength };
  }

  async get(key: string): Promise<Uint8Array> {
    const object = this.objects.get(key);
    if (object === undefined) throw new Error(`Objeto no encontrado: ${key}`);
    return object.bytes;
  }

  async signedUrl(key: string, ttlSeconds: number): Promise<string> {
    const expires = Date.now() + ttlSeconds * 1000;
    return `/desarrollo/documentos/${encodeURIComponent(key)}?expira=${expires}`;
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }
}

/** Correo a memoria. En desarrollo real se usa Mailpit. */
export class MockEmailProvider implements EmailProvider {
  readonly name = 'mock';
  readonly isMock = true;

  readonly sent: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<{ providerMessageId: string }> {
    this.sent.push(message);
    return { providerMessageId: `mock-mail-${randomUUID()}` };
  }
}
