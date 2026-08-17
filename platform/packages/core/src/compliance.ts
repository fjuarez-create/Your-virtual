/**
 * Parámetros de cumplimiento.
 *
 * Ninguno de estos valores es una constante del código: todos viven en la tabla
 * `compliance_setting` y se cambian desde el panel de administración, con
 * histórico de quién los cambió y por qué. Lo que hay aquí son los valores POR
 * DEFECTO con los que se siembra la base de datos y los tipos que hacen que
 * usarlos mal no compile.
 *
 * ------------------------------------------------------------------------
 * AVISO: los valores marcados como POR_VALIDAR son la interpretación de un
 * ingeniero leyendo la norma, no asesoramiento jurídico. Tienen que pasar por
 * la asesoría legal antes de que la plataforma capte un solo euro real. Están
 * aquí para que el sistema funcione de extremo a extremo, y son configurables
 * precisamente porque se espera que cambien.
 * ------------------------------------------------------------------------
 */

export type SettingValueType = 'INTEGER' | 'DECIMAL' | 'BOOLEAN' | 'STRING' | 'JSON';

export interface SettingDefinition {
  readonly key: string;
  readonly valueType: SettingValueType;
  readonly defaultValue: string;
  readonly description: string;
  /** `true` = la interfaz no puede desactivarlo. */
  readonly locked: boolean;
  /** Referencia normativa pendiente de validar por la asesoría. */
  readonly pendingLegalReview?: string;
}

export const COMPLIANCE_SETTINGS = {
  KYC_LEVEL1_REQUIRED: {
    key: 'kyc.level1.required',
    valueType: 'BOOLEAN',
    defaultValue: 'true',
    description:
      'Exigir verificación de identidad a todo inversor. No desactivable: es un mínimo legal de prevención del blanqueo en cualquier jurisdicción.',
    locked: true,
  },
  KYC_VALIDITY_MONTHS: {
    key: 'kyc.validity_months',
    valueType: 'INTEGER',
    defaultValue: '24',
    description: 'Meses que sigue siendo válida una verificación de identidad antes de repetirla.',
    locked: false,
    pendingLegalReview: 'Plazo de revisión de diligencia debida — Ley 10/2010',
  },
  KYC_LEVEL3_THRESHOLD_CENTS: {
    key: 'kyc.level3.threshold_cents',
    valueType: 'INTEGER',
    defaultValue: '5000000', // 50.000 €
    description:
      'Importe acumulado por inversor a partir del cual se exige acreditar el origen de los fondos.',
    locked: false,
    pendingLegalReview: 'Umbral de origen de fondos — a fijar por la asesoría',
  },
  COOLING_OFF_DAYS: {
    key: 'investment.cooling_off_days',
    valueType: 'INTEGER',
    defaultValue: '4',
    description:
      'Días naturales de reflexión desde la firma, durante los cuales el inversor puede revocar sin motivo ni penalización.',
    locked: false,
    pendingLegalReview: 'Art. 22 Reglamento (UE) 2020/1503 — 4 días naturales',
  },
  WARNING_THRESHOLD_CENTS: {
    key: 'investment.warning_threshold_cents',
    valueType: 'INTEGER',
    defaultValue: '100000', // 1.000 €
    description:
      'Importe de una inversión individual a partir del cual se muestra el aviso de riesgo reforzado a inversores no sofisticados.',
    locked: false,
    pendingLegalReview: 'Art. 21.7 Reglamento (UE) 2020/1503',
  },
  WARNING_NET_WORTH_PCT: {
    key: 'investment.warning_networth_pct',
    valueType: 'DECIMAL',
    defaultValue: '5.0',
    description:
      'Porcentaje del patrimonio neto declarado que, superado por una inversión individual, dispara el aviso reforzado. Se aplica el mayor de los dos umbrales.',
    locked: false,
    pendingLegalReview: 'Art. 21.7 Reglamento (UE) 2020/1503',
  },
  SUITABILITY_VALIDITY_MONTHS: {
    key: 'suitability.validity_months',
    valueType: 'INTEGER',
    defaultValue: '24',
    description: 'Meses de validez del test de idoneidad antes de tener que repetirlo.',
    locked: false,
    pendingLegalReview: 'Art. 21 Reglamento (UE) 2020/1503',
  },
  SOPHISTICATION_VALIDITY_MONTHS: {
    key: 'sophistication.validity_months',
    valueType: 'INTEGER',
    defaultValue: '24',
    description: 'Meses de validez de la clasificación como inversor sofisticado.',
    locked: false,
    pendingLegalReview: 'Anexo II Reglamento (UE) 2020/1503',
  },
  RESERVATION_TTL_HOURS: {
    key: 'investment.reservation_ttl_hours',
    valueType: 'INTEGER',
    defaultValue: '72',
    description:
      'Horas que se mantiene reservado el cupo de una inversión sin avanzar antes de liberarlo.',
    locked: false,
  },
  AML_RETENTION_YEARS: {
    key: 'privacy.aml_retention_years',
    valueType: 'INTEGER',
    defaultValue: '10',
    description:
      'Años que debe conservarse la documentación de diligencia debida. Durante este plazo una solicitud de supresión se resuelve con pseudonimización, no con borrado.',
    locked: true,
    pendingLegalReview: 'Art. 25 Ley 10/2010',
  },
  FEATURE_PAYMENTS_LIVE: {
    key: 'feature.payments_live',
    valueType: 'BOOLEAN',
    defaultValue: 'false',
    description: 'Pasarela de pago real en lugar del simulador.',
    locked: false,
  },
  FEATURE_KYC_PROVIDER: {
    key: 'feature.kyc_provider',
    valueType: 'STRING',
    defaultValue: 'mock',
    description: 'Proveedor de verificación de identidad activo.',
    locked: false,
  },
  FEATURE_SIGNATURE_PROVIDER: {
    key: 'feature.signature_provider',
    valueType: 'STRING',
    defaultValue: 'mock',
    description: 'Proveedor de firma electrónica activo.',
    locked: false,
  },
} as const satisfies Record<string, SettingDefinition>;

