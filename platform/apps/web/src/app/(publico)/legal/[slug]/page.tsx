import type { ReactNode } from 'react';

/**
 * Documento legal publicado.
 *
 * Sirve la versión VIGENTE (`effective_until IS NULL`) de `legal_document`. Las
 * versiones anteriores siguen accesibles por su etiqueta, porque un inversor
 * tiene derecho a leer exactamente el texto que aceptó, no el actual.
 */
export default async function LegalPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<ReactNode> {
  const { slug } = await params;

  return (
    <main>
      <p className="eyebrow">Información legal</p>
      <h1>{slug.replace(/-/g, ' ')}</h1>
      <div className="pendiente">
        <p>
          En la fase 2 se renderiza <code>legal_document_version.content_md</code> de
          la versión vigente, con su etiqueta y fecha de entrada en vigor visibles.
        </p>
        <p>
          Los textos actuales son <strong>borradores sin valor contractual</strong>,
          pendientes de redacción por la asesoría jurídica.
        </p>
      </div>
    </main>
  );
}
