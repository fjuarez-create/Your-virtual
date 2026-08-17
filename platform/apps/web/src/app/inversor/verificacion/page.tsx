import type { ReactNode } from 'react';

/**
 * Verificación de identidad del inversor.
 *
 * En la fase 3 conduce los tres niveles: identidad, clasificación (test de
 * idoneidad o vía de inversor sofisticado) y origen de fondos por encima del
 * umbral configurado.
 */
export default function VerificacionPage(): ReactNode {
  return (
    <main>
      <p className="eyebrow">Área de inversor</p>
      <h1>Verificación</h1>
      <div className="pendiente">
        <p>Se construye en la fase 3:</p>
        <ul className="rutas">
          <li>Nivel 1 · Identidad: datos personales, documento y domicilio.</li>
          <li>Nivel 2 · Clasificación: test de idoneidad, o acreditación como inversor sofisticado.</li>
          <li>Nivel 3 · Origen de fondos, solo al superar el umbral configurado.</li>
          <li>Para sociedades: datos societarios, poder de representación y titulares reales.</li>
        </ul>
      </div>
      <div className="aviso-legal">
        Mientras no haya proveedor de verificación contratado, los expedientes se
        resuelven <strong>a mano por un revisor</strong>. El simulador de desarrollo
        no aprueba ninguna verificación por su cuenta.
      </div>
    </main>
  );
}
