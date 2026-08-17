import { type NextRequest, NextResponse } from 'next/server';

/**
 * Guardia de perímetro.
 *
 * Comprueba únicamente que EXISTA la cookie del perímetro correcto antes de
 * dejar pasar a una ruta protegida. La validación de verdad —que la sesión no
 * esté caducada ni revocada, que se haya satisfecho el 2FA, que el usuario siga
 * activo— ocurre en el servidor, contra la base de datos.
 *
 * Esto es deliberado y conviene no confundirlo con seguridad:
 *
 *   · El middleware corre en el borde y no debe consultar la base de datos en
 *     cada navegación.
 *   · Una cookie presente pero inválida pasará este filtro y la rechazará la
 *     capa siguiente. El middleware ahorra viajes, no autoriza.
 *   · Por eso CADA caso de uso vuelve a comprobar permisos. Que la ruta esté
 *     protegida no exime al servicio de comprobar quién llama.
 *
 * Los dos perímetros usan cookies con nombres distintos, así que una sesión de
 * inversor no puede presentarse jamás ante el panel de administración.
 */

const COOKIE_INVERSOR = 'umaia_inv_sesion';
const COOKIE_ADMIN = 'umaia_adm_sesion';

/** El prefijo __Host- solo es válido sobre HTTPS; en local se cae al nombre simple. */
function leerCookie(request: NextRequest, base: string): string | undefined {
  return (
    request.cookies.get(`__Host-${base}`)?.value ?? request.cookies.get(base)?.value
  );
}

export function middleware(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl;

  if (pathname.startsWith('/admin')) {
    if (pathname.startsWith('/admin/entrar')) return NextResponse.next();

    if (leerCookie(request, COOKIE_ADMIN) === undefined) {
      const destino = new URL('/admin/entrar', request.url);
      destino.searchParams.set('siguiente', `${pathname}${search}`);
      return NextResponse.redirect(destino);
    }
    return NextResponse.next();
  }

  if (pathname.startsWith('/inversor')) {
    if (pathname.startsWith('/inversor/entrar') || pathname.startsWith('/inversor/registro')) {
      return NextResponse.next();
    }

    if (leerCookie(request, COOKIE_INVERSOR) === undefined) {
      const destino = new URL('/inversor/entrar', request.url);
      destino.searchParams.set('siguiente', `${pathname}${search}`);
      return NextResponse.redirect(destino);
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/inversor/:path*'],
};
