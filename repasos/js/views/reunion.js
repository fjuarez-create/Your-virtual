/* LA REUNIÓN DE UN DÍA — en marcha si es la de hoy, acta si ya pasó.

   De arriba a abajo: quién está en la mesa (los del equipo con su
   cara, los invitados sin cuenta en pastilla), las tareas que salen de
   esta reunión, lo que sigue pendiente de reuniones anteriores para
   repasarlo en voz alta, y el botón de terminar.

   El acta se sella sola a las 23:59 del día, en el servidor. Hasta
   entonces la DF y el administrador pueden añadir y corregir; después,
   lo único que sigue vivo es tachar tareas como hechas, que no cambia
   lo acordado: solo cuenta cómo va cumpliéndose. */
import { h, icon, toast, hora, avatar, sheet } from '../ui.js';
import * as api from '../api.js';
import * as store from '../store.js';
import { puedeVerificar } from '../catalog.js';
import { cabecera, avisoLocal, barraSync } from '../piezas.js';
import { fechaDeActa, diaDeLaSemana } from './historial.js';
import {
  filaEncargo, tacharEncargo, hojaEncargo, avisarDeError,
} from '../piezasObra.js';
import { ir, refrescar } from '../app.js';

export async function render({ reunionId }) {
  let datos = null;
  let error = null;
  try {
    datos = await api.verReunion(reunionId);
  } catch (e) {
    if (e.status === 404) { toast('Reunión desconocida', 'err'); ir('#/obra', { reemplazar: true }); return { contenido: [] }; }
    error = e.codigo === 'red'
      ? 'Las reuniones de obra se llevan en directo con el servidor: hace falta cobertura para verlas.'
      : e.message;
  }

  if (error) {
    return { sinTabs: true, clase: 'pantalla-diseno', contenido: [
      cabecera({ volver: '#/obra', titulo: '' }),
      h('p.d-epigrafe', null, 'Sin conexión'),
      h('p.d-nota-pie', { style: { whiteSpace: 'normal' } }, error),
      h('button.d-fantasma', { style: { marginTop: '14px' }, onclick: () => refrescar() }, 'Volver a intentarlo'),
    ] };
  }

  const { reunion: r, encargos, arrastre } = datos;
  const esHoy = r.fecha === datos.hoy;
  const abierta = !r.sellada;
  const df = puedeVerificar(store.sesion());
  const edita = df && abierta;

  const tachar = async (e) => { if (await tacharEncargo(e)) refrescar(); };
  const abrir = edita
    ? async (e) => { if (await hojaEncargo({ reunionId: r.id, promoId: r.promoId, encargo: e })) refrescar(); }
    : null;

  const contenido = [
    cabecera({ volver: '#/obra', titulo: '' }),
    h('h1.d-saludo', null, esHoy ? 'Reunión de hoy' : `Acta · ${diaDeLaSemana(r.fecha)} ${Number(r.fecha.slice(8, 10))}`),
    h('p.d-nota-pie', { style: { margin: '-4px 6px 0' } },
      `${diaDeLaSemana(r.fecha, { mayuscula: true })}, ${fechaDeActa(r.fecha, { conAno: true })}`
      + ` · empezada a las ${hora(r.empezada)} h`
      + (r.terminada ? ` · terminada a las ${hora(r.terminada)} h` : '')),
    avisoLocal() || barraSync(),

    /* ─── La mesa ─── */
    h('p.d-epigrafe', null, 'En la mesa'),
    h('div.d-mesa', null,
      (r.asistentes || []).map((id) => avatar(store.persona(id), { tam: 44 })),
      (r.invitados || []).map((n) => h('span.d-invitado', null, `${n} (invitado)`)),
      edita
        ? h('button.d-mesa-mas', { onclick: async () => { if (await hojaMesa(r)) refrescar(); } }, '+ Añadir')
        : null,
      !edita && !(r.asistentes || []).length && !(r.invitados || []).length
        ? h('p.d-nota-pie', { style: { margin: '0' } }, 'Sin asistentes apuntados.')
        : null,
    ),

    /* ─── Las tareas de esta reunión ─── */
    h('p.d-epigrafe', null, 'Tareas de esta reunión'),
    encargos.length
      ? h('div', null, encargos.map((e) => filaEncargo(e, { alTachar: tachar, alAbrir: abrir })))
      : h('p.d-nota-pie', null, edita
          ? 'Todavía ninguna. Lo que se acuerde, apúntalo aquí: con responsable y fecha no se pierde.'
          : 'Esta reunión no dejó tareas apuntadas.'),
    edita
      ? h('button.d-fantasma', {
          style: { marginTop: '10px' },
          onclick: async () => { if (await hojaEncargo({ reunionId: r.id, promoId: r.promoId })) refrescar(); },
        }, icon('plus'), 'Apuntar una tarea')
      : null,
  ];

  /* ─── El arrastre ─── */
  if (arrastre.length) {
    contenido.push(
      h('p.d-epigrafe', null, 'Pendiente de reuniones anteriores'),
      h('div', null, arrastre.map((e) => filaEncargo(e, { alTachar: tachar, origen: true }))),
      h('p.d-nota-pie', null, 'Lo que se tache aquí queda tachado también en su acta de origen.'),
    );
  }

  /* ─── Terminar y el sello ─── */
  if (edita && !r.terminada) {
    const terminar = h('button.d-boton-negro', {
      style: { marginTop: '24px' },
      onclick: async () => {
        terminar.disabled = true;
        try {
          await api.editarReunion(r.id, { terminada: true });
          toast('Reunión terminada');
          refrescar();
        } catch (e) { terminar.disabled = false; avisarDeError(e); }
      },
    }, icon('check'), 'Terminar la reunión');
    contenido.push(terminar);
  }
  contenido.push(h('p.d-nota-pie', null, abierta
    ? 'El acta se sella sola a las 23:59: hasta entonces la dirección facultativa y el administrador '
      + 'pueden añadir o corregir, aunque la reunión esté terminada. Tachar lo hecho se puede siempre.'
    : 'Acta sellada: se cerró sola a las 23:59 de ese día. Lo pendiente se arrastra a las reuniones '
      + 'siguientes, y tacharlo como hecho se puede siempre.'));

  return { sinTabs: true, clase: 'pantalla-diseno', contenido };
}

