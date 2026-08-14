/* Portada. Dos widgets con el pulso de la obra, el acceso a crear un
   acta y las últimas tocadas.

   Los dos widgets miden lo mismo con criterios distintos: el de la
   izquierda, el ritmo (cuánto se verifica cada día); el de la derecha,
   el acumulado. Uno dice si hoy se ha trabajado, el otro cuánto queda. */
import { h, icon, avatar, anillo, logoUnik } from '../ui.js';
import * as store from '../store.js';
import { puedeVerificar } from '../catalog.js';
import { barraSync, avisoLocal, tarjetaActa } from '../piezas.js';
import { ir } from '../app.js';

export async function render() {
  const u = store.sesion();
  const resumen = await store.resumenGeneral();
  const semana = await store.verificadasPorDia(7);
  const recientes = await store.listasRecientes(15);

  const cta = h('button.cta-negro', { onclick: () => ir('#/viviendas') },
    h('span.grow', null, 'NUEVA LISTA DE REPASOS'),
    h('span.cta-mas', null, icon('plus', 18)),
  );

  // El botón flotante es el mismo botón cuando el de arriba se va de
  // la pantalla: nunca están los dos a la vez, así que no hay dos
  // formas de hacer lo mismo compitiendo por la atención.
  const fab = h('button.fab-bola', {
    'aria-label': 'Nueva lista de repasos',
    onclick: () => ir('#/viviendas'),
  }, icon('plus', 22));
  vigilar(cta, fab);

  return {
    tab: 'inicio',
    fab,
    contenido: [
      h('div.topbar', null,
        h('div.grow', null, logoUnik({ alto: 20 })),
        avatar(u, { onclick: () => ir('#/ajustes') }),
      ),

      avisoLocal() || barraSync(),

      h('div.widgets', null, widgetSemana(semana), widgetAvance(resumen, puedeVerificar(u))),

      cta,

      recientes.length
        ? h('div.stack.actas', { style: { marginTop: '18px' } },
            recientes.map((a) => tarjetaActa(a)))
        : h('div.vacio-suave', null,
            h('p.sub.center', null, 'Todavía no hay actas. Crea la primera con el botón de arriba.')),
    ],
  };
}

/** Barras de verificaciones por día. */
function widgetSemana({ dias, hoy, media, tope }) {
  return h('div.widget', null,
    h('p.widget-tit', null, 'Verificadas por día'),
    h('div.barras', null,
      ...dias.map((d, i) => h('div.barra' + (d.hoy ? '.hoy' : ''), {
        title: `${d.n} el ${d.inicial}`,
      },
        h('div.barra-caja', null,
          h('i', {
            // Altura mínima visible aunque el día esté a cero: una
            // columna que desaparece se lee como «no hubo día».
            style: {
              height: Math.max(3, Math.round((d.n / tope) * 100)) + '%',
              transitionDelay: (i * 40) + 'ms',
            },
          }),
        ),
        h('span.barra-dia', null, d.inicial),
      )),
    ),
    h('div.widget-pie', null,
      h('div', null, h('b', null, String(hoy)), h('span', null, 'Hoy')),
      h('div', null, h('b', null, String(media)), h('span', null, 'Media')),
    ),
  );
}

/** Anillo del avance acumulado. */
function widgetAvance({ total, hechas, esperando }, puedeDarVisto) {
  const pct = total ? Math.round((100 * hechas) / total) : 0;
  return h('div.widget.widget-anillo', null,
    h('p.widget-tit', null, 'Avance'),
    h('div.widget-centro', null, anillo(pct, { tam: 104, grosor: 9 })),
    h('div.widget-pie', null,
      h('div', null, h('b', null, String(total)), h('span', null, 'Total')),
      h('div', null, h('b', null, String(hechas)), h('span', null, 'Verificadas')),
    ),
    // La cola de verificación: el trabajo que la subcontrata ya ha dado
    // por resuelto y espera a que alguien lo compruebe. Sin esta cifra,
    // ese trabajo no aparece por ningún lado.
    // A quien puede verificar se le habla de su cola; a quien no, de lo
    // que está entregado y aún sin comprobar. Es el mismo dato, pero
    // decirle «tu visto bueno» a quien no puede darlo es mentira.
    esperando > 0
      ? h('p.widget-cola', null, puedeDarVisto
          ? `${esperando} ${esperando === 1 ? 'espera' : 'esperan'} tu visto bueno`
          : `${esperando} ${esperando === 1 ? 'resuelta sin verificar' : 'resueltas sin verificar'}`)
      : null,
  );
}

/**
 * Cambia el botón ancho por la bolita cuando aquel sale de pantalla.
 * Con IntersectionObserver y no escuchando el scroll: el navegador
 * avisa solo cuando cruza el borde, en vez de preguntarlo en cada
 * fotograma mientras se arrastra la lista.
 */
function vigilar(cta, fab) {
  fab.classList.add('oculto');
  requestAnimationFrame(() => {
    const raiz = document.getElementById('screen');
    if (!raiz || !window.IntersectionObserver) { fab.classList.remove('oculto'); return; }
    const obs = new IntersectionObserver(([e]) => {
      fab.classList.toggle('oculto', e.isIntersecting);
    }, { root: raiz, threshold: 0 });
    obs.observe(cta);
    new MutationObserver((_, m) => {
      if (!cta.isConnected) { obs.disconnect(); m.disconnect(); }
    }).observe(document.getElementById('app'), { childList: true, subtree: true });
  });
}
