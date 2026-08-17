import type { ReactNode } from 'react';

/**
 * Listado de proyectos.
 *
 * Existe desde la fase 1 aunque hoy solo se publique UMAIA: el modelo soporta
 * varios proyectos desde el primer día, así que añadir Brassie o Serenea será
 * insertar filas, no rehacer páginas.
 */
export default function ProyectosPage(): ReactNode {
  return (
    <main>
      <p className="eyebrow">Catálogo</p>
      <h1>Proyectos</h1>
      <div className="pendiente">
        <p>
          En la fase 2: tarjetas por proyecto con estado de captación, leídas de{' '}
          <code>project</code> ordenadas por <code>display_order</code>. Cada una
          enlaza a <code>/proyectos/[slug]</code>, que usa la misma plantilla que la
          portada con contenido dinámico.
        </p>
      </div>
    </main>
  );
}
