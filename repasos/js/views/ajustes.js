/* Ajustes: cuenta, sincronización, administración de usuarios y datos
   guardados en el dispositivo. */
import { h, icon, sheet, toast, confirmSheet, iniciales, pesoLegible } from '../ui.js';
import * as store from '../store.js';
import * as api from '../api.js';
import * as db from '../db.js';
import { barraSync, chevron } from '../piezas.js';
import { ir } from '../app.js';

export async function render() {
  const u = store.sesion();
  const ocupacion = await espacioUsado();

  const filas = [];

  if (api.HAY_SERVIDOR && !u.local) {
    filas.push(fila('key', 'Cambiar mi contraseña', null, () => cambiarPassword()));
  }
  if (store.esAdmin() && api.HAY_SERVIDOR && !u.local) {
    filas.push(fila('users', 'Usuarios', 'Alta y baja del equipo', () => ir('#/usuarios')));
  }

  return {
    tab: 'ajustes',
    contenido: [
      h('h1.display', null, 'Ajustes'),

      // Tarjeta de cuenta, con el mismo aire que el perfil de la referencia.
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '14px', margin: '22px 0 6px' } },
        h('div.avatar', { style: { width: '64px', height: '64px', flex: '0 0 64px', fontSize: '21px' } }, iniciales(u?.nombre)),
        h('div.grow', { style: { minWidth: 0 } },
          h('h2.title', null, u?.nombre || 'Sin identificar'),
          h('p.sub', null, u?.email || (u?.local ? 'Modo local' : '')),
        ),
      ),
      h('div.chips', null,
        h('span.chip', { 'aria-pressed': 'true' }, store.esAdmin() ? 'Administrador' : 'Arquitecto'),
        u?.local ? h('span.chip', null, 'Sin servidor') : null,
      ),

      h('p.eyebrow', { style: { marginTop: '26px', marginBottom: '10px' } }, 'Sincronización'),
      barraSync(),
      h('div.stack', null,
        fila('refresh', 'Sincronizar ahora', 'Sube lo pendiente y baja lo nuevo', async () => {
          if (!navigator.onLine) return toast('Sin conexión', 'err');
          await store.sincronizar({ forzar: true });
          toast(store.estadoSync.error ? 'No se pudo sincronizar' : 'Sincronizado',
            store.estadoSync.error ? 'err' : '');
        }),
      ),

      filas.length ? h('p.eyebrow', { style: { marginTop: '26px', marginBottom: '10px' } }, 'Cuenta') : null,
      filas.length ? h('div.stack', null, filas) : null,

      h('p.eyebrow', { style: { marginTop: '26px', marginBottom: '10px' } }, 'En este dispositivo'),
      h('div.stack', null,
        h('div.row', null,
          h('div.row-lead', null, icon('image', 18)),
          h('div.grow', null,
            h('div.row-title', null, `${ocupacion.medios} archivos guardados`),
            h('div.row-sub', null, [pesoLegible(ocupacion.bytes), `${ocupacion.sinSubir} sin subir`].filter(Boolean).join(' · ')),
          ),
        ),
        fila('trash', 'Vaciar la caché local', 'No borra nada del servidor', () => vaciarCache(), true),
      ),

      h('p.eyebrow', { style: { marginTop: '26px', marginBottom: '10px' } }, 'Sesión'),
      h('div.stack', null,
        fila('logout', 'Cerrar sesión', null, () => cerrarSesion(), true),
      ),

      h('p.hint', { style: { marginTop: '30px', textAlign: 'center' } },
        'UNIK repasos · versión ' + (window.REPASOS_CONFIG?.build || 'local')),
    ],
  };
}

function fila(ico, titulo, sub, onclick, peligro = false) {
  return h('button.row', { class: peligro ? 'danger' : '', onclick },
    h('div.row-lead', null, icon(ico, 18)),
    h('div.grow', null,
      h('div.row-title', null, titulo),
      sub && h('div.row-sub', null, sub),
    ),
    chevron(),
  );
}

async function espacioUsado() {
  const medios = (await db.getAll('medios')).filter((m) => !m.borrada);
  return {
    medios: medios.length,
    bytes: medios.reduce((s, m) => s + (m.blob?.size || 0), 0),
    sinSubir: medios.filter((m) => !m.subido).length,
  };
}

function cambiarPassword() {
  return sheet((cerrar) => {
    const actual = h('input.input', { type: 'password', placeholder: 'Contraseña actual', autocomplete: 'current-password' });
    const nueva = h('input.input', { type: 'password', placeholder: 'Contraseña nueva', autocomplete: 'new-password' });
    const repetir = h('input.input', { type: 'password', placeholder: 'Repite la nueva', autocomplete: 'new-password' });
    const aviso = h('p.hint.err', { style: { display: 'none' } });

    return [
      h('h2.title', null, 'Cambiar contraseña'),
      h('div.stack', null, actual, nueva, repetir),
      aviso,
      h('button.btn.accent.full', {
        onclick: async () => {
          aviso.style.display = 'none';
          if (nueva.value.length < 8) {
            aviso.textContent = 'La contraseña nueva debe tener al menos 8 caracteres.';
            aviso.style.display = 'block'; return;
          }
          if (nueva.value !== repetir.value) {
            aviso.textContent = 'Las dos contraseñas nuevas no coinciden.';
            aviso.style.display = 'block'; return;
          }
          try {
            await api.cambiarPassword(actual.value, nueva.value);
            cerrar(true);
            toast('Contraseña actualizada');
          } catch (e) {
            aviso.textContent = e.status === 401 ? 'La contraseña actual no es correcta.' : e.message;
            aviso.style.display = 'block';
          }
        },
      }, 'Guardar'),
      h('button.btn.ghost.full', { onclick: () => cerrar(false) }, 'Cancelar'),
    ];
  });
}

async function vaciarCache() {
  const pendientes = await db.numPendientes();
  if (pendientes > 0) {
    return toast(`Hay ${pendientes} cambios sin subir. Sincroniza antes de vaciar.`, 'err');
  }
  if (!await confirmSheet({
    title: '¿Vaciar la caché?',
    text: 'Se borran del dispositivo las fotos y los datos ya sincronizados. Se vuelven a descargar del servidor cuando hagan falta.',
    ok: 'Vaciar',
  })) return;
  await db.vaciar('medios');
  await db.vaciar('tareas');
  await db.vaciar('listas');
  await db.meta.del('ultimoSync');
  await store.sincronizar({ forzar: true });
  toast('Caché vaciada');
  location.reload();
}

async function cerrarSesion() {
  const pendientes = await db.numPendientes();
  if (!await confirmSheet({
    title: '¿Cerrar sesión?',
    text: pendientes > 0
      ? `Quedan ${pendientes} cambios sin subir. Se conservarán en este dispositivo hasta que vuelvas a entrar.`
      : 'Se borrarán los datos guardados en este dispositivo.',
    ok: 'Cerrar sesión', danger: true,
  })) return;
  await store.cerrarSesion();
  location.hash = '#/entrar';
  location.reload();
}
