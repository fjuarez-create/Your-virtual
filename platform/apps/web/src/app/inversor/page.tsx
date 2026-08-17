import type { ReactNode } from 'react';

/**
 * Cartera del inversor.
 *
 * En la fase 3 muestra las inversiones de la CUENTA activa. Un apoderado que
 * represente a varias sociedades alterna entre ellas: la cuenta activa vive en
 * `investor_session.active_account_id`, y toda consulta se filtra por ella.
 */
export default function CarteraPage(): ReactNode {
  return (
    <main>
      <p className="eyebrow">Área de inversor</p>
      <h1>Mi cartera</h1>
      <div className="pendiente">
        <p>Esqueleto de la fase 1. Se construye en las fases 3 y 4 con:</p>
        <ul className="rutas">
          <li>Selector de cuenta, para quien represente a más de una sociedad.</li>
          <li>Estado de la verificación: pendiente, en revisión, aprobada o rechazada con su motivo.</li>
          <li>Inversiones con su estado en el flujo y sus documentos firmados.</li>
          <li>Histórico de movimientos y distribuciones.</li>
          <li>Descarga de certificados fiscales.</li>
        </ul>
      </div>
    </main>
  );
}