/**
 * La hoja de la mesa: quién del equipo está en la reunión y qué
 * invitados de fuera —gente de la obra sin cuenta en la app— se
 * apuntan a mano. Resuelve a true si se guardó en el servidor.
 */
function hojaMesa(r) {
  return sheet((cerrar) => {
    const dentro = new Set(r.asistentes || []);
    const invitados = [...(r.invitados || [])];

    const listaEquipo = h('div.stack');
    const listaInvitados = h('div.stack');

    const pintar = () => {
      listaEquipo.replaceChildren(...store.equipo().map((p) => h('button.row', {
        onclick: () => { if (dentro.has(p.id)) dentro.delete(p.id); else dentro.add(p.id); pintar(); },
      },
        avatar(p, { tam: 34 }),
        h('div.grow', null, h('div.row-title', null, p.nombre)),
        dentro.has(p.id) ? icon('check', 20) : h('span', { style: { width: '20px' } }),
      )));
      listaInvitados.replaceChildren(
        ...invitados.map((n, i) => h('div.row', null,
          h('div.grow', null, h('div.row-title', null, n)),
          h('button.icon-btn', {
            'aria-label': `Quitar a ${n}`,
            onclick: () => { invitados.splice(i, 1); pintar(); },
          }, icon('x', 18)),
        )),
      );
    };
    pintar();

    const caja = h('input.input', { type: 'text', placeholder: 'Invitado de fuera (nombre y empresa)…', maxlength: 80 });
    const meter = () => {
      const n = caja.value.trim();
      if (!n) return;
      if (!invitados.includes(n)) invitados.push(n);
      caja.value = '';
      pintar();
    };
    caja.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') meter(); });

    const guardar = h('button.d-boton-negro', {
      onclick: async () => {
        meter();   // lo que quede escrito en la caja también cuenta
        guardar.disabled = true;
        try {
          await api.editarReunion(r.id, { asistentes: [...dentro], invitados });
          cerrar(true);
        } catch (e) { guardar.disabled = false; avisarDeError(e); }
      },
    }, 'Guardar la mesa');

    return [
      h('h2.title', null, 'En la mesa'),
      h('p.hint', { style: { whiteSpace: 'normal' } }, 'Los del equipo llevan cuenta y cara; los de fuera se apuntan a mano.'),
      listaEquipo,
      h('p.eyebrow', { style: { marginTop: '14px' } }, 'Invitados'),
      listaInvitados,
      h('div', { style: { display: 'flex', gap: '8px' } },
        caja,
        h('button.btn.accent', { onclick: meter }, 'Añadir'),
      ),
      guardar,
    ];
  });
}
