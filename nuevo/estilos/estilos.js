/* Propuestas de diseño del showroom SERENEA: prototipo navegable con las tres
   direcciones, catálogo de micro-interacciones y tarjeta «Tu elección».
   Sin dependencias. Las capas interactivas (edificios, plantas, viviendas,
   estancias) salen de los JSON de img/, que casan al píxel con sus imágenes.
   En la versión de un solo fichero (tools/empaquetar_estilos.py) las
   imágenes, las fuentes y los JSON van incrustados: activo() y json() los
   buscan ahí antes de ir a la red. */
(() => {
  'use strict';

  /* ── Utilidades ── */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const NS = 'http://www.w3.org/2000/svg';
  const S = (tag, attrs, padre) => {
    const e = document.createElementNS(NS, tag);
    if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (padre) padre.appendChild(e);
    return e;
  };
  const H = (tag, cls, padre, html) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    if (padre) padre.appendChild(e);
    return e;
  };
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const limitar = (v, a, b) => Math.max(a, Math.min(b, v));
  const REDUCIDO = matchMedia('(prefers-reduced-motion: reduce)');
  const ACTIVOS = window.SERENEA_ACTIVOS || null;
  const ALIAS = window.SERENEA_ALIAS || {};
  const activo = (ruta) => (ACTIVOS && (ACTIVOS[ruta] || ACTIVOS[ALIAS[ruta]])) || ruta;
  const ESTRECHO = matchMedia('(max-width: 760px)').matches;
  const NBSP = ' ';

  /* Formato español: 147.000 € y 63,45 m² (agrupa también los miles de 4 cifras). */
  const miles = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const euros = (n) => (n == null ? 'Consultar' : miles(n) + NBSP + '€');
  const dec = (n, d = 2) => {
    const [e, f] = Number(n).toFixed(d).split('.');
    return miles(Number(e)) + (d ? ',' + f : '');
  };
  const m2 = (n) => (n == null ? '—' : dec(n) + NBSP + 'm²');
  const pct = (n) => String(n).replace('.', ',') + NBSP + '%';

  async function json(ruta) {
    const incrustado = document.querySelector(`script[type="application/json"][data-ruta="${ruta}"]`);
    if (incrustado) return JSON.parse(incrustado.textContent);
    const r = await fetch(ruta, { cache: 'no-cache' });
    if (!r.ok) throw new Error(`${ruta}: ${r.status}`);
    return r.json();
  }

  const IMG = {
    conjunto: { w: 2400, h: 1350, src: 'img/conjunto.webp', m: 'img/conjunto-m.webp' },
    edificio: { w: 2400, h: 1350, src: 'img/edificio.webp', m: 'img/edificio-m.webp' },
    planta: { w: 2400, h: 760, src: 'img/planta-2.webp', m: 'img/planta-2-m.webp' },
    vivienda: { w: 1480, h: 2060, src: 'img/vivienda-238-aislada.webp', m: 'img/vivienda-238-aislada-m.webp' },
    panel: { w: 1200, h: 900, src: 'img/panel-apolo.webp' },
    salon: { w: 1080, h: 1920, src: 'img/estancia-salon.webp', m: 'img/estancia-salon-m.webp' },
  };
  const fuente = (img, ligera = ESTRECHO) => activo(ligera && img.m ? img.m : img.src);
  /* Si se sirvió la ligera, datos para pasar a la grande (ancho real de la -m). */
  const ANCHO_M = { conjunto: 1200, edificio: 1200, salon: 720 };
  const alta = (clave) => (ESTRECHO && IMG[clave].m && !ACTIVOS ? { src: activo(IMG[clave].src), ancho: ANCHO_M[clave] } : null);

  const poligonosAD = (polis) => polis.map((p) => 'M' + p.map(([x, y]) => `${+x.toFixed(1)} ${+y.toFixed(1)}`).join('L') + 'Z').join('');
  const cajaDe = (polis) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of polis) for (const [x, y] of p) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  };
  const ampliar = (c, m) => ({ x: c.x - m, y: c.y - m, w: c.w + 2 * m, h: c.h + 2 * m });
  const icoFlecha = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7.5 4l6 6-6 6"/></svg>';

  /* ══ Visor: imagen + SVG en un lienzo con una sola transformación ══ */
  let uid = 0;
  class Visor {
    constructor(raiz, o) {
      this.raiz = raiz; this.o = o; this.W = o.img.w; this.H = o.img.h; this.id = 'v' + (++uid);
      this.roi = o.roi || { x: 0, y: 0, w: this.W, h: this.H };
      this.lienzo = H('div', 'lienzo');
      this.lienzo.style.width = this.W + 'px';
      this.lienzo.style.height = this.H + 'px';
      this.img = new Image();
      this.img.alt = o.alt || '';
      this.img.decoding = 'async';
      this.img.draggable = false;
      this.img.width = this.W; this.img.height = this.H;
      this.svg = S('svg', { viewBox: `0 0 ${this.W} ${this.H}`, width: this.W, height: this.H, focusable: 'false' });
      if (o.svgEtiqueta) { this.svg.setAttribute('role', 'group'); this.svg.setAttribute('aria-label', o.svgEtiqueta); }
      else this.svg.setAttribute('aria-hidden', 'true');
      this.defs = S('defs', null, this.svg);
      this.lienzo.append(this.img, this.svg);
      this.capa = H('div', 'capa');
      raiz.prepend(this.capa);
      raiz.prepend(this.lienzo);
      this.k = 1; this.tx = 0; this.ty = 0; this.b = null; this.usuario = false;
      this.marcas = []; this.oyentes = []; this.patrones = []; this.suprimirHasta = 0;
      this.w = 0; this.h = 0; this.m = { arr: 0, der: 0, aba: 0, izq: 0 };
      this.ro = new ResizeObserver(() => this.ajustar());
      this.ro.observe(raiz);
      if (o.zoom) this.gestos();
      if (o.cargar !== false) this.cargar();
    }
    cargar() { if (!this.img.getAttribute('src') && this.o.src) this.img.src = this.o.src; }
    al(fn) { this.oyentes.push(fn); }
    medir() {
      this.w = this.raiz.clientWidth; this.h = this.raiz.clientHeight;
      const cs = getComputedStyle(this.raiz);
      const n = (p) => parseFloat(cs.getPropertyValue(p)) || 0;
      this.m = { arr: n('--encuadre-arr'), der: n('--encuadre-der'), aba: n('--encuadre-aba'), izq: n('--encuadre-izq') };
      if (this.w < 600) this.m.izq = this.m.der = 0;
    }
    area() {
      const { w, h, m } = this;
      return { x: m.izq, y: m.arr, w: Math.max(40, w - m.izq - m.der), h: Math.max(40, h - m.arr - m.aba) };
    }
    base() {
      const A = this.area(); const r = this.roi; const W = this.W, Hh = this.H;
      if (this.o.inicial) { const b = this.o.inicial(this, A); if (b) return this.acotar(b); }
      const kc = Math.max(this.w / W, this.h / Hh);
      /* margenPx: píxeles de pantalla que deben quedar libres a cada lado de la zona
         de interés (p. ej., media chincheta), sea cual sea el zoom. */
      const mx = this.o.margenPx || 0;
      const kr = Math.min(Math.max(20, A.w - 2 * mx) / r.w, A.h / r.h) * (this.o.holgura || 1);
      let k;
      switch (this.o.modo) {
        case 'contener': k = kr; break;
        case 'roi-cubrir': k = Math.max(this.w / r.w, this.h / r.h); break;
        case 'cubrir': k = kc; break;
        default: {
          /* encajar: la zona de interés llena el hueco libre y la imagen cubre el resto. Si un
             panel tapa un lado, sube el zoom lo justo para poder centrarla en el hueco libre. */
          k = Math.max(kc, kr);
          const cx = r.x + r.w / 2, cy = r.y + r.h / 2, ax = A.x + A.w / 2, ay = A.y + A.h / 2;
          const m = this.m;
          const nec = Math.max(k,
            m.izq || m.der ? Math.max(ax / cx, (this.w - ax) / (W - cx)) : 0,
            m.arr || m.aba ? Math.max(ay / cy, (this.h - ay) / (Hh - cy)) : 0);
          if (nec <= Math.max(kr, kc) * 1.3) k = nec;
        }
      }
      return this.centrar(k, r.x + r.w / 2, r.y + r.h / 2, A);
    }
    centrar(k, cx, cy, A = this.area()) {
      return this.acotar({ k, tx: A.x + A.w / 2 - cx * k, ty: A.y + A.h / 2 - cy * k });
    }
    acotar({ k, tx, ty }) {
      const iw = this.W * k, ih = this.H * k;
      tx = iw <= this.w ? limitar(tx, 0, this.w - iw) : limitar(tx, this.w - iw, 0);
      ty = ih <= this.h ? limitar(ty, 0, this.h - ih) : limitar(ty, this.h - ih, 0);
      return { k, tx, ty };
    }
    kMin() { return this.b ? this.b.k * (this.o.kMinF || 1) : this.k; }
    kMax() { const b = this.b ? this.b.k : this.k; return Math.max(b * 1.25, typeof this.o.kMax === 'function' ? this.o.kMax(b) : (this.o.kMax || b)); }
    ajustar() {
      const w0 = this.w, h0 = this.h;
      this.medir();
      if (!this.w || !this.h) return;
      if (this.anim) { cancelAnimationFrame(this.anim); this.anim = 0; }
      this.b = this.base();
      if (this.usuario && w0 && h0) {
        const cx = (w0 / 2 - this.tx) / this.k, cy = (h0 / 2 - this.ty) / this.k;
        const k = limitar(this.k, this.kMin(), this.kMax());
        this.poner(this.acotar({ k, tx: this.w / 2 - cx * k, ty: this.h / 2 - cy * k }));
      } else this.poner(this.b);
    }
    reencuadrar(animar = true) {
      this.medir(); if (!this.w) return;
      this.b = this.base(); this.usuario = false;
      animar ? this.animarA(this.b) : this.poner(this.b);
    }
    poner({ k, tx, ty }) {
      this.k = k; this.tx = tx; this.ty = ty;
      /* La versión ligera (-m) se cambia por la grande cuando el zoom o la pantalla
         (móvil en horizontal, tableta) piden más píxeles de los que tiene. El
         navegador mantiene la imagen anterior hasta que la nueva está lista. */
      const al = this.o.alta;
      if (al && !this.altaPuesta && this.img.getAttribute('src') && k * (window.devicePixelRatio || 1) > al.ancho / this.W * 1.3) {
        this.altaPuesta = true; this.img.src = al.src;
      }
      this.lienzo.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${k})`;
      for (const p of this.patrones) p(k);
      for (const mk of this.marcas) this.situarMarca(mk);
      for (const f of this.oyentes) f(this);
      if (this.o.zoom) {
        const libre = this.k > this.kMin() * 1.02 || this.o.tactilLibre || document.body.classList.contains('con-completa');
        this.raiz.classList.toggle('visor-zoom', libre);
        this.raiz.classList.toggle('visor-pany', !libre);
      }
    }
    aPantalla(x, y) { return [x * this.k + this.tx, y * this.k + this.ty]; }
    marca(x, y, hijo) {
      const mk = H('div', 'mk', this.capa);
      mk.appendChild(hijo);
      const r = { el: mk, x, y };
      this.marcas.push(r); this.situarMarca(r);
      return r;
    }
    situarMarca(r) { r.el.style.transform = `translate3d(${(r.x * this.k + this.tx).toFixed(1)}px, ${(r.y * this.k + this.ty).toFixed(1)}px, 0)`; }
    quitarMarcas() { for (const r of this.marcas) r.el.remove(); this.marcas = []; }
    animarA(dest, dur = 460) {
      if (this.anim) cancelAnimationFrame(this.anim);
      dest = this.acotar(dest);
      if (REDUCIDO.matches || !this.w) { this.poner(dest); return Promise.resolve(); }
      const ini = { k: this.k, tx: this.tx, ty: this.ty };
      const t0 = performance.now();
      this.lienzo.style.willChange = 'transform';
      return new Promise((res) => {
        const paso = (t) => {
          const u = Math.min(1, (t - t0) / dur);
          const e = 1 - Math.pow(1 - u, 3);
          const k = Math.exp(Math.log(ini.k) + (Math.log(dest.k) - Math.log(ini.k)) * e);
          /* Interpola el punto de la imagen que queda en el centro para que el zoom no «patine». */
          const c0x = (this.w / 2 - ini.tx) / ini.k, c0y = (this.h / 2 - ini.ty) / ini.k;
          const c1x = (this.w / 2 - dest.tx) / dest.k, c1y = (this.h / 2 - dest.ty) / dest.k;
          const cx = c0x + (c1x - c0x) * e, cy = c0y + (c1y - c0y) * e;
          this.poner({ k, tx: this.w / 2 - cx * k, ty: this.h / 2 - cy * k });
          if (u < 1) this.anim = requestAnimationFrame(paso);
          else { this.anim = 0; this.poner(dest); this.lienzo.style.willChange = ''; res(); }
        };
        this.anim = requestAnimationFrame(paso);
      });
    }
    encuadrar(caja, { margen = 1.12, kMax = Infinity, animar = true, dur } = {}) {
      this.medir();
      const A = this.area();
      const k = Math.min(A.w / (caja.w * margen), A.h / (caja.h * margen), kMax);
      const d = this.centrar(k, caja.x + caja.w / 2, caja.y + caja.h / 2, A);
      return animar ? this.animarA(d, dur) : (this.poner(d), Promise.resolve());
    }
    zoomEn(f, px = this.w / 2, py = this.h / 2, animar = true) {
      const k = limitar(this.k * f, this.kMin(), this.kMax());
      const ix = (px - this.tx) / this.k, iy = (py - this.ty) / this.k;
      const d = this.acotar({ k, tx: px - ix * k, ty: py - iy * k });
      this.usuario = k > this.kMin() * 1.001;
      return animar ? this.animarA(d, 280) : (this.poner(d), Promise.resolve());
    }
    suprimido() { return performance.now() < this.suprimirHasta; }
    gestos() {
      const pts = new Map(); let ini = null; let movido = false;
      const instantanea = () => {
        const p = [...pts.values()];
        const c = p.length === 2 ? { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2, d: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) } : { x: p[0].x, y: p[0].y, d: 1 };
        return { k: this.k, tx: this.tx, ty: this.ty, ...c, n: p.length };
      };
      const local = (e) => { const r = this.raiz.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
      this.raiz.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        if (e.target.closest('.zoom, .m-acciones, .minimapa, .r360-cab')) return;
        pts.set(e.pointerId, local(e));
        if (pts.size === 1) movido = false;
        ini = instantanea();
        if (this.anim) { cancelAnimationFrame(this.anim); this.anim = 0; }
      });
      this.raiz.addEventListener('pointermove', (e) => {
        if (!pts.has(e.pointerId)) return;
        pts.set(e.pointerId, local(e));
        const a = instantanea();
        if (!movido && (a.n === 2 || Math.hypot(a.x - ini.x, a.y - ini.y) > 6)) {
          movido = true;
          try { this.raiz.setPointerCapture(e.pointerId); } catch (_) { /* sin captura */ }
          this.raiz.classList.add('arrastrando');
          this.lienzo.style.willChange = 'transform';
        }
        if (!movido) return;
        let k = ini.k;
        if (a.n === 2 && ini.n === 2) k = limitar(ini.k * a.d / ini.d, this.kMin(), this.kMax());
        const ix = (ini.x - ini.tx) / ini.k, iy = (ini.y - ini.ty) / ini.k;
        this.poner(this.acotar({ k, tx: a.x - ix * k, ty: a.y - iy * k }));
        this.usuario = true;
      });
      const fin = (e) => {
        if (!pts.has(e.pointerId)) return;
        pts.delete(e.pointerId);
        if (pts.size) { ini = instantanea(); return; }
        this.raiz.classList.remove('arrastrando');
        this.lienzo.style.willChange = '';
        if (movido) { this.suprimirHasta = performance.now() + 120; this.usuario = true; }
      };
      this.raiz.addEventListener('pointerup', fin);
      this.raiz.addEventListener('pointercancel', fin);
      this.raiz.addEventListener('wheel', (e) => {
        const libre = document.body.classList.contains('con-completa') || this.o.ruedaLibre;
        if (!(e.ctrlKey || e.metaKey || libre)) return;
        e.preventDefault();
        const p = local(e);
        this.zoomEn(Math.exp(-e.deltaY * (e.ctrlKey ? .01 : .0022)), p.x, p.y, false);
      }, { passive: false });
      this.raiz.addEventListener('dblclick', (e) => {
        if (e.target.closest('.zoom, .m-acciones, button')) return;
        const p = local(e);
        if (this.k >= this.kMax() * .98) this.reencuadrar(true);
        else this.zoomEn(1.9, p.x, p.y, true);
      });
    }
    /* Trama a 45° con separación constante en pantalla, sea cual sea el zoom. */
    trama(id, clase, paso = 7, grosor = 1.6, fondo = false) {
      const pat = S('pattern', { id, patternUnits: 'userSpaceOnUse', width: paso, height: paso, patternTransform: 'rotate(45)' }, this.defs);
      const rect = fondo ? S('rect', { class: 'pat-fondo', width: paso, height: paso }, pat) : null;
      const linea = S('line', { class: clase, x1: 0, y1: 0, x2: 0, y2: paso }, pat);
      this.patrones.push((k) => {
        const s = paso / k;
        pat.setAttribute('width', s); pat.setAttribute('height', s);
        linea.setAttribute('y2', s); linea.style.strokeWidth = grosor / k;
        if (rect) { rect.setAttribute('width', s); rect.setAttribute('height', s); }
      });
      return `url(#${id})`;
    }
  }

  /* Capa de resalte (H1–H4) para un polígono. */
  function resalte(padre, d, W, Hh, trama) {
    const g = S('g', { class: 'res' }, padre);
    S('path', { d, class: 'r-relleno' }, g);
    S('path', { d, class: 'r-contorno' }, g);
    S('path', { d, class: 'r-rayado', fill: trama }, g);
    S('path', { d: `M-4000 -4000H${W + 4000}V${Hh + 4000}H-4000Z` + d, class: 'r-oscuro' }, g);
    S('path', { d, class: 'r-oscuro-borde' }, g);
    return g;
  }

  /* Etiqueta flotante dentro de un visor, sin salirse de su zona libre. */
  function crearEtiqueta(visor) {
    const el = H('div', 'etiqueta', visor.capa);
    el.setAttribute('aria-hidden', 'true');
    el.style.position = 'absolute';
    const et = { el, ancla: null, visor };
    visor.al(() => { if (et.ancla) et.colocar(et.ancla); });
    et.mostrar = (html, ancla, tactil = false) => {
      el.innerHTML = html; el.classList.toggle('tactil', tactil); et.ancla = ancla; et.colocar(ancla); el.classList.add('on');
    };
    et.ocultar = () => { el.classList.remove('on'); et.ancla = null; };
    et.colocar = (a) => {
      const v = visor; const A = v.area();
      const bw = el.offsetWidth, bh = el.offsetHeight;
      let x, y;
      if (a.puntero) { x = a.px + 18; y = a.py - bh - 14; if (x + bw > A.x + A.w - 8) x = a.px - bw - 18; if (y < A.y + 8) y = a.py + 22; }
      else {
        const [sx, sy] = v.aPantalla(a.x, a.y);
        x = sx - bw / 2; y = sy - bh - 12;
        if (y < A.y + 8 && a.y2 != null) y = v.aPantalla(a.x, a.y2)[1] + 12;
      }
      x = limitar(x, A.x + 8, Math.max(A.x + 8, A.x + A.w - bw - 8));
      y = limitar(y, A.y + 8, Math.max(A.y + 8, A.y + A.h - bh - 8));
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    };
    return et;
  }

  /* Ancho en pantalla de una etiqueta de estado (.et-estado: 10 px, mayúsculas,
     espaciado .04em, relleno 4 px y filete de 1 px). */
  let lienzoMedida = null;
  function anchoEtiqueta(texto) {
    lienzoMedida = lienzoMedida || document.createElement('canvas').getContext('2d');
    lienzoMedida.font = '500 10px "NHG Text", "Helvetica Neue", "Arimo Serenea", Arial, sans-serif';
    const t = texto.toUpperCase();
    return Math.ceil(lienzoMedida.measureText(t).width + t.length * .4 + 10);
  }

  /* Velos de no disponibles (V1–V3) y estado reservada (R1–R3). */
  function dibujarVelos(visor, unidades, pref, src, conEtiquetas = true) {
    const tramaVelo = visor.trama(`${pref}-velo`, 'pat-velo', 6, 1);
    const capaDesat = S('g', null, visor.svg);
    const filtro = S('filter', { id: `${pref}-desat`, 'color-interpolation-filters': 'sRGB' }, visor.defs);
    S('feColorMatrix', { type: 'saturate', values: '0' }, filtro);
    const ct = S('feComponentTransfer', null, filtro);
    for (const c of ['R', 'G', 'B']) S(`feFunc${c}`, { type: 'linear', slope: '.62', intercept: '.3' }, ct);
    for (const estado of ['vendida', 'reservada']) {
      const lista = unidades.filter((u) => u.estado === estado);
      if (!lista.length) continue;
      const clip = S('clipPath', { id: `${pref}-clip-${estado}` }, visor.defs);
      S('path', { d: lista.map((u) => u.d).join('') }, clip);
      const im = S('image', { href: src, x: 0, y: 0, width: visor.W, height: visor.H, 'clip-path': `url(#${pref}-clip-${estado})`, filter: `url(#${pref}-desat)`, class: `desat ${estado}`, preserveAspectRatio: 'none' }, capaDesat);
      im.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', src);
    }
    const g = S('g', null, visor.svg);
    const etiquetas = [];
    for (const u of unidades) {
      if (u.estado === 'disponible') continue;
      const gv = S('g', { class: `velo ${u.estado}` }, g);
      S('path', { d: u.d, class: 'v-gris' }, gv);
      S('path', { d: u.d, class: 'v-rayado-fondo' }, gv);
      S('path', { d: u.d, class: 'v-rayado', fill: tramaVelo }, gv);
      S('path', { d: u.d, class: 'v-marco' }, gv);
      S('path', { d: u.d, class: 'v-borde-res' }, gv);
      if (conEtiquetas) {
        const largo = u.estado === 'vendida' ? 'Vendida' : 'Reservada';
        const corto = u.estado === 'vendida' ? 'Vend.' : 'Res.';
        const t = H('span', `et-estado ${u.estado}`, null, `<span class="et-largo">${largo}</span>${corto ? `<span class="et-corto" aria-hidden="true">${corto}</span>` : ''}`);
        t.dataset.r = u.estado;
        etiquetas.push({ u, t, lw: anchoEtiqueta(largo), cw: corto ? anchoEtiqueta(corto) : Infinity, mk: visor.marca(u.centroide[0], u.centroide[1], t) });
      }
    }
    if (conEtiquetas) {
      /* Las etiquetas de un mismo estado van todas enteras o todas abreviadas
         («Res.», «Vend.»): en cuanto una no cabe en su vivienda con el zoom
         actual, se abrevian todas. Solo se oculta la que ni abreviada cabe. Los
         anchos se miden una vez con canvas para no forzar el maquetado en cada
         fotograma. */
      visor.al((v) => {
        const corta = { vendida: false, reservada: false };
        for (const e of etiquetas) if (e.lw > e.u.caja.w * v.k - 6) corta[e.u.estado] = true;
        for (const e of etiquetas) {
          const c = corta[e.u.estado];
          e.t.classList.toggle('corta', c);
          e.t.classList.toggle('oculta', (c ? e.cw : e.lw) > e.u.caja.w * v.k + (c ? 4 : -6));
        }
      });
    }
    return { etiquetas };
  }

  /* ══ Estado de la elección ══ */
  const DIRS = {
    galeria: { nombre: 'Galería', frase: '<b>Galería.</b> Blanco hueso, filetes de 1 px y cifras grandes: el edificio y el precio se leen como en un catálogo de arte, sin ruido. La más atemporal y la que mejor se lee al sol en el móvil.', corta: 'Blanco hueso, filetes finos y cifras grandes: se lee como un catálogo de arte.', rec: { h: 'H2', v: 'V1', r: 'R2', p: 'P3', t: 'T1', l: 'L1' } },
    plano: { nombre: 'Plano', frase: '<b>Plano.</b> Habla el idioma del proyecto: retícula, cotas, escala gráfica, norte y cajetín, en negro con un solo rojo. Transmite rigor técnico y que cada metro es real.', corta: 'El idioma del proyecto: retícula, cotas, escala y cajetín, en negro y un rojo.', rec: { h: 'H3', v: 'V2', r: 'R2', p: 'P4', t: 'T2', l: 'L1' } },
    nocturno: { nombre: 'Nocturno', frase: '<b>Nocturno.</b> La imagen manda: renders a sangre, paneles negros sólidos y un solo acento arena. La más inmersiva, pensada para lucir los renders y el vídeo.', corta: 'La imagen manda: renders a sangre, paneles negros sólidos y un acento arena.', rec: { h: 'H4', v: 'V1', r: 'R2', p: 'P1', t: 'T3', l: 'L2' } },
  };
  const GRUPOS = [
    { k: 'h', titulo: 'Resalte de planta', texto: 'Lo que pasa al pasar el ratón o tocar una planta del edificio. El mismo efecto marca la vivienda bajo el ratón en la planta.', ir: 'edificio',
      op: { H1: ['Relleno tintado', 'La planta se tiñe con el color de la dirección.'], H2: ['Contorno', 'Solo el perfil de la planta, con una línea firme.'], H3: ['Rayado', 'Trama a 45° como en un plano, con su contorno.'], H4: ['Oscurecer el resto', 'Todo lo demás se apaga y la planta queda limpia.'] } },
    { k: 'v', titulo: 'Velo de no disponibles', texto: 'Cómo se apagan en la planta las viviendas que no están a la venta, con la geometría exacta de cada una.', ir: 'planta',
      op: { V1: ['Gris 55 %', 'Velo gris translúcido, como en tu descripción. El más fácil de leer.'], V2: ['Rayado', 'Trama a 45°: se intuye el mobiliario y se lee «no disponible».'], V3: ['Desaturado con etiqueta', 'La vivienda pierde el color y lleva escrito su estado.'] } },
    { k: 'r', titulo: 'Viviendas reservadas', texto: 'Si una reservada se distingue de una vendida y si se puede abrir.', ir: 'planta',
      op: { R1: ['Igual que vendida', 'Una sola categoría: no disponible. No se abre.'], R2: ['Diferenciada', 'Velo más ligero y borde discontinuo. No se abre.'], R3: ['Consultable', 'Diferenciada y con ficha visible, sin pagos. Útil si la reserva cae.'] } },
    { k: 'p', titulo: 'Bolita de onda', texto: 'El punto de cada estancia que lleva al 360. Ondas planas, sin destellos de luz.', ir: 'vivienda',
      op: { P1: ['Anillos concéntricos', 'Tres anillos que se expanden y se desvanecen.'], P2: ['Onda única', 'Un solo anillo, más pausado.'], P3: ['Punto que respira', 'El contorno crece y decrece sin alejarse del punto.'], P4: ['Cuadrada', 'La versión rectilínea: punto y ondas cuadradas.'] } },
    { k: 't', titulo: 'Transición entre pantallas', texto: 'Cómo se pasa de una pantalla a la siguiente. En el showroom real, del conjunto al edificio irá el vídeo de cámara; esto es para el resto de pasos.', ir: 'conjunto',
      op: { T1: ['Fundido', 'La pantalla nueva aparece sobre la anterior.'], T2: ['Barrido', 'La nueva entra de lado y, al volver, sale por donde entró.'], T3: ['Zoom al elemento', 'Se acerca al punto pulsado y la nueva nace de ahí.'] } },
    { k: 'l', titulo: 'Panel de la vivienda', texto: 'Dónde va la ficha en el ordenador. En el móvil es siempre una hoja inferior que se arrastra hacia arriba.', ir: 'vivienda',
      op: { L1: ['Columna', 'Como en tu storyboard: ficha a la izquierda y plano a la derecha.'], L2: ['Tarjeta flotante', 'El plano ocupa toda la pantalla y la ficha flota encima.'], L3: ['Hoja lateral', 'La ficha entra de lado y se recoge para ver el plano entero.'] } },
  ];
  const CLAVE = 'serenea-estilos-v1';
  const estado = { dir: 'galeria', ...DIRS.galeria.rec, propio: false };
  try {
    const g = JSON.parse(localStorage.getItem(CLAVE) || 'null');
    if (g && DIRS[g.dir]) {
      estado.dir = g.dir; estado.propio = !!g.propio;
      for (const G of GRUPOS) if (g[G.k] && G.op[g[G.k]]) estado[G.k] = g[G.k];
    }
  } catch (_) { /* sin almacenamiento: valores por defecto */ }
  const hashDir = location.hash.replace('#', '');
  if (DIRS[hashDir]) {
    if (hashDir !== estado.dir && !estado.propio) Object.assign(estado, DIRS[hashDir].rec);
    estado.dir = hashDir;
  }
  const guardar = () => { try { localStorage.setItem(CLAVE, JSON.stringify(estado)); } catch (_) { /* nada */ } };
  const codigo = () => [DIRS[estado.dir].nombre, ...GRUPOS.map((g) => estado[g.k])].join(' · ');

  const pagina = $('#pagina');
  const proto = $('#proto');
  proto.classList.add('tema');
  document.documentElement.lang = 'es';

  /* ══ Datos ══ */
  let D = null;
  const visores = [];
  const nuevoVisor = (raiz, o) => { const v = new Visor(raiz, o); visores.push(v); return v; };

  function preparar([serenea, conjunto, edificio, planta, vivienda]) {
    const apolo = serenea.edificios.find((e) => e.id === 'apolo') || serenea.edificios[0];
    const plantas = apolo.plantas.slice().sort((a, b) => a.orden - b.orden);
    const viv = new Map();
    for (const p of plantas) for (const v of p.viviendas) viv.set(String(v.id), { ...v, planta: p });
    const cuenta = (lista) => {
      const c = { disponible: 0, reservada: 0, vendida: 0, total: 0 };
      for (const v of lista) { if (v.visible === false) continue; c.total++; c[v.estado === 'disponible' ? 'disponible' : v.estado === 'reservada' ? 'reservada' : 'vendida']++; }
      return c;
    };
    const unidades = planta.viviendas.map((u) => {
      const datos = viv.get(String(u.id));
      let est = datos ? datos.estado : u.estado;
      if (datos && datos.visible === false) est = 'vendida';
      if (est !== 'disponible' && est !== 'reservada') est = 'vendida';
      return { id: String(u.id), estado: est, datos, d: poligonosAD([u.puntos]), caja: cajaDe([u.puntos]), puntos: u.puntos, centroide: u.centroide };
    });
    const edificiosConj = conjunto.edificios.map((e) => {
      const n = e.numero ?? e.numeroProbable;
      const info = serenea.edificios.find((s) => s.numero === n) || {};
      return { ...e, n, nombre: info.nombre || e.nombre || `Edificio ${n}`, estadoCom: info.estado || (e.id === 'apolo' ? 'en-venta' : 'proximamente'), d: poligonosAD(e.poligonos), caja: cajaDe(e.poligonos) };
    }).sort((a, b) => a.n - b.n);
    const suelos = (edificio.limitesNivel && edificio.limitesNivel[0] && edificio.limitesNivel[0].suelos) || null;
    const pisos = edificio.plantas.map((p) => {
      const pl = plantas[p.nivel - 1];
      return { ...p, d: poligonosAD(p.poligonos), caja: cajaDe(p.poligonos), info: pl, cuenta: cuenta(pl ? pl.viviendas : []), cota: suelos ? suelos[p.nivel - 1] - suelos[0] : null, nombreVisible: pl ? pl.nombre : p.nombre };
    });
    const v238 = { ...vivienda, contornoD: poligonosAD([vivienda.contorno]) };
    D = { serenea, apolo, plantas, viv, cuenta, unidades, uPorId: new Map(unidades.map((u) => [u.id, u])), conjunto, edificiosConj, edificio, pisos, planta, vivienda: v238, cuentaApolo: cuenta([...viv.values()]) };
    const g = serenea.generado ? new Date(serenea.generado) : new Date();
    D.fecha = `${String(g.getDate()).padStart(2, '0')}.${String(g.getMonth() + 1).padStart(2, '0')}.${g.getFullYear()}`;
  }

  /* ══ Avisos ══ */
  let tAviso = 0;
  /* En el ordenador el aviso se centra en la imagen de la pantalla actual, sin
     pisar la ficha, el panel de Nocturno ni el minimapa. */
  function colocarAviso(a) {
    a.style.left = ''; a.style.maxWidth = '';
    if (!D || proto.clientWidth <= 720) return;
    const z = P.modal
      ? (P.modal.vista === '360' ? $('#v-360') : P.modal.vista === 'pagos' ? $('#mv-pagos') : (P.modal.id === D.vivienda.id ? $('#v-vivienda') : $('#v-recorte')))
      : $(`#e-${P.escena} .e-visor`);
    if (!z) return;
    const pr = proto.getBoundingClientRect(), zr = z.getBoundingClientRect();
    let izq = zr.left, der = zr.right;
    const tapa = P.modal ? $('#ficha') : (pagina.dataset.dir === 'nocturno' ? $(`#e-${P.escena} .e-info`) : null);
    if (tapa) { const t = tapa.getBoundingClientRect(); if (t.width && t.right > izq && t.right < zr.left + zr.width * .6) izq = t.right; }
    if (P.modal && P.modal.vista === '360' && !$('#minimapa').hidden) der = Math.min(der, $('#minimapa').getBoundingClientRect().left - 8);
    a.style.left = ((izq + der) / 2 - pr.left).toFixed(0) + 'px';
    a.style.maxWidth = Math.max(240, der - izq - 32).toFixed(0) + 'px';
  }
  function aviso(texto) {
    const a = $('#p-aviso');
    a.textContent = texto; colocarAviso(a); a.classList.add('on');
    clearTimeout(tAviso); tAviso = setTimeout(() => a.classList.remove('on'), 3200);
  }
  /* Un aviso es de la pantalla en la que se dio: al cambiar de pantalla se retira. */
  function quitarAviso() { clearTimeout(tAviso); $('#p-aviso').classList.remove('on'); }

  /* ══ Cajetín (dirección Plano) ══ */
  const HOJAS = { conjunto: '01', edificio: '02', planta: '03', vivienda: '04', '360': '05', pagos: '06' };
  function cajetin(clave, plano, escalaHTML) {
    const c = $(`.cajetin[data-cajetin="${clave}"]`);
    if (!c) return;
    c.innerHTML = `<div class="cj-c ancha"><span>Proyecto</span><b>Residencial Serenea · Las Huesas, Telde</b></div>
      <div class="cj-c"><span>Plano</span><b>${esc(plano)}</b></div>
      <div class="cj-c"><span>Hoja</span><b>${HOJAS[clave]} / 06</b></div>
      <div class="cj-c"><span>Escala</span><b class="cj-escala" data-escala>${escalaHTML || 'Sin escala'}</b></div>
      <div class="cj-c"><span>Fecha</span><b>${D.fecha}</b></div>`;
  }
  function escalaGrafica(pxPorM) {
    const opciones = [0.5, 1, 2, 5, 10, 20, 50];
    let L = opciones.find((l) => l * pxPorM >= 56) || 50;
    const ancho = L * pxPorM;
    return `<span class="escala-barra" style="width:${ancho.toFixed(0)}px"><i style="width:25%"></i><i style="width:25%"></i><i style="width:25%"></i><i style="width:25%"></i></span><span class="escala-num">${dec(L, L < 1 ? 1 : 0)} m</span>`;
  }
  function actualizarEscala(clave, pxPorM) {
    if (pagina.dataset.dir !== 'plano') return;
    const b = $(`.cajetin[data-cajetin="${clave}"] [data-escala]`);
    if (b) b.innerHTML = escalaGrafica(pxPorM);
  }

  /* Cota (dirección Plano): línea con remates a 45° y el texto en metros. */
  function cota(visor, x1, y1, x2, y2, texto, vertical = false) {
    const g = S('g', { class: 'cota' }, visor.svg);
    const p = S('path', { class: 'cota-l' }, g);
    const t = H('span', 'cota-t' + (vertical ? ' vertical' : ''), null, texto);
    const mk = visor.marca(vertical ? x1 : (x1 + x2) / 2, vertical ? (y1 + y2) / 2 : y1, t);
    mk.el.classList.add('cota');
    const dibujar = (v) => {
      const r = 6 / v.k;
      const tick = (x, y) => `M${x - r} ${y + r}L${x + r} ${y - r}`;
      const ext = 10 / v.k;
      p.setAttribute('d', vertical
        ? `M${x1} ${y1}V${y2}${tick(x1, y1)}${tick(x1, y2)}M${x1 - ext / 2} ${y1}H${x1 + ext * 2}M${x1 - ext / 2} ${y2}H${x1 + ext * 2}`
        : `M${x1} ${y1}H${x2}${tick(x1, y1)}${tick(x2, y1)}M${x1} ${y1 - ext / 2}V${y1 + ext * 2}M${x2} ${y1 - ext / 2}V${y1 + ext * 2}`);
    };
    visor.al(dibujar);
    if (visor.w) dibujar(visor);
    return g;
  }
  function norte(raiz) {
    const n = H('div', 'norte', raiz, '<svg viewBox="0 0 26 34" aria-hidden="true"><path d="M13 2v30M13 2 7 14h12z"/></svg><span>N</span>');
    n.setAttribute('aria-hidden', 'true');
  }

  /* ══ Prototipo ══ */
  const P = { escena: 'conjunto', modal: null, ocupado: false };
  let vConj, vEdif, vPlanta, vViv, vRec, v360;
  let etPlanta, etEdif, etViv;

  function montarConjunto() {
    const raiz = $('#v-conjunto');
    vConj = nuevoVisor(raiz, { img: IMG.conjunto, src: fuente(IMG.conjunto), alta: alta('conjunto'), modo: 'encajar', roi: { x: 560, y: 200, w: 1560, h: 700 }, holgura: .94, margenPx: 24, alt: 'Vista aérea del Residencial Serenea con sus cinco edificios' });
    const trama = vConj.trama('pc-rayado', 'pat-linea', 8, 2, true);
    const capaRes = S('g', null, vConj.svg);
    const capaHit = S('g', null, vConj.svg);
    const lista = $('#lista-edificios');
    const ca = D.cuentaApolo;
    $('#c-total').textContent = ca.total;
    $('#c-disp').textContent = ca.disponible;
    for (const ed of D.edificiosConj) {
      const activo = ed.estadoCom === 'en-venta';
      const g = resalte(capaRes, ed.d, vConj.W, vConj.H, trama);
      const hit = S('path', { d: ed.d, class: 'hit' + (activo ? '' : ' hit-inerte') }, capaHit);
      const pin = H('button', 'pin ' + (activo ? 'activo' : 'proximo'));
      pin.type = 'button';
      pin.setAttribute('aria-label', activo ? `${ed.n}, ${ed.nombre}: ver el edificio` : `${ed.n}, ${ed.nombre}: próximamente`);
      pin.innerHTML = `<span class="pin-cabeza"><span class="pin-n">${ed.n}</span><span class="pin-sub">${activo ? '02' : '—'}</span></span><span class="pin-mastil"></span><span class="pin-et">${esc(ed.nombre)} <small>${activo ? `${ca.disponible} disponibles` : 'Próximamente'}</small></span>`;
      vConj.marca(ed.chincheta[0], ed.chincheta[1], pin);
      const li = H('li', null, lista);
      const fila = H('button', 'fila-boton', li, `<span class="fb-n">${ed.n}</span><span><span class="fb-nombre">${esc(ed.nombre)}</span><span class="fb-sub">${activo ? `${ca.total} viviendas` : 'Próximamente'}</span></span><span class="fb-dato">${activo ? `${ca.disponible}<small>disponibles</small>` : ''}</span>${icoFlecha}`);
      fila.type = 'button';
      if (!activo) fila.setAttribute('aria-disabled', 'true');
      const encender = (on) => { g.classList.toggle('on', on && activo); pin.classList.toggle('on', on); fila.classList.toggle('on', on); };
      const pulsar = (e) => {
        if (vConj.suprimido()) return;
        if (!activo) { aviso(`${ed.nombre}: próximamente. Ahora solo está a la venta Apolo.`); return; }
        ir('edificio', { origen: origenDe(e, vConj, ed.chincheta) });
      };
      for (const x of [hit, pin, fila]) {
        x.addEventListener('pointerenter', () => encender(true));
        x.addEventListener('pointerleave', () => encender(false));
        x.addEventListener('click', pulsar);
      }
      for (const x of [pin, fila]) { x.addEventListener('focus', () => encender(true)); x.addEventListener('blur', () => encender(false)); }
    }
    cajetin('conjunto', 'Conjunto · 5 edificios', 'Sin escala · perspectiva');
  }

  function montarEdificio() {
    const raiz = $('#v-edificio');
    vEdif = nuevoVisor(raiz, { img: IMG.edificio, src: fuente(IMG.edificio), alta: alta('edificio'), modo: 'encajar', roi: { x: 580, y: 400, w: 1700, h: 560 }, holgura: .96, alt: 'Edificio Apolo desde el noroeste', cargar: false });
    $('#ed-texto').textContent = D.apolo.texto || '';
    const trama = vEdif.trama('pe-rayado', 'pat-linea', 8, 2, true);
    const capaRes = S('g', null, vEdif.svg);
    const capaHit = S('g', null, vEdif.svg);
    etEdif = crearEtiqueta(vEdif);
    const lista = $('#lista-plantas');
    let tactil = false; let tocado = null;
    vEdif.raiz.addEventListener('pointerdown', (e) => { tactil = e.pointerType !== 'mouse'; }, true);
    const filas = new Map();
    const pisosArriba = D.pisos.slice().sort((a, b) => b.nivel - a.nivel);
    for (const p of D.pisos) {
      p.g = resalte(capaRes, p.d, vEdif.W, vEdif.H, trama);
      p.hit = S('path', { d: p.d, class: 'hit' }, capaHit);
    }
    const html = (p) => `<span class="et-t">${esc(p.nombreVisible)}</span><span class="et-s"><b>${p.cuenta.disponible}</b> viviendas disponibles de ${p.cuenta.total}</span><span class="et-pista">Toca otra vez para entrar</span>`;
    const encender = (p, on, ancla) => {
      for (const q of D.pisos) { q.g.classList.toggle('on', on && q === p); filas.get(q).classList.toggle('on', on && q === p); }
      if (on) etEdif.mostrar(html(p), ancla || { x: p.caja.x + p.caja.w * .62, y: p.caja.y, y2: p.caja.y + p.caja.h }, ancla ? false : tactil);
      else etEdif.ocultar();
    };
    const entrar = (p, origen) => {
      if (p.nivel === 2) ir('planta', { origen });
      else aviso(`${p.nombreVisible}: su vista de planta llegará con los renders. En esta maqueta está la planta 2.`);
    };
    for (const p of pisosArriba) {
      const li = H('li', null, lista);
      const cotaTxt = p.cota != null ? ` · +${dec(p.cota)} m` : '';
      const fila = H('button', 'fila-boton', li, `<span class="fb-n">${p.nivel}</span><span><span class="fb-nombre">${esc(p.nombreVisible)}</span><span class="fb-sub">${p.cuenta.total} viviendas<span class="solo-plano">${cotaTxt}</span></span></span><span class="fb-dato">${p.cuenta.disponible}<small>disponibles</small></span>${icoFlecha}`);
      fila.type = 'button';
      fila.setAttribute('aria-label', `${p.nombreVisible}: ${p.cuenta.disponible} viviendas disponibles de ${p.cuenta.total}`);
      filas.set(p, fila);
      fila.addEventListener('pointerenter', () => encender(p, true));
      fila.addEventListener('pointerleave', () => encender(p, false));
      fila.addEventListener('focus', () => encender(p, true));
      fila.addEventListener('blur', () => encender(p, false));
      fila.addEventListener('click', (e) => entrar(p, origenDe(e, vEdif, [p.caja.x + p.caja.w / 2, p.caja.y + p.caja.h / 2])));
      p.hit.addEventListener('pointermove', (e) => {
        if (e.pointerType !== 'mouse') return;
        const r = vEdif.raiz.getBoundingClientRect();
        if (!p.g.classList.contains('on')) encender(p, true, { puntero: true, px: e.clientX - r.left, py: e.clientY - r.top });
        else etEdif.colocar(etEdif.ancla = { puntero: true, px: e.clientX - r.left, py: e.clientY - r.top });
      });
      p.hit.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') encender(p, false); });
      p.hit.addEventListener('click', (e) => {
        if (vEdif.suprimido()) return;
        if (tactil && tocado !== p) { tocado = p; encender(p, true); return; }
        tocado = null;
        entrar(p, origenDe(e, vEdif));
      });
    }
    cajetin('edificio', 'Edificio Apolo · 4 plantas', 'Sin escala · perspectiva');
  }

  function montarPlanta() {
    const raiz = $('#v-planta');
    const roi = { x: 70, y: 50, w: 2260, h: 660 };
    vPlanta = nuevoVisor(raiz, {
      img: IMG.planta, src: activo(IMG.planta.src), modo: 'contener', roi, holgura: .97, zoom: true, cargar: false,
      kMax: () => 1.7, svgEtiqueta: 'Viviendas de la planta 2: elige una disponible',
      alt: 'Planta 2 de Apolo vista desde arriba, con mobiliario',
      inicial: (v, A) => {
        if (v.w >= 600) return null;
        const k = Math.min(A.h * .94 / roi.h, 1.2);
        return v.centrar(k, 1200, roi.y + roi.h / 2, A);
      },
    });
    norte(raiz);
    etPlanta = crearEtiqueta(vPlanta);
    const trama = vPlanta.trama('pp-rayado', 'pat-linea', 7, 1.6, true);
    dibujarVelos(vPlanta, D.unidades, 'pp', activo(IMG.planta.src));
    const capaRes = S('g', null, vPlanta.svg);
    const capaHit = S('g', null, vPlanta.svg);
    const c = D.cuenta(D.unidades.map((u) => ({ estado: u.estado })));
    $('#pl-disp').textContent = c.disponible;
    $('#pl-total').textContent = c.total;
    let tactil = false;
    raiz.addEventListener('pointerdown', (e) => { tactil = e.pointerType !== 'mouse'; }, true);
    for (const u of D.unidades) {
      const consultable = () => u.estado === 'disponible' || (u.estado === 'reservada' && proto.dataset.r === 'R3');
      u.g = resalte(capaRes, u.d, vPlanta.W, vPlanta.H, trama);
      u.hit = S('path', { d: u.d, class: 'hit', 'data-id': u.id }, capaHit);
      S('path', { d: u.d, class: 'foco-unidad' }, capaHit);
      const datos = u.datos || {};
      if (u.estado === 'disponible') {
        u.hit.setAttribute('tabindex', '0');
        u.hit.setAttribute('role', 'button');
        u.hit.setAttribute('aria-label', `Vivienda ${u.id}, ${dormTxt(datos.dormitorios)}, ${euros(datos.precio)}`);
      }
      const htmlEt = () => {
        if (u.estado === 'disponible') return `<span class="et-t">Vivienda ${u.id}</span><span class="et-s">${dormTxt(datos.dormitorios)} · <b>${euros(datos.precio)}</b></span><span class="et-pista">Toca otra vez para abrirla</span>`;
        const r = proto.dataset.r;
        const nombre = u.estado === 'reservada' && r !== 'R1' ? 'Reservada' : (r === 'R1' ? 'No disponible' : 'Vendida');
        return `<span class="et-t">Vivienda ${u.id}</span><span class="et-s">${nombre}${u.estado === 'reservada' && r === 'R3' ? ' · ver ficha' : ''}</span>`;
      };
      const ancla = { x: u.caja.x + u.caja.w / 2, y: u.caja.y, y2: u.caja.y + u.caja.h };
      const encender = (on, porTacto) => {
        u.g.classList.toggle('on', on && consultable());
        if (on) { etPlanta.mostrar(htmlEt(), ancla, !!porTacto && u.estado === 'disponible'); etPlanta.actual = u; }
        else if (etPlanta.actual === u) { etPlanta.ocultar(); etPlanta.actual = null; }
        u.hit.style.cursor = consultable() ? 'pointer' : 'default';
      };
      u.encender = encender;
      u.hit.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') encender(true); });
      u.hit.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') encender(false); });
      u.hit.addEventListener('focus', () => encender(true));
      u.hit.addEventListener('blur', () => encender(false));
      u.hit.addEventListener('click', (e) => {
        if (vPlanta.suprimido()) return;
        if (!consultable()) { if (tactil) { D.unidades.forEach((x) => x !== u && x.g.classList.remove('on')); encender(true); P.armado = null; } return; }
        if (tactil && P.armado !== u) { D.unidades.forEach((x) => x !== u && x.g.classList.remove('on')); encender(true, true); P.armado = u; return; }
        P.armado = null;
        abrirVivienda(u.id, { origen: origenDe(e, vPlanta) });
      });
      u.hit.addEventListener('keydown', (e) => {
        if ((e.key === 'Enter' || e.key === ' ') && consultable()) { e.preventDefault(); abrirVivienda(u.id, { origen: origenDe(null, vPlanta, [u.centroide[0], u.centroide[1]]) }); }
      });
    }
    /* Leyenda */
    const ley = $('#leyenda-planta');
    const muestra = (est) => `<svg class="muestra-estado" viewBox="0 0 16 16" aria-hidden="true"><rect class="me-disp" x=".5" y=".5" width="15" height="15"/>${est === 'disponible' ? '' : `<g class="velo ${est}"><rect class="v-gris" x=".5" y=".5" width="15" height="15"/><rect class="v-rayado-fondo" x=".5" y=".5" width="15" height="15"/><path class="v-rayado" d="M.5 6.5 6.5.5M.5 12.5 12.5.5M3.5 15.5 15.5 3.5M9.5 15.5l6-6"/><rect class="v-marco" x=".5" y=".5" width="15" height="15" style="fill:var(--p-velo);fill-opacity:.35"/><rect class="v-borde-res" x="1" y="1" width="14" height="14"/></g>`}</svg>`;
    ley.innerHTML = `<li>${muestra('disponible')}Disponibles <b>${c.disponible}</b></li><li class="ley-res">${muestra('reservada')}<span class="ley-res-t">Reservadas</span> <b>${c.reservada}</b></li><li>${muestra('vendida')}<span class="ley-vend-t">Vendidas</span> <b>${c.vendida}</b></li>`;
    /* Cambio de planta */
    const cp = $('#cambio-planta');
    for (const p of D.pisos) {
      const b = H('button', null, cp, p.nivel === 4 ? 'Ático' : String(p.nivel));
      b.type = 'button';
      b.setAttribute('aria-label', p.nombreVisible);
      if (p.nivel === 2) b.setAttribute('aria-current', 'true');
      b.addEventListener('click', () => { if (p.nivel !== 2) aviso(`${p.nombreVisible}: su vista de planta llegará con los renders. En esta maqueta está la planta 2.`); });
    }
    /* Zoom */
    $$('.zoom button', raiz).forEach((b) => b.addEventListener('click', () => {
      const z = b.dataset.zoom;
      if (z === 'todo') vPlanta.reencuadrar(true);
      else vPlanta.zoomEn(z === 'mas' ? 1.6 : 1 / 1.6);
    }));
    /* Cota del edificio entero (Plano) */
    const xs = D.unidades.flatMap((u) => u.puntos.map((p) => p[0]));
    const x0 = Math.min(...xs), x1 = Math.max(...xs);
    const s = (D.planta.transformacion && D.planta.transformacion.pxPorMetro) || 20;
    cota(vPlanta, x0, 30, x1, 30, `${dec((x1 - x0) / s)} m`);
    vPlanta.al((v) => actualizarEscala('planta', s * v.k));
    cajetin('planta', 'Apolo · Planta 2 · norte arriba', escalaGrafica(s * .5));
    actualizarAyudaPlanta();
  }
  function actualizarAyudaPlanta() {
    const t = matchMedia('(hover: none)').matches
      ? 'Toca una vivienda disponible para ver su precio y otra vez para abrirla. Arrastra para moverte y pellizca para acercar.'
      : 'Pulsa una vivienda disponible. Arrastra para moverte; acerca con los botones, con doble clic o con Ctrl y la rueda.';
    $('#ayuda-planta').textContent = t;
  }
  const dormTxt = (n) => (n === 0 ? 'Estudio' : n === 1 ? '1 dormitorio' : `${n} dormitorios`);
  const banosTxt = (n) => (n === 1 ? '1 baño' : `${n} baños`);

  /* Punto de origen (en coordenadas de .p-escenas) para la transición T3. */
  function origenDe(e, visor, pt) {
    const caja = $('#p-escenas').getBoundingClientRect();
    if (e && e.clientX != null && (e.clientX || e.clientY)) return { x: e.clientX - caja.left, y: e.clientY - caja.top };
    if (visor && pt) {
      const r = visor.raiz.getBoundingClientRect(); const [sx, sy] = visor.aPantalla(pt[0], pt[1]);
      return { x: r.left - caja.left + sx, y: r.top - caja.top + sy };
    }
    return { x: caja.width / 2, y: caja.height / 2 };
  }

  /* ── Vivienda ── */
  function montarVivienda() {
    const V = D.vivienda;
    const cc = V.cajaContorno;
    const caja = { x: cc[0], y: cc[1], w: cc[2] - cc[0], h: cc[3] - cc[1] };
    const raiz = $('#v-vivienda');
    vViv = nuevoVisor(raiz, { img: IMG.vivienda, src: activo(IMG.vivienda.src), modo: 'contener', roi: ampliar(caja, 95), holgura: .96, zoom: true, kMax: () => 1.2, cargar: false, alt: `Plano de la vivienda ${V.id} visto desde arriba, con mobiliario` });
    norte(raiz);
    etViv = crearEtiqueta(vViv);
    const capa = S('g', null, vViv.svg);
    V.salas = [];
    const porNombre = new Map();
    for (const e of [...V.estancias, ...(V.sinPunto || [])]) {
      const sala = { ...e, ficha: e.estanciaFicha || e.nombre };
      if (e.poligono && e.poligono.length) sala.res = S('path', { d: poligonosAD([e.poligono]), class: 'est-res' }, capa);
      V.salas.push(sala);
      if (!porNombre.has(sala.ficha)) porNombre.set(sala.ficha, []);
      porNombre.get(sala.ficha).push(sala);
    }
    V.porNombre = porNombre;
    for (const s of V.salas) {
      if (s.x == null) continue;
      const b = bolita();
      b.setAttribute('aria-label', `Entrar en ${s.nombre}: vista 360`);
      s.bolita = b;
      vViv.marca(s.x, s.y, b);
      const sup = s.superficieFicha != null && s.nombre === s.ficha ? ` <b>${m2(s.superficieFicha)}</b>` : '';
      const on = (v) => {
        b.classList.toggle('on', v);
        for (const x of porNombre.get(s.ficha) || []) if (x.res) x.res.classList.toggle('on', v);
        const fila = $(`.estancia-b[data-ficha="${CSS.escape(s.ficha)}"]`);
        if (fila) fila.classList.toggle('on', v);
        if (v) etViv.mostrar(`<span class="et-t">${esc(s.nombre)}</span><span class="et-s">${sup ? m2(s.superficieFicha) + ' · ' : ''}Entrar en 360</span>`, { x: s.x, y: s.y - 30 }); else etViv.ocultar();
      };
      s.on = on;
      b.addEventListener('pointerenter', () => on(true));
      b.addEventListener('pointerleave', () => on(false));
      b.addEventListener('focus', () => on(true));
      b.addEventListener('blur', () => on(false));
      b.addEventListener('click', (e) => { if (vViv.suprimido()) return; on(false); vista360(s.nombre, { origen: origenDe(e, null) }); });
    }
    /* Cotas exteriores de la vivienda (Plano) */
    const s = V.transformacion.pxPorMetro;
    cota(vViv, caja.x, caja.y - 62, caja.x + caja.w, caja.y - 62, `${dec(caja.w / s)} m`);
    cota(vViv, caja.x - 62, caja.y, caja.x - 62, caja.y + caja.h, `${dec(caja.h / s)} m`, true);
    vViv.al((v) => { if (P.modal && P.modal.id === V.id) actualizarEscala('vivienda', s * v.k); });

    /* Recorte de la planta para el resto de viviendas */
    const rr = $('#v-recorte');
    vRec = nuevoVisor(rr, { img: IMG.planta, src: activo(IMG.planta.src), modo: 'contener', roi: { x: 0, y: 0, w: 100, h: 100 }, holgura: .92, zoom: true, kMax: (b) => b.k * 1.8, cargar: false, alt: 'Ampliación de la planta 2' });
    norte(rr);
    vRec.velo = S('path', { class: 'recorte-velo' }, vRec.svg);
    vRec.borde = S('path', { class: 'recorte-borde' }, vRec.svg);
    vRec.al((v) => { if (P.modal && P.modal.id !== V.id) actualizarEscala('vivienda', 20 * v.k); });

    /* 360 simulado */
    const r3 = $('#v-360');
    v360 = nuevoVisor(r3, {
      img: IMG.salon, src: fuente(IMG.salon), alta: alta('salon'), modo: 'cubrir', zoom: true, tactilLibre: true, ruedaLibre: false, cargar: false,
      kMax: (b) => b.k * 2.2, kMinF: 1, alt: 'Salón de referencia de la línea de decoración',
      /* Un 20 % más que cubrir en pantallas apaisadas: la foto es vertical y, sin margen, no se podía mirar a los lados. */
      inicial: (v, A) => { const k = Math.max(v.w / v.W, v.h / v.H) * (v.w > v.h ? 1.2 : 1.15); return v.centrar(k, 540, 1330, A); },
    });
    const saltos = [{ x: 300, y: 1450, a: 'Dormitorio principal' }, { x: 700, y: 1505, a: 'Cocina' }];
    for (const s3 of saltos) {
      const b = bolita();
      b.classList.add('hotspot-sala');
      b.setAttribute('aria-label', `Ir a ${s3.a}`);
      v360.marca(s3.x, s3.y, b);
      b.addEventListener('click', () => { if (v360.suprimido()) return; et3.ocultar(); cambiarSala(s3.a); });
    }
    const et3 = crearEtiqueta(v360);
    v360.marcas.forEach((mk, i) => {
      const b = mk.el.firstChild;
      b.addEventListener('pointerenter', () => et3.mostrar(`<span class="et-t">${esc(saltos[i].a)}</span><span class="et-s">Ir a esta estancia</span>`, { x: saltos[i].x, y: saltos[i].y - 40 }));
      b.addEventListener('pointerleave', () => et3.ocultar());
      b.addEventListener('focus', () => et3.mostrar(`<span class="et-t">${esc(saltos[i].a)}</span><span class="et-s">Ir a esta estancia</span>`, { x: saltos[i].x, y: saltos[i].y - 40 }));
      b.addEventListener('blur', () => et3.ocultar());
    });
    let pistaFuera = false;
    r3.addEventListener('pointerdown', () => { if (!pistaFuera) { pistaFuera = true; $('#r360-pista').classList.add('fuera'); } });
    r3.tabIndex = 0;
    r3.setAttribute('aria-label', 'Vista 360 simulada: usa las flechas para mirar');
    r3.addEventListener('keydown', (e) => {
      const d = { ArrowLeft: [60, 0], ArrowRight: [-60, 0], ArrowUp: [0, 60], ArrowDown: [0, -60] }[e.key];
      if (!d) return;
      e.preventDefault();
      v360.usuario = true;
      v360.animarA({ k: v360.k, tx: v360.tx + d[0], ty: v360.ty + d[1] }, 200);
    });
    /* Minimapa */
    const mm = $('#minimapa');
    const img = H('img', null, mm);
    img.alt = '';
    img.style.cssText = `position:absolute;max-width:none;width:${(V.ancho / caja.w * 100).toFixed(3)}%;height:${(V.alto / caja.h * 100).toFixed(3)}%;left:${(-caja.x / caja.w * 100).toFixed(3)}%;top:${(-caja.y / caja.h * 100).toFixed(3)}%;object-fit:fill`;
    mm.style.overflow = 'hidden';
    mm.dataset.src = activo(IMG.vivienda.m || IMG.vivienda.src);
    for (const sl of V.salas) {
      if (sl.x == null) continue;
      const b = H('button', 'mm-punto', mm);
      b.type = 'button';
      b.dataset.sala = sl.nombre;
      b.setAttribute('aria-label', `Ir a ${sl.nombre}`);
      b.style.left = ((sl.x - caja.x) / caja.w * 100).toFixed(2) + '%';
      b.style.top = ((sl.y - caja.y) / caja.h * 100).toFixed(2) + '%';
      b.addEventListener('click', () => cambiarSala(sl.nombre));
    }
    /* Botones del modal */
    $('#m-cerrar').addEventListener('click', () => cerrarVivienda());
    $('#m-volver').addEventListener('click', () => vistaModal('plano', { atras: true }));
    $('#f-pagos').addEventListener('click', () => {
      if (P.modal && P.modal.vista === 'pagos') vistaModal('plano', { atras: true });
      else vistaModal('pagos');
    });
    montarHoja();
  }
  function bolita() {
    const b = H('button', 'bolita', null, '<span class="b-onda"></span><span class="b-onda"></span><span class="b-onda"></span><span class="b-punto"></span>');
    b.type = 'button';
    return b;
  }

  /* Hoja de la ficha: lateral (L3) en el ordenador, inferior en el móvil. */
  function montarHoja() {
    const asa = $('#ficha-asa'); const ficha = $('#ficha'); const modal = $('#p-modal');
    const estrecho = () => proto.clientWidth <= 720;
    let arr = null; let suprimir = 0;
    const abrir = (v) => {
      modal.classList.toggle('ficha-abierta', v);
      asa.setAttribute('aria-expanded', String(v));
      $('.asa-texto', asa).textContent = v ? 'Ocultar ficha' : 'Ver ficha';
      if (!estrecho()) setTimeout(() => visorModal() && visorModal().reencuadrar(true), 30);
    };
    P.abrirHoja = abrir;
    asa.addEventListener('click', () => { if (performance.now() < suprimir) return; abrir(!modal.classList.contains('ficha-abierta')); });
    asa.addEventListener('pointerdown', (e) => {
      if (!estrecho()) return;
      arr = { y0: e.clientY, abierta: modal.classList.contains('ficha-abierta'), h: ficha.offsetHeight, asoma: parseFloat(getComputedStyle(ficha).getPropertyValue('--asoma')) || 172, dy: 0 };
      asa.setPointerCapture(e.pointerId);
      ficha.classList.add('arrastrando');
    });
    asa.addEventListener('pointermove', (e) => {
      if (!arr) return;
      arr.dy = e.clientY - arr.y0;
      const base = arr.abierta ? 0 : arr.h - arr.asoma;
      ficha.style.transform = `translateY(${limitar(base + arr.dy, 0, arr.h - arr.asoma)}px)`;
    });
    const fin = () => {
      if (!arr) return;
      ficha.classList.remove('arrastrando');
      ficha.style.transform = '';
      if (Math.abs(arr.dy) > 8) { suprimir = performance.now() + 250; abrir(arr.dy < 0 ? true : arr.dy > 0 ? false : arr.abierta); }
      arr = null;
    };
    asa.addEventListener('pointerup', fin);
    asa.addEventListener('pointercancel', fin);
  }
  const visorModal = () => (P.modal ? (P.modal.vista === '360' ? v360 : P.modal.id === D.vivienda.id ? vViv : vRec) : null);

  function rellenarFicha(u, unidad, consulta) {
    const prom = D.serenea.promocion || {};
    $('#f-imagen').src = activo(IMG.panel.src);
    $('#f-ubicacion').textContent = `Apolo · ${u.planta.nombre}${u.orientacion ? ' · ' + u.orientacion : ''}`;
    $('#f-titulo').textContent = `Vivienda ${u.id}`;
    $('#f-ref').textContent = `Ref. ${u.referencia || u.id}`;
    const av = $('#f-aviso');
    av.hidden = !consulta;
    av.textContent = consulta ? 'Reservada. Puedes ver la ficha, pero ahora mismo no está a la venta.' : '';
    $('#f-precio').textContent = euros(u.precio);
    $('#f-imp').textContent = u.precio == null ? '' : (prom.textoPrecio || '+ IGIC');
    $('#f-tipo').textContent = `${dormTxt(u.dormitorios)} · ${banosTxt(u.banos)}`;
    $('#f-pagos').hidden = !!consulta;
    $('#f-pagos').setAttribute('aria-pressed', 'false');
    const sp = u.superficies || {};
    const filas = [['Útil', sp.util], ['Construida interior', sp.construidaInterior], ['Construida con zonas comunes', sp.construidaZZCC]];
    if (sp.terraza) filas.push(['Terraza', sp.terraza]);
    $('#f-superficies').innerHTML = filas.filter((f) => f[1] != null).map(([t, v]) => `<div><dt>${t}</dt><dd>${m2(v)}</dd></div>`).join('');
    const ul = $('#f-estancias');
    ul.innerHTML = '';
    const es238 = u.id === D.vivienda.id;
    for (const e of u.estancias || []) {
      const li = H('li', null, ul);
      const con360 = e.tiene360 !== false && e.tipo !== 'distribuidor';
      const b = H(con360 ? 'button' : 'div', 'estancia-b' + (con360 ? ' con360' : ''), li, `<span class="ico" aria-hidden="true"></span><span>${esc(e.nombre)}</span><span class="num">${e.superficie != null ? m2(e.superficie) : '—'}</span>`);
      b.dataset.ficha = e.nombre;
      if (con360) {
        b.type = 'button';
        b.setAttribute('aria-label', `${e.nombre}, ${e.superficie != null ? m2(e.superficie) : ''}: entrar en 360`);
        b.addEventListener('click', (ev) => vista360(e.nombre === 'Salón - comedor - cocina' ? 'Salón - comedor' : e.nombre, { origen: origenDe(ev) }));
      }
      if (es238) {
        const salas = D.vivienda.porNombre.get(e.nombre) || [];
        const on = (v) => { for (const s of salas) { if (s.res) s.res.classList.toggle('on', v); if (s.bolita) s.bolita.classList.toggle('on', v); } b.classList.toggle('on', v); };
        b.addEventListener('pointerenter', () => on(true));
        b.addEventListener('pointerleave', () => on(false));
        b.addEventListener('focus', () => on(true));
        b.addEventListener('blur', () => on(false));
      }
    }
    cajetin('vivienda', `Vivienda ${u.id} · ${u.referencia || ''}`, '');
    rellenarPagos(u);
  }

  function rellenarPagos(u) {
    const precio = u.precio || 0;
    const plan = (D.serenea.planesPago || []).find((p) => p.codigo === u.planPagos) || null;
    const reservaImp = plan ? (plan.reserva.importe || precio * (plan.reserva.porcentaje || 0) / 100) : 6000;
    const pc = plan ? plan.contrato : 20, pa = plan ? plan.aplazado.porcentaje : 30, cuotas = plan ? plan.aplazado.cuotas || 12 : 12, pe = plan ? plan.entrega : 50;
    const contrato = precio * pc / 100 - reservaImp;
    const aplazado = precio * pa / 100;
    const entrega = precio * pe / 100;
    const filas = [
      ['Reserva', 'Al reservar la vivienda', null, reservaImp],
      ['Firma del contrato', `${pct(pc)} del precio, menos la reserva`, pc, contrato],
      ['Durante la obra', `${cuotas} cuotas mensuales de ${euros(aplazado / cuotas)}`, pa, aplazado],
      ['Entrega de llaves', 'Con la escritura', pe, entrega],
    ];
    const total = filas.reduce((s, f) => s + f[3], 0) || 1;
    $('#pagos').innerHTML = `<div class="pagos-hoja">
      <div class="pagos-cab"><div><p class="e-eyebrow">Vivienda ${esc(u.id)} · ${esc(u.referencia || '')}</p><h3>Plan de pagos</h3></div><span class="sello-ejemplo">${plan ? 'Plan vigente' : 'Ejemplo'}</span></div>
      <p class="pagos-total"><span class="precio">${euros(precio)}</span><span class="precio-imp">${esc((D.serenea.promocion || {}).textoPrecio || '+ IGIC')}</span></p>
      <div class="barra-pagos" aria-hidden="true">${filas.map((f) => `<i style="flex:${(f[3] / total).toFixed(4)}"></i>`).join('')}</div>
      <div class="tabla-pagos">${filas.map((f) => `<div><span class="tp-clave" aria-hidden="true"></span><span class="tp-concepto"><b>${f[0]}</b><span>${f[1]}</span></span><span class="tp-pct">${f[2] != null ? pct(f[2]) : ''}</span><span class="tp-imp">${euros(f[3])}</span></div>`).join('')}</div>
      <p class="pagos-nota">${plan ? '' : 'Cifras de ejemplo para enseñar la pantalla: el plan real se cargará desde el panel de gestión. '}Impuestos no incluidos.</p>
    </div>`;
  }

  function cambiarSala(nombre) {
    if (P.modal) P.modal.sala = nombre;
    $('#r360-titulo').textContent = nombre;
    $('#m-titulo').textContent = `Vista 360 · ${nombre}`;
    actualizarMigas();
    $$('.mm-punto').forEach((b) => b.classList.toggle('on', b.dataset.sala === nombre));
    if (!REDUCIDO.matches) {
      const k = v360.k;
      v360.animarA({ k: k * 1.1, tx: v360.tx - v360.w * .05, ty: v360.ty - v360.h * .05 }, 260).then(() => v360.reencuadrar(true));
    }
    aviso(`Simulación: en el visor real entrarías en ${nombre}.`);
  }

  /* ── Navegación y transiciones ── */
  const DUR = { T1: 320, T2: 560, T3: 620 };
  function transicion(sale, entra, { tipo = proto.dataset.t, origen = null, atras = false } = {}) {
    if (entra) entra.hidden = false;
    if (REDUCIDO.matches || !sale || !entra) {
      if (sale && sale !== entra) sale.hidden = true;
      if (entra && !REDUCIDO.matches) return entra.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: 'ease-out' }).finished;
      return Promise.resolve();
    }
    const d = DUR[tipo] || 320;
    let a, b;
    entra.style.zIndex = 2; sale.style.zIndex = 1;
    if (tipo === 'T2') {
      const s = atras ? -1 : 1;
      const ease = 'cubic-bezier(.7, 0, .2, 1)';
      b = entra.animate([{ transform: `translate3d(${s * 100}%, 0, 0)` }, { transform: 'translate3d(0, 0, 0)' }], { duration: d, easing: ease });
      a = sale.animate([{ transform: 'translate3d(0, 0, 0)', opacity: 1 }, { transform: `translate3d(${-s * 30}%, 0, 0)`, opacity: .4 }], { duration: d, easing: ease });
    } else if (tipo === 'T3') {
      const o = origen ? `${origen.x}px ${origen.y}px` : '50% 50%';
      sale.style.transformOrigin = o; entra.style.transformOrigin = o;
      const ease = 'cubic-bezier(.55, 0, .15, 1)';
      if (!atras) {
        a = sale.animate([{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(2.4)', opacity: 0 }], { duration: d, easing: ease });
        b = entra.animate([{ transform: 'scale(.55)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: d, easing: ease });
      } else {
        sale.style.zIndex = 2; entra.style.zIndex = 1;
        a = sale.animate([{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(.55)', opacity: 0 }], { duration: d, easing: ease });
        b = entra.animate([{ transform: 'scale(2.4)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: d, easing: ease });
      }
    } else {
      b = entra.animate([{ opacity: 0 }, { opacity: 1 }], { duration: d, easing: 'ease-out' });
      a = sale.animate([{ opacity: 1 }, { opacity: 0 }], { duration: d, easing: 'ease-in' });
    }
    return Promise.all([a.finished, b.finished]).catch(() => {}).then(() => {
      sale.hidden = true;
      for (const x of [sale, entra]) { x.style.zIndex = ''; x.style.transformOrigin = ''; }
    });
  }

  /* Móvil: si el prototipo queda en parte bajo la cabecera fija o por debajo de
     la pantalla, al navegar se coloca entero a la vista. */
  function asegurarVista(instantaneo = false) {
    if (proto.classList.contains('completa') || (innerWidth >= 900 && innerHeight > 540)) return;
    const cab = $('#cabecera');
    const arriba = getComputedStyle(cab).position === 'sticky' ? cab.getBoundingClientRect().bottom : 0;
    const r = proto.getBoundingClientRect();
    if (r.top >= arriba - 1 && r.bottom <= innerHeight + 1) return;
    window.scrollTo({ top: Math.max(0, scrollY + r.top - arriba - 6), behavior: instantaneo || REDUCIDO.matches ? 'auto' : 'smooth' });
  }
  /* Al girar el móvil con el prototipo a la vista, se vuelve a encajar (la
     cabecera deja de ser fija en horizontal y el texto de arriba cambia de alto). */
  let protoALaVista = false;
  new IntersectionObserver((e) => { protoALaVista = e[e.length - 1].intersectionRatio > .5; }, { threshold: [0, .5, 1] }).observe(proto);
  matchMedia('(orientation: landscape)').addEventListener?.('change', () => {
    if (protoALaVista) requestAnimationFrame(() => requestAnimationFrame(() => asegurarVista(true)));
  });

  const escenaEl = (n) => $(`#e-${n}`);
  const visorDe = { conjunto: () => vConj, edificio: () => vEdif, planta: () => vPlanta };
  async function ir(destino, { origen, atras = false, instantaneo = false } = {}) {
    if (P.ocupado && !instantaneo) return;
    if (P.modal) await cerrarVivienda({ instantaneo: true });
    if (destino === P.escena) return;
    const sale = escenaEl(P.escena), entra = escenaEl(destino);
    const orden = ['conjunto', 'edificio', 'planta'];
    atras = atras || orden.indexOf(destino) < orden.indexOf(P.escena);
    P.escena = destino;
    proto.dataset.escena = destino;
    quitarAviso();
    asegurarVista();
    visorDe[destino]().cargar();
    etPlanta && etPlanta.ocultar(); etEdif && etEdif.ocultar(); P.armado = null;
    for (const g of $$('.res.on', proto)) g.classList.remove('on');
    actualizarMigas();
    if (instantaneo) { entra.hidden = false; sale.hidden = true; return; }
    P.ocupado = true;
    await transicion(sale, entra, { origen, atras });
    P.ocupado = false;
    const t = $('.e-titulo', entra);
    if (t) { t.tabIndex = -1; t.focus({ preventScroll: true }); }
    precargar(destino);
  }
  function precargar(desde) {
    const sig = { conjunto: [vEdif], edificio: [vPlanta], planta: [vViv] }[desde] || [];
    for (const v of sig) v && v.cargar();
  }

  async function abrirVivienda(id, { origen, instantaneo = false } = {}) {
    if (P.ocupado && !instantaneo) return;
    const u = D.viv.get(String(id));
    const unidad = D.uPorId.get(String(id));
    if (!u || !unidad) return;
    const consulta = unidad.estado === 'reservada';
    const modal = $('#p-modal');
    const es238 = u.id === D.vivienda.id;
    quitarAviso();
    asegurarVista();
    P.modal = { id: u.id, vista: 'plano', sala: 'Salón - comedor', origenPlanta: { k: vPlanta.k, tx: vPlanta.tx, ty: vPlanta.ty, usuario: vPlanta.usuario } };
    rellenarFicha(u, unidad, consulta);
    $('#v-vivienda').hidden = !es238;
    $('#v-recorte').hidden = es238;
    $('#m-pie-plano').textContent = es238 ? 'Pulsa un punto para entrar en la estancia.' : 'Ampliación provisional de la planta: el render de esta vivienda y sus puntos 360 llegarán después.';
    if (!es238) {
      const c = ampliar(unidad.caja, 26);
      vRec.roi = c;
      vRec.velo.setAttribute('d', `M0 0H${vRec.W}V${vRec.H}H0Z` + unidad.d);
      vRec.borde.setAttribute('d', unidad.d);
    }
    for (const v of ['plano', '360', 'pagos']) $(`#mv-${v}`).hidden = v !== 'plano';
    modal.dataset.vista = 'plano';
    $('#m-volver').hidden = true;
    $('#m-titulo').textContent = `Plano · Vivienda ${u.id}`;
    const ancho = proto.clientWidth > 720;
    P.abrirHoja(ancho);
    actualizarMigas();
    const tipo = proto.dataset.t;
    P.ocupado = !instantaneo;
    if (!instantaneo && tipo === 'T3' && !REDUCIDO.matches) {
      for (const g of $$('.res.on', proto)) g.classList.remove('on');
      etPlanta.ocultar();
      await vPlanta.encuadrar(unidad.caja, { margen: 1.6, kMax: 2.2, dur: 420 });
    }
    modal.hidden = false;
    $('#p-escenas').inert = true;
    const v = es238 ? vViv : vRec;
    v.cargar(); v.usuario = false; v.ajustar();
    if (!instantaneo && !REDUCIDO.matches) {
      let anim;
      if (tipo === 'T2') anim = modal.animate([{ transform: 'translate3d(100%, 0, 0)' }, { transform: 'translate3d(0, 0, 0)' }], { duration: DUR.T2, easing: 'cubic-bezier(.7, 0, .2, 1)' });
      else if (tipo === 'T3') anim = modal.animate([{ opacity: 0, transform: 'scale(.96)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 340, easing: 'cubic-bezier(.2, .7, .1, 1)' });
      else anim = modal.animate([{ opacity: 0 }, { opacity: 1 }], { duration: DUR.T1, easing: 'ease-out' });
      await anim.finished.catch(() => {});
    }
    P.ocupado = false;
    $('#f-titulo').tabIndex = -1;
    $('#f-titulo').focus({ preventScroll: true });
    const mi = $('#minimapa img');
    if (!mi.getAttribute('src')) mi.src = $('#minimapa').dataset.src;
  }

  async function cerrarVivienda({ instantaneo = false } = {}) {
    if (!P.modal) return;
    const modal = $('#p-modal');
    const origen = P.modal.origenPlanta;
    const id = P.modal.id;
    P.modal = null;
    quitarAviso();
    actualizarMigas();
    if (!instantaneo && !REDUCIDO.matches) {
      P.ocupado = true;
      const tipo = proto.dataset.t;
      const anim = tipo === 'T2'
        ? modal.animate([{ transform: 'translate3d(0, 0, 0)' }, { transform: 'translate3d(100%, 0, 0)' }], { duration: DUR.T2 * .8, easing: 'cubic-bezier(.7, 0, .2, 1)' })
        : modal.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, easing: 'ease-in' });
      await anim.finished.catch(() => {});
    }
    modal.hidden = true;
    $('#p-escenas').inert = false;
    if (origen) {
      if (!instantaneo && proto.dataset.t === 'T3' && !REDUCIDO.matches) await vPlanta.animarA(origen, 420);
      else vPlanta.poner(vPlanta.acotar(origen));
      vPlanta.usuario = origen.usuario;
    }
    P.ocupado = false;
    const u = D.uPorId.get(id);
    if (u && u.hit && !instantaneo && u.estado === 'disponible') u.hit.focus({ preventScroll: true });
  }

  async function vistaModal(vista, { origen, atras = false } = {}) {
    if (!P.modal || P.modal.vista === vista || P.ocupado) return;
    const sale = $(`#mv-${P.modal.vista}`), entra = $(`#mv-${vista}`);
    P.modal.vista = vista;
    quitarAviso();
    asegurarVista();
    const modal = $('#p-modal');
    modal.dataset.vista = vista;
    $('#m-volver').hidden = vista === 'plano';
    $('#f-pagos').setAttribute('aria-pressed', String(vista === 'pagos'));
    $('#m-titulo').textContent = vista === 'plano' ? `Plano · Vivienda ${P.modal.id}` : vista === 'pagos' ? `Pagos · Vivienda ${P.modal.id}` : `Vista 360 · ${P.modal.sala}`;
    if (vista === '360') {
      v360.cargar(); $('#r360-titulo').textContent = P.modal.sala;
      $$('.mm-punto').forEach((b) => b.classList.toggle('on', b.dataset.sala === P.modal.sala));
      $('#minimapa').hidden = P.modal.id !== D.vivienda.id;
    }
    if (proto.clientWidth <= 720 || (proto.dataset.l === 'L3' && vista === '360')) P.abrirHoja(false);
    else if (proto.dataset.l === 'L3' && vista === 'plano') P.abrirHoja(true);
    actualizarMigas();
    P.ocupado = true;
    await transicion(sale, entra, { origen, atras });
    P.ocupado = false;
    if (vista === '360') { v360.usuario = false; v360.ajustar(); }
    const vm = visorModal(); if (vm && vista === 'plano') vm.ajustar();
  }
  async function vista360(sala, opts) {
    if (!P.modal) return;
    P.modal.sala = sala;
    if (P.modal.vista === '360') { cambiarSala(sala); return; }
    await vistaModal('360', opts);
  }

  function atras() {
    if (P.ocupado) return;
    if (P.modal && P.modal.vista !== 'plano') vistaModal('plano', { atras: true });
    else if (P.modal) cerrarVivienda();
    else if (P.escena === 'planta') ir('edificio', { atras: true });
    else if (P.escena === 'edificio') ir('conjunto', { atras: true });
  }

  function actualizarMigas() {
    const ol = $('#p-migas');
    const pasos = [['Residencial Serenea', () => ir('conjunto', { atras: true })]];
    if (P.escena !== 'conjunto' || P.modal) pasos.push(['Apolo', () => ir('edificio', { atras: true })]);
    if (P.escena === 'planta' || P.modal) pasos.push(['Planta 2', () => (P.modal ? cerrarVivienda() : null)]);
    if (P.modal) pasos.push([`Vivienda ${P.modal.id}`, () => vistaModal('plano', { atras: true })]);
    if (P.modal && P.modal.vista === '360') pasos.push([`360 · ${P.modal.sala}`, null]);
    if (P.modal && P.modal.vista === 'pagos') pasos.push(['Pagos', null]);
    ol.innerHTML = '';
    pasos.forEach(([t, f], i) => {
      const li = H('li', null, ol);
      if (i === pasos.length - 1 || !f) { li.textContent = t; li.setAttribute('aria-current', 'page'); }
      else { const b = H('button', null, li, esc(t)); b.type = 'button'; b.addEventListener('click', f); }
    });
    const clave = P.modal ? (P.modal.vista === 'plano' ? 'vivienda' : P.modal.vista) : P.escena;
    $('#p-hoja').textContent = `Hoja ${HOJAS[clave]} / 06`;
    $('#p-atras').hidden = P.escena === 'conjunto' && !P.modal;
    $$('#demo-pasos button').forEach((b) => {
      const ir2 = b.dataset.ir;
      const act = ir2 === clave;
      if (act) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
    });
  }

  async function saltarA(paso) {
    if (P.ocupado) return;
    asegurarVista();
    if (['conjunto', 'edificio', 'planta'].includes(paso)) { await ir(paso); return; }
    if (!P.modal || P.modal.id !== D.vivienda.id) {
      if (P.modal) await cerrarVivienda({ instantaneo: true });
      if (P.escena !== 'planta') await ir('planta', { instantaneo: true });
      await abrirVivienda(D.vivienda.id, { instantaneo: paso !== 'vivienda' });
    }
    if (paso === 'vivienda') { if (P.modal.vista !== 'plano') await vistaModal('plano', { atras: true }); }
    else if (paso === '360') { P.modal.sala = 'Salón - comedor'; await vistaModal('360'); }
    else if (paso === 'pagos') await vistaModal('pagos');
  }

  function montarProto() {
    montarConjunto();
    montarEdificio();
    montarPlanta();
    montarVivienda();
    $('#p-atras').addEventListener('click', atras);
    $$('#demo-pasos button').forEach((b) => b.addEventListener('click', () => saltarA(b.dataset.ir)));
    const completa = (v) => {
      proto.classList.toggle('completa', v);
      document.body.classList.toggle('con-completa', v);
      $('#btn-completa').setAttribute('aria-pressed', String(v));
      $('#p-salir').hidden = !v;
      requestAnimationFrame(() => visores.forEach((x) => x.ajustar()));
    };
    $('#btn-completa').addEventListener('click', () => completa(!proto.classList.contains('completa')));
    $('#p-salir').addEventListener('click', () => completa(false));
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (P.modal || P.escena !== 'conjunto') {
        if (proto.contains(document.activeElement) || proto.classList.contains('completa')) { e.preventDefault(); atras(); return; }
      }
      if (proto.classList.contains('completa')) completa(false);
    });
    actualizarMigas();
  }

  /* ══ Catálogo ══ */
  function montarCatalogo() {
    const cont = $('#grupos');
    const visible = new IntersectionObserver((ents) => {
      for (const en of ents) { en.target.dataset.visible = en.isIntersecting ? '1' : ''; if (en.isIntersecting && en.target._cargar) en.target._cargar(); }
    }, { rootMargin: '200px 0px' });
    for (const G of GRUPOS) {
      const sec = H('div', 'grupo', cont);
      sec.id = 'grupo-' + G.k;
      sec.innerHTML = `<div class="grupo-cab"><h3>${G.titulo}</h3><p>${G.texto}</p><p class="grupo-rec" data-rec="${G.k}"></p>
        <button type="button" class="grupo-ir" data-ir="${G.ir}">Verlo en el prototipo <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4v12M4 10l6 6 6-6"/></svg></button></div>`;
      const ops = H('div', 'opciones', sec);
      ops.setAttribute('role', 'radiogroup');
      ops.setAttribute('aria-label', G.titulo);
      for (const [cod, [nombre, desc]] of Object.entries(G.op)) {
        const lab = H('label', 'opcion', ops);
        lab.innerHTML = `<input type="radio" name="op-${G.k}" value="${cod}" id="op-${cod}"><div class="muestra tema" data-${G.k}="${cod}"></div>
          <div class="op-txt"><span class="op-cod">${cod}</span><span class="op-nombre">${nombre}</span><span class="op-desc">${desc}</span><span class="op-elegida">Elegida</span></div>`;
        const input = $('input', lab);
        input.addEventListener('change', () => { if (input.checked) elegir(G.k, cod); });
        const mu = $('.muestra', lab);
        mu.setAttribute('aria-hidden', 'true');
        visible.observe(mu);
        MUESTRAS[G.k](mu, cod);
      }
      $('.grupo-ir', sec).addEventListener('click', () => {
        $('#demo').scrollIntoView({ behavior: REDUCIDO.matches ? 'auto' : 'smooth', block: 'start' });
        saltarA(G.ir);
      });
    }
  }
  const sinMovil = (img) => activo(img.m && !ACTIVOS ? img.m : img.src);
  const MUESTRAS = {
    h(mu, cod) {
      const raiz = H('div', 'e-visor', mu);
      const v = nuevoVisor(raiz, { img: IMG.edificio, src: sinMovil(IMG.edificio), modo: 'contener', roi: { x: 600, y: 470, w: 1640, h: 440 }, holgura: 1.02, cargar: false });
      const trama = v.trama(`mh${cod}-r`, 'pat-linea', 6, 1.6, true);
      const gs = D.pisos.map((p) => resalte(v.svg, p.d, v.W, v.H, trama));
      const hits = D.pisos.map((p) => S('path', { d: p.d, class: 'hit' }, v.svg));
      let i = 1; let manual = -1;
      const pintar = () => gs.forEach((g, j) => g.classList.toggle('on', j === (manual >= 0 ? manual : i)));
      hits.forEach((h, j) => { h.addEventListener('pointerenter', () => { manual = j; pintar(); }); h.addEventListener('pointerleave', () => { manual = -1; pintar(); }); });
      setInterval(() => { if (mu.dataset.visible && manual < 0 && !REDUCIDO.matches) { i = (i + 1) % gs.length; pintar(); } }, 1400);
      pintar();
      mu._cargar = () => v.cargar();
    },
    v(mu, cod) { muestraVelos(mu, cod, 'v'); },
    r(mu, cod) { muestraVelos(mu, cod, 'r'); },
    p(mu, cod) {
      const raiz = H('div', 'e-visor', mu);
      raiz.style.background = 'var(--cenital)';
      const v = nuevoVisor(raiz, { img: IMG.vivienda, src: sinMovil(IMG.vivienda), modo: 'roi-cubrir', roi: { x: 470, y: 930, w: 900, h: 520 }, cargar: false });
      for (const s of D.vivienda.estancias.filter((e) => e.nombre === 'Dormitorio secundario' || e.nombre === 'Baño')) v.marca(s.x, s.y, bolita());
      mu._cargar = () => v.cargar();
    },
    t(mu, cod) {
      const a = H('div', 'mt-escena', mu, '<img alt="">');
      const b = H('div', 'mt-escena b', mu, '<img alt="">');
      b.hidden = true;
      let ida = true;
      mu._cargar = () => {
        const ia = $('img', a), ib = $('img', b);
        if (!ia.getAttribute('src')) ia.src = sinMovil(IMG.edificio);
        if (!ib.getAttribute('src')) ib.src = sinMovil(IMG.planta);
      };
      setInterval(() => {
        if (!mu.dataset.visible || REDUCIDO.matches) return;
        const [sale, entra] = ida ? [a, b] : [b, a];
        transicion(sale, entra, { tipo: cod, origen: { x: mu.clientWidth * .55, y: mu.clientHeight * .5 }, atras: !ida });
        ida = !ida;
      }, 2600);
    },
    l(mu, cod) {
      const c = H('div', 'mt-l', mu, `<img class="mt-plano" alt="">
        <div class="mt-ficha"><i class="img"></i><i class="corta"></i><i class="precio-b"></i><i></i><i></i><i class="btn"></i><i></i><i class="corta"></i></div>${cod === 'L3' ? '<span class="mt-asa"></span>' : ''}`);
      c.dataset.l = cod;
      mu._cargar = () => { const im = $('img', c); if (!im.getAttribute('src')) im.src = sinMovil(IMG.vivienda); };
    },
  };
  function muestraVelos(mu, cod, k) {
    mu.dataset.v = k === 'v' ? cod : estado.v;
    mu.dataset.r = k === 'r' ? cod : estado.r;
    mu.dataset.cruce = k === 'v' ? 'r' : 'v';
    const raiz = H('div', 'e-visor', mu);
    raiz.style.background = 'var(--cenital)';
    const roi = { x: 1240, y: 250, w: 470, h: 420 };
    const v = nuevoVisor(raiz, { img: IMG.planta, src: activo(IMG.planta.src), modo: 'roi-cubrir', roi, cargar: false });
    const unidades = D.unidades.filter((u) => u.caja.x < roi.x + roi.w + 200 && u.caja.x + u.caja.w > roi.x - 200);
    dibujarVelos(v, unidades, `mv${k}${cod}`, activo(IMG.planta.src));
    mu._cargar = () => v.cargar();
  }

  /* ══ Elección ══ */
  function elegir(k, cod) {
    estado[k] = cod;
    estado.propio = GRUPOS.some((g) => estado[g.k] !== DIRS[estado.dir].rec[g.k]);
    aplicar();
  }
  function aplicar(cambioDir = false) {
    pagina.dataset.dir = estado.dir;
    for (const G of GRUPOS) proto.dataset[G.k] = estado[G.k];
    $$('#selector button').forEach((b) => {
      const on = b.dataset.dir === estado.dir;
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
    });
    $('#frase-dir').innerHTML = DIRS[estado.dir].frase;
    $('#demo-frase').innerHTML = `<b>${DIRS[estado.dir].nombre}.</b> ${DIRS[estado.dir].corta}`;
    const c = codigo();
    $('#codigo').textContent = c;
    $('#codigo-mini').textContent = c;
    const rec = DIRS[estado.dir].rec;
    for (const G of GRUPOS) {
      const r = $(`#op-${estado[G.k]}`);
      if (r) r.checked = true;
      const nota = $(`[data-rec="${G.k}"]`);
      if (nota) nota.textContent = `Recomendada para ${DIRS[estado.dir].nombre}: ${rec[G.k]} · ${G.op[rec[G.k]][0]}.`;
    }
    $$('.muestra[data-cruce="r"]').forEach((m) => { m.dataset.r = estado.r; });
    $$('.muestra[data-cruce="v"]').forEach((m) => { m.dataset.v = estado.v; });
    $('#eleccion-lista').innerHTML = `<div><dt>Dirección</dt><dd>${DIRS[estado.dir].nombre}</dd></div>` +
      GRUPOS.map((G) => `<div><dt>${G.titulo}</dt><dd><b>${estado[G.k]}</b> · ${G.op[estado[G.k]][0]}</dd></div>`).join('');
    const rb = $('#restablecer');
    rb.disabled = !estado.propio;
    rb.textContent = estado.propio ? `Volver a las recomendadas de ${DIRS[estado.dir].nombre}` : `Usas las recomendadas de ${DIRS[estado.dir].nombre}`;
    $('.ley-res-t') && ($('.ley-res-t').textContent = estado.r === 'R1' ? 'Reservadas (no disponibles)' : 'Reservadas');
    if (D) {
      for (const u of D.unidades) if (u.hit && u.estado === 'reservada') {
        if (estado.r === 'R3') { u.hit.setAttribute('tabindex', '0'); u.hit.setAttribute('role', 'button'); u.hit.setAttribute('aria-label', `Vivienda ${u.id}, reservada: ver ficha`); }
        else { u.hit.removeAttribute('tabindex'); u.hit.removeAttribute('role'); u.hit.removeAttribute('aria-label'); }
      }
    }
    guardar();
    if (cambioDir) {
      try { history.replaceState(null, '', '#' + estado.dir); } catch (_) { /* sin historial */ }
      requestAnimationFrame(() => requestAnimationFrame(() => { visores.forEach((v) => v.ajustar()); cajetines(); }));
    }
  }
  function cajetines() {
    if (!D) return;
    actualizarEscala('planta', 20 * vPlanta.k);
    const vm = visorModal();
    if (vm && P.modal) actualizarEscala('vivienda', (P.modal.id === D.vivienda.id ? D.vivienda.transformacion.pxPorMetro : 20) * vm.k);
  }
  function montarSelector() {
    const botones = $$('#selector button');
    const elegirDir = (dir, foco) => {
      if (dir === estado.dir) return;
      estado.dir = dir;
      if (!estado.propio) Object.assign(estado, DIRS[dir].rec);
      aplicar(true);
      if (foco) $(`#dir-${dir}`).focus();
    };
    botones.forEach((b, i) => {
      b.addEventListener('click', () => elegirDir(b.dataset.dir));
      b.addEventListener('keydown', (e) => {
        const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
        if (!d) return;
        e.preventDefault();
        const n = botones[(i + d + botones.length) % botones.length];
        elegirDir(n.dataset.dir, true);
      });
    });
    /* #galeria, #plano o #nocturno en la dirección: al cargar (arriba) y si cambia. */
    addEventListener('hashchange', () => { const h = location.hash.slice(1); if (DIRS[h]) elegirDir(h); });
    /* «Tu código» baja a la tarjeta sin cambiar el #, que guarda la dirección elegida. */
    $('.cab-codigo').addEventListener('click', (e) => {
      e.preventDefault();
      $('#eleccion').scrollIntoView({ behavior: REDUCIDO.matches ? 'auto' : 'smooth', block: 'start' });
      const t = $('#el-titulo'); t.tabIndex = -1; t.focus({ preventScroll: true });
    });
    $('#restablecer').addEventListener('click', () => { Object.assign(estado, DIRS[estado.dir].rec); estado.propio = false; aplicar(); });
    $('#copiar').addEventListener('click', () => {
      const c = codigo();
      const ok = () => { $('#copiar-estado').textContent = `Copiado: ${c}. Pégalo en un correo o en WhatsApp y envíamelo.`; };
      const manual = () => {
        const r = document.createRange(); r.selectNodeContents($('#codigo'));
        const s = getSelection(); s.removeAllRanges(); s.addRange(r);
        $('#copiar-estado').textContent = 'El navegador no deja copiar desde aquí: el código está seleccionado, cópialo con Ctrl+C o mantén pulsado en el móvil.';
      };
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(c).then(ok, manual);
        else manual();
      } catch (_) { manual(); }
    });
    /* Medida real de la cabecera para el alto del prototipo. */
    const cab = $('#cabecera');
    const medir = () => document.documentElement.style.setProperty('--cab-h', cab.offsetHeight + 'px');
    new ResizeObserver(medir).observe(cab);
    medir();
  }

  function error(e) {
    const p = H('div', 'p-error', proto);
    p.style.cssText = 'position:absolute;inset:52px 0 0;display:grid;place-items:center;padding:24px;text-align:center;z-index:20;background:var(--p-fondo)';
    p.innerHTML = `<p>No he podido cargar los datos del prototipo (${esc(e.message)}). Abre esta página desde el servidor, no como fichero suelto.</p>`;
  }

  /* ══ Arranque ══ */
  montarSelector();
  aplicar();
  Promise.all(['../data/serenea.json', 'img/conjunto.json', 'img/edificio-plantas.json', 'img/planta-2-viviendas.json', 'img/vivienda-238.json'].map(json))
    .then((r) => {
      preparar(r);
      montarProto();
      montarCatalogo();
      aplicar();
      matchMedia('(hover: none)').addEventListener?.('change', actualizarAyudaPlanta);
      const idle = window.requestIdleCallback || ((f) => setTimeout(f, 600));
      idle(() => {
        vEdif.cargar(); vPlanta.cargar();
        /* Las muestras del catálogo se cargan al acercarse; aquí se completan sin prisa. */
        setTimeout(() => $$('.muestra').forEach((m) => m._cargar && m._cargar()), 2500);
      });
    })
    .catch((e) => { console.error(e); error(e); });
})();
