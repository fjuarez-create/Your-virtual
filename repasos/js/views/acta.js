/* El acta de un día: lo que pasó en la obra esa fecha.

   Se lee como un parte de visita, que es lo que es: arriba el día y
   quién estuvo, después el resumen de lo que se hizo, y debajo, casa
   por casa, cada cosa con su hora, quién la hizo y en qué quedó.

   Cada línea lleva a su tarea. El acta cuenta lo que pasó; la tarea es
   donde se sigue trabajando. */
import { h, icon, grupoAvatares, toast, hora, trasLaOnda } from '../ui.js';
import * as store from '../store.js';
import { PROMOCIONES, unidad, oficio } from '../catalog.js';
import { cabecera, menuTarjeta, avisoLocal, barraSync, entregarFichero } from '../piezas.js';
import { actaDelDia, nombreDeFichero } from '../pdf.js';
import { ir } from '../app.js';
import { fechaDeActa, diaDeLaSemana } from './historial.js';

/* Cómo se cuenta cada cosa que puede pasarle a un repaso en un día.
   El verbo va en pasado y con nombre y apellidos: un acta se lee meses
   después, cuando ya nadie se acuerda de quién hizo qué. */
const HECHOS = {
  nueva: { rotulo: 'Apuntado', clase: 'nueva', icono: 'plus' },
  resuelta: { rotulo: 'Completado', clase: 'completada', icono: 'check' },
  verificada: { rotulo: 'Verificado', clase: 'verificada', icono: 'check' },
  rechazada: { rotulo: 'Rechazado', clase: 'rechazada', icono: 'rechazo' },
  nota: { rotulo: 'Nota', clase: 'nota', icono: 'hilo' },
};

export async function render({ fecha }) {
  const activas = PROMOCIONES.filter((p) => p.activa);
  const p = activas.length === 1 ? activas[0] : null;
  if (!p) { ir('#/promociones', { reemplazar: true }); return { contenido: [] }; }

  const acta = await store.actaDeUnDia(p.id, fecha);
  if (!acta) {
    toast('Ese día no se tocó la obra');
    ir('#/listas', { reemplazar: true });
    return { contenido: [] };
  }

  const c = acta.conteo;
  const esHoy = acta.fecha === store.diaDe(new Date().toISOString());

  const menu = async () => {
    const elegido = await menuTarjeta(`Parte del ${fechaDeActa(acta.fecha)}`, [
      { id: 'pdf', icono: 'download', rotulo: 'Bajar el parte en PDF', sub: 'Para mandarla o archivarla' },
    ]);
    if (elegido === 'pdf') bajar();
  };

  /* El PDF se fabrica entero de una sentada y sin soltar el hilo. Se le
     dan dos fotogramas de margen para que la onda del botón arranque
     antes: si no, la ola se queda congelada a medias mientras el móvil
     monta el documento y parece que la app se ha colgado. */
  const bajar = () => trasLaOnda(() => {
    const blob = actaDelDia({
      fecha: acta.fecha,
      titulo: fechaDeActa(acta.fecha, { conAno: true }),
      diaSemana: diaDeLaSemana(acta.fecha, { mayuscula: true }),
      promocion: p.nombre,
      gente: acta.gente.map((g) => g.nombre),
      conteo: c,
      villas: acta.villas.map((v) => ({
        nombre: unidad(v.unidadId)?.nombre || 'Sin vivienda',
        eventos: v.eventos.map((e) => ({
          tipo: e.tipo,
          hora: hora(e.cuando),
          quien: e.quien || '',
          texto: e.texto || 'Sin descripción',
          nota: e.nota || '',
          oficio: oficio(e.oficio).nombre,
          zona: e.zona || '',
        })),
      })),
    });
    // La entrega, con la hoja de la casa: en el iPhone instalado como
    // app, el enlace de descarga no enseña nada y el «Parte
    // descargado» de antes era mentira (le pasó a Fran en obra). La
    // hoja ofrece el Compartir de iOS —Archivos, WhatsApp, correo,
    // imprimir— y solo avisa de descargado cuando descarga de verdad.
    const nombre = nombreDeFichero(`parte-${p.nombre}`, acta.fecha);
    entregarFichero(new File([blob], nombre, { type: 'application/pdf' }), nombre);
  });

  const cifra = (n, rotulo, clase) => (n ? h('div.d-acta-cifra', { class: clase },
    h('span.n', null, String(n)),
    h('span.r', null, rotulo)) : null);

  return {
    sinTabs: true,
    clase: 'pantalla-diseno',
    contenido: [
      cabecera({ volver: '#/listas', titulo: 'Parte', menu }),
      avisoLocal() || barraSync(),

      // La portada del acta: la fecha grande, como en el papel.
      h('div.d-acta-portada', { class: esHoy ? 'hoy' : '' },
        h('p.d-acta-eyebrow', null, esHoy ? 'Parte de hoy · en curso' : 'Parte de repasos'),
        h('h1.d-acta-fecha', null, fechaDeActa(acta.fecha, { conAno: true })),
        h('p.d-acta-sub', null, `${diaDeLaSemana(acta.fecha, { mayuscula: true })} · ${p.nombre}`),
      ),

      // Quién estuvo. Un acta sin firmas no es un acta.
      h('p.d-epigrafe', null, acta.gente.length === 1 ? 'Quien estuvo' : 'Quienes estuvieron'),
      h('div.d-acta-gente', null,
        grupoAvatares(acta.gente.map((g) => store.persona(g.id, g.nombre)), { tam: 44, max: 6, solape: 14 }),
        h('p.d-acta-nombres', null, listaDeNombres(acta.gente.map((g) => g.nombre))),
      ),

      // El resumen del día, en cifras grandes.
      h('p.d-epigrafe', null, 'Lo que se hizo'),
      h('div.d-acta-cifras', null,
        cifra(c.nuevas, c.nuevas === 1 ? 'repaso nuevo' : 'repasos nuevos', 'gris'),
        cifra(c.completadas, c.completadas === 1 ? 'completado' : 'completados', 'ambar'),
        cifra(c.verificadas, c.verificadas === 1 ? 'verificado' : 'verificados', 'verde'),
        cifra(c.rechazadas, c.rechazadas === 1 ? 'rechazado' : 'rechazados', 'rojo'),
        cifra(c.notas, c.notas === 1 ? 'nota escrita' : 'notas escritas', 'gris'),
      ),

      // Y el detalle, casa por casa.
      ...acta.villas.flatMap((v) => bloqueDeVilla(v)),

      h('button.d-boton-negro', { onclick: bajar, style: { marginTop: '22px' } },
        'Bajar el parte en PDF'),
    ],
  };
}

