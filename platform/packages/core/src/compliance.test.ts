import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  COMPLIANCE_SETTINGS,
  defaultComplianceConfig,
  parseComplianceConfig,
} from './compliance.js';

describe('valores por defecto', () => {
  it('arranca con una configuración completa sin tocar la base de datos', () => {
    const config = defaultComplianceConfig();
    assert.equal(config.coolingOffDays, 4);
    assert.equal(config.kycLevel3ThresholdCents, 5_000_000n);
    assert.equal(config.warningThresholdCents, 100_000n);
    assert.equal(config.kycProvider, 'mock');
    assert.equal(config.paymentsLive, false);
  });

  it('sale de fábrica con todos los proveedores simulados', () => {
    // Si esto cambia sin querer, la aplicación intentaría hablar con un
    // proveedor real sin credenciales.
    const config = defaultComplianceConfig();
    assert.equal(config.kycProvider, 'mock');
    assert.equal(config.signatureProvider, 'mock');
    assert.equal(config.paymentsLive, false);
  });
});

describe('lectura de la base de datos', () => {
  it('los valores almacenados ganan a los de fábrica', () => {
    const config = parseComplianceConfig({
      'investment.cooling_off_days': '14',
      'kyc.level3.threshold_cents': '1000000',
    });
    assert.equal(config.coolingOffDays, 14);
    assert.equal(config.kycLevel3ThresholdCents, 1_000_000n);
  });

  it('las claves ausentes caen al valor de fábrica', () => {
    const config = parseComplianceConfig({ 'investment.cooling_off_days': '7' });
    assert.equal(config.coolingOffDays, 7);
    assert.equal(config.suitabilityValidityMonths, 24);
  });

  it('falla ruidosamente ante un valor corrupto', () => {
    assert.throws(() =>
      parseComplianceConfig({ 'investment.cooling_off_days': 'catorce' }),
    );
  });
});

describe('la verificación de identidad no se puede apagar', () => {
  it('rechaza la configuración que la desactiva', () => {
    // Aunque alguien edite la fila directamente en la base de datos, la
    // aplicación se niega a funcionar con la verificación desactivada.
    assert.throws(
      () => parseComplianceConfig({ 'kyc.level1.required': 'false' }),
      /no negociable/,
    );
  });

  it('está marcada como bloqueada para la interfaz', () => {
    assert.equal(COMPLIANCE_SETTINGS.KYC_LEVEL1_REQUIRED.locked, true);
    assert.equal(COMPLIANCE_SETTINGS.AML_RETENTION_YEARS.locked, true);
  });
});

describe('trazabilidad de los parámetros legales', () => {
  it('los parámetros con base normativa citan su referencia', () => {
    // Cuando el asesor legal revise esto, tiene que poder ver de dónde sale
    // cada número sin preguntar.
    const conNorma = [
      COMPLIANCE_SETTINGS.COOLING_OFF_DAYS,
      COMPLIANCE_SETTINGS.WARNING_THRESHOLD_CENTS,
      COMPLIANCE_SETTINGS.WARNING_NET_WORTH_PCT,
      COMPLIANCE_SETTINGS.SUITABILITY_VALIDITY_MONTHS,
      COMPLIANCE_SETTINGS.AML_RETENTION_YEARS,
    ];
    for (const setting of conNorma) {
      assert.ok(
        setting.pendingLegalReview !== undefined && setting.pendingLegalReview.length > 0,
        `${setting.key} debería citar su referencia normativa pendiente de validar`,
      );
    }
  });

  it('todo parámetro se explica en castellano', () => {
    for (const setting of Object.values(COMPLIANCE_SETTINGS)) {
      assert.ok(setting.description.length > 20, `${setting.key} necesita descripción`);
      assert.ok(setting.key.includes('.'), `${setting.key} debería ir con espacio de nombres`);
    }
  });

  it('no hay claves duplicadas', () => {
    const keys = Object.values(COMPLIANCE_SETTINGS).map((s) => s.key);
    assert.equal(new Set(keys).size, keys.length);
  });
});
