/* La home del rediseño 2026, calcada del Figma de Fran.

   De arriba a abajo: la cara de quien mira (que lleva a Ajustes), las
   tres bolas de navegación, el saludo del día, el banner beige con lo
   completado por verificar, los dos que acumulan —verde verificadas,
   rojo rechazadas—, el módulo de Brassie con su anillo, y el muro de
   comentarios y feedback coloreado por estado, con su caja de escribir.

   La misma pantalla para técnicos y para constructora: solo cambia el
   saludo, que al jefe de obra no le baila con los días. */
import { h, icon, avatar, grupoAvatares, anillo, toast, fechaCorta, hora, fechaRelativa } from '../ui.js';
import * as store from '../store.js';
import { PROMOCIONES, unidad, estado, puedeVerificar } from '../catalog.js';
import { avisoLocal, barraSync } from '../piezas.js';
import { ultimaMirada, anotarMirada } from '../ajustesLocales.js';
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
    h('span.d-banner-fondo'),
    h('span.d-banner-esquina'),
    h('span.d-banner-texto', null,
      h('span.d-banner-rotulo', null, rotulo),
      h('span.d-banner-cifra', null, String(cifra)),
    ),
    h('span.d-banner-boton', null, icon('flechaSubir')),
  );
}

/** Cuándo, como lo dice el diseño: «Ayer, 20:00 h». */
function cuandoCorto(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const hoy = new Date();
  const ayer = new Date(hoy); ayer.setDate(hoy.getDate() - 1);
  const dia = d.toDateString() === hoy.toDateString() ? 'Hoy'
    : d.toDateString() === ayer.toDateString() ? 'Ayer'
    : fechaCorta(iso);
  return `${dia}, ${hora(iso)} h`;
}

/** Y en el muro: «Andrea, ayer a las 11:40 h». */
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

  const nuevasVerificadas = await store.cuantasDesde('verificada', ultimaMirada(yo, 'verificadas'), { promoId: p.id });
  const nuevasRechazadas = await store.cuantasDesde('rechazada', ultimaMirada(yo, 'rechazadas'), { promoId: p.id });

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
      h('div.d-cab', null,
        avatar(yo, { tam: 54, onclick: () => ir('#/ajustes') }),
        h('div.d-cab-menu', null,
          h('button.d-bola.activa', { 'aria-label': 'Inicio', 'aria-current': 'true' }, icon('brujula')),
          h('button.d-bola', { 'aria-label': 'Viviendas', onclick: () => ir('#/viviendas') }, icon('casa')),
          h('button.d-bola', { 'aria-label': 'Actas', onclick: () => ir('#/listas') }, icon('periodico')),
        ),
      ),

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
        cifra: nuevasVerificadas,
        adonde: conFiltros('#/viviendas', { estado: 'verificada' }),
        alPinchar: () => anotarMirada(yo, 'verificadas'),
      }),
      banner({
        clase: 'rojo',
        rotulo: 'Tareas rechazadas',
        cifra: nuevasRechazadas,
        adonde: conFiltros('#/viviendas', { estado: 'rechazada' }),
        alPinchar: () => anotarMirada(yo, 'rechazadas'),
      }),

      h('p.d-epigrafe', null, p.nombre),
      h('button.d-brassie', { onclick: () => ir('#/viviendas') },
        h('div.d-brassie-cab', null,
          icon('toque', 20),
          h('span', null, cuandoCorto(d.ultimaSinVerificar) || 'Sin tareas abiertas'),
          h('span.d-brassie-caras', null,
            grupoAvatares(d.caras.slice(0, 3), { tam: 36, max: 3 })),
        ),
        h('div.d-brassie-cifra', null,
          `${d.sinVerificar} ${d.sinVerificar === 1 ? 'tarea pendiente' : 'tareas pendientes'}`),
        h('div.d-brassie-pie', null,
          h('span.d-chip', null, icon('listaChecks'), `${c.hechas} / ${c.total}`),
          h('span.d-chip', { class: pct < 30 ? 'rojo' : pct < 70 ? 'ambar' : 'verde' },
            icon('fuego'), `${pct}%`),
        ),
        h('span.d-brassie-anillo', {
          style: { '--anillo-color': '#000', '--anillo-fondo': 'var(--d-anillo-fondo)' },
        }, anillo(pct, { tam: 44, grosor: 5, etiqueta: false })),
      ),

      h('p.d-epigrafe', null, 'Comentarios y feedback'),
      muro,
      h('div.d-escribir', null,
        caja,
        h('button.d-escribir-mandar', { 'aria-label': 'Publicar', onclick: mandar }, icon('avionPapel')),
      ),
    ],
  };
}
