/* Administración de usuarios. Solo la ve el administrador: da de alta a
   los arquitectos con su correo y una contraseña inicial, y puede
   desactivarlos sin perder la firma de los repasos que ya hicieron. */
import { h, icon, sheet, toast, confirmSheet, avatar, emptyState } from '../ui.js';
import * as api from '../api.js';
import * as store from '../store.js';
import { EMPRESAS, contrasenaInicial, verificaPorDefecto } from '../catalog.js';
import { cabeceraClasica, chevron, hojaFoto } from '../piezas.js';
import { ir, refrescar } from '../app.js';

export async function render() {
  if (!store.esAdmin()) { ir('#/ajustes', { reemplazar: true }); return { contenido: [] }; }

  let usuarios = [];
  let error = null;
  try {
    const r = await api.listarUsuarios();
    usuarios = (r.usuarios || []).map((u) => ({ ...u, avatarUrl: api.urlAvatar(u.id, u.avatar) }));
  } catch (e) {
    error = e.codigo === 'red' ? 'Sin conexión con el servidor.' : e.message;
  }

  const yo = store.sesion();

  return {
    sinTabs: true,
    fab: h('button.fab', { onclick: () => altaUsuario() }, icon('plus'), 'Nuevo usuario'),
    contenido: [
      cabeceraClasica('Usuarios', 'Equipo con acceso a los repasos', { volverA: '#/ajustes' }),
      h('h1.display', { style: { marginTop: '10px' } }, 'Equipo'),

      error
        ? h('div.row', null,
            h('div.row-lead', null, icon('alert', 18)),
            h('div.grow', null,
              h('div.row-title', null, 'No se pudo cargar'),
              h('div.row-sub', { style: { whiteSpace: 'normal' } }, error),
            ),
          )
        : usuarios.length
          ? h('div.stack', null, usuarios.map((u) => filaUsuario(u, yo)))
          : emptyState('users', 'Solo estás tú', 'Da de alta a los arquitectos que van a hacer los repasos.'),

      h('p.hint', { style: { marginTop: '22px' } },
        'La contraseña la genera la app con el nombre y la empresa. Al crear el usuario aparece un botón para enviársela por WhatsApp o donde prefieras. Cada uno puede cambiarla después desde sus ajustes.'),
    ],
  };
}

function filaUsuario(u, yo) {
  const esYo = u.id === yo?.id;
  return h('button.row', {
    onclick: () => (esYo ? toast('Tu propia cuenta se gestiona en Ajustes') : editarUsuario(u)),
    style: u.activo ? null : { opacity: '0.55' },
  },
    avatar(u, { tam: 40, radio: '13px' }),
    h('div.grow', null,
      h('div.row-title', null, u.nombre + (esYo ? ' (tú)' : '')),
      h('div.row-sub', null, [u.empresa, u.email].filter(Boolean).join(' · ')),
    ),
    u.verifica ? h('span.tag.accent', null, 'Verifica') : null,
    u.rol === 'admin' ? h('span.tag.ink', null, 'Admin') : null,
    !u.activo ? h('span.tag', null, 'Inactivo') : null,
    esYo ? null : chevron(),
  );
}

/* ─── Alta ────────────────────────────────────────────────────── */
/**
 * Alta en un paso: nombre y empresa. La contraseña la calcula la propia
 * app con la regla de la casa (nombre + primera palabra de la empresa),
 * así que no hay que inventarla ni apuntarla en ningún sitio.
 */
