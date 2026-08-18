/* La home del rediseño 2026, calcada del Figma de Fran.

   De arriba a abajo: la cara de quien mira (que lleva a Ajustes), las
   tres bolas de navegación, el saludo del día, los tres banners de
   estado, el módulo de Brassie con su anillo, y el muro de comentarios
   y feedback coloreado por estado, con su caja de escribir.

   Los tres banners cuentan LO QUE HAY AHORA MISMO, no lo que ha pasado
   desde que uno miró: beige, las completadas que esperan visto bueno;
   verde, todas las verificadas de la obra —que va subiendo sola salvo
   que a alguna se le cambie el estado—; rojo, las que están rechazadas
   en este momento y que se vacía según se van rehaciendo. Las tres
   salen de la misma cuenta, así que ninguna puede contradecir a otra.

   La misma pantalla para técnicos y para constructora: solo cambia el
   saludo, que al jefe de obra no le baila con los días. */
import { h, icon, avatar, toast, fechaCorta, hora } from '../ui.js';
import * as store from '../store.js';
import { PROMOCIONES, unidad, estado, puedeVerificar } from '../catalog.js';
import { avisoLocal, barraSync, cabDiseno, tarjetaVilla, cuandoVilla } from '../piezas.js';
import { ir, conFiltros, refrescar } from '../app.js';

/**
 * El saludo, con las frases literales del diseño: lunes y viernes
 * tienen la suya y el resto de la semana comparte una. El jefe de obra
 * ve siempre la misma — a él la frase no le informa de nada y una que
 * cambia sola acaba leyéndose como ruido.
 */
function saludo(usuario) {
  if (!puedeVerificar(usuario)) return 'A por los repasos pendientes! 💪🏼';
  const dia = new Date().getDay();
  if (dia === 1) return 'Qué bien sienta un lunes de repasos. 🪖';
  if (dia === 5) return 'Magnífico viernes para pillar repasos. 🔪';
  return 'Hoy vamos a cazar cada repaso! 👋🏻';
}

/** El banner con el mordisco: rótulo, cifra y botón redondo. */
function banner({ clase, rotulo, cifra, adonde, alPinchar }) {
  return h('button.d-banner', { class: clase, onclick: () => { alPinchar?.(); ir(adonde); } },
    h('span.d-mordida'),
    h('span.d-mordida-esquina'),
    h('span.d-banner-texto', null,
      h('span.d-banner-rotulo', null, rotulo),
      h('span.d-banner-cifra', null, String(cifra)),
    ),
    h('span.d-banner-boton', null, icon('flechaSubir')),
  );
}

/** En el muro: «Andrea, ayer a las 11:40 h». */
function cuandoMuro(nombre, iso) {
  const pila = String(nombre || '').trim().split(/\s+/)[0] || 'Alguien';
  if (!iso) return pila;
  const d = new Date(iso);
  const hoy = new Date();
  const ayer = new Date(hoy); ayer.setDate(hoy.getDate() - 1);
  if (d.toDateString() === hoy.toDateString()) return `${pila}, hoy a las ${hora(iso)} h`;
  if (d.toDateString() === ayer.toDateString()) return `${pila}, ayer a las ${hora(iso)} h`;
  return `${pila}, ${fechaCorta(iso)}`;
}

export async function render() {
  const activas = PROMOCIONES.filter((p) => p.activa);
  const p = activas[0] || null;
  if (!p) {
    return { sinTabs: true, clase: 'pantalla-diseno', contenido: [
      h('p.d-epigrafe', null, 'No hay ninguna promoción activa.')] };
  }

  const yo = store.sesion();
  const d = await store.datosHome(p.id);
  const c = d.conteo;

  const pct = c.total ? Math.round((100 * c.hechas) / c.total) : 0;

  /* ─── El muro ─── */
  const muro = h('div.d-muro', null, d.muro.map((n) => {
    const e = n.estado ? estado(n.estado) : null;
    const clase = n.estado === 'rechazada' ? 'rechazada'
      : n.estado === 'verificada' ? 'verificada'
      : n.estado === 'resuelta' ? 'completada' : 'pendiente';
    const villa = n.unidadId ? (unidad(n.unidadId)?.nombre || '') : 'Brassie';
    const abre = n.tipo === 'tarea'
      ? () => ir(`#/l/${n.listaId}/t/${n.tareaId}`)
      : null;
    return h(abre ? 'button.d-nota' : 'div.d-nota', { class: clase, onclick: abre },
      h('div.d-nota-cab', null,
        avatar(store.persona(n.quienId, n.quien), { tam: 36 }),
        h('div.d-nota-quien', null,
          h('div.d-nota-villa', null, villa),
          h('div.d-nota-cuando', null, cuandoMuro(n.quien, n.cuando)),
        ),
        e && n.tipo === 'tarea' ? h('span.d-nota-estado', null, e.nombre) : null,
      ),
      h('p.d-nota-texto', null, n.texto || 'Sin texto.'),
    );
  }));

  /* ─── Escribir en el muro ─── */
  const caja = h('input', { type: 'text', placeholder: 'Escribe lo que quieras contar…', autocapitalize: 'sentences' });
  const mandar = async () => {
    const texto = caja.value.trim();
    if (!texto) return;
    await store.escribirMensaje('general:' + p.id, p.id, texto);
    caja.value = '';
    toast('Publicado en el muro');
    refrescar();
  };
  caja.addEventListener('keydown', (e) => { if (e.key === 'Enter') mandar(); });

  return {
    sinTabs: true,
    clase: 'pantalla-diseno',
    contenido: [
      /* La cabecera del diseño: la cara y las tres bolas. */
      cabDiseno('inicio'),

      h('h1.d-saludo', null, saludo(yo)),
      avisoLocal() || barraSync(),

      h('p.d-epigrafe', null, 'Pendiente de revisión por la DF'),
      banner({
        clase: 'beige',
        rotulo: 'Tareas completadas por verificar',
        cifra: c.esperando,
        adonde: conFiltros('#/viviendas', { estado: 'resuelta' }),
      }),

      h('p.d-epigrafe', null, 'Tareas revisadas por la DF'),
      banner({
        clase: 'verde',
        rotulo: 'Tareas verificadas',
        cifra: c.hechas,
        adonde: conFiltros('#/viviendas', { estado: 'verificada' }),
      }),
      banner({
        clase: 'rojo',
        rotulo: 'Tareas rechazadas',
        cifra: c.rechazadas,
        adonde: conFiltros('#/viviendas', { estado: 'rechazada' }),
      }),

      h('p.d-epigrafe', null, p.nombre),
      tarjetaVilla({
        titulo: `${d.sinVerificar} ${d.sinVerificar === 1 ? 'tarea pendiente' : 'tareas pendientes'}`,
        cuando: cuandoVilla(d.ultimaSinVerificar),
        caras: d.caras,
        hechas: c.hechas,
        total: c.total,
        pct,
        alPinchar: () => ir('#/viviendas'),
      }),

      h('p.d-epigrafe', null, 'Comentarios y feedback'),
      muro,
      h('div.d-escribir', null,
        caja,
        h('button.d-escribir-mandar', { 'aria-label': 'Publicar', onclick: mandar }, icon('avionPapel')),
      ),
    ],
  };
}
