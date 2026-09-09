/* ═══════════════════════════════════════════════════════════════════════════
   shell.js — La carcasa nueva, conectada a la escena.

   No dibuja nada en 3D: se limita a traducir los botones de la barra a las
   órdenes que main.js ya entiende. Así la interfaz puede rehacerse entera sin
   tocar el motor, que es justo lo que estamos haciendo.
   ═══════════════════════════════════════════════════════════════════════════ */
import { FLOOR_DEFS } from 'app/layout.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

/* main.js publica su estado en window.apolo, pero tarda en arrancar: hay que
   esperar a que exista antes de colgarle nada. */
function cuandoHayaApp(fn) {
  if (window.apolo?.setMomento) return fn(window.apolo);
  const reloj = setInterval(() => {
    if (window.apolo?.setMomento) { clearInterval(reloj); fn(window.apolo); }
  }, 60);
  setTimeout(() => clearInterval(reloj), 20000);
}

cuandoHayaApp((app) => {
  /* Es una herramienta de la comercializadora, no un escaparate público: no
     hay portada que atravesar, se entra directo al edificio. */
  app.enter?.();

  // ── Barra: vistas ──
  const bConjunto = $('#bConjunto');
  const bEdificio = $('#bEdificio');
  const bPlantas = $('#bPlantas');
  const panel = $('#plantas');

  function marcarVista(id) {
    for (const b of [bConjunto, bEdificio, bPlantas]) b.classList.toggle('on', b.id === id);
  }

  bConjunto.addEventListener('click', () => {
    cerrarPanel();
    app.setFloor('all');
    marcarVista('bConjunto');
  });

  bEdificio.addEventListener('click', () => {
    cerrarPanel();
    app.setFloor('all');
    marcarVista('bEdificio');
  });

  /* La barra se coloca a la altura del botón que la abre; se recalcula al
     abrir y al cambiar el tamaño de la ventana. */
  function alinearPanel() {
    const r = bPlantas.getBoundingClientRect();
    panel.style.setProperty('--plantas-top', `${Math.round(r.top)}px`);
  }
  window.addEventListener('resize', alinearPanel);

  bPlantas.addEventListener('click', () => {
    alinearPanel();
    const abierto = panel.classList.toggle('abierto');
    bPlantas.classList.toggle('on', abierto);
    if (abierto) { bConjunto.classList.remove('on'); bEdificio.classList.remove('on'); }
  });

  function cerrarPanel() {
    panel.classList.remove('abierto');
    bPlantas.classList.remove('on');
  }

  // ── Panel de plantas ──
  const rejilla = $('#plantasRejilla');
  const plantas = FLOOR_DEFS.filter((f) => f.key !== 'cubierta');
  for (const F of plantas) {
    const b = document.createElement('button');
    b.className = 'planta-btn';
    b.textContent = F.short;
    b.dataset.planta = F.key;
    b.title = F.label;
    rejilla.appendChild(b);
  }
  const todo = document.createElement('button');
  todo.className = 'planta-btn ancho';
  todo.textContent = 'TODO';
  todo.title = 'Edificio completo';
  todo.dataset.planta = 'all';
  rejilla.appendChild(todo);

  rejilla.addEventListener('click', (e) => {
    const b = e.target.closest('.planta-btn');
    if (!b) return;
    app.setFloor(b.dataset.planta);
    marcarPlanta(b.dataset.planta);
  });

  function marcarPlanta(clave) {
    for (const b of $$('.planta-btn')) b.classList.toggle('on', b.dataset.planta === clave);
  }
  marcarPlanta('all');
  marcarVista('bConjunto');

  // ── Momento del día ──
  const horas = $('#horas');
  $('#horaPrincipal').addEventListener('click', () => horas.classList.toggle('abierto'));
  for (const b of $$('#horas .opcion')) {
    b.addEventListener('click', () => {
      app.setMomento(b.dataset.momento);
      for (const o of $$('#horas .opcion')) o.classList.toggle('on', o === b);
      horas.classList.remove('abierto');
    });
  }
  $$('#horas .opcion').find((b) => b.dataset.momento === 'dia')?.classList.add('on');

  // ── Recentrar ──
  $('#bCentrar').addEventListener('click', () => {
    app.setFloor(app.floor);   // rehace el encuadre de lo que esté activo
  });

  // ── Capas: renders y vídeo ──
  $('#bRenders').addEventListener('click', () => abrirCapa('capaRenders'));
  $('#bVideo').addEventListener('click', () => abrirCapa('capaVideo'));
  for (const b of $$('.capa-cerrar')) {
    b.addEventListener('click', () => cerrarCapa(b.dataset.cierra));
  }
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    for (const c of $$('.capa.abierta')) cerrarCapa(c.id);
    cerrarPanel();
    horas.classList.remove('abierto');
  });

  function abrirCapa(id) {
    $('#' + id).classList.add('abierta');
    if (id === 'capaRenders') montarRenders();
    if (id === 'capaVideo') montarVideo();
  }
  function cerrarCapa(id) {
    $('#' + id).classList.remove('abierta');
    if (id === 'capaVideo') $('#videoProm').pause();
  }

  /* Galería de renders. Todavía no hay ninguno: en cuanto assets/renders/
     tenga imágenes y un renders.json que las liste, esto las enseña sin
     tocar nada más. */
  let rendersMontados = false;
  async function montarRenders() {
    if (rendersMontados) return;
    rendersMontados = true;
    let lista = [];
    try {
      const r = await fetch('data/renders.json');
      if (r.ok) lista = await r.json();
    } catch { /* sin listado: se avisa abajo */ }

    const tiras = $('#renderTiras');
    const grande = $('#renderGrande');
    if (!lista.length) {
      $('#renderPie').textContent = 'Aún no hay renders cargados para esta promoción.';
      grande.style.display = 'none';
      return;
    }
    lista.forEach((r, i) => {
      const b = document.createElement('button');
      b.innerHTML = `<img src="${r.src}" alt="">`;
      b.addEventListener('click', () => mostrar(i));
      tiras.appendChild(b);
    });
    function mostrar(i) {
      grande.src = lista[i].src;
      $('#renderPie').textContent = lista[i].titulo || '';
      [...tiras.children].forEach((b, j) => b.classList.toggle('on', j === i));
    }
    mostrar(0);
  }

  /* Vídeo de la promoción. Se sirve desde el propio servidor —nada de
     incrustar YouTube— para que el reproductor sea el nuestro y no aparezcan
     ni anuncios ni vídeos sugeridos al terminar. */
  let videoMontado = false;
  async function montarVideo() {
    if (videoMontado) return;
    videoMontado = true;
    const v = $('#videoProm');
    const r = await fetch('assets/video/promocion.mp4', { method: 'HEAD' }).catch(() => null);
    if (r?.ok) {
      v.src = 'assets/video/promocion.mp4';
      $('#videoPie').textContent = 'SERENEA · Edificio Apolo';
    } else {
      v.style.display = 'none';
      $('#videoPie').textContent = 'El vídeo de la promoción todavía no está cargado.';
    }
  }
});
