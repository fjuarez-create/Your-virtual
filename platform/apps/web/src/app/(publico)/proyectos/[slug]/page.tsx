import type { ReactNode } from 'react';

/**
 * Ficha de un proyecto. Misma plantilla que la portada, contenido dinámico.
 * En la fase 2 se resuelve el proyecto por `slug` y se genera la metainformación
 * para SEO desde sus datos.
 */
export default async function ProyectoPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<ReactNode> {
  const { slug } = await params;

  return (
    <main>
      <p className="eyebrow">Proyecto</p>
      <h1>{slug}</h1>
      <div className="pendiente">
        <p>
          Esqueleto de la fase 1. En la fase 2 carga el proyecto con sus activos,
          documentos publicados, cronograma y ronda vigente.
        </p>
      </div>
    </main>
  );
}
