import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  MockKycProvider,
  MockPaymentProvider,
  MockScreeningProvider,
  MockSignatureProvider,
} from './mock.js';
import {
  ProviderConfigurationError,
  type ProviderEnvironment,
  resolveProviders,
} from './registry.js';

function env(overrides: Partial<ProviderEnvironment> = {}): ProviderEnvironment {
  return {
    nodeEnv: 'development',
    kycProvider: undefined,
    screeningProvider: undefined,
    signatureProvider: undefined,
    paymentProvider: undefined,
    storageProvider: undefined,
    emailProvider: undefined,
    allowMockKycInProduction: undefined,
    ...overrides,
  };
}

describe('el simulador de identidad nunca aprueba', () => {
  it('deja siempre el expediente en revisión humana', async () => {
    // Es la garantía central de todo este paquete. Si algún día este test se
    // pone en rojo, el entorno de pruebas se ha convertido en una vía para
    // saltarse la verificación de identidad.
    const provider = new MockKycProvider();

    for (const subject of ['INDIVIDUAL', 'COMPANY'] as const) {
      const session = await provider.startVerification({
        subject,
        externalReference: 'ref-1',
        locale: 'es-ES',
      });
      const result = await provider.getResult(session.providerReference);
      assert.equal(result.outcome, 'NEEDS_HUMAN_REVIEW');
      assert.notEqual(result.outcome, 'CHECKS_PASSED');
    }
  });

  it('tampoco aprueba una referencia que no conoce', async () => {
    const result = await new MockKycProvider().getResult('inventada');
    assert.equal(result.outcome, 'NEEDS_HUMAN_REVIEW');
  });

  it('deja claro en los motivos que no se ha verificado nada', async () => {
    const provider = new MockKycProvider();
    const session = await provider.startVerification({
      subject: 'INDIVIDUAL',
      externalReference: 'ref-2',
      locale: 'es-ES',
    });
    const result = await provider.getResult(session.providerReference);
    assert.ok(result.reasons.some((r) => /simulada|revisión manual/i.test(r)));
  });
});

describe('los adaptadores simulados se identifican como tales', () => {
  it('marcan isMock y se llaman mock', () => {
    // `provider` se graba en la base de datos y no se borra: es lo que permite
    // responder a «¿qué expedientes se resolvieron sin proveedor real?».
    const adaptadores = [
      new MockKycProvider(),
      new MockScreeningProvider(),
      new MockSignatureProvider(),
      new MockPaymentProvider(),
    ];
    for (const adaptador of adaptadores) {
      assert.equal(adaptador.isMock, true);
      assert.equal(adaptador.name, 'mock');
    }
  });

  it('no fingen haber verificado la firma de un webhook', () => {
    const provider = new MockKycProvider();
    const webhook = provider.verifyWebhook('{"a":1}', 'evt-123');
    assert.equal(webhook.signatureVerified, false);
  });
});

describe('cribado simulado', () => {
  it('devuelve una coincidencia para que la cola de disposición se ejercite', async () => {
    const result = await new MockScreeningProvider().screen({
      fullName: 'Nombre de Prueba',
      entityType: 'INDIVIDUAL',
    });
    assert.equal(result.hits.length, 1);
    assert.match(result.hits[0]!.listSource, /SIMULADO/);
  });
});

describe('firma simulada', () => {
  it('avisa en el acta de que no tiene valor probatorio', async () => {
    const provider = new MockSignatureProvider();
    const envelope = await provider.createEnvelope({
      externalReference: 'inv-1',
      documentBytes: new Uint8Array([1, 2, 3]),
      documentName: 'contrato.pdf',
      signer: { fullName: 'Persona Prueba', email: 'prueba@ejemplo.test' },
      locale: 'es-ES',
    });
    const outcome = await provider.getOutcome(envelope.providerEnvelopeId);

    assert.equal(outcome.status, 'SIGNED');
    assert.ok(outcome.evidencePackage);
    const acta = Buffer.from(outcome.evidencePackage).toString('utf8');
    assert.match(acta, /no tiene valor probatorio/i);
  });

  it('no inventa una firma para un sobre que no existe', async () => {
    const outcome = await new MockSignatureProvider().getOutcome('inexistente');
    assert.equal(outcome.status, 'ERROR');
    assert.equal(outcome.signedDocument, null);
  });
});

describe('cobros simulados', () => {
  it('respeta la idempotencia: no cobra dos veces al reintentar', async () => {
    const provider = new MockPaymentProvider();
    const input = {
      externalReference: 'INV-2026-0001',
      amountCents: 100_000n,
      currency: 'EUR',
      method: 'CARD' as const,
      idempotencyKey: 'clave-unica',
      description: 'Inversión UMAIA',
    };
    const primero = await provider.createIntent(input);
    const reintento = await provider.createIntent(input);
    assert.equal(primero.providerReference, reintento.providerReference);
  });

  it('da instrucciones de transferencia marcadas como simuladas', async () => {
    const intent = await new MockPaymentProvider().createIntent({
      externalReference: 'INV-2026-0002',
      amountCents: 500_000n,
      currency: 'EUR',
      method: 'SEPA_CREDIT_TRANSFER',
      idempotencyKey: 'otra-clave',
      description: 'Inversión UMAIA',
    });
    assert.ok(intent.transferInstructions);
    assert.match(intent.transferInstructions.holder, /SIMULADA/);
    assert.equal(intent.transferInstructions.concept, 'INV-2026-0002');
  });
});

describe('salvaguarda de producción', () => {
  it('se niega a arrancar en producción con identidad simulada', () => {
    assert.throws(
      () => resolveProviders(env({ nodeEnv: 'production', kycProvider: 'mock' })),
      ProviderConfigurationError,
    );
  });

  it('el mensaje explica por qué, no solo que falla', () => {
    try {
      resolveProviders(env({ nodeEnv: 'production' }));
      assert.fail('debería haber fallado');
    } catch (error) {
      assert.match((error as Error).message, /prevención del blanqueo/i);
    }
  });

  it('con la excusa explícita arranca, pero deja un aviso crítico', () => {
    const { warnings } = resolveProviders(
      env({
        nodeEnv: 'production',
        kycProvider: 'mock',
        allowMockKycInProduction: 'true',
      }),
    );
    const critico = warnings.find((w) => w.severity === 'CRITICAL');
    assert.ok(critico, 'debería avisar de forma crítica en el panel');
    assert.match(critico.message, /No debe captarse inversión real/i);
  });

  it('en desarrollo arranca con todo simulado', () => {
    const { providers, warnings } = resolveProviders(env());
    assert.equal(providers.kyc.isMock, true);
    assert.ok(warnings.every((w) => w.severity === 'INFO'));
  });

  it('avisa de cada proveedor simulado para que el panel diga la verdad', () => {
    const { warnings } = resolveProviders(env());
    // Seis áreas: identidad, cribado, firma, pagos, almacenamiento y correo.
    assert.equal(warnings.length, 6);
  });

  it('falla claro ante un proveedor que aún no tiene adaptador', () => {
    assert.throws(
      () => resolveProviders(env({ kycProvider: 'sumsub' })),
      /no implementado/i,
    );
  });
});
