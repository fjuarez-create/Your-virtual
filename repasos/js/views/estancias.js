/* El editor de estancias. Solo lo ve el administrador: la lista que
   antes vivía escrita en el código —planta baja, planta alta, otros—
   aquí se puede cambiar sin tocar nada más. Cada cambio se guarda en el
   servidor al momento y llega a los demás móviles en su siguiente
   arranque.

   OJO: lo que guarda cada tarea es el TEXTO de su estancia, no un
   identificador. Renombrar o quitar una estancia no toca las tareas ya
   escritas: conservan su texto y se siguen leyendo bien; solo dejan de
   poder filtrarse por ella. Está contado también en catalog.js. */
import { h, icon, sheet, toast, confirmSheet } from '../ui.js';
import * as api from '../api.js';
import * as store from '../store.js';
import { PLANTAS, fijarPlantas } from '../catalog.js';
import { cabeceraClasica, ICONO_DE_ESTANCIA } from '../piezas.js';
import { ir, refrescar } from '../app.js';

export async function render() {
  if (!store.esAdmin()) { ir('#/ajustes', { reemplazar: true }); return { contenido: [] }; }

  let plantas = null;   // null = se está con la lista de fábrica
  let error = null;
  try {
    const r = await api.leerZonas();
    plantas = r.plantas;
  } catch (e) {
    error = e.codigo === 'red' ? 'Sin conexión con el servidor. Para editar las estancias hace falta cobertura.' : e.message;
  }
  const deFabrica = !error && plantas === null;
  // Se trabaja siempre sobre una copia: la primera edición sobre la
  // lista de fábrica manda la lista entera al servidor.
  const lienzo = copia(plantas || PLANTAS);

  return {
    sinTabs: true,
    fab: error ? null : h('button.fab', { onclick: () => nuevaPlanta(lienzo) }, icon('plus'), 'Nueva planta'),
    contenido: [
      cabeceraClasica('Estancias', 'Las que ofrece la app al crear repasos', { volverA: '#/ajustes' }),
      h('h1.display', { style: { marginTop: '10px' } }, 'Estancias'),

      error
        ? h('div.row', null,
            h('div.row-lead', null, icon('alert', 18)),
            h('div.grow', null,
              h('div.row-title', null, 'No se pudo cargar'),
              h('div.row-sub', { style: { whiteSpace: 'normal' } }, error),
            ),
          )
        : null,
      // Desplegados uno a uno: el pintor no aplana listas anidadas.
      ...(error ? [] : lienzo.map((p, i) => bloquePlanta(lienzo, p, i))),

      error ? null : h('p.hint', { style: { marginTop: '18px', whiteSpace: 'normal' } },
        (deFabrica ? 'Ahora mismo se usa la lista de fábrica. ' : '') +
        'El orden de aquí es el del selector y el del PDF. Los repasos ya escritos conservan su estancia aunque se renombre o se quite de la lista.'),

      error || deFabrica ? null : h('button.btn.ghost.full', {
        style: { marginTop: '10px' },
        onclick: async () => {
          if (!await confirmSheet({
            title: '¿Volver a la lista de fábrica?',
            text: 'Se pierde la lista editada. Los repasos ya escritos no se tocan.',
            ok: 'Volver a la de fábrica',
          })) return;
          await guardar(null);
        },
      }, 'Volver a la lista de fábrica'),
    ],
  };
}