/** «Fran Acién», «Fran Acién y Alba Ruiz», «Fran, Alba y 2 más». */
function listaDeNombres(nombres) {
  if (!nombres.length) return '';
  if (nombres.length === 1) return nombres[0];
  if (nombres.length === 2) return `${nombres[0]} y ${nombres[1]}`;
  return `${nombres.slice(0, 2).join(', ')} y ${nombres.length - 2} más`;
}

/** Una vivienda del día, con sus hechos en orden. */
function bloqueDeVilla(v) {
  const u = unidad(v.unidadId);
  return [
    h('div.d-acta-villa', null,
      h('span.d-acta-villa-nombre', null, u?.nombre || 'Sin vivienda'),
      h('span.d-acta-villa-cuantos', null,
        v.eventos.length === 1 ? '1 apunte' : `${v.eventos.length} apuntes`),
    ),
    h('div.d-acta-lineas', null, v.eventos.map((e) => linea(e))),
  ];
}

function linea(e) {
  const hecho = HECHOS[e.tipo] || HECHOS.nota;
  const o = oficio(e.oficio);
  return h('button.d-acta-linea', {
    class: hecho.clase,
    onclick: () => ir(`#/l/${e.listaId}/t/${e.tareaId}`),
  },
    h('span.d-acta-hora', null, hora(e.cuando)),
    h('span.d-acta-cuerpo', null,
      h('span.d-acta-hecho', null,
        icon(hecho.icono, 14), hecho.rotulo,
        e.quien ? h('span.d-acta-quien', null, ` · ${e.quien}`) : null),
      h('span.d-acta-texto', null, e.texto || 'Sin descripción'),
      e.nota ? h('span.d-acta-nota', null, `«${e.nota}»`) : null,
      h('span.d-acta-pie', null, [o.nombre, e.zona].filter(Boolean).join(' · ')),
    ),
  );
}
