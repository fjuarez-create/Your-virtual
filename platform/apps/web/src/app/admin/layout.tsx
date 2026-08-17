import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * Superficie 3 · Panel de administración.
 *
 * Perímetro separado: cookie propia, sesión más corta y 2FA obligatorio. En
 * producción se sirve desde un host propio, no desde el dominio público.
 *
 * Todas las páginas de este segmento son dinámicas: nada de lo que hay aquí
 * puede cachearse estáticamente.
 */
export const dynamic = 'force-dynamic';

export default function AdminLayout({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  return (
    <>
      <nav className="superficie">
        <strong>UMAIA</strong>
        <span className="marca-admin">Administración</span>
        <Link href="/admin">Resumen</Link>
        <Link href="/admin/proyectos">Proyectos</Link>
        <Link href="/admin/verificaciones">Verificaciones</Link>
        <Link href="/admin/transacciones">Transacciones</Link>
        <Link href="/admin/cumplimiento">Cumplimiento</Link>
      </nav>
      {children}
    </>
  );
}