/* ─── Un bloque por planta ────────────────────────────────────── */
function bloquePlanta(lienzo, p, i) {
  return h('div', { style: { marginTop: i ? '18px' : '0' } },
    h('div.row', null,
      h('div.grow', null,
        h('p.eyebrow', null, p.nombre),
      ),
      h('button.icon-btn', {
        'aria-label': `Renombrar ${p.nombre}`,
        onclick: async () => {
          const nombre = await pedirTexto('Nombre de la planta', p.nombre);
          if (!nombre || nombre === p.nombre) return;
          const nuevas = copia(lienzo);
          nuevas[i].nombre = nombre;
          await guardar(nuevas);
        },
      }, icon('edit', 18)),
      h('button.icon-btn', {
        'aria-label': `Borrar ${p.nombre}`,
        onclick: async () => {
          if (lienzo.length === 1) { toast('Tiene que quedar al menos una planta', 'err'); return; }
          if (!await confirmSheet({
            title: `¿Borrar «${p.nombre}»?`,
            text: p.zonas.length
              ? `Se van también sus ${p.zonas.length} estancias. Los repasos ya escritos no se tocan.`
              : 'La planta está vacía.',
            ok: 'Borrar', danger: true,
          })) return;
          const nuevas = copia(lienzo);
          nuevas.splice(i, 1);
          if (!nuevas.some((x) => x.zonas.length)) { toast('Tiene que quedar al menos una estancia', 'err'); return; }
          await guardar(nuevas);
        },
      }, icon('trash', 18)),
    ),

    h('div.stack', null,
      p.zonas.map((z, j) => filaZona(lienzo, i, z, j)),
      h('button.row', {
        onclick: async () => {
          const nombre = await pedirTexto('Estancia nueva en ' + p.nombre, '');
          if (!nombre) return;
          if (repetida(lienzo, nombre)) { toast(`«${nombre}» ya está en la lista`, 'err'); return; }
          const nuevas = copia(lienzo);
          nuevas[i].zonas.push(nombre);
          await guardar(nuevas);
        },
      },
        h('div.row-lead', null, icon('plus', 18)),
        h('div.grow', null, h('div.row-title', null, 'Añadir estancia')),
      ),
    ),
  );
}

function filaZona(lienzo, i, z, j) {
  return h('div.row', null,
    h('div.row-lead', null, icon(ICONO_DE_ESTANCIA[z] || 'casa', 18)),
    h('div.grow', null, h('div.row-title', null, z)),
    h('button.icon-btn', {
      'aria-label': `Renombrar ${z}`,
      onclick: async () => {
        const nombre = await pedirTexto('Nombre de la estancia', z);
        if (!nombre || nombre === z) return;
        if (repetida(lienzo, nombre)) { toast(`«${nombre}» ya está en la lista`, 'err'); return; }
        const nuevas = copia(lienzo);
        nuevas[i].zonas[j] = nombre;
        await guardar(nuevas);
      },
    }, icon('edit', 18)),
    h('button.icon-btn', {
      'aria-label': `Borrar ${z}`,
      onclick: async () => {
        if (cuenta(lienzo) === 1) { toast('Tiene que quedar al menos una estancia', 'err'); return; }
        if (!await confirmSheet({
          title: `¿Quitar «${z}»?`,
          text: 'Los repasos que ya la llevan conservan su texto.',
          ok: 'Quitar', danger: true,
        })) return;
        const nuevas = copia(lienzo);
        nuevas[i].zonas.splice(j, 1);
        await guardar(nuevas);
      },
    }, icon('trash', 18)),
  );
}

function nuevaPlanta(lienzo) {
  return (async () => {
    const nombre = await pedirTexto('Nombre de la planta nueva', '');
    if (!nombre) return;
    const nuevas = copia(lienzo);
    nuevas.push({ nombre, zonas: [] });
    await guardar(nuevas);
  })();
}

/* ─── Guardar: al servidor, al almacén local y a la pantalla ──── */
async function guardar(plantas) {
  try {
    const r = await api.guardarZonas(plantas);
    fijarPlantas(r.plantas);
    await store.guardarZonasLocales(r.plantas);
    refrescar();
  } catch (e) {
    toast(e.codigo === 'red' ? 'Sin conexión: no se ha guardado' : e.message, 'err');
  }
}

/* ─── Menudencias ─────────────────────────────────────────────── */
const copia = (plantas) => plantas.map((p) => ({ nombre: p.nombre, zonas: [...p.zonas] }));
const cuenta = (plantas) => plantas.reduce((n, p) => n + p.zonas.length, 0);
const llano = (t) => String(t).trim().toLowerCase();
const repetida = (plantas, nombre) => plantas.some((p) => p.zonas.some((z) => llano(z) === llano(nombre)));

function pedirTexto(titulo, valor) {
  return sheet((cerrar) => {
    const caja = h('input.input', { type: 'text', value: valor, maxlength: 40, autocomplete: 'off' });
    const listo = () => {
      const texto = caja.value.trim();
      if (!texto) return;
      cerrar(texto);
    };
    caja.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') listo(); });
    setTimeout(() => caja.focus(), 60);
    return [
      h('h2.title', null, titulo),
      caja,
      h('button.btn.accent.full', { style: { marginTop: '14px' }, onclick: listo }, 'Guardar'),
      h('button.btn.ghost.full', { onclick: () => cerrar(null) }, 'Cancelar'),
    ];
  });
}
