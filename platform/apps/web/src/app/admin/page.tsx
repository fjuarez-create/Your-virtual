import type { ReactNode } from 'react';

/**
 * Resumen del panel.
 *
 * En la fase 5 encabeza la página con los avisos que devuelve
 * `resolveProviders()`: mientras haya proveedores simulados, el panel lo dice.
 * Un operador tiene que saber en qué estado real está la plataforma sin tener
 * que leer variables de entorno.
 */
export default function AdminPage(): ReactNode {
  return (
    <main>
      <p className="eyebrow">Administración</p>
      <h1>Resumen</h1>

      <div className="aviso-legal">
        <strong>Estado de la plataforma.</strong> En la fase 5, aquí se listan los
        avisos de <code>resolveProviders()</code>: qué proveedores están simulados y
        si se está operando sin verificación de identidad real.
      </div>

      <h2>Pendiente de la fase 5</h2>
      <div className="pendiente">
        <ul className="rutas">
          <li>Proyectos: alta, edición, documentación versionada, apertura y cierre de rondas.</li>
          <li>Verificaciones: cola de revisión, aprobación o rechazo con motivo, disposición de coincidencias de cribado.</li>
          <li>Transacciones: compromisos por proyecto, conciliación de transferencias, cierre de ronda y devoluciones.</li>
          <li>Cumplimiento: parámetros con histórico, textos legales versionados, solicitudes de derechos RGPD.</li>
          <li>Usuarios internos y sus permisos.</li>
          <li>Exportaciones para la asesoría fiscal y legal.</li>
        </ul>
      </div>
    </main>
  );
}
