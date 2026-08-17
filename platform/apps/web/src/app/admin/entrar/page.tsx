import type { ReactNode } from 'react';

/**
 * Acceso al panel de administración.
 *
 * Perímetro distinto del de inversor: credenciales en `admin_user`, sesión en
 * `admin_session`, cookie propia, política de intentos más estricta
 * (`ADMIN_LOGIN_POLICY`) y 2FA obligatorio para que la sesión sea válida.
 */
export default function EntrarAdminPage(): ReactNode {
  return (
    <main>
      <p className="eyebrow">Administración</p>
      <h1>Acceso restringido</h1>
      <div className="pendiente">
        <p>
          Formulario pendiente de la fase 5. Una sesión de administración sin 2FA
          satisfecho no es válida: <code>validateSession()</code> la rechaza con{' '}
          <code>MFA_REQUIRED</code>.
        </p>
      </div>
    </main>
  );
}