export type ComplianceSettingKey = keyof typeof COMPLIANCE_SETTINGS;

/** Los valores resueltos, ya convertidos a tipos de programa. */
export interface ComplianceConfig {
  kycLevel1Required: boolean;
  kycValidityMonths: number;
  kycLevel3ThresholdCents: bigint;
  coolingOffDays: number;
  warningThresholdCents: bigint;
  warningNetWorthPct: number;
  suitabilityValidityMonths: number;
  sophisticationValidityMonths: number;
  reservationTtlHours: number;
  amlRetentionYears: number;
  paymentsLive: boolean;
  kycProvider: string;
  signatureProvider: string;
}

/** Configuración con todos los valores por defecto. Útil en tests y en el seed. */
export function defaultComplianceConfig(): ComplianceConfig {
  return parseComplianceConfig(
    Object.fromEntries(
      Object.values(COMPLIANCE_SETTINGS).map((s) => [s.key, s.defaultValue]),
    ),
  );
}

/**
 * Convierte los valores crudos de `compliance_setting` a la configuración
 * tipada. Si falta una clave, usa el valor por defecto: preferimos arrancar
 * con el valor conservador conocido a fallar de forma opaca.
 */
export function parseComplianceConfig(
  raw: Readonly<Record<string, string>>,
): ComplianceConfig {
  const get = (definition: SettingDefinition): string =>
    raw[definition.key] ?? definition.defaultValue;

  const asInt = (definition: SettingDefinition): number => {
    const value = Number.parseInt(get(definition), 10);
    if (!Number.isFinite(value)) {
      throw new Error(`Parámetro de cumplimiento no numérico: ${definition.key}`);
    }
    return value;
  };

  const asBigInt = (definition: SettingDefinition): bigint => BigInt(get(definition));

  const asBool = (definition: SettingDefinition): boolean => get(definition) === 'true';

  const s = COMPLIANCE_SETTINGS;

  const config: ComplianceConfig = {
    kycLevel1Required: asBool(s.KYC_LEVEL1_REQUIRED),
    kycValidityMonths: asInt(s.KYC_VALIDITY_MONTHS),
    kycLevel3ThresholdCents: asBigInt(s.KYC_LEVEL3_THRESHOLD_CENTS),
    coolingOffDays: asInt(s.COOLING_OFF_DAYS),
    warningThresholdCents: asBigInt(s.WARNING_THRESHOLD_CENTS),
    warningNetWorthPct: Number.parseFloat(get(s.WARNING_NET_WORTH_PCT)),
    suitabilityValidityMonths: asInt(s.SUITABILITY_VALIDITY_MONTHS),
    sophisticationValidityMonths: asInt(s.SOPHISTICATION_VALIDITY_MONTHS),
    reservationTtlHours: asInt(s.RESERVATION_TTL_HOURS),
    amlRetentionYears: asInt(s.AML_RETENTION_YEARS),
    paymentsLive: asBool(s.FEATURE_PAYMENTS_LIVE),
    kycProvider: get(s.FEATURE_KYC_PROVIDER),
    signatureProvider: get(s.FEATURE_SIGNATURE_PROVIDER),
  };

  // Salvaguarda: por mucho que alguien edite la base de datos, la verificación
  // de identidad no se puede apagar. Es el único parámetro con una regla así.
  if (!config.kycLevel1Required) {
    throw new Error(
      'kyc.level1.required no puede ser false: la verificación de identidad es un mínimo legal no negociable.',
    );
  }

  return config;
}
