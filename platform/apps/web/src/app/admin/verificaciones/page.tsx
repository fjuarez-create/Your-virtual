import type { ReactNode } from 'react';

/**
 * Cola de revisión de expedientes.
 *
 * Es la pantalla donde un humano aprueba o rechaza. El dominio lo impone:
 * `applyKycEvent()` exige actor `REVIEWER` para llegar a `APPROVED`, así que no
 * hay ninguna otra vía por la que un expediente pueda quedar aprobado.
 */
export default function VerificacionesPage(): ReactNode {
  return (
    <main>
      <p className="eyebrow">Administración</p>
      <h1>Verificaciones</h1>
      <div className="pendiente">
        <p>Se construye en la fase 5:</p>
        <ul className="rutas">
          <li>Expedientes en revisión, con sus comprobaciones y la respuesta cruda del proveedor.</li>
          <li>Aprobar o rechazar, con motivo obligatorio en el rechazo (lo exige un CHECK de la base de datos).</li>
          <li>Disposición de coincidencias de PEP y sanciones, una a una.</li>
          <li>Aprobación de poderes de representación de sociedades.</li>
          <li>Aviso visible cuando el expediente se tramitó con proveedor simulado.</li>
        </ul>
      </div>
    </main>
  );
}