function altaUsuario() {
  return sheet((cerrar) => {
    const nombre = h('input.input', { type: 'text', placeholder: 'Nombre y apellido', autocomplete: 'off' });
    const email = h('input.input', { type: 'email', placeholder: 'correo@unikdi.com', autocomplete: 'off', inputmode: 'email' });
    const empresa = h('input.input', { type: 'text', placeholder: 'Empresa o rol', autocomplete: 'off' });
    const aviso = h('p.hint.err', { style: { display: 'none' } });
    const vista = h('code.clave-vista', null, '—');
    let rol = 'usuario';
    let verifica = false;
    let verificaTocado = false;

    const chipsEmpresa = h('div.chips', null,
      EMPRESAS.map((e) => h('button.chip', {
        onclick: () => { empresa.value = e.texto; empresa.dispatchEvent(new Event('input')); },
      }, e.texto)),
    );

    const chipVerifica = h('button.chip.accent', {
      'aria-pressed': 'false',
      onclick: (ev) => {
        verifica = !verifica;
        verificaTocado = true;
        ev.currentTarget.setAttribute('aria-pressed', verifica ? 'true' : 'false');
      },
    }, 'Puede verificar');

    const chipAdmin = h('button.chip', {
      'aria-pressed': 'false',
      onclick: (ev) => {
        rol = rol === 'admin' ? 'usuario' : 'admin';
        ev.currentTarget.setAttribute('aria-pressed', rol === 'admin' ? 'true' : 'false');
      },
    }, 'Administrador');

    const repintar = () => {
      const clave = contrasenaInicial(nombre.value, empresa.value);
      vista.textContent = clave || '—';
      // El permiso se propone según la empresa, pero manda lo que se toque.
      if (!verificaTocado) {
        verifica = verificaPorDefecto(empresa.value.trim());
        chipVerifica.setAttribute('aria-pressed', verifica ? 'true' : 'false');
      }
    };
    nombre.addEventListener('input', repintar);
    empresa.addEventListener('input', repintar);

    return [
      h('h2.title', null, 'Nuevo usuario'),
      h('div.stack', null, nombre, email, empresa),
      h('p.hint', { style: { marginTop: '10px' } }, 'Atajos:'),
      chipsEmpresa,

      h('div.clave-caja', { style: { marginTop: '16px' } },
        h('div.grow', null,
          h('p.eyebrow', null, 'Su contraseña será'),
          vista,
        ),
      ),

      h('p.eyebrow', { style: { marginTop: '18px', marginBottom: '8px' } }, 'Permisos'),
      h('div.chips', null, chipVerifica, chipAdmin),
      h('p.hint', null, 'Sin «Puede verificar», el usuario solo podrá mover tareas entre pendiente y resuelta.'),

      aviso,
      h('button.btn.accent.full', {
        style: { marginTop: '16px' },
        onclick: async (ev) => {
          aviso.style.display = 'none';
          const datos = {
            nombre: nombre.value.trim(),
            email: email.value.trim().toLowerCase(),
            empresa: empresa.value.trim(),
            rol, verifica,
          };
          if (datos.nombre.length < 3) return fallo('Escribe el nombre completo.');
          if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(datos.email)) return fallo('El correo no es válido.');
          if (!datos.empresa) return fallo('Escribe la empresa o el rol: de ahí sale la contraseña.');
          if (contrasenaInicial(datos.nombre, datos.empresa).length < 8) {
            return fallo('El nombre y la empresa son demasiado cortos para una contraseña segura.');
          }
          ev.currentTarget.disabled = true;
          try {
            const r = await api.crearUsuario(datos);
            cerrar(true);
            await hojaCredenciales(r.usuario, r.password, 'Usuario creado');
            refrescar();
          } catch (err) {
            ev.currentTarget.disabled = false;
            fallo(err.codigo === 'duplicado' ? 'Ya existe un usuario con ese correo.' : err.message);
          }

          function fallo(msg) {
            aviso.textContent = msg;
            aviso.style.display = 'block';
          }
        },
      }, 'Crear usuario'),
      h('button.btn.ghost.full', { onclick: () => cerrar(false) }, 'Cancelar'),
    ];
  });
}

/**
 * Hoja con el usuario y la contraseña recién creados, con el botón de
 * compartir del móvil: desde ahí se manda por WhatsApp, correo o lo que
 * haya instalado. Es la única vez que la contraseña se puede ver.
 */
export function hojaCredenciales(usuario, password, titulo = 'Acceso') {
  const texto = [
    'UNIK Works — tu acceso',
    '',
    `Nombre: ${usuario.nombre}`,
    `Usuario: ${usuario.email}`,
    `Contraseña: ${password}`,
    '',
    location.origin + location.pathname.replace(/index\.html$/, ''),
  ].join('\n');

  return sheet((cerrar) => {
    const compartir = h('button.btn.accent.full', null, icon('share'), 'Enviar por WhatsApp o correo');
    compartir.addEventListener('click', async () => {
      try {
        if (navigator.share) {
          await navigator.share({ title: 'UNIK Works', text: texto });
        } else {
          await navigator.clipboard.writeText(texto);
          toast('Copiado al portapapeles');
        }
      } catch (e) {
        if (e?.name !== 'AbortError') toast('No se pudo compartir; cópialo a mano', 'err');
      }
    });

    return [
      h('h2.title', null, titulo),
      h('p.sub', null, 'Esta contraseña no se puede volver a consultar. Envíasela ahora.'),
      h('div.clave-caja', { style: { marginTop: '6px' } },
        h('div.grow', null,
          h('p.eyebrow', null, usuario.email),
          h('code.clave-vista', null, password),
        ),
        h('button.icon-btn', {
          'aria-label': 'Copiar',
          onclick: async () => {
            try { await navigator.clipboard.writeText(password); toast('Contraseña copiada'); }
            catch { toast('No se pudo copiar', 'err'); }
          },
        }, icon('copy', 18)),
      ),
      compartir,
      h('button.btn.ghost.full', { onclick: () => cerrar(true) }, 'Hecho'),
    ];
  });
}

