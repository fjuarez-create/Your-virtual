/* ═══════════════════════════════════════════════════════════════
   informe.js — informe imprimible de una lista de repaso.

   Es lo que se le pasa al jefe de obra o a la constructora: cabecera
   con promoción, vivienda, fecha y firma, y después una ficha por
   tarea con su foto y su texto. Se monta fuera de #app para que la hoja
   de estilos de impresión pueda esconder la app entera y dejar solo el
   informe; desde ahí, «Guardar como PDF» del propio navegador.
   ═══════════════════════════════════════════════════════════════ */
import { h, icon, fechaLarga, hora, toast } from './ui.js';
import * as store from './store.js';
import { unidad, promocion, estado, enObra } from './catalog.js';

export async function informe(lista, { abrirImpresion = false } = {}) {
  const tareas = await store.tareasDeLista(lista.id);
  if (!tareas.length) { toast('La lista no tiene tareas que listar', 'err'); return; }

  const u = unidad(lista.unidadId);
  const p = promocion(lista.promoId);

  // Las rechazadas cuentan aquí: para quien lee el informe son trabajo
  // por hacer igual que una pendiente, no un caso aparte.
  const pendientes = tareas.filter(enObra).length;

  const fichas = [];
  for (let i = 0; i < tareas.length; i++) {
    const t = tareas[i];
    const url = await store.urlDePortada(t);
    const e = estado(t.estado);
    const medios = await store.mediosDeTarea(t.id);
    const extras = [];
    if (medios.filter((m) => m.tipo === 'imagen').length > 1) {
      extras.push(`${medios.filter((m) => m.tipo === 'imagen').length} fotos`);
    }
    if (medios.some((m) => m.tipo === 'video')) extras.push('vídeo');
    if (medios.some((m) => m.tipo === 'audio')) extras.push('nota de voz');

    fichas.push(h('article.inf-item', null,
      h('div.inf-foto', null,
        url ? h('img', { src: url, alt: '' }) : h('span', null, 'Sin foto'),
      ),
      h('div.inf-txt', null,
        h('div.inf-num', null, `${i + 1}. `, h('span', { class: 'inf-estado ' + t.estado }, e.nombre)),
        h('p', null, t.texto || 'Sin descripción.'),
        extras.length ? h('p.inf-extras', null, 'Material adicional: ' + extras.join(', ') + '.') : null,
        t.estado !== 'pendiente' && t.estadoPor
          ? h('p.inf-extras', null, `${e.nombre} por ${t.estadoPor}.`)
          : null,
      ),
    ));
  }

  const doc = h('div.informe', null,
    h('div.inf-barra', null,
      h('button.btn.ghost', { onclick: cerrar }, icon('x'), 'Cerrar'),
      h('button.btn.accent', { onclick: () => window.print() }, icon('download'), 'Imprimir o guardar PDF'),
    ),
    h('div.inf-hoja', null,
      h('header.inf-cab', null,
        h('div', null,
          h('p.inf-marca', null, 'UNIK repasos'),
          h('h1', null, `${u?.nombre || lista.unidadId}`),
          h('p.inf-sub', null, `${p?.nombre || lista.promoId} · ${f.nombre}`),
        ),
        h('div.inf-meta', null,
          h('p', null, h('b', null, 'Inspección: '), `${fechaLarga(lista.creado)} · ${hora(lista.creado)}`),
          h('p', null, h('b', null, 'Realizada por: '), lista.creadoPorNombre),
          h('p', null, h('b', null, 'Tareas: '), `${tareas.length} (${pendientes} pendientes)`),
          h('p', null, h('b', null, 'Emitido: '), `${fechaLarga(new Date().toISOString())}`),
        ),
      ),
      ...fichas,
      h('footer.inf-pie', null,
        'Documento generado desde UNIK repasos. Las fotografías corresponden al estado de la vivienda en la fecha de la inspección.'),
    ),
  );

  document.body.append(doc);
  document.documentElement.classList.add('imprimiendo');
  if (abrirImpresion) setTimeout(() => window.print(), 400);

  function cerrar() {
    doc.remove();
    document.documentElement.classList.remove('imprimiendo');
  }
}
