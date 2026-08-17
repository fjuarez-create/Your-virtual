/**
 * @umaia/core — dominio de la plataforma.
 *
 * Lógica pura: sin HTTP, sin base de datos, sin proveedores externos. Todo lo
 * que hay aquí se puede probar con `node --test` y leer sin abrir el navegador,
 * que es exactamente lo que hará quien tenga que auditar cómo se aplican las
 * reglas de cumplimiento.
 */

export * from './money.js';
export * from './compliance.js';
export * from './investment-flow.js';
export * from './kyc-flow.js';
export * from './eligibility.js';
export * from './waterfall.js';
