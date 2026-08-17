import type { ReactNode } from 'react';

/**
 * Portada · ficha del proyecto destacado.
 *
 * Esqueleto de la fase 1: sin lógica de negocio. En la fase 2 esta página carga
 * `project where isFeatured = true` con sus activos, su ronda vigente y su
 * cascada, y renderiza en servidor para que el proyecto sea indexable.
 *
 * El «mono-proyecto» es una consulta, no una página especial: cuando UMAIA se
 * cierre y entre otro proyecto destacado, esta página no cambia.
 */
export default function PortadaPage(): ReactNode {
  return (
    <main>
      <p className="eyebrow">Telde · Gran Canaria</p>
      <h1>UMAIA</h1>
      <p>
        Cuatro edificios residenciales y una parcela terciaria, con licencia de
        urbanización obtenida.
      </p>

      <div className="aviso-legal">
        <strong>Advertencia de riesgo.</strong> Invertir en este proyecto puede
        suponer la pérdida total del capital. La inversión no está cubierta por el
        Fondo de Garantía de Depósitos ni por el Fondo de Garantía de Inversiones,
        no existe mercado secundario y el capital de los inversores está
        subordinado a la deuda bancaria. Las rentabilidades objetivo son
        proyecciones, no promesas.
      </div>

      <h2>Pendiente de la fase 2</h2>
      <div className="pendiente">
        <p>Esta página se construye en la fase 2 con:</p>
        <ul className="rutas">
          <li>Cabecera con renders, mapa y cifras clave.</li>
          <li>Barra de progreso de captación, leída de <code>funding_round_progress</code>.</li>
          <li>Memoria del proyecto y sus cinco activos.</li>
          <li>
            Estructura financiera: orden de prelación desde{' '}
            <code>capital_stack_item</code> y cascada desde <code>return_tier</code>.
          </li>
          <li>
            Simulador de inversión, que consume <code>simulateInvestment()</code> de{' '}
            <code>@umaia/core</code> — la misma función que liquida.
          </li>
          <li>Sala de documentación con acceso por URL firmada.</li>
          <li>Carrusel de proyectos relacionados.</li>
        </ul>
      </div>
    </main>
  );
}
