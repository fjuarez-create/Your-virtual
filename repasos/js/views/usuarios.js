/* Administración de usuarios. Solo la ve el administrador: da de alta a
   los arquitectos con su correo y una contraseña inicial, y puede
   desactivarlos sin perder la firma de los repasos que ya hicieron. */
import { h, icon, sheet, toast, confirmSheet, iniciales, emptyState } from '../ui.js';
import * as api from '../api.js';
import * as store from '../store.js';
import { cabecera, chevron } from '../piezas.js';
import { ir, refrescar } from '../app.js';

export async function render() {
  if (!store.esAdmin()) { ir('#/ajustes', { reemplazar: true }); return { contenido: [] }; }

  let usuarios = [];
  let error = null;
  try {
    const r = await api.listarUsuarios();
    usuarios = r.usuarios || [];
  } catch (e) {
    error = e.codigo === 'red' ? 'Sin conexión con el servidor.' : e.message;
  }

  const yo = store.sesion();

  return {
    tab: 'ajustes',
    fab: h('button.fab', { onclick: () => altaUsuario() }, icon('plus'), 'Nuevo usuario'),
    contenido: [
      cabecera('Usuarios', 'Equipo con acceso a los repasos', { volverA: '#/ajustes' }),
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
        'La contraseña que pongas al crear el usuario se la tienes que pasar tú. Cada uno puede cambiarla después desde sus ajustes.'),
    ],
  };
}

function filaUsuario(u, yo) {
  const esYo = u.id === yo?.id;
  return h('button.row', {
    onclick: () => (esYo ? toast('Tu propia cuenta se gestiona en Ajustes') : editarUsuario(u)),
    style: u.activo ? null : { opacity: '0.55' },
  },
    h('div.avatar', { style: { width: '40px', height: '40px', flex: '0 0 40px', fontSize: '13px', borderRadius: '12px' } },
      iniciales(u.nombre)),
    h('div.grow', null,
      h('div.row-title', null, u.nombre + (esYo ? ' (tú)' : '')),
      h('div.row-sub', null, u.email),
    ),
    u.rol === 'admin' ? h('span.tag.ink', null, 'Admin') : null,
    !u.activo ? h('span.tag', null, 'Inactivo') : null,
    esYo ? null : chevron(),
  );
}

/* ─── Alta ────────────────────────────────────────────────────── */
function altaUsuario() {
  return sheet((cerrar) => {
    const nombre = h('input.input', { type: 'text', placeholder: 'Nombre y apellido', autocomplete: 'off' });
    const email = h('input.input', { type: 'email', placeholder: 'correo@unikdi.com', autocomplete: 'off', inputmode: 'email' });
    const pass = h('input.input', { type: 'text', placeholder: 'Contraseña inicial', autocomplete: 'off' });
    const aviso = h('p.hint.err', { style: { display: 'none' } });
    let rol = 'usuario';

    const chips = h('div.chips', null,
      ...[['usuario', 'Arquitecto'], ['admin', 'Administrador']].map(([id, txt]) =>
        h('button.chip', {
          'aria-pressed': id === rol ? 'true' : 'false',
          onclick: (e) => {
            rol = id;
            [...chips.children].forEach((c) => c.setAttribute('aria-pressed', c === e.currentTarget ? 'true' : 'false'));
          },
        }, txt)),
    );

    const generar = h('button.tag', {
      onclick: () => { pass.value = contraseñaSugerida(); toast('Contraseña generada, cópiala antes de guardar'); },
    }, 'Generar');

    return [
      h('h2.title', null, 'Nuevo usuario'),
      h('div.stack', null, nombre, email,
        h('div', { style: { position: 'relative' } }, pass,
          h('div', { style: { position: 'absolute', right: '10px', top: '11px' } }, generar)),
      ),
      h('p.eyebrow', { style: { marginTop: '14px', marginBottom: '8px' } }, 'Permisos'),
      chips,
      aviso,
      h('button.btn.accent.full', {
        onclick: async (e) => {
          aviso.style.display = 'none';
          const datos = { nombre: nombre.value.trim(), email: email.value.trim().toLowerCase(), password: pass.value, rol };
          if (datos.nombre.length < 3) return fallo('Escribe el nombre completo.');
          if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(datos.email)) return fallo('El correo no es válido.');
          if (datos.password.length < 8) return fallo('La contraseña debe tener al menos 8 caracteres.');
          e.currentTarget.disabled = true;
          try {
            await api.crearUsuario(datos);
            cerrar(true);
            toast('Usuario creado');
            refrescar();
          } catch (err) {
            e.currentTarget.disabled = false;
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

/* ─── Edición ─────────────────────────────────────────────────── */
function editarUsuario(u) {
  return sheet((cerrar) => [
    h('h2.title', null, u.nombre),
    h('p.sub', null, u.email),
    h('div.stack', { style: { marginTop: '10px' } },
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
  return sheet((cerrar) => {
    const pass = h('input.input', { type: 'text', placeholder: 'Contraseña nueva', value: contraseñaSugerida() });
    const aviso = h('p.hint.err', { style: { display: 'none' } });
    return [
      h('h2.title', null, 'Contraseña de ' + u.nombre.split(/\s+/)[0]),
      pass,
      h('p.hint', null, 'Cópiala antes de guardar: no se puede volver a consultar.'),
      aviso,
      h('button.btn.accent.full', {
        onclick: async () => {
          if (pass.value.length < 8) {
            aviso.textContent = 'Mínimo 8 caracteres.';
            aviso.style.display = 'block'; return;
          }
          try {
            await api.editarUsuario(u.id, { password: pass.value });
            cerrar(true); toast('Contraseña cambiada');
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
function contraseñaSugerida() {
  const alfabeto = 'abcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return [...bytes].map((b) => alfabeto[b % alfabeto.length]).join('');
}
