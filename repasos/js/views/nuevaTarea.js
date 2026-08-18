/* El formulario de nueva tarea, calcado del Figma.

   Se llega desde el menú de «Nueva inspección» de la ficha de la
   villa: las fotos hechas o elegidas allí viajan en la bandeja y aquí
   se recogen. Cinco campos —vivienda, estancia, oficio, fecha límite
   (el único opcional) y descripción—, el multimedia adicional, y el
   botón de guardar arropado en su placa blanca, gris hasta que lo
   obligatorio está relleno.

   Guardar crea una inspección nueva (un acta) con esta tarea dentro:
   una inspección es exactamente eso, alguien que pasó por la casa y
   dejó apuntado lo que vio. */
import { h, icon, toast, openViewer } from '../ui.js';
import { promocion, unidad, unidades, oficio as oficioDe } from '../catalog.js';
import * as store from '../store.js';
import * as media from '../media.js';
import {
  hojaZonas, hojaOficios, hojaFotoAcciones, menuFlotante, filaMenu,
  bandeja, caraDeGremio,
} from '../piezas.js';
import { ir } from '../app.js';

export async function render({ promoId, unidadId }) {
  const p = promocion(promoId);
  const u = unidad(unidadId);
  if (!p || !u) { toast('Vivienda desconocida', 'err'); ir('#/viviendas', { reemplazar: true }); return { contenido: [] }; }

  const rutaVilla = `#/p/${promoId}/v/${String(unidadId).split(':')[1]}`;

  /* ─── Las fotos: las de la bandeja más las que se añadan aquí ─── */
  const fotos = [];
  const brutas = bandeja.fotos;
  bandeja.fotos = [];

  const cajaFotos = h('div');
  const pintarFotos = () => {
    cajaFotos.replaceChildren();
    if (!fotos.length) {
      cajaFotos.append(h('button.d-foto', {
        'aria-label': 'Añadir la foto principal',
        style: { display: 'grid', placeItems: 'center', color: 'var(--d-gris)' },
        onclick: () => hojaFotoAcciones(meter),
      }, h('div', { style: { textAlign: 'center' } },
        icon('camera', 30),
        h('p', { style: { marginTop: '8px', fontSize: '14px' } }, 'Añade una foto del remate'))));
      return;
    }
    const [primera, ...resto] = fotos;
    const url = URL.createObjectURL(primera.blob);
    cajaFotos.append(h('div.d-foto', {
      style: resto.length ? { aspectRatio: 'auto', height: '200px' } : null,
      onclick: (ev) => { if (ev.target.closest('.d-foto-papelera')) return; openViewer(h('img', { src: url, alt: '' })); },
    },
      h('img', { src: url, alt: 'Foto principal' }),
      papelera(0),
    ));
    if (resto.length) {
      cajaFotos.append(h('div.d-carrusel', null, resto.map((f, i) => {
        const u2 = URL.createObjectURL(f.blob);
        return h('div.celda', {
          style: { backgroundImage: `url("${u2}")` },
          role: 'button', 'aria-label': 'Ver la foto',
          onclick: (ev) => { if (ev.target.closest('.d-foto-papelera')) return; openViewer(h('img', { src: u2, alt: '' })); },
        }, papelera(i + 1));
      })));
    }
  };
  /** La papelera abre el menú del diseño: eliminar o conservar. */
  const papelera = (indice) => h('button.d-foto-papelera', {
    'aria-label': 'Borrar esta foto',
    onclick: () => menuFlotante((cerrar) => [
      filaMenu('trash', 'Eliminar imagen', () => { cerrar(); fotos.splice(indice, 1); pintarFotos(); }),
      filaMenu('corazon', 'Conservar', cerrar),
    ]),
  }, icon('trash'));

  const meter = async (ficheros) => {
    toast('Preparando…');
    let fallos = 0;
    for (const f of [...ficheros]) {
      try { fotos.push(await media.prepararImagen(f)); } catch { fallos++; }
    }
    if (fallos) toast(`${fallos} ${fallos === 1 ? 'foto no se pudo leer' : 'fotos no se pudieron leer'}`, 'err');
    pintarFotos();
    repasar();
  };
  pintarFotos();
  if (brutas.length) meter(brutas);

  /* ─── Los campos ─── */
  let villa = u;
  let zona = '';
  let gremio = null;
  let fechaLimite = null;

  const campo = (rotulo, obligatorio, pastilla) => h('div.d-campo', null,
    h('label.d-campo-rotulo', null, rotulo, obligatorio ? h('span.req', null, '*') : null),
    pastilla,
  );
  const selecto = (valor, marcador, icono, alPinchar) => {
    const b = h('button.d-desplegable', { style: { width: '100%' }, onclick: alPinchar },
      h('span', null, valor || marcador), icon(icono));
    b.classList.toggle('puesto', !!valor);
    return b;
  };

  const selVilla = selecto(u.nombre, '', 'caretAbajo', async () => {
    const otras = unidades(promoId);
    menuFlotante((cerrar) => otras.slice(0, 50).map((x) => filaMenu('casa', x.nombre, () => {
      cerrar(); villa = x; refrescarSelectos();
    })), { conX: true });
  });
  const selZona = selecto('', 'Seleccionar estancia', 'caretAbajo', async () => {
    const z = await hojaZonas(zona);
    if (z !== null) { zona = z; refrescarSelectos(); }
  });
  const selGremio = selecto('', 'Seleccionar oficio', 'caretAbajo', async () => {
    const g = await hojaOficios(gremio || 'general');
    if (g) { gremio = g; refrescarSelectos(); }
  });

  // La fecha con el calendario del sistema: un campo de fecha invisible
  // debajo de la pastilla, que es quien lo abre.
  const fechaOculta = h('input', {
    type: 'date', style: { position: 'absolute', opacity: '0', pointerEvents: 'none', width: '1px', height: '1px' },
  });
  fechaOculta.addEventListener('change', () => {
    fechaLimite = fechaOculta.value ? new Date(fechaOculta.value + 'T12:00:00').toISOString() : null;
    refrescarSelectos();
  });
  const selFecha = selecto('', 'Indicar fecha en el calendario', 'calendario', () => {
    try { fechaOculta.showPicker(); } catch { fechaOculta.click(); }
  });

  const refrescarSelectos = () => {
    selVilla.querySelector('span').textContent = villa.nombre;
    selZona.querySelector('span').textContent = zona || 'Seleccionar estancia';
    selZona.classList.toggle('puesto', !!zona);
    selGremio.querySelector('span').textContent = gremio ? oficioDe(gremio).nombre : 'Seleccionar oficio';
    selGremio.classList.toggle('puesto', !!gremio);
    selFecha.querySelector('span').textContent = fechaLimite ? fechaLarga(fechaLimite) : 'Indicar fecha en el calendario';
    selFecha.classList.toggle('puesto', !!fechaLimite);
    repasar();
  };

  const area = h('textarea.d-area', { placeholder: 'Mensaje...', autocapitalize: 'sentences' });
  area.addEventListener('input', () => repasar());

  /* ─── Guardar ─── */
  const guardarBtn = h('button.d-boton-negro', { disabled: true }, 'Guardar tarea');
  const repasar = () => { guardarBtn.disabled = !(zona && gremio && area.value.trim()); };

  guardarBtn.addEventListener('click', async () => {
    if (guardarBtn.disabled) return;
    guardarBtn.disabled = true;
    try {
      const acta = await store.crearLista({ unidadId: villa.id, promoId });
      const t = await store.crearTarea({
        listaId: acta.id,
        texto: area.value.trim(),
        oficio: gremio,
        zona,
        fechaLimite,
      });
      for (const f of fotos) {
        await store.añadirMedio(t.id, { tipo: 'imagen', blob: f.blob, mime: f.mime, ancho: f.ancho, alto: f.alto });
      }
      toast('Tarea guardada');
      ir(`#/p/${promoId}/v/${String(villa.id).split(':')[1]}`, { reemplazar: true });
    } catch (e) {
      toast(e.message, 'err');
      guardarBtn.disabled = false;
    }
  });

  return {
    sinTabs: true,
    clase: 'pantalla-diseno',
    contenido: [
      h('div.d-cab-dentro', null,
        h('button.d-bola', { 'aria-label': 'Volver', onclick: () => ir(rutaVilla) }, icon('arrowLeft')),
        h('div.d-titulo', null, 'Nueva tarea'),
        h('button.d-bola', {
          'aria-label': 'Más opciones',
          onclick: () => menuFlotante((cerrar) => [
            filaMenu('trash', 'Descartar el borrador', () => { cerrar(); ir(rutaVilla); }),
          ]),
        }, icon('puntos')),
      ),

      cajaFotos,

      campo('Vivienda', true, selVilla),
      campo('Zona o estancia', true, selZona),
      campo('Oficio o subcontrata', true, selGremio),
      campo('Fecha límite', false, h('div', { style: { position: 'relative' } }, selFecha, fechaOculta)),
      campo('Descripción', true, area),

      h('p.d-epigrafe', null, 'Imágenes o video adicionales'),
      h('button.d-fantasma', { onclick: () => hojaFotoAcciones(meter) },
        icon('plus'), 'Añadir multimedia'),

      h('div.d-pie-placa', null, guardarBtn),
    ],
  };
}

/** La fecha del diseño: «19 noviembre, 2026». */
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
function fechaLarga(iso) {
  const d = new Date(iso);
  return `${d.getDate()} ${MESES[d.getMonth()]}, ${d.getFullYear()}`;
}
