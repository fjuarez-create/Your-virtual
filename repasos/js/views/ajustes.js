/* Ajustes: cuenta, sincronización, administración de usuarios y datos
   guardados en el dispositivo. */
import { h, icon, sheet, toast, confirmSheet, avatar, pesoLegible } from '../ui.js';
import * as store from '../store.js';
import * as api from '../api.js';
import * as db from '../db.js';
import { barraSync, chevron, cabeceraTab, cabeceraDentro, hojaFoto, ctaAccion, ctaCancelar } from '../piezas.js';
import * as ejemplos from '../ejemplos.js';
import { PROMOCIONES } from '../catalog.js';
import { ir, refrescar } from '../app.js';

export async function render() {
  const u = store.sesion();
  const ocupacion = await espacioUsado();

  const filas = [];

  if (api.HAY_SERVIDOR && !u.local) {
    filas.push(fila('user', u.avatar ? 'Cambiar mi foto' : 'Poner una foto',
      'Si no hay foto se ven tus iniciales', async () => {
        if (await hojaFoto(u)) { await store.refrescarSesion(); refrescar(); }
      }));
    filas.push(fila('key', 'Cambiar mi contraseña', null, () => cambiarPassword()));
  }
  if (store.esAdmin() && api.HAY_SERVIDOR && !u.local) {
    filas.push(fila('users', 'Usuarios', 'Alta y baja del equipo', () => ir('#/usuarios')));
  }

  const admin = store.esAdmin();
  const hayEjemplos = admin ? await ejemplos.cuantos() : 0;

  // Si el servidor es viejo y todavía no conoce la ruta, la fila se
  // enseña igual como «sin poner»: es lo que hay, y al pulsarla dirá
  // qué falta en vez de desaparecer sin explicación.
  let claude = null;
  if (admin && api.HAY_SERVIDOR && !u.local) {
    try { claude = await api.claudeEstado(); } catch { claude = { puesta: false, final: '' }; }
  }

  return {
    // Quien administra tiene su pestaña; el resto llega por la bolita
    // de la esquina, así que aquí necesita la flecha de vuelta.
    tab: admin ? 'ajustes' : undefined,
    sinTabs: !admin,
    contenido: [
      // Para quien administra es una pestaña y no hay atrás; para el
      // resto se llega desde su bolita de cuenta, y ahí sí hay vuelta.
      ...(admin ? cabeceraTab('AJUSTES') : cabeceraDentro('AJUSTES', { volverA: '#/' })),

      // Tarjeta de cuenta, con el mismo aire que el perfil de la referencia.
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '14px', margin: '22px 0 6px' } },
        avatar(u, { tam: 64 }),
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

      // Solo para quien administra: montar trabajo de muestra firmado
      // por el equipo, y quitarlo después sin dejar rastro.
      admin ? h('p.eyebrow', { style: { marginTop: '26px', marginBottom: '10px' } }, 'Datos de ejemplo') : null,
      admin ? h('div.stack', null,
        fila('users', 'Crear actas de ejemplo',
          'Tres actas firmadas por el equipo, para ver cómo queda',
          () => montarEjemplos()),
        hayEjemplos ? fila('trash', 'Quitar las actas de ejemplo',
          `${hayEjemplos} ${hayEjemplos === 1 ? 'acta puesta' : 'actas puestas'}`,
          () => quitarEjemplos(), true) : null,
      ) : null,

      // La transcripción de los recorridos la tendrá que mandar el
      // servidor, no el móvil. Muchos alojamientos compartidos tienen la
      // salida cerrada, y esto lo dice en diez segundos desde el propio
      // teléfono en vez de a base de correos con el hosting.
      admin && api.HAY_SERVIDOR && !u.local
        ? h('p.eyebrow', { style: { marginTop: '26px', marginBottom: '10px' } }, 'Servidor')
        : null,
      admin && api.HAY_SERVIDOR && !u.local
        ? h('div.stack', null,
            fila('cloud', 'Comprobar la salida a internet',
              'Si el hosting puede llamar a servicios de fuera', (e) => probarSalida(e)),
            // La clave de Anthropic: se pega una vez y se queda en el
            // servidor, en la misma carpeta cerrada que la base de datos.
            fila('key', 'Clave de Anthropic',
              claude?.puesta ? `Puesta · termina en ${claude.final}` : 'Sin poner · el recorrido no redacta solo',
              () => hojaClave(claude)))
        : null,

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

/**
 * Comprueba, desde el móvil, si el hosting puede salir a internet por
 * su cuenta. El resultado se escribe en la propia fila en vez de en un
 * aviso que se va: es un dato que hay que poder leer con calma y, si
 * dice que no, copiar tal cual en el correo al hosting.
 */
async function probarSalida(evento) {
  const boton = evento.currentTarget;
  const sub = boton.querySelector('.row-sub');
  sub.classList.add('libre');
  sub.textContent = 'Probando…';
  boton.disabled = true;
  try {
    const r = await api.salidaAInternet();
    sub.textContent = r.puede
      ? `${r.motivo} (${r.ms} ms)`
      : `${r.motivo} — ${r.detalle || ''}`.trim();
    boton.classList.toggle('danger', !r.puede);
  } catch (e) {
    sub.textContent = e?.status === 404
      ? 'El servidor todavía no tiene esta comprobación instalada.'
      : 'No se ha podido preguntar al servidor.';
    boton.classList.add('danger');
  } finally {
    boton.disabled = false;
  }
}

/**
 * La clave de Anthropic. Se pega aquí una vez, desde el móvil, y se
 * queda en el servidor —en api/datos/, la carpeta que el navegador
 * tiene prohibida, junto a la base de datos—. No vuelve nunca: de ahí
 * en adelante lo único que se ve son sus cuatro últimos caracteres.
 *
 * Se pide aquí y no en un fichero del hosting porque el fichero habría
 * que editarlo por FTP, y esto se hace desde el teléfono en veinte
 * segundos y se puede deshacer igual de rápido.
 */
function hojaClave(estado) {
  return sheet((cerrar) => {
    const campo = h('input.input', {
      type: 'password', placeholder: 'sk-ant-…',
      autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false',
    });
    const aviso = h('p.hint.err', { style: { display: 'none' } });
    const guardar = ctaAccion('GUARDAR LA CLAVE', { icono: 'check' });

    const fallo = (texto) => {
      aviso.textContent = texto;
      aviso.style.display = 'block';
      guardar.disabled = false;
      guardar.querySelector('.grow').textContent = 'GUARDAR LA CLAVE';
    };

    guardar.addEventListener('click', async () => {
      aviso.style.display = 'none';
      const clave = campo.value.trim();
      if (!clave) return fallo('No has pegado nada.');
      guardar.disabled = true;
      guardar.querySelector('.grow').textContent = 'GUARDANDO…';
      try {
        await api.claudePonerClave(clave);
        cerrar(true);
        toast('Clave guardada · el recorrido ya puede redactar solo');
        refrescar();
      } catch (e) {
        fallo(e?.message || 'No se ha podido guardar.');
      }
    });

    return [
      h('h2.title', null, 'Clave de Anthropic'),
      h('p.sub', { style: { marginTop: '6px' } },
        'Con ella, al terminar un recorrido las tareas salen escritas a partir '
        + 'de lo que dijiste, y tú solo repasas. Se guarda en el servidor y no '
        + 'vuelve a salir de ahí.'),
      estado?.puesta
        ? h('p.hint', { style: { marginTop: '10px' } },
            `Ahora hay una puesta que termina en ${estado.final}. Si pegas otra, la sustituye.`)
        : null,
      h('div.stack', { style: { marginTop: '14px' } }, campo),
      aviso,
      h('p.hint', { style: { marginTop: '10px' } },
        `Modelo: ${estado?.modelo || 'claude-opus-5'}. Cada recorrido cuesta unos céntimos.`),
      guardar,
      estado?.puesta
        ? h('button.btn.ghost.full', {
            style: { marginTop: '8px' },
            onclick: async () => {
              await api.claudeQuitarClave();
              cerrar(true);
              toast('Clave retirada');
              refrescar();
            },
          }, 'Quitar la clave del servidor')
        : null,
      ctaCancelar(() => cerrar(false)),
    ];
  });
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

/* ─── Datos de ejemplo ────────────────────────────────────────── */
async function montarEjemplos() {
  const p = PROMOCIONES.find((x) => x.activa);
  if (!p) return toast('No hay ninguna promoción activa', 'err');

  const seguir = await confirmSheet({
    title: '¿Crear actas de ejemplo?',
    text: 'Se montan tres actas en viviendas que no tengan nada, firmadas por '
      + 'gente del equipo, para ver cómo queda la app con varias personas. '
      + 'Se llaman «Ejemplo · …» y se pueden quitar desde aquí mismo.',
    ok: 'Crear',
  });
  if (!seguir) return;

  try {
    const { actas, tareas } = await ejemplos.crear(p.id);
    toast(`${actas} actas y ${tareas} tareas de ejemplo`);
    refrescar();
  } catch (e) {
    toast(e.message || 'No se pudieron crear', 'err');
  }
}

async function quitarEjemplos() {
  const seguir = await confirmSheet({
    title: '¿Quitar las actas de ejemplo?',
    text: 'Solo se retiran las que empiezan por «Ejemplo · ». El repaso real no se toca.',
    ok: 'Quitar', danger: true,
  });
  if (!seguir) return;
  const n = await ejemplos.borrar();
  toast(n ? `${n} ${n === 1 ? 'acta retirada' : 'actas retiradas'}` : 'No había ninguna');
  refrescar();
}
