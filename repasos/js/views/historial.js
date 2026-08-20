/* ACTAS — el archivo de la obra, un acta por día.

   Un acta de obra no es la ficha de una casa: es el registro de una
   visita. Se va una mañana, se recorren cinco viviendas, y eso es UN
   hecho con su fecha y su gente. Antes aquí había un documento por
   lista de repasos y salían cuatro «Acta Villa 01» seguidas que no se
   distinguían entre sí; ahora hay una por día y dentro va lo que se
   tocó, agrupado por vivienda.

   El acta no se crea ni se nombra: se abre sola con el primer repaso
   del día. Nadie tiene que acordarse de nada.

   Misma cabecera que Inicio y Viviendas, el titular en su sitio y una
   sola fila de filtro: el mes a la izquierda y la bola del embudo a la
   derecha para la vivienda. */
import { h, icon, grupoAvatares, emptyState } from '../ui.js';
import * as store from '../store.js';
import { PROMOCIONES, unidad, unidades } from '../catalog.js';
import {
  cabDiseno, menuFlotante, filaMenu, avisoLocal, barraSync, menuTarjeta,
} from '../piezas.js';
import { ir } from '../app.js';

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** «12 de agosto» · «12 de agosto de 2025» si no es de este año. */
export function fechaDeActa(fecha, { conAno = false } = {}) {
  const [a, m, d] = String(fecha).split('-').map(Number);
  const corto = `${d} de ${MESES[m - 1]}`;
  return conAno || a !== new Date().getFullYear() ? `${corto} de ${a}` : corto;
}

/** «miércoles» — el día de la semana de una fecha suelta. */
export function diaDeLaSemana(fecha, { mayuscula = false } = {}) {
  const [a, m, d] = String(fecha).split('-').map(Number);
  const dia = DIAS[new Date(a, m - 1, d).getDay()];
  return mayuscula ? dia.charAt(0).toUpperCase() + dia.slice(1) : dia;
}

/** «AGOSTO 2026», para el epígrafe que separa los meses. */
function mesDe(fecha) {
  const [a, m] = String(fecha).split('-').map(Number);
  return `${MESES[m - 1]} ${a}`.toUpperCase();
}

export async function render() {
  const activas = PROMOCIONES.filter((p) => p.activa);
  const p = activas.length === 1 ? activas[0] : null;
  if (!p) { ir('#/promociones', { reemplazar: true }); return { contenido: [] }; }

  const actas = await store.actasPorDia(p.id);

  if (!actas.length) {
    return {
      sinTabs: true,
      clase: 'pantalla-diseno',
      contenido: [
        cabDiseno('listas'),
        h('h1.d-saludo', null, 'Actas'),
        emptyState('clipboard', 'Todavía no hay ningún día de obra',
          'El acta se abre sola con el primer repaso que se apunte. Cada día tendrá la suya, con lo que se haya tocado y quién estuvo.'),
      ],
    };
  }

  /* ─── Filtros: el mes y la vivienda ─── */
  let mes = 'todos';
  let villa = '';

  const meses = [];
  for (const a of actas) {
    const clave = a.fecha.slice(0, 7);
    const ya = meses.find((x) => x.clave === clave);
    if (ya) ya.cuantos += 1;
    else meses.push({ clave, rotulo: mesDe(a.fecha), cuantos: 1 });
  }

  const villasConActas = () => {
    const vistas = new Set();
    for (const a of actas) for (const v of a.villas) vistas.add(v.unidadId);
    return unidades(p.id).filter((u) => vistas.has(u.id));
  };

  const visibles = () => actas.filter((a) => {
    if (mes !== 'todos' && !a.fecha.startsWith(mes)) return false;
    if (villa && !a.villas.some((v) => v.unidadId === villa)) return false;
    return true;
  });

  const selector = h('button.d-selector-estado', {
    onclick: () => menuFlotante((cerrar) => [
      filaMenu(mes === 'todos' ? 'check' : 'calendario', `Todos los meses (${actas.length})`,
        () => { cerrar(); mes = 'todos'; pintar(); }),
      ...meses.map((x) => filaMenu(mes === x.clave ? 'check' : 'calendario',
        `${x.rotulo.charAt(0) + x.rotulo.slice(1).toLowerCase()} (${x.cuantos})`,
        () => { cerrar(); mes = x.clave; pintar(); })),
    ], { conX: true }),
  }, h('span'), icon('caretAbajo'));

  const bolaFiltros = h('button.d-bola-embudo', {
    'aria-label': 'Filtrar por vivienda',
    onclick: async () => {
      const elegida = await menuTarjeta('Ver solo una vivienda', [
        { id: '', icono: villa ? 'listaChecks' : 'check', rotulo: 'Todas las viviendas' },
        ...villasConActas().map((u) => ({
          id: u.id,
          icono: villa === u.id ? 'check' : 'casa',
          rotulo: u.nombre,
        })),
      ]);
      if (elegida === null) return;
      villa = elegida;
      pintar();
    },
  }, icon('cursores'));

  const filtros = h('div.d-filtros-tareas');
  const cuantos = h('p.d-cuantos-filtros');
  const epigrafe = h('p.d-epigrafe');
  const lista = h('div.d-actas-dias');

  const pintar = () => {
    const dias = visibles();

    selector.querySelector('span').textContent = mes === 'todos'
      ? `Todos los meses (${dias.length})`
      : `${meses.find((x) => x.clave === mes)?.rotulo.toLowerCase() || ''} (${dias.length})`;

    const piezas = [];
    if (villa) piezas.push(h('span.pastilla', null, unidad(villa)?.nombre || 'Vivienda'));
    if (piezas.length) {
      piezas.push(h('button.quitar', {
        'aria-label': 'Quitar el filtro',
        onclick: () => { villa = ''; pintar(); },
      }, icon('x')));
    }
    filtros.replaceChildren(...piezas);
    filtros.style.display = piezas.length ? '' : 'none';
    cuantos.textContent = villa ? 'Solo los días en los que se tocó esa vivienda' : '';
    cuantos.style.display = villa ? '' : 'none';

    epigrafe.textContent = dias.length === 1
      ? '1 día de obra'
      : `${dias.length} días de obra`;

    // Las tarjetas, con su mes por encima cuando cambia.
    const hoy = store.diaDe(new Date().toISOString());
    const nodos = [];
    let mesPuesto = '';
    for (const a of dias) {
      const suyo = mesDe(a.fecha);
      if (suyo !== mesPuesto) {
        mesPuesto = suyo;
        nodos.push(h('p.d-actas-mes', null, suyo));
      }
      nodos.push(tarjetaDelDia(a, { hoy }));
    }
    if (!nodos.length) {
      nodos.push(h('p.d-epigrafe', { style: { color: 'var(--d-gris)', textAlign: 'center', padding: '30px 0' } },
        'Ningún día encaja con este filtro.'));
    }
    lista.replaceChildren(...nodos);
  };
  pintar();

  return {
    sinTabs: true,
    clase: 'pantalla-diseno',
    contenido: [
      cabDiseno('listas'),
      h('h1.d-saludo', null, 'Actas'),
      avisoLocal() || barraSync(),
      h('div.d-fila-filtro', null, selector, bolaFiltros),
      filtros,
      cuantos,
      epigrafe,
      lista,
    ],
  };
}

