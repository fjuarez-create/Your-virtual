/* ═══════════════════════════════════════════════════════════════
   piezas.js — componentes compartidos entre pantallas: cabecera con
   botón de volver, cinta de sincronización y fila de lista de repaso.
   ═══════════════════════════════════════════════════════════════ */
import {
  h, icon, sheet, toast, confirmSheet, avatar, grupoAvatares, anillo,
  fechaCorta, fechaRelativa, hora,
} from './ui.js';
import * as media from './media.js';
import * as store from './store.js';
import * as api from './api.js';
import { unidad, fase, oficio, OFICIOS } from './catalog.js';
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

/**
 * Etiqueta de fase. Pre-entrega en gris, porque es lo corriente;
 * post-entrega en el color de marca, porque es lo que hay que mirar
 * primero: la vivienda ya está entregada y el cliente está dentro.
 */
export function chipFase(faseId) {
  const f = fase(faseId);
  return h('span.chip-fase' + (faseId === 'post' ? '.post' : ''), null, f.corto.toUpperCase());
}

/**
 * Tarjeta de un acta. Es la misma en la portada y en la pestaña de
 * actas: quién ha participado, de qué vivienda es, cuándo se hizo, si
 * es pre o post, y cuánto lleva verificado.
 */
export function tarjetaActa({ lista, conteo, gente }) {
  const u = unidad(lista.unidadId);
  const titulo = lista.nombre || u?.nombre || lista.unidadId;

  return h('button.acta', { onclick: () => ir('#/l/' + lista.id) },
    grupoAvatares(gente, { tam: 38 }),
    h('div.grow', null,
      h('div.acta-tit', null, titulo),
      h('div.acta-pie', null,
        h('span', null, fechaRelativa(lista.creado)),
        chipFase(lista.fase),
      ),
    ),
    anillo(store.avance(conteo), { tam: 46 }),
  );
}

/**
 * Chips de estado. Mismos tres en actas y en viviendas, y con el mismo
 * significado: terminada = todo verificado.
 */
export function filtroEstado(alCambiar, inicial = 'todas') {
  let activo = inicial;
  const chips = h('div.chips.filtro', null,
    ...[['todas', 'Todas'], ['pendientes', 'Pendientes'], ['terminadas', 'Terminadas']].map(([id, txt]) =>
      h('button.chip.accent', {
        'aria-pressed': id === activo ? 'true' : 'false',
        onclick: (e) => {
          if (activo === id) return;
          activo = id;
          [...chips.children].forEach((c) => c.setAttribute('aria-pressed', c === e.currentTarget ? 'true' : 'false'));
          alCambiar(activo);
        },
      }, txt)),
  );
  return chips;
}

/** Selector de oficio. Abre una hoja con los doce a dos columnas. */
export function filtroOficio(alCambiar, inicial = 'todos') {
  let activo = inicial;
  const texto = h('span.grow', null, 'Todos los oficios');

  const boton = h('button.selector', {
    onclick: async () => {
      const elegido = await hojaOficios(activo, { conTodos: true });
      if (elegido === null || elegido === activo) return;
      activo = elegido;
      texto.textContent = activo === 'todos' ? 'Todos los oficios' : oficio(activo).nombre;
      boton.classList.toggle('puesto', activo !== 'todos');
      alCambiar(activo);
    },
  }, texto, icon('chevron', 16));

  return boton;
}

/**
 * Hoja de oficios. `conTodos` añade la opción de no filtrar; al crear
 * una tarea no aparece, porque ahí elegir uno es obligatorio.
 */
export function hojaOficios(actual, { conTodos = false, titulo = 'Oficio' } = {}) {
  return sheet((cerrar) => [
    h('h2.title', null, titulo),
    h('div.rejilla-oficios', null,
      conTodos ? h('button.oficio' + (actual === 'todos' ? '.on' : ''), {
        onclick: () => cerrar('todos'),
      }, 'Todos los oficios') : null,
      ...OFICIOS.map((o) => h('button.oficio' + (actual === o.id ? '.on' : ''), {
        onclick: () => cerrar(o.id),
      }, o.corto)),
    ),
    h('button.btn.ghost.full', { onclick: () => cerrar(null) }, 'Cancelar'),
  ]);
}

/** Flecha «>» del final de las píldoras. */
export function chevron() {
  const svg = icon('chevron');
  svg.classList.add('chev');
  return svg;
}
