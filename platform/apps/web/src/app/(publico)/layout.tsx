import Link from 'next/link';
import type { ReactNode } from 'react';

/** Superficie 1 · Web pública. Accesible sin autenticación. */
export default function PublicoLayout({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  return (
    <>
      <nav className="superficie">
        <strong>UMAIA</strong>
        <Link href="/">Proyecto</Link>
        <Link href="/proyectos">Proyectos relacionados</Link>
        <Link href="/legal/advertencias-de-riesgo">Riesgos</Link>
        <Link href="/inversor">Área de inversor</Link>
      </nav>
      {children}
    </>
  );
}
