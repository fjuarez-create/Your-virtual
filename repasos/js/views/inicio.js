/* Primera bolita: el panel de la promoción.

   Tres banners, la barra de avance y, debajo, las últimas tareas
   tocadas. No las últimas actas: lo que dice si la obra se mueve es el
   trabajo, y el acta es solo la carpeta donde estaba. */
import { h, icon } from '../ui.js';
import * as store from '../store.js';
import { PROMOCIONES, unidad, puedeVerificar } from '../catalog.js';
import { barraSync, avisoLocal, cabeceraTab, barraAvance, tareaFila, chevron } from '../piezas.js';
import { ultimaMirada, anotarMirada } from '../ajustesLocales.js';
import { ir, conFiltros } from '../app.js';

/**
 * El titular cambia según el día. Lunes y viernes tienen el suyo; el
 * resto de la semana comparte uno.
 *
 * El jefe de obra ve siempre el mismo, y no es un descuido del diseño:
 * a él la frase no le informa de nada —su trabajo es el mismo el lunes
 * que el jueves— y una que cambia sola acaba leyéndose como ruido.
 */
function titular(usuario) {
  if (!puedeVerificar(usuario)) return 'A por los repasos pendientes! 💪🏼';
  const dia = new Date().getDay();
  if (dia === 1) return 'Lunes. A ver qué nos ha dejado la obra 👀';
  if (dia === 5) return 'Viernes. A cerrar lo que se pueda 🏁';
  return 'A por los repasos pendientes! 💪🏼';
}

/**
 * Un banner de la portada: un rótulo, una cifra grande y adónde lleva.
 *
 * Los dos de abajo —verificadas y rechazadas— acumulan desde la última
 * vez que se pincharon. Al pinchar se anota la mirada y se entra al
 * listado filtrado por ese estado, así que la cifra vuelve a cero sola
 * la próxima vez que se pinta. El de arriba no acumula: enseña cuántas
 * hay ahora esperando revisión, que es un total, no una novedad.
 */
function banner({ clase, rotulo, cifra, sub, adonde, alPinchar }) {
  return h('button.banner', { class: clase, onclick: () => { alPinchar?.(); ir(adonde); } },
    h('div.grow', null,
      h('p.banner-rotulo', null, rotulo),
      sub ? h('p.banner-sub', null, sub) : null,
    ),
    h('span.banner-cifra.mono-num', null, String(cifra)),
    chevron(),
  );
}

export async function render() {
  const activas = PROMOCIONES.filter((p) => p.activa);
  const p = activas[0] || null;
  if (!p) {
    return { tab: 'inicio', contenido: [...cabeceraTab('UNIK'),
      h('p.sub', null, 'No hay ninguna promoción activa.')] };
  }

  const yo = store.sesion();
  const c = await store.resumenPromocion(p.id);
  const recientes = await store.tareasRecientes(12, { promoId: p.id });
  const nActas = await store.cuantasActas(p.id);

  const desdeVerificadas = ultimaMirada(yo, 'verificadas');
  const desdeRechazadas = ultimaMirada(yo, 'rechazadas');
  const nuevasVerificadas = await store.cuantasDesde('verificada', desdeVerificadas, { promoId: p.id });
  const nuevasRechazadas = await store.cuantasDesde('rechazada', desdeRechazadas, { promoId: p.id });

  // Aquí no hay botón de crear: esta pantalla es para mirar, y crear
  // empieza eligiendo vivienda, que es la tercera bolita.
  return {
    tab: 'inicio',
    contenido: [
      ...cabeceraTab(p.nombre.toUpperCase()),
      h('p.titular', null, titular(yo)),
      avisoLocal() || barraSync(),

      h('div.stack', { style: { gap: '10px', marginTop: '4px' } },
        c.esperando ? banner({
          clase: 'beige',
          rotulo: 'Pendiente de revisión por la DF',
          sub: c.esperando === 1 ? 'una tarea completada esperando' : `${c.esperando} tareas completadas esperando`,
          cifra: c.esperando,
          adonde: conFiltros('#/viviendas', { estado: 'resuelta' }),
        }) : null,

        nuevasVerificadas ? banner({
          clase: 'verde',
          rotulo: 'Tareas revisadas por la DF',
          sub: 'desde la última vez que miraste',
          cifra: nuevasVerificadas,
          adonde: conFiltros('#/viviendas', { estado: 'verificada' }),
          alPinchar: () => anotarMirada(yo, 'verificadas'),
        }) : null,

        nuevasRechazadas ? banner({
          clase: 'rojo',
          rotulo: 'Tareas rechazadas',
          sub: 'hay que subsanarlas y volver a completarlas',
          cifra: nuevasRechazadas,
          adonde: conFiltros('#/viviendas', { estado: 'rechazada' }),
          alPinchar: () => anotarMirada(yo, 'rechazadas'),
        }) : null,
      ),

      c.total ? barraAvance(c) : null,

      // El archivo de actas. Vive aquí y no en la barra de abajo porque
      // es una consulta de despacho: se viene cuando hace falta el
      // documento firmado, no cada vez que se abre la app.
      nActas ? h('button.row', { onclick: () => ir('#/listas') },
        h('div.row-lead', null, icon('clipboard', 18)),
        h('div.grow', null,
          h('div.row-title', null, 'Todas las actas'),
          h('div.row-sub', null, `${nActas} ${nActas === 1 ? 'acta firmada' : 'actas firmadas'}`),
        ),
        chevron(),
      ) : null,

      recientes.length
        ? h('div', { style: { marginTop: '22px' } },
            h('p.eyebrow', null, 'Actividad reciente'),
            h('div.stack', { style: { marginTop: '10px', gap: '8px' } },
              recientes.map(({ tarea, unidadId, portada }) =>
                tareaFila(tarea, { portada, donde: unidad(unidadId)?.nombre }))),
          )
        : h('div.vacio-suave', null,
            h('p.sub.center', null, 'Todavía no hay tareas. Entra en Viviendas y crea la primera lista de repaso.')),
    ],
  };
}
