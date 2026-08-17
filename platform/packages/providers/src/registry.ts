/**
 * Selección de proveedores según el entorno.
 *
 * Es el único sitio donde se decide qué adaptador se usa. Contiene además la
 * salvaguarda que impide que la plataforma capte dinero real con la
 * verificación de identidad simulada.
 */

import {
  MockEmailProvider,
  MockKycProvider,
  MockPaymentProvider,
  MockScreeningProvider,
  MockSignatureProvider,
  MockStorageProvider,
} from './mock.js';
import type {
  EmailProvider,
  KycProvider,
  PaymentProvider,
  ScreeningProvider,
  SignatureProvider,
  StorageProvider,
} from './ports.js';

export interface ProviderEnvironment {
  nodeEnv: string | undefined;
  kycProvider: string | undefined;
  screeningProvider: string | undefined;
  signatureProvider: string | undefined;
  paymentProvider: string | undefined;
  storageProvider: string | undefined;
  emailProvider: string | undefined;
  allowMockKycInProduction: string | undefined;
}

export interface ProviderSet {
  kyc: KycProvider;
  screening: ScreeningProvider;
  signature: SignatureProvider;
  payments: PaymentProvider;
  storage: StorageProvider;
  email: EmailProvider;
}

export class ProviderConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderConfigurationError';
  }
}

/** Avisos que el panel de administración muestra de forma permanente. */
export interface ProviderWarning {
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  message: string;
}

export interface ResolvedProviders {
  providers: ProviderSet;
  warnings: ProviderWarning[];
}

export function readProviderEnvironment(
  env: Record<string, string | undefined> = process.env,
): ProviderEnvironment {
  return {
    nodeEnv: env['NODE_ENV'],
    kycProvider: env['KYC_PROVIDER'],
    screeningProvider: env['SCREENING_PROVIDER'],
    signatureProvider: env['SIGNATURE_PROVIDER'],
    paymentProvider: env['PAYMENT_PROVIDER'],
    storageProvider: env['STORAGE_PROVIDER'],
    emailProvider: env['EMAIL_PROVIDER'],
    allowMockKycInProduction: env['ALLOW_MOCK_KYC_IN_PRODUCTION'],
  };
}

/**
 * Construye el conjunto de proveedores.
 *
 * En producción con la verificación de identidad simulada, **falla al
 * arrancar**. La única forma de saltárselo es activar de forma explícita
 * `ALLOW_MOCK_KYC_IN_PRODUCTION`, que además deja un aviso crítico permanente
 * en el panel: si alguien lo hace, que sea una decisión consciente y visible,
 * no un descuido que nadie note hasta la inspección.
 */
export function resolveProviders(env: ProviderEnvironment): ResolvedProviders {
  const warnings: ProviderWarning[] = [];
  const isProduction = env.nodeEnv === 'production';

  const kycName = env.kycProvider ?? 'mock';
  const mockKyc = kycName === 'mock';

  if (isProduction && mockKyc) {
    if (env.allowMockKycInProduction !== 'true') {
      throw new ProviderConfigurationError(
        'No se puede arrancar en producción con KYC_PROVIDER=mock. ' +
          'La verificación de identidad es un requisito legal de prevención del blanqueo, ' +
          'no una funcionalidad opcional. Configure un proveedor real antes de captar inversión.',
      );
    }
    warnings.push({
      severity: 'CRITICAL',
      message:
        'La plataforma está en producción con la verificación de identidad SIMULADA ' +
        '(ALLOW_MOCK_KYC_IN_PRODUCTION=true). Ningún inversor está verificado de verdad. ' +
        'No debe captarse inversión real en estas condiciones.',
    });
  }

  const providers: ProviderSet = {
    kyc: buildKyc(kycName),
    screening: buildScreening(env.screeningProvider ?? 'mock'),
    signature: buildSignature(env.signatureProvider ?? 'mock'),
    payments: buildPayments(env.paymentProvider ?? 'mock'),
    storage: buildStorage(env.storageProvider ?? 'mock'),
    email: buildEmail(env.emailProvider ?? 'mock'),
  };

  // Un aviso por cada proveedor simulado, para que el panel diga la verdad
  // sobre en qué estado está la plataforma.
  for (const [area, provider] of Object.entries(providers)) {
    if (provider.isMock && !(area === 'kyc' && isProduction)) {
      warnings.push({
        severity: isProduction ? 'WARNING' : 'INFO',
        message: `El proveedor de ${area} está simulado (${provider.name}).`,
      });
    }
  }

  return { providers, warnings };
}

function unsupported(area: string, name: string): never {
  throw new ProviderConfigurationError(
    `Proveedor de ${area} no implementado: "${name}". ` +
      'Escriba el adaptador en packages/providers/src/ y regístrelo aquí.',
  );
}

function buildKyc(name: string): KycProvider {
  switch (name) {
    case 'mock':
      return new MockKycProvider();
    // Adaptadores pendientes de contratar el proveedor:
    case 'sumsub':
    case 'veriff':
    case 'onfido':
      return unsupported('KYC', name);
    default:
      return unsupported('KYC', name);
  }
}

function buildScreening(name: string): ScreeningProvider {
  if (name === 'mock') return new MockScreeningProvider();
  return unsupported('cribado', name);
}

function buildSignature(name: string): SignatureProvider {
  if (name === 'mock') return new MockSignatureProvider();
  return unsupported('firma electrónica', name);
}

function buildPayments(name: string): PaymentProvider {
  if (name === 'mock') return new MockPaymentProvider();
  return unsupported('pagos', name);
}

function buildStorage(name: string): StorageProvider {
  // `minio` y `s3` comparten adaptador (API compatible); pendiente de escribir.
  if (name === 'mock') return new MockStorageProvider();
  return unsupported('almacenamiento', name);
}

function buildEmail(name: string): EmailProvider {
  if (name === 'mock') return new MockEmailProvider();
  return unsupported('correo', name);
}
