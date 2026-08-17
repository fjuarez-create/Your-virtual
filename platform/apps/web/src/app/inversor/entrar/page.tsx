import type { ReactNode } from 'react';

/**
 * Acceso del inversor.
 *
 * Ruta pública dentro del segmento protegido: el middleware la deja pasar de
 * forma explícita. Usa la cookie de inversor, distinta de la de administración.
 */
export default function EntrarInversorPage(): ReactNode {
  return (
    <main>
      <p className="eyebrow">Área de inversor</p>
      <h1>Acceder</h1>
      <div className="pendiente">
        <p>
          Formulario pendiente de la fase 3. Al implementarlo: limitación de
          intentos con <code>evaluateRateLimit()</code> de <code>@umaia/auth</code>,
          verificación con <code>verifyPassword()</code>, y emisión de sesión con{' '}
          <code>issueSessionToken(INVESTOR_REALM)</code>.
        </p>
        <p>
          El mensaje de error no debe distinguir «usuario inexistente» de
          «contraseña incorrecta»: sería un oráculo para averiguar quién tiene
          cuenta en la plataforma.
        </p>
      </div>
    </main>
  );
}
