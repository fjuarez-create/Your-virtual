/* ═══════════════════════════════════════════════════════════════════════════
   shell.js — La carcasa de cristal, conectada al visor nuevo.

   No dibuja nada en 3D: traduce los botones a la API de window.apolo
   (new/js/visor/main.js) y escucha sus eventos ('planta', 'seleccion',
   'momento', 'carga', 'trazado') para marcar el estado. Así la interfaz
   puede rehacerse entera sin tocar el motor, y el motor no sabe qué botón
   existe.
   ═══════════════════════════════════════════════════════════════════════════ */

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const NOMBRE_ESTADO = { disponible: 'Disponible', reservada: 'Reservada', vendida: 'Vendida' };
const euros = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const m2 = (v) => (v > 0 ? `${v.toLocaleString('es-ES', { maximumFractionDigits: 2 })} m²` : '—');

/* main.js publica su API en window.apolo al evaluar el módulo, pero el
   orden de los dos imports del index no está garantizado: se espera. */
function cuandoHayaApp(fn) {
  if (window.apolo?.setMomento) return fn(window.apolo);
  const reloj = setInterval(() => {
    if (window.apolo?.setMomento) { clearInterval(reloj); fn(window.apolo); }
  }, 60);
  setTimeout(() => clearInterval(reloj), 30000);
}

