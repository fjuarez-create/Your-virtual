import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * Superficie 2 · Área privada del inversor.
 *
 * Protegida por el middleware (presencia de cookie) y, en la fase 3, por la
 * validación real de sesión contra `investor_session` en cada carga de página.
 */
export default function InversorLayout({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  return (
    <>
      <nav className="superficie">
        <strong>UMAIA</strong>
        <span className="marca-admin">Área de inversor</span>
        <Link href="/inversor">Cartera</Link>
        <Link href="/inversor/verificacion">Verificación</Link>
        <Link href="/inversor/movimientos">Movimientos</Link>
        <Link href="/inversor/documentos">Documentos</Link>
      </nav>
      {children}
    </>
  );
}
