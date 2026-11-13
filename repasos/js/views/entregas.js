/* ENTREGAS — el calendario de la obra, validado por Fran (noviembre de
   2026, opción A «Rejilla y agenda»).

   Una sección más de la app, al nivel de Inicio / Obra / Viviendas /
   Partes: entra por la quinta bola de la cabecera y por el banner negro
   de la portada. Tres vistas con el mismo conmutador de siempre:

     MES      la rejilla de siete columnas con el número de la villa en
              cada día que tiene algo (negro = firma, beige = revisión,
              verde = revisión hecha, rojo = con incidencias).
     SEMANA   una tarjeta por día, como las de Partes, con la villa,
              los compradores y qué toca.
     DÍA      una tarjeta grande por visita, con todo: la hora, los
              compradores, la otra fecha de la casa y quién la fijó.

   Tocar un día del mes o una tarjeta de la semana abre ese día; en el
   día, la bola de la flecha lleva a la ficha de la villa.

   Las fechas las ponen Ezequiel y el administrador, y también desde
   aquí (al principio el calendario solo dejaba mirar, y el comercial
   no encontraba dónde cambiarlas): en el día, la bola del calendario
   de cada tarjeta abre la hoja de fechas de esa vivienda, y debajo del
   calendario hay un botón para poner fechas a cualquier otra. El resto
   del equipo no ve ni la bola ni el botón.

   «Entregada» es lo que han apuntado ellos dos, no lo que diga la
   fecha: una firma con el día ya pasado y sin esa marca sale como
   «Firma / entrega · sin confirmar».

   Una vivienda puede tener varias visitas con el cliente: cada una que
   se haya hecho sale en su día como «Revisión hecha», con quien la dio
   por hecha, además de la cita que tenga pendiente (ver hitosDe en
   js/entregas.js).

   La vista y la fecha viajan en la dirección, así que atrás vuelve a
   donde se estaba y un enlace copiado abre lo mismo. */
import { h, icon, avatar } from '../ui.js';
import * as store from '../store.js';
import { PROMOCIONES, puedePonerFechas } from '../catalog.js';
import { cabecera, avisoLocal, barraSync } from '../piezas.js';
import { ir, anotarRuta, refrescar } from '../app.js';
import * as E from '../entregas.js';
import { hojaFechas, hojaFechasDeOtra } from '../hojaEntrega.js';

const VISTAS = [
  { id: 'mes', rotulo: 'Mes', unidad: 'Mes' },
  { id: 'semana', rotulo: 'Semana', unidad: 'Semana' },
  { id: 'dia', rotulo: 'Día', unidad: 'Día' },
];

/** Lo que dice la dirección: #/entregas?vista=semana&fecha=2026-11-09 */
function leerRuta() {
  const p = new URLSearchParams(location.hash.split('?')[1] || '');
  const vista = VISTAS.some((v) => v.id === p.get('vista')) ? p.get('vista') : 'mes';
  const fecha = E.esDia(p.get('fecha')) ? p.get('fecha') : E.hoyIso();
  return { vista, fecha };
}

/** La deja escrita sin repintar ni ensuciar el historial (como los filtros). */
function anotarVista(vista, fecha) {
  anotarRuta(`#/entregas?vista=${vista}&fecha=${fecha}`);
}

/** El primer día del mes de ese día, n meses más allá. */
function mesMas(iso, n) {
  const { a, m } = E.partes(iso);
  const d = new Date(a, m - 1 + n, 1, 12);
  return E.isoDe(d);
}