cuandoHayaApp((app) => {
  /* Es una herramienta de la comercializadora, no un escaparate público: no
     hay portada que atravesar, se entra directo al edificio. */
  app.enter?.();

  // ── Barra: vistas ──
  const bConjunto = $('#bConjunto');
  const bEdificio = $('#bEdificio');
  const bPlantas = $('#bPlantas');
  const bPlano = $('#bPlano');
  const panel = $('#plantas');

  function marcarVista(id) {
    for (const b of [bConjunto, bEdificio, bPlantas, bPlano]) b.classList.toggle('on', b.id === id);
  }

  bConjunto.addEventListener('click', () => { cerrarPanel(); app.setPlano(false); app.irConjunto(); marcarVista('bConjunto'); });
  bEdificio.addEventListener('click', () => { cerrarPanel(); app.setPlano(false); app.irEdificio(); marcarVista('bEdificio'); });

  /* La barra se coloca a la altura del botón que la abre; se recalcula al
     abrir y al cambiar el tamaño de la ventana. */
  function alinearPanel() {
    const r = bPlantas.getBoundingClientRect();
    panel.style.setProperty('--plantas-top', `${Math.round(r.top)}px`);
  }
  window.addEventListener('resize', alinearPanel);

  /* Plantas (perspectiva) y Plano (cenital) comparten la misma barra: cambia
     solo si al elegir planta la cámara se coloca encima o se queda donde
     está. `abrirPlantas` recuerda cuál de los dos botones la ha abierto. */
  function abrirPlantas(boton, plano) {
    alinearPanel();
    const abierto = !panel.classList.contains('abierto') || boton.classList.contains('on') === false;
    panel.classList.toggle('abierto', abierto);
    app.setPlano(plano && abierto);
    bPlantas.classList.toggle('on', abierto && !plano);
    bPlano.classList.toggle('on', abierto && plano);
    if (abierto) { bConjunto.classList.remove('on'); bEdificio.classList.remove('on'); }
    else marcarVista(app.floor === 'all' ? (app.vista === 'conjunto' ? 'bConjunto' : 'bEdificio') : (plano ? 'bPlano' : 'bPlantas'));
  }

  bPlantas.addEventListener('click', () => abrirPlantas(bPlantas, false));
  bPlano.addEventListener('click', () => abrirPlantas(bPlano, true));

  function cerrarPanel() {
    panel.classList.remove('abierto');
    bPlantas.classList.remove('on');
    bPlano.classList.remove('on');
  }

  // ── Panel de plantas (1 · 2 · 3 · 4 · Edificio completo, ya en el HTML) ──
  $('#plantasRejilla').addEventListener('click', (e) => {
    const b = e.target.closest('.planta-btn');
    if (!b) return;
    app.setFloor(b.dataset.planta);
    if (b.dataset.planta === 'all') { cerrarPanel(); marcarVista('bEdificio'); }
  });

  function marcarPlanta(clave) {
    for (const b of $$('.planta-btn')) b.classList.toggle('on', b.dataset.planta === clave);
    if (clave !== 'all') {
      bConjunto.classList.remove('on'); bEdificio.classList.remove('on');
      bPlantas.classList.toggle('on', !app.plano);
      bPlano.classList.toggle('on', !!app.plano);
    }
  }
  /* El modo plano también puede encenderse desde fuera (app.setPlano): el
     raíl se entera por el evento, no solo por el clic. */
  app.on('plano', (activo) => {
    if (app.floor === 'all') return;
    bPlantas.classList.toggle('on', !activo);
    bPlano.classList.toggle('on', !!activo);
  });

  app.on('planta', (clave) => {
    marcarPlanta(clave);
    if (clave === 'all' && !panel.classList.contains('abierto')) marcarVista(app.vista === 'conjunto' ? 'bConjunto' : 'bEdificio');
  });
  marcarPlanta(app.floor || 'all');
  marcarVista('bConjunto');

  // ── Momento del día ──
  const horas = $('#horas');
  const icono = (momento) => $(`#horas .opcion[data-momento="${momento}"] use`)?.getAttribute('href');
  $('#horaPrincipal').addEventListener('click', () => horas.classList.toggle('abierto'));
  for (const b of $$('#horas .opcion')) {
    b.addEventListener('click', () => { app.setMomento(b.dataset.momento); horas.classList.remove('abierto'); });
  }
  function marcarMomento(clave) {
    for (const o of $$('#horas .opcion')) o.classList.toggle('on', o.dataset.momento === clave);
    // el botón principal enseña el icono del momento activo
    const href = icono(clave);
    if (href) $('#horaPrincipal use').setAttribute('href', href);
  }
  app.on('momento', marcarMomento);
  marcarMomento(app.momento || 'dia');

  // ── Recentrar: repite el encuadre del estado actual ──
  $('#bCentrar').addEventListener('click', () => app.recentrar());

  // ── Ficha de vivienda ──
  const ficha = $('#ficha');
  function mostrarFicha({ id, unidad, estado }) {
    if (id == null || !unidad) { ficha.hidden = true; return; }
    $('#fichaId').textContent = `Vivienda ${id}`;
    const e = $('#fichaEstado');
    e.textContent = NOMBRE_ESTADO[estado] || estado || '';
    e.dataset.estado = estado || '';
    const dorm = unidad.dorm ? `${unidad.dorm} dormitorio${unidad.dorm === 1 ? '' : 's'}` : '';
    const planta = unidad.planta ? `Planta ${plantaPublica(unidad.planta)}` : '';
    $('#fichaTipo').textContent = [dorm, planta].filter(Boolean).join(' · ');
    $('#fichaSupViv').textContent = m2(unidad.supViv);
    $('#fichaTerraza').textContent = m2(unidad.terraza);
    $('#fichaSupTotal').textContent = m2(unidad.supTotal);
    $('#fichaOrient').textContent = unidad.orientacion || '—';
    $('#fichaPrecio').textContent = unidad.precio ? euros.format(unidad.precio) : '';
    ficha.hidden = false;
  }
  /* units.json conserva la nomenclatura del listado de precios ('Baja',
     '1ª', '2ª', 'Ático'); la numeración pública coincide con el primer
     dígito de la vivienda (1xx → planta 1 … 4xx → planta 4). */
  function plantaPublica(p) { return { 'Baja': '1', '1ª': '2', '2ª': '3', 'Ático': '4' }[p] || p; }
  app.on('seleccion', mostrarFicha);
  $('#fichaVolver').addEventListener('click', () => { app.volverAPlanta(); ficha.hidden = true; });

  /* El reposo vuela solo al conjunto: el raíl lo refleja y se recogen el
     panel de plantas y la ficha, que ya no corresponden a lo que se ve. */
  app.on('reposo', () => { cerrarPanel(); ficha.hidden = true; marcarVista('bConjunto'); });

  // ── Indicador de carga y línea de progreso del trazador ──
  const progreso = $('#progreso');
  const barra = $('#progresoBarra');
  const cargando = $('#cargando');
  const textoCarga = $('#cargandoTexto');
  const ETAPAS = { luz: 'Cielo listo…', edificio: 'Edificio cargado…', entorno: 'Entorno cargado…', listo: '', error: 'No se pudo cargar el visor' };
  let cargado = false;
  function pintarBarra(fraccion, clase) {
    progreso.className = clase;
    barra.style.transform = `scaleX(${Math.max(0, Math.min(1, fraccion))})`;
  }
  app.on('carga', ({ progreso: p, etapa, error, secundaria }) => {
    /* Mobiliario y plantas cortadas llegan después de la primera imagen: la
       línea fina los sigue, sin volver a enseñar el aviso de carga. */
    if (secundaria) {
      if (!cargado) return;
      pintarBarra(p, 'carga');
      if (p >= 1) setTimeout(() => { if (progreso.className === 'carga') progreso.className = ''; }, 600);
      return;
    }
    if (ETAPAS[etapa] !== undefined) textoCarga.textContent = ETAPAS[etapa] || textoCarga.textContent;
    if (error) { textoCarga.textContent = ETAPAS.error; cargando.classList.add('error'); return; }
    pintarBarra(p, 'carga');
    if (p >= 1) {
      cargado = true;
      cargando.classList.add('fuera');
      setTimeout(() => { progreso.className = ''; }, 600);
    }
  });
  /* El trazador: mientras construye el BVH, la línea crece con su progreso;
     mientras acumula muestras, con la convergencia (32 muestras = línea
     completa); en movimiento no se ve nada. */
  app.on('trazado', ({ activo, progreso: p, muestras, pintando }) => {
    if (!cargado || !activo) return;
    if (pintando) pintarBarra(Math.min(1, muestras / 32), 'trazado');
    else if (p > 0 && p < 1) pintarBarra(p, 'bvh');
    else progreso.className = '';
  });

  // ── Capas: renders y vídeo ──
  $('#bRenders').addEventListener('click', () => abrirCapa('capaRenders'));
  $('#bVideo').addEventListener('click', () => abrirCapa('capaVideo'));
  for (const b of $$('.capa-cerrar')) b.addEventListener('click', () => cerrarCapa(b.dataset.cierra));
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    for (const c of $$('.capa.abierta')) cerrarCapa(c.id);
    cerrarPanel();
    horas.classList.remove('abierto');
    if (!ficha.hidden) { app.volverAPlanta(); ficha.hidden = true; }
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

  /* data/multimedia.json lista lo que hay: { renders: [{ src, titulo }],
     video: 'assets/video/….mp4' | null }. Un único manifiesto que siempre
     existe, en vez de pedir cada fichero y comprobar el 404: el navegador
     escribe cada 404 como error en la consola y esta app debe abrirse
     limpia. Se lee una vez y lo comparten las dos capas. */
  let multimedia = null;
  async function leerMultimedia() {
    if (multimedia) return multimedia;
    try {
      const r = await fetch('data/multimedia.json');
      multimedia = r.ok ? await r.json() : {};
    } catch { multimedia = {}; }
    return multimedia;
  }

  /* Galería de renders. Todavía no hay ninguno: en cuanto assets/renders/
     tenga imágenes y multimedia.json las liste, esto las enseña sin tocar
     nada más. */
  let rendersMontados = false;
  async function montarRenders() {
    if (rendersMontados) return;
    rendersMontados = true;
    const lista = Array.isArray((await leerMultimedia()).renders) ? multimedia.renders : [];

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
    const { video } = await leerMultimedia();
    if (typeof video === 'string' && video) {
      v.src = video;
      $('#videoPie').textContent = 'SERENEA · Edificio Apolo';
    } else {
      v.style.display = 'none';
      $('#videoPie').textContent = 'El vídeo de la promoción todavía no está cargado.';
    }
  }
});