/* ─── Edición ─────────────────────────────────────────────────── */
function editarUsuario(u) {
  return sheet((cerrar) => [
    h('h2.title', null, u.nombre),
    h('p.sub', null, u.email),
    h('div.stack', { style: { marginTop: '10px' } },
      h('button.row', {
        onclick: async () => {
          if (await hojaFoto(u)) { cerrar(true); refrescar(); }
        },
      },
        h('div.row-lead', null, icon('camera', 18)),
        h('div.grow', null,
          h('div.row-title', null, u.avatar ? 'Cambiar su foto' : 'Ponerle una foto'),
          h('div.row-sub', null, 'Podrá cambiarla o quitarla'),
        ),
      ),
      h('button.row', {
        onclick: async () => {
          const nueva = await pedirPassword(u);
          if (nueva) cerrar(true);
        },
      },
        h('div.row-lead', null, icon('key', 18)),
        h('div.grow', null,
          h('div.row-title', null, 'Poner una contraseña nueva'),
          h('div.row-sub', null, 'Se la tendrás que pasar tú'),
        ),
      ),
      h('button.row', {
        onclick: async () => {
          await api.editarUsuario(u.id, { rol: u.rol === 'admin' ? 'usuario' : 'admin' });
          cerrar(true); toast('Permisos actualizados'); refrescar();
        },
      },
        h('div.row-lead', null, icon('users', 18)),
        h('div.grow', null,
          h('div.row-title', null, u.rol === 'admin' ? 'Quitar permisos de administrador' : 'Hacer administrador'),
        ),
      ),
      // El permiso de verificar, persona a persona. En esta obra el DEO
      // no verifica, pero en otra puede que sí: por eso no va atado a la
      // empresa, se decide aquí. La empresa solo pone la sugerencia al
      // dar de alta.
      h('button.row', {
        onclick: async () => {
          await api.editarUsuario(u.id, { verifica: !u.verifica });
          cerrar(true);
          toast(u.verifica ? 'Ya no puede verificar' : 'Ya puede verificar');
          refrescar();
        },
      },
        h('div.row-lead', null, icon('check', 18)),
        h('div.grow', null,
          h('div.row-title', null, u.verifica ? 'Quitarle el permiso de verificar' : 'Dejarle verificar'),
          h('div.row-sub', { style: { whiteSpace: 'normal' } },
            u.verifica
              ? 'Pasará a mover tareas solo entre pendiente y resuelta'
              : 'Podrá dar tareas por verificadas y rechazarlas'),
        ),
      ),
      h('button.row', {
        class: u.activo ? 'danger' : '',
        onclick: async () => {
          await api.editarUsuario(u.id, { activo: !u.activo });
          cerrar(true);
          toast(u.activo ? 'Usuario desactivado' : 'Usuario reactivado');
          refrescar();
        },
      },
        h('div.row-lead', null, icon(u.activo ? 'logout' : 'check', 18)),
        h('div.grow', null,
          h('div.row-title', null, u.activo ? 'Desactivar el acceso' : 'Reactivar el acceso'),
          h('div.row-sub', { style: { whiteSpace: 'normal' } },
            'Sus repasos y su firma se conservan'),
        ),
      ),
      h('button.row.danger', {
        onclick: async () => {
          if (!await confirmSheet({
            title: '¿Borrar el usuario?',
            text: 'Sus repasos se conservan, pero la cuenta desaparece. Si solo quieres quitarle el acceso, desactívalo.',
            ok: 'Borrar', danger: true,
          })) return;
          try {
            await api.eliminarUsuario(u.id);
            cerrar(true); toast('Usuario borrado'); refrescar();
          } catch (e) { toast(e.message, 'err'); }
        },
      },
        h('div.row-lead', null, icon('trash', 18)),
        h('div.grow', null, h('div.row-title', null, 'Borrar el usuario')),
      ),
    ),
    h('button.btn.ghost.full', { onclick: () => cerrar(false) }, 'Cerrar'),
  ]);
}

function pedirPassword(u) {
  const sugerida = contrasenaInicial(u.nombre, u.empresa || '');
  return sheet((cerrar) => {
    const pass = h('input.input', { type: 'text', value: sugerida.length >= 8 ? sugerida : contrasenaSugerida() });
    const aviso = h('p.hint.err', { style: { display: 'none' } });
    return [
      h('h2.title', null, 'Contraseña de ' + u.nombre.split(/\s+/)[0]),
      pass,
      h('p.hint', null, 'Viene puesta la que le corresponde por su nombre y empresa. Al guardar podrás enviársela.'),
      aviso,
      h('button.btn.accent.full', {
        onclick: async () => {
          if (pass.value.length < 8) {
            aviso.textContent = 'Mínimo 8 caracteres.';
            aviso.style.display = 'block'; return;
          }
          try {
            await api.editarUsuario(u.id, { password: pass.value });
            cerrar(true);
            await hojaCredenciales(u, pass.value, 'Contraseña cambiada');
          } catch (e) {
            aviso.textContent = e.message;
            aviso.style.display = 'block';
          }
        },
      }, 'Guardar'),
      h('button.btn.ghost.full', { onclick: () => cerrar(false) }, 'Cancelar'),
    ];
  });
}

/** Contraseña legible al dictado: sin caracteres que se confundan. */
function contrasenaSugerida() {
  const alfabeto = 'abcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return [...bytes].map((b) => alfabeto[b % alfabeto.length]).join('');
}