export async function render() {
  const p = PROMOCIONES.find((x) => x.activa) || null;
  if (!p) { ir('#/promociones', { reemplazar: true }); return { contenido: [] }; }

  const hoy = E.hoyIso();
  // Quien pone fechas (el comercial y el administrador) también las
  // pone desde aquí. Al guardar se repinta la pantalla, que vuelve a
  // la misma vista y al mismo día porque van en la dirección.
  const poneFechas = puedePonerFechas(store.sesion());
  const entregas = await store.entregasDePromo(p.id);
  const incidencias = await store.incidenciasPorUnidad(p.id);
  const hitos = E.hitosDe(entregas, { incidencias, hoy });
  const porDia = E.porDia(hitos);
  const diasConAlgo = [...porDia.keys()].sort();

  let { vista, fecha } = leerRuta();

  /* ─── El armazón: conmutador, fila con flechas y el cuerpo ─── */
  const selector = h('div.d-selector', null, ...VISTAS.map((v) => h('button', {
    'data-vista': v.id,
    onclick: () => {
      if (vista === v.id) return;
      // Al pasar a mes se mira el mes de la fecha que se tenía; al
      // pasar a día, el día: la fecha no se pierde al cambiar de vista.
      vista = v.id;
      pintar();
    },
  }, v.rotulo)));
  const titulo = h('span.d-cal-titulo');
  const sub = h('p.d-cal-sub');
  const atras = h('button.d-bola-filtros', { onclick: () => mover(-1) }, icon('caretIzquierda'));
  const adelante = h('button.d-bola-filtros', { onclick: () => mover(+1) }, icon('chevron'));
  const cuerpo = h('div.d-cal-cuerpo');

  const mover = (n) => {
    if (vista === 'mes') fecha = mesMas(fecha, n);
    else if (vista === 'semana') fecha = E.sumarDias(fecha, 7 * n);
    else fecha = E.sumarDias(fecha, n);
    pintar();
  };
  const abrirDia = (iso) => { vista = 'dia'; fecha = iso; pintar(); cuerpoArriba(); };
  const cuerpoArriba = () => { document.querySelector('.screen')?.scrollTo({ top: 0, behavior: 'instant' }); };

  const pintar = () => {
    anotarVista(vista, fecha);
    selector.querySelectorAll('button').forEach((b) =>
      b.setAttribute('aria-pressed', b.dataset.vista === vista ? 'true' : 'false'));
    const unidad = VISTAS.find((v) => v.id === vista).unidad;
    atras.setAttribute('aria-label', `${unidad} anterior`);
    adelante.setAttribute('aria-label', `${unidad} siguiente`);
    if (vista === 'mes') {
      titulo.textContent = E.mesTitulo(fecha);
      sub.textContent = fecha.slice(0, 7) === hoy.slice(0, 7) ? '' : '';
      cuerpo.replaceChildren(pintarMes());
    } else if (vista === 'semana') {
      titulo.textContent = E.semanaTitulo(fecha);
      sub.textContent = E.semanaRelativa(fecha, hoy);
      cuerpo.replaceChildren(pintarSemana());
    } else {
      titulo.textContent = E.fechaConDia(fecha, { mayus: true });
      sub.textContent = E.relativo(fecha, hoy);
      cuerpo.replaceChildren(pintarDia());
    }
  };

  /* ═══ MES: la rejilla tipo Google Calendar, con una barra por villa ═══ */
  const pintarMes = () => {
    const { a, m } = E.partes(fecha);
    const primero = new Date(a, m - 1, 1, 12);
    // La rejilla arranca el lunes de la semana del día 1 (como hojaFecha).
    const desfase = (primero.getDay() + 6) % 7;
    const cursor = new Date(primero);
    cursor.setDate(1 - desfase);

    const celdas = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'].map((d) => h('span.dia.cabecera', null, h('span.num', null, d)));
    for (let i = 0; i < 42; i++) {
      const d = new Date(cursor);
      const iso = E.isoDe(d);
      const fuera = d.getMonth() !== primero.getMonth();
      const eventos = porDia.get(iso) || [];
      // Una villa, una barra: con revisión y firma el mismo día saldría
      // «Villa 09» dos veces y taparía a las demás casas. La villa va
      // como palabra («Villa 07»; en los móviles estrechos, «V 07») para
      // que no se confunda con el número del día.
      const vistas = new Set();
      const villas = eventos.filter((e) => !vistas.has(e.villa) && vistas.add(e.villa));
      const barras = villas.slice(0, 2).map((e) => h('span.d-barra', { class: E.HITOS[e.tipo].chip },
        'V', h('span.d-barra-palabra', null, 'illa'), ` ${e.villa}`));
      if (villas.length > 2) barras.push(h('span.d-barra.mas', null, `+${villas.length - 2}`));
      celdas.push(h('button.dia', {
        class: [fuera ? 'fuera' : '', iso === hoy ? 'hoy' : ''].filter(Boolean).join(' '),
        'aria-label': `${E.fechaConDia(iso)}${iso === hoy ? ', hoy' : ''}${eventos.length ? `, ${eventos.length === 1 ? '1 hito' : `${eventos.length} hitos`}` : ''}. Abrir el día`,
        onclick: () => abrirDia(iso),
      }, h('span.num', null, String(d.getDate())), ...barras));
      cursor.setDate(cursor.getDate() + 1);
      // Seis semanas de rejilla, pero si la sexta es toda del mes
      // siguiente, sobra.
      if (i >= 34 && (i + 1) % 7 === 0 && cursor.getMonth() !== primero.getMonth()) break;
    }

    const hayIncidencias = hitos.some((x) => x.tipo === 'incidencia');
    return h('div.d-cal-carta', null,
      h('div.d-calendario', null, ...celdas),
      // La leyenda: una barrita de cada color.
      h('div.d-cal-leyenda', null,
        h('span', null, h('span.d-barra.firma'), 'Firma'),
        h('span', null, h('span.d-barra.revision'), 'Revisión'),
        h('span', null, h('span.d-barra.revisada'), 'Revisada'),
        hayIncidencias ? h('span', null, h('span.d-barra.incidencia'), 'Incidencias') : null,
      ),
    );
  };

  /* Una fila de hito: el chip de la villa, los compradores y qué es.
     La comparten la semana y (en grande) la tarjeta del día. */
  const filaHito = (e, rotulo) => h('div.d-hito', null,
    h('span.d-minichip', { class: E.HITOS[e.tipo].chip }, e.villa),
    h('div.d-hito-texto', null,
      h('div.d-hito-nombres', null, e.compradores || e.nombre),
      h('div.d-hito-que', null, rotulo),
    ),
  );
  const rotuloLargo = (e) => {
    if (e.tipo === 'incidencia') return `Entregada · ${e.incidencias} ${e.incidencias === 1 ? 'incidencia' : 'incidencias'}`;
    // La fecha de la firma ya pasó y nadie ha dicho si se entregó.
    if (e.tipo === 'firma' && e.sinConfirmar) return `${E.HITOS.firma.largo}${e.hora ? ` · ${e.hora}` : ''} · sin confirmar`;
    return E.HITOS[e.tipo].largo + (e.hora ? ` · ${e.hora}` : '');
  };

  /* ═══ SEMANA: siete tarjetas ═══ */
  const pintarSemana = () => h('div.d-actas-dias.entregas', null, ...E.semanaDe(fecha).map((iso) => {
    const eventos = porDia.get(iso) || [];
    return h('button.d-acta-dia', {
      class: [iso === hoy ? 'hoy' : '', iso < hoy ? 'pasado' : ''].filter(Boolean).join(' '),
      'aria-label': `${E.fechaConDia(iso)}, abrir el día`,
      onclick: () => abrirDia(iso),
    },
      h('div.d-acta-dia-cab', null,
        h('div.grow', null,
          h('p.d-acta-dia-cuando', null, iso === hoy ? 'Hoy' : E.diaSemana(iso, { mayus: true })),
          h('p.d-acta-dia-fecha', null, E.fechaLarga(iso)),
        ),
      ),
      eventos.length
        ? h('div.d-hitos', null, ...eventos.map((e) => filaHito(e, rotuloLargo(e))))
        : h('p.d-acta-dia-villas', null, 'Nada previsto'),
    );
  }));

  /* ═══ DÍA: una tarjeta grande por hito, o el salto si no hay nada ═══ */
  /* Lo otro que tiene la villa ese día: su firma si lo que se enseña
     es la revisión; su revisión (hecha o prevista) si es la firma. */
  const loOtro = (e) => {
    const v = e.entrega;
    if (e.tipo === 'revision' || e.tipo === 'revisada') {
      return v.firma
        ? { clase: 'gris', icono: 'key', texto: `Firma el ${E.fechaConDia(v.firma)}${v.firmaHora ? ` · ${v.firmaHora}` : ''}` }
        : v.entregadaEn
          ? { clase: 'gris', icono: 'key', texto: `Entregada el ${E.fechaConDia(E.diaEntregada(v))}` }
          : { clase: 'gris', icono: 'key', texto: 'Firma sin fecha todavía' };
    }
    if (e.tipo === 'incidencia') {
      return { clase: 'rojo', icono: 'periodico', texto: `${e.incidencias} ${e.incidencias === 1 ? 'repaso del parte post-entrega por resolver' : 'repasos del parte post-entrega por resolver'}` };
    }
    // Manda la cita vigente (hecha o por hacer); si no hay ninguna pero
    // la vivienda ya tuvo visitas, se dice la última.
    const marcada = E.visitaMarcada(v);
    if (marcada?.vigente) return { clase: 'verde', icono: 'check', texto: `Revisión hecha el ${E.fechaLarga(marcada.dia)}` };
    if (v.revision) return { clase: 'gris', icono: 'calendario', texto: `Revisión con el cliente el ${E.fechaConDia(v.revision)}${v.revisionHora ? ` · ${v.revisionHora}` : ''}` };
    const ultima = E.todasLasVisitas(v).pop();
    if (ultima) return { clase: 'verde', icono: 'check', texto: `Revisión hecha el ${E.fechaLarga(ultima.dia)}` };
    return { clase: 'gris', icono: 'calendario', texto: 'Revisión sin fecha todavía' };
  };
  /* Quién lo fijó y cuándo, para el pie de la tarjeta. La de una
     visita hecha lo lleva en el propio hito: cada visita de la
     vivienda (la vigente y las del historial) tiene su autor. */
  const quienLoFijo = (e) => {
    const v = e.entrega;
    const [id, nombre, cuando, verbo] = e.tipo === 'entregada' || e.tipo === 'incidencia'
      ? [v.entregadaPor, v.entregadaPorNombre, v.entregadaFijadaEn || v.entregadaEn, 'la dio por entregada']
      : e.tipo === 'revisada'
      ? [e.visita?.por, e.visita?.porNombre, e.visita?.hechaEn, 'la dio por hecha']
      : e.tipo === 'revision'
        ? [v.revisionPor, v.revisionPorNombre, v.revisionFijadaEn, 'la fijó']
        : [v.firmaPor, v.firmaPorNombre, v.firmaFijadaEn, 'la fijó'];
    if (!nombre && !cuando) return null;
    const pila = String(nombre || 'Alguien').trim().split(/\s+/)[0];
    const dia = cuando ? E.isoDe(new Date(cuando)) : '';
    return {
      persona: store.persona(id, nombre || 'Alguien'),
      texto: `${pila} ${verbo}${dia ? ` el ${E.partes(dia).d} ${E.fechaBanner(dia).split(' ').pop()}` : ''}`,
    };
  };
  const chipTexto = (e) => (e.tipo === 'incidencia' ? 'Entregada con incidencias'
    : e.tipo === 'firma' && e.sinConfirmar ? `${E.HITOS.firma.largo} · sin confirmar`
      : E.HITOS[e.tipo].largo);
  const villasDe = (iso) => {
    const vs = [...new Set((porDia.get(iso) || []).map((e) => e.nombre))].sort();
    return vs.length > 1 ? `${vs.slice(0, -1).join(', ')} y ${vs[vs.length - 1]}` : vs[0] || '';
  };
  const saltoDesde = (iso, sentido) => {
    const k = sentido > 0 ? diasConAlgo.find((c) => c > iso) : [...diasConAlgo].reverse().find((c) => c < iso);
    if (!k) return null;
    const mismoMes = k.slice(0, 7) === iso.slice(0, 7);
    return { iso: k, cuando: `${E.diaSemana(k, { mayus: true })} ${mismoMes ? E.partes(k).d : E.fechaLarga(k)}`, villas: villasDe(k) };
  };

  const pintarDia = () => {
    const eventos = porDia.get(fecha) || [];
    if (!eventos.length) {
      const salto = (s, rotulo, icono) => (s ? h('button.d-dia-salto', {
        'aria-label': `${rotulo}: ${s.cuando}, ${s.villas}`,
        onclick: () => abrirDia(s.iso),
      },
        icon(icono),
        h('div.d-dia-salto-texto', null,
          h('div.d-dia-salto-que', null, rotulo),
          h('div.d-dia-salto-cuando', null, `${s.cuando} · ${s.villas}`),
        ),
      ) : null);
      const anterior = saltoDesde(fecha, -1);
      const siguiente = saltoDesde(fecha, +1);
      return h('div.d-dia-vacio', null,
        h('p.d-dia-nada', null, diasConAlgo.length ? 'Nada previsto' : 'Todavía no hay ninguna fecha de entrega'),
        anterior || siguiente ? h('div.d-dia-saltos', null,
          salto(anterior, 'Anterior con algo', 'caretIzquierda'),
          salto(siguiente, 'Siguiente con algo', 'chevron'),
        ) : null,
      );
    }
    return h('div.d-dia-lista', null, ...eventos.map((e) => {
      const otro = loOtro(e);
      const quien = quienLoFijo(e);
      const nn = String(e.unidadId).split(':')[1];
      return h('div.d-dia-tarjeta', null,
        h('div.d-dia-cab', null,
          h('span.d-minichip', { class: E.HITOS[e.tipo].chip }, chipTexto(e)),
          e.hora ? h('span.d-dia-hora', null, e.hora) : null,
        ),
        h('h2.d-dia-titulo', null, e.nombre),
        h('div.d-dia-fila', { class: e.compradores ? '' : 'gris' }, icon('users'),
          h('span', null, e.compradores || 'Compradores sin apuntar')),
        h('div.d-dia-fila', { class: otro.clase }, icon(otro.icono), h('span', null, otro.texto)),
        h('div.d-dia-pie', null,
          quien ? avatar(quien.persona, { tam: 36 }) : null,
          h('span.d-dia-quien', null, quien ? quien.texto : ''),
          poneFechas ? h('button.d-dia-bola.fechas', {
            'aria-label': `Cambiar las fechas de la ${e.nombre} o apuntar su entrega`,
            onclick: () => hojaFechas({ unidadId: e.unidadId, promoId: p.id, nombre: e.nombre, entrega: e.entrega, alCambiar: refrescar }),
          }, icon('calendario')) : null,
          h('button.d-dia-bola', {
            'aria-label': `Abrir la ficha de la ${e.nombre}`,
            onclick: () => ir(`#/p/${p.id}/v/${nn}`),
          }, icon('flechaSubir')),
        ),
      );
    }));
  };

  pintar();

  return {
    sinTabs: true,
    clase: 'pantalla-diseno',
    contenido: [
      cabecera({ seccion: 'entregas' }),
      h('h1.d-saludo', null, 'Entregas'),
      avisoLocal() || barraSync(),
      h('div.d-fila-selector', null, selector),
      h('div.d-cal-fila', null, atras, titulo, adelante),
      sub,
      cuerpo,
      poneFechas ? h('button.d-cal-poner', {
        onclick: () => hojaFechasDeOtra({ promoId: p.id, entregas, alCambiar: refrescar }),
      }, icon('calendario'), h('span', null, 'Poner o cambiar las fechas de una vivienda')) : null,
    ],
  };
}