/**
 * La tarjeta de un día: la fecha grande, quién estuvo, las viviendas
 * que se tocaron y lo que se hizo, contado con los mismos chips de
 * colores que el resto de la aplicación.
 *
 * El día de hoy va en beige y con el rótulo «en curso»: sigue vivo, y
 * lo que se apunte en el próximo rato caerá dentro de él.
 */
function tarjetaDelDia(acta, { hoy }) {
  const c = acta.conteo;
  const esHoy = acta.fecha === hoy;
  const villas = acta.villas.map((v) => unidad(v.unidadId)?.nombre).filter(Boolean);

  const chip = (n, texto, clase) => (n
    ? h('span.d-chip', { class: clase }, `${n} ${texto}`)
    : null);

  return h('button.d-acta-dia', {
    class: esHoy ? 'hoy' : '',
    onclick: () => ir(`#/acta/${acta.fecha}`),
  },
    h('div.d-acta-dia-cab', null,
      h('div.grow', null,
        h('p.d-acta-dia-cuando', null, esHoy ? 'Hoy · en curso' : diaDeLaSemana(acta.fecha, { mayuscula: true })),
        h('p.d-acta-dia-fecha', null, fechaDeActa(acta.fecha)),
      ),
      grupoAvatares(acta.gente.map((g) => store.persona(g.id, g.nombre)),
        { tam: 40, max: 3, solape: 13 }),
    ),
    h('p.d-acta-dia-villas', null,
      villas.length <= 3 ? villas.join(' · ') : `${villas.slice(0, 3).join(' · ')} y ${villas.length - 3} más`),
    h('div.d-acta-dia-chips', null,
      chip(c.nuevas, c.nuevas === 1 ? 'repaso nuevo' : 'repasos nuevos', ''),
      chip(c.completadas, c.completadas === 1 ? 'completado' : 'completados', 'ambar'),
      chip(c.verificadas, c.verificadas === 1 ? 'verificado' : 'verificados', 'verde'),
      chip(c.rechazadas, c.rechazadas === 1 ? 'rechazado' : 'rechazados', 'rojo'),
      chip(c.notas, c.notas === 1 ? 'nota' : 'notas', ''),
    ),
  );
}
