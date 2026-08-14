/* ═══════════════════════════════════════════════════════════════
   piezas.js — componentes compartidos entre pantallas: cabecera con
   botón de volver, cinta de sincronización y fila de lista de repaso.
   ═══════════════════════════════════════════════════════════════ */
import { h, icon, sheet, toast, confirmSheet, avatar, fechaCorta, hora } from './ui.js';
import * as media from './media.js';
import * as store from './store.js';
import * as api from './api.js';
import { unidad, fase } from './catalog.js';
import { ir } from './app.js';

/** Cabecera con flecha de volver, título, subtítulo y acciones. */
export function cabecera(titulo, sub, { volverA, acciones = [] } = {}) {
  return h('div.topbar', null,
    volverA && h('button.icon-btn', {
      'aria-label': 'Volver',
      onclick: () => ir(volverA),
    }, icon('arrowLeft')),
    h('div.grow', null,
      h('h1', null, titulo),
      sub && h('div.sub', null, sub),
    ),
    ...acciones,
  );
}

/** Cinta de estado: conexión y cambios pendientes de subir. */
export function barraSync() {
  const led = h('span.led');
  const texto = h('span.grow');
  const boton = h('button', {
    'aria-label': 'Sincronizar ahora',
    style: { display: 'flex', color: 'inherit' },
    onclick: () => store.sincronizar({ forzar: true }),
  }, icon('refresh', 16));
  const barra = h('div.syncbar', null, led, texto, boton);

  const pintar = (e) => {
    barra.className = 'syncbar ' + (
      !e.online ? 'offline' : e.pendientes > 0 || e.sincronizando ? 'pending' : 'online'
    );
    if (!e.online) {
      texto.textContent = e.pendientes
        ? `Sin conexión · ${e.pendientes} ${e.pendientes === 1 ? 'cambio' : 'cambios'} en espera`
        : 'Sin conexión · se guarda en el dispositivo';
    } else if (e.sincronizando) {
      texto.textContent = 'Sincronizando…';
    } else if (e.error === 'sesion') {
      texto.textContent = 'Sesión caducada · vuelve a entrar';
    } else if (e.error) {
      texto.textContent = `No se pudo sincronizar · ${e.pendientes} en espera`;
    } else if (e.pendientes > 0) {
      texto.textContent = `Subiendo ${e.pendientes} ${e.pendientes === 1 ? 'cambio' : 'cambios'}…`;
    } else {
      texto.textContent = e.ultimo ? `Todo sincronizado · ${hora(e.ultimo)}` : 'Todo sincronizado';
    }
    boton.style.display = e.online && !e.sincronizando ? 'flex' : 'none';
  };

  pintar(store.estadoSync);
  const quitar = store.alCambiarSync(pintar);
  // Cuando la cinta sale del documento deja de escuchar.
  new MutationObserver((_, obs) => {
    if (!barra.isConnected) { quitar(); obs.disconnect(); }
  }).observe(document.getElementById('app'), { childList: true, subtree: true });

  return barra;
}

/** Aviso de modo local, para que nadie crea que sus repasos viajan. */
export function avisoLocal() {
  if (api.HAY_SERVIDOR && !store.sesion()?.local) return null;
  return h('div.syncbar', null,
    h('span.led'),
    h('span.grow', null, 'Modo local · los datos no salen de este dispositivo'),
  );
}

/** Fila de una lista de repaso. `conteo` = { total, pendientes }. */
export function filaLista(lista, conteo, { mostrarVivienda = false } = {}) {
  const u = unidad(lista.unidadId);
  const f = fase(lista.fase);
  const titulo = mostrarVivienda
    ? `${u?.nombre || lista.unidadId} · ${fechaCorta(lista.creado)}`
    : `Inspección ${fechaCorta(lista.creado)}`;

  const partes = [f.nombre, lista.creadoPorNombre];
  if (conteo) {
    partes.push(conteo.total === 0
      ? 'sin tareas'
      : conteo.pendientes > 0
        ? `${conteo.pendientes} de ${conteo.total} pendientes`
        : `${conteo.total} ${conteo.total === 1 ? 'tarea resuelta' : 'tareas resueltas'}`);
  }

  return h('button.row', { onclick: () => ir('#/l/' + lista.id) },
    h('div.row-lead', {
      style: conteo && conteo.pendientes > 0
        ? { background: 'var(--accent)', color: 'var(--on-accent)' }
        : { background: 'var(--bg)' },
    }, conteo ? String(conteo.pendientes || conteo.total) : icon('clipboard', 18)),
    h('div.grow', null,
      h('div.row-title', null, titulo),
      h('div.row-sub', null, partes.join(' · ')),
    ),
    lista.cerrada ? h('span.tag.ok', null, 'Cerrada') : null,
    chevron(),
  );
}

/**
 * Foto de perfil: ponerla, cambiarla o quitarla. Quien administra puede
 * hacerlo sobre cualquiera; el resto, solo sobre sí mismo (y el servidor
 * lo comprueba igualmente).
 */
export function hojaFoto(u) {
  return sheet((cerrar) => {
    const previa = avatar(u, { tam: 92 });

    const poner = async (origen) => {
      const ficheros = origen === 'camara' ? await media.hacerFoto() : await media.elegirFotos();
      if (!ficheros.length) return;
      toast('Preparando la foto…');
      try {
        const blob = await media.prepararAvatar(ficheros[0]);
        await api.subirAvatar(u.id, blob);
        cerrar('puesta');
        toast('Foto actualizada');
      } catch (e) {
        toast(e.status === 403 ? 'No puedes cambiar esta foto' : 'No se pudo subir la foto', 'err');
      }
    };

    return [
      h('h2.title', null, u.nombre),
      h('div', { style: { display: 'flex', justifyContent: 'center', padding: '8px 0 4px' } }, previa),
      h('div.stack', null,
        h('button.row', { onclick: () => poner('camara') },
          h('div.row-lead', null, icon('camera', 18)),
          h('div.grow', null, h('div.row-title', null, 'Hacer una foto')),
        ),
        h('button.row', { onclick: () => poner('galeria') },
          h('div.row-lead', null, icon('image', 18)),
          h('div.grow', null, h('div.row-title', null, 'Elegir de la galería')),
        ),
        u.avatar ? h('button.row.danger', {
          onclick: async () => {
            if (!await confirmSheet({ title: '¿Quitar la foto?', text: 'Volverán a verse las iniciales.', ok: 'Quitar', danger: true })) return;
            try {
              await api.borrarAvatar(u.id);
              cerrar('quitada');
              toast('Foto quitada');
            } catch { toast('No se pudo quitar', 'err'); }
          },
        },
          h('div.row-lead', null, icon('trash', 18)),
          h('div.grow', null, h('div.row-title', null, 'Quitar la foto')),
        ) : null,
      ),
      h('p.hint', null, 'Se recorta cuadrada y se reduce a 512 px antes de subirla.'),
      h('button.btn.ghost.full', { onclick: () => cerrar(null) }, 'Cerrar'),
    ];
  });
}

/** Flecha «>» del final de las píldoras. */
export function chevron() {
  const svg = icon('chevron');
  svg.classList.add('chev');
  return svg;
}
