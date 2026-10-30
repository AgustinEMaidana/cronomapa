/* =========================================================
   Cronomapa — lógica del juego
   HTML5 + CSS3 + JavaScript, sin librerías.
   El contenido (niveles, eventos y preguntas) está en datos/contenido.json
   y los mapas vectoriales en datos/mapas.json.
   ========================================================= */
'use strict';

(() => {
  // ---------- Utilidades ----------
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const NS = 'http://www.w3.org/2000/svg';
  const PREFIJO = 'cronomapa:';

  const mezclar = arr => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const muestra = (arr, n) => mezclar(arr).slice(0, n);
  const elegir = arr => arr[Math.floor(Math.random() * arr.length)];
  const capitalizar = t => t.charAt(0).toUpperCase() + t.slice(1);
  const esc = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function el(tag, attrs = {}) {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    return e;
  }

  // ---------- Almacenamiento local (ranking, progreso, configuración) ----------
  const almacen = {
    leer(clave, porDefecto) {
      try {
        const v = localStorage.getItem(PREFIJO + clave);
        return v === null ? porDefecto : JSON.parse(v);
      } catch (e) { return porDefecto; }
    },
    guardar(clave, valor) {
      try { localStorage.setItem(PREFIJO + clave, JSON.stringify(valor)); } catch (e) { /* sin almacenamiento */ }
    },
    borrar(clave) {
      try { localStorage.removeItem(PREFIJO + clave); } catch (e) { /* sin almacenamiento */ }
    }
  };

  // ---------- Estado global ----------
  const S = {
    contenido: null,
    mapas: null,
    progreso: almacen.leer('progreso', { completados: {} }),
    config: Object.assign({ musica: true, efectos: true }, almacen.leer('config', {})),
    apodo: almacen.leer('apodo', ''),
    ranking: almacen.leer('ranking', []),
    pantalla: 'cargando',
    modoNiveles: 'tiempo',
    diapo: 0,
    partida: null,
    visores: {},
    despuesApodo: null,
    ultimoRanking: null
  };

  // =========================================================
  //   SONIDO (Web Audio: todo se sintetiza, sin archivos con derechos)
  // =========================================================
  const sonido = {
    ctx: null, maestro: null, musicaGain: null, timer: null, paso: 0, proxima: 0,

    iniciar() {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return true;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.maestro = this.ctx.createGain();
      this.maestro.gain.value = 0.9;
      this.maestro.connect(this.ctx.destination);
      this.musicaGain = this.ctx.createGain();
      this.musicaGain.gain.value = 0;
      this.musicaGain.connect(this.maestro);
      return true;
    },

    nota(frec, inicio, dur, { tipo = 'sine', vol = 0.2, destino = null } = {}) {
      const c = this.ctx;
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = tipo;
      o.frequency.value = frec;
      g.gain.setValueAtTime(0.0001, inicio);
      g.gain.exponentialRampToValueAtTime(vol, inicio + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, inicio + dur);
      o.connect(g);
      g.connect(destino || this.maestro);
      o.start(inicio);
      o.stop(inicio + dur + 0.05);
    },

    efecto(nombre) {
      if (!S.config.efectos || !this.iniciar()) return;
      const t = this.ctx.currentTime;
      const n = (f, d, dt = 0, o = {}) => this.nota(f, t + dt, d, o);
      switch (nombre) {
        case 'acierto': n(660, 0.15, 0, { tipo: 'triangle', vol: 0.25 }); n(990, 0.25, 0.1, { tipo: 'triangle', vol: 0.25 }); break;
        case 'error': n(220, 0.25, 0, { tipo: 'sawtooth', vol: 0.1 }); n(165, 0.35, 0.12, { tipo: 'sawtooth', vol: 0.1 }); break;
        case 'soltar': n(520, 0.06, 0, { tipo: 'square', vol: 0.05 }); break;
        case 'elegir': n(780, 0.06, 0, { tipo: 'sine', vol: 0.12 }); break;
        case 'nivel': [523, 659, 784, 1047].forEach((f, i) => n(f, 0.3, i * 0.12, { tipo: 'triangle', vol: 0.22 })); break;
        case 'tiempo': [440, 370, 311, 262].forEach((f, i) => n(f, 0.25, i * 0.15, { tipo: 'square', vol: 0.07 })); break;
        case 'tic': n(1200, 0.03, 0, { tipo: 'sine', vol: 0.06 }); break;
        case 'pista': [880, 1175, 1568].forEach((f, i) => n(f, 0.15, i * 0.06, { tipo: 'sine', vol: 0.12 })); break;
      }
    },

    actualizarMusica() {
      if (S.config.musica) {
        if (this.iniciar()) this.arrancarMusica();
      } else {
        this.pararMusica();
      }
    },

    arrancarMusica() {
      if (this.timer) return;
      const c = this.ctx;
      this.musicaGain.gain.cancelScheduledValues(c.currentTime);
      this.musicaGain.gain.setTargetAtTime(1, c.currentTime, 0.6);
      this.proxima = c.currentTime + 0.1;
      // Do – La menor – Fa – Sol, arpegiado y suave
      const acordes = [[262, 330, 392], [220, 262, 330], [175, 220, 262], [196, 247, 294]];
      const patron = [0, 1, 2, 1, 0, 2, 1, 2];
      const pulso = 0.55;
      this.timer = setInterval(() => {
        while (this.proxima < c.currentTime + 0.6) {
          const ac = acordes[Math.floor(this.paso / 8) % 4];
          const i = this.paso % 8;
          if (i === 0) this.nota(ac[0] / 2, this.proxima, pulso * 7, { tipo: 'sine', vol: 0.05, destino: this.musicaGain });
          this.nota(ac[patron[i]] * 2, this.proxima, pulso * 1.6, { tipo: 'triangle', vol: 0.025, destino: this.musicaGain });
          this.proxima += pulso;
          this.paso++;
        }
      }, 200);
    },

    pararMusica() {
      if (this.timer) { clearInterval(this.timer); this.timer = null; }
      if (this.musicaGain) this.musicaGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2);
    }
  };

  // =========================================================
  //   NAVEGACIÓN ENTRE PANTALLAS
  // =========================================================
  function mostrar(nombre) {
    $$('.pantalla').forEach(p => p.classList.toggle('activa', p.id === 'p-' + nombre));
    S.pantalla = nombre;
    if (nombre === 'sala') renderSala();
    if (nombre === 'niveles') renderNiveles();
    if (nombre === 'instrucciones') renderDiapo();
    if (nombre === 'ranking') renderRanking();
    if (nombre === 'config') renderConfig();
    window.scrollTo(0, 0);
  }

  function aviso(texto) {
    const a = $('#aviso');
    a.textContent = texto;
    a.hidden = false;
    clearTimeout(aviso.t);
    aviso.t = setTimeout(() => { a.hidden = true; }, 2200);
  }

  // ---------- Progreso y desbloqueo ----------
  const niveles = () => S.contenido.niveles;
  const nivelPorId = id => niveles().find(n => n.id === id);
  const completado = id => !!S.progreso.completados[id];
  const nivelesDelModo = modo => niveles().filter(n => n.modo === modo);
  const nivelFinal = () => niveles().find(n => n.modo === 'final');

  function desbloqueado(nivel) {
    if (nivel.modo === 'final') return niveles().filter(n => n.modo !== 'final').every(n => completado(n.id));
    const lista = nivelesDelModo(nivel.modo);
    const i = lista.indexOf(nivel);
    return i === 0 || completado(lista[i - 1].id);
  }

  function siguienteNivel(nivel) {
    const lista = nivelesDelModo(nivel.modo);
    const i = lista.indexOf(nivel);
    if (i < lista.length - 1) return lista[i + 1];
    const fin = nivelFinal();
    if (nivel.modo !== 'final' && fin && desbloqueado(fin) && !completado(fin.id)) return fin;
    return null;
  }

  const nivelParaContinuar = () => niveles().find(n => desbloqueado(n) && !completado(n.id)) || null;

  // =========================================================
  //   SALA (MENÚ PRINCIPAL) Y MÁQUINA DEL TIEMPO
  // =========================================================
  function renderSala() {
    renderMaquina();
    $('#btn-continuar').disabled = Object.keys(S.progreso.completados).length === 0;
  }

  function renderMaquina() {
    const svg = $('#maquina-svg');
    const lista = niveles();
    const hechos = lista.filter(n => completado(n.id)).length;
    const polar = (r, grados) => {
      const a = grados * Math.PI / 180;
      return [200 + r * Math.cos(a), 200 + r * Math.sin(a)];
    };
    let dientes = '';
    for (let i = 0; i < 24; i++) {
      dientes += `<rect x="191" y="36" width="18" height="20" rx="3" transform="rotate(${i * 15} 200 200)" style="fill:var(--superficie-2);stroke:var(--azul-noche);stroke-width:2.5"/>`;
    }
    let rayos = '';
    lista.forEach((n, i) => {
      const ang = -90 + i * (360 / lista.length);
      const [x1, y1] = polar(82, ang - 13);
      const [x2, y2] = polar(178, ang);
      const [x3, y3] = polar(82, ang + 13);
      const [tx, ty] = polar(126, ang);
      const listo = completado(n.id);
      const estilo = listo
        ? 'fill:var(--dorado);stroke:var(--dorado-oscuro);stroke-width:2.5'
        : 'fill:var(--superficie);stroke:var(--tierra-borde);stroke-width:2;stroke-dasharray:5 4';
      rayos += `<polygon class="rayo" points="${x1},${y1} ${x2},${y2} ${x3},${y3}" style="${estilo}"/>`;
      rayos += `<text x="${tx}" y="${ty}" text-anchor="middle" dominant-baseline="central" style="font:800 19px var(--fuente-titulo);fill:${listo ? '#10274A' : 'var(--tinta-suave)'}">${n.id}</text>`;
    });
    const angAguja = -90 + (hechos / lista.length) * 360;
    const [ax, ay] = polar(48, angAguja);
    svg.innerHTML = `
      <title id="maquina-titulo">Máquina del Tiempo: ${hechos} de ${lista.length} piezas reparadas</title>
      <g class="engranaje">${dientes}<circle cx="200" cy="200" r="150" style="fill:var(--superficie-2);stroke:var(--azul-noche);stroke-width:3"/></g>
      ${rayos}
      <circle cx="200" cy="200" r="74" style="fill:var(--azul);stroke:var(--azul-noche);stroke-width:3"/>
      <circle cx="200" cy="200" r="60" style="fill:none;stroke:var(--dorado);stroke-width:2.5;stroke-dasharray:3 6"/>
      <line x1="200" y1="200" x2="200" y2="158" style="stroke:var(--superficie);stroke-width:6;stroke-linecap:round"/>
      <line x1="200" y1="200" x2="${ax}" y2="${ay}" style="stroke:var(--dorado);stroke-width:5;stroke-linecap:round"/>
      <circle cx="200" cy="200" r="8" style="fill:var(--dorado)"/>`;
    $('#maquina-estado').textContent = hechos === lista.length
      ? '¡Máquina reparada! 8 de 8 piezas'
      : `${hechos} de ${lista.length} piezas reparadas`;
  }

  // =========================================================
  //   ELEGIR NIVEL
  // =========================================================
  function renderNiveles() {
    $$('.pestana').forEach(b => b.setAttribute('aria-selected', String(b.dataset.modo === S.modoNiveles)));
    const cont = $('#lista-niveles');
    cont.innerHTML = '';
    nivelesDelModo(S.modoNiveles).forEach(n => {
      const b = document.createElement('button');
      b.className = 'nivel';
      const libre = desbloqueado(n);
      b.disabled = !libre;
      const est = S.progreso.completados[n.id] || 0;
      const pie = libre
        ? `<span class="estrellitas" aria-label="${est} de 3 estrellas">${'★'.repeat(est)}${'☆'.repeat(3 - est)}</span>`
        : '<span>Bloqueado</span>';
      b.innerHTML = `
        <span class="nivel-num">${n.id}</span>
        <span class="nivel-nombre">${esc(n.nombre)}</span>
        <span class="nivel-obj">${esc(n.objetivo)}</span>
        <span class="nivel-pie"><span class="dificultad dif-${n.dificultad}">${n.dificultad}</span>${pie}</span>`;
      b.addEventListener('click', () => pedirApodoY(() => iniciarNivel(n.id)));
      cont.appendChild(b);
    });
    if (S.modoNiveles === 'final' && !desbloqueado(nivelFinal())) {
      const p = document.createElement('p');
      p.className = 'vacio';
      p.textContent = 'El Desafío final se habilita cuando completás todos los niveles de Línea de Tiempo y de Mapa-Quiz.';
      cont.appendChild(p);
    }
  }

  function cambiarModo(paso) {
    const modos = ['tiempo', 'mapa', 'final'];
    const i = (modos.indexOf(S.modoNiveles) + paso + modos.length) % modos.length;
    S.modoNiveles = modos[i];
    renderNiveles();
  }

  // =========================================================
  //   INSTRUCCIONES (carrusel con flechas y deslizamiento)
  // =========================================================
  function renderDiapo() {
    const diapos = $$('.diapo');
    diapos.forEach((d, i) => d.classList.toggle('activa', i === S.diapo));
    $('#puntos-carrusel').innerHTML = diapos.map((_, i) => `<span class="${i === S.diapo ? 'activo' : ''}"></span>`).join('');
  }
  function cambiarDiapo(paso) {
    const total = $$('.diapo').length;
    S.diapo = Math.min(total - 1, Math.max(0, S.diapo + paso));
    renderDiapo();
  }

  // =========================================================
  //   RANKING
  // =========================================================
  function renderRanking() {
    const tb = $('#tabla-ranking');
    tb.innerHTML = S.ranking.map((r, i) => {
      const n = nivelPorId(r.nivel);
      const fecha = new Date(r.fecha).toLocaleDateString('es-AR');
      return `<tr class="${r.id === S.ultimoRanking ? 'yo' : ''}">
        <td>${i + 1}</td><td>${esc(r.apodo)}</td><td>${r.puntos}</td>
        <td>${n ? `${n.id}. ${esc(n.nombre)}` : r.nivel}</td><td>${fecha}</td></tr>`;
    }).join('');
    $('#ranking-vacio').hidden = S.ranking.length > 0;
    $('.tabla-ranking').hidden = S.ranking.length === 0;
  }

  function guardarRanking(puntos, nivel) {
    if (puntos <= 0) return null;
    const entrada = { id: Date.now(), apodo: S.apodo || 'Explorador/a', puntos, nivel: nivel.id, fecha: new Date().toISOString() };
    S.ranking.push(entrada);
    S.ranking.sort((a, b) => b.puntos - a.puntos);
    S.ranking = S.ranking.slice(0, 10);
    almacen.guardar('ranking', S.ranking);
    const puesto = S.ranking.findIndex(r => r.id === entrada.id);
    if (puesto === -1) return null;
    S.ultimoRanking = entrada.id;
    return puesto + 1;
  }

  // =========================================================
  //   CONFIGURACIÓN Y APODO
  // =========================================================
  function renderConfig() {
    $('#cfg-musica').checked = S.config.musica;
    $('#cfg-efectos').checked = S.config.efectos;
    $('#cfg-apodo').value = S.apodo;
  }

  function pedirApodoY(callback) {
    if (S.apodo) { callback(); return; }
    S.despuesApodo = callback;
    $('#c-apodo').hidden = false;
    $('#input-apodo').value = '';
    $('#input-apodo').focus();
  }

  function guardarApodo() {
    S.apodo = $('#input-apodo').value.trim().slice(0, 16) || 'Explorador/a';
    almacen.guardar('apodo', S.apodo);
    $('#c-apodo').hidden = true;
    const cb = S.despuesApodo;
    S.despuesApodo = null;
    if (cb) cb();
  }

  function borrarProgreso(boton) {
    if (!boton.dataset.confirmar) {
      boton.dataset.confirmar = '1';
      boton.textContent = 'Tocá de nuevo para confirmar';
      setTimeout(() => { delete boton.dataset.confirmar; boton.textContent = 'Borrar progreso y ranking'; }, 4000);
      return;
    }
    S.progreso = { completados: {} };
    S.ranking = [];
    almacen.borrar('progreso');
    almacen.borrar('ranking');
    delete boton.dataset.confirmar;
    boton.textContent = 'Borrar progreso y ranking';
    aviso('Se borró el progreso y el ranking.');
  }

  // =========================================================
  //   MAPAS: proyección, construcción SVG y zoom
  // =========================================================
  function proyectar(p, lon, lat) {
    if (p.tipo === 'eqr') return [(lon - p.lonMin) * p.c * p.k, (p.latMax - lat) * p.k];
    const my = l => Math.log(Math.tan(Math.PI / 4 + l * Math.PI / 360));
    return [(lon - p.lonMin) * Math.PI / 180 * p.k, (my(p.latMax) - my(lat)) * p.k];
  }

  class Visor {
    constructor(svg, base, alEscalar) {
      this.svg = svg;
      this.base = base;
      this.vb = { ...base };
      this.alEscalar = alEscalar;
      this.punteros = new Map();
      this.arrastro = false;
      this.inicio = null;
      this.pinch = null;

      svg.addEventListener('wheel', e => {
        e.preventDefault();
        this.zoom(e.deltaY < 0 ? 1.25 : 0.8, this.aSvg(e.clientX, e.clientY));
      }, { passive: false });
      svg.addEventListener('pointerdown', e => this.bajar(e));
      window.addEventListener('pointermove', e => this.mover(e));
      window.addEventListener('pointerup', e => this.subir(e));
      window.addEventListener('pointercancel', e => this.subir(e));
      if ('ResizeObserver' in window) new ResizeObserver(() => this.avisarEscala()).observe(svg);
    }

    escala() {
      const r = this.svg.getBoundingClientRect();
      if (!r.width || !r.height) return 1;
      return Math.max(this.vb.w / r.width, this.vb.h / r.height);
    }

    aSvg(cx, cy) {
      const r = this.svg.getBoundingClientRect();
      const s = this.escala();
      const ox = r.left + (r.width - this.vb.w / s) / 2;
      const oy = r.top + (r.height - this.vb.h / s) / 2;
      return { x: this.vb.x + (cx - ox) * s, y: this.vb.y + (cy - oy) * s };
    }

    aplicar() {
      this.svg.setAttribute('viewBox', `${this.vb.x} ${this.vb.y} ${this.vb.w} ${this.vb.h}`);
      this.avisarEscala();
    }

    avisarEscala() { if (this.alEscalar) this.alEscalar(this.escala()); }

    limitar() {
      const b = this.base, v = this.vb;
      if (v.w >= b.w - 0.01) { this.vb = { ...b }; return; }
      const cx = Math.min(Math.max(v.x + v.w / 2, b.x), b.x + b.w);
      const cy = Math.min(Math.max(v.y + v.h / 2, b.y), b.y + b.h);
      v.x = cx - v.w / 2;
      v.y = cy - v.h / 2;
    }

    zoom(factor, centro) {
      const c = centro || { x: this.vb.x + this.vb.w / 2, y: this.vb.y + this.vb.h / 2 };
      const w = Math.min(this.base.w, Math.max(this.base.w / 8, this.vb.w / factor));
      const k = w / this.vb.w;
      this.vb.x = c.x - (c.x - this.vb.x) * k;
      this.vb.y = c.y - (c.y - this.vb.y) * k;
      this.vb.w = w;
      this.vb.h = this.vb.h * k;
      this.limitar();
      this.aplicar();
    }

    reset() { this.vb = { ...this.base }; this.aplicar(); }

    bajar(e) {
      this.punteros.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.punteros.size === 1) {
        this.inicio = { x: e.clientX, y: e.clientY, vb: { ...this.vb } };
        this.arrastro = false;
      } else if (this.punteros.size === 2) {
        const [a, b] = [...this.punteros.values()];
        this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, vb: { ...this.vb }, centro: this.aSvg((a.x + b.x) / 2, (a.y + b.y) / 2) };
        this.arrastro = true;
      }
    }

    mover(e) {
      if (!this.punteros.has(e.pointerId)) return;
      this.punteros.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.punteros.size === 1 && this.inicio) {
        const dx = e.clientX - this.inicio.x;
        const dy = e.clientY - this.inicio.y;
        if (!this.arrastro && Math.hypot(dx, dy) > 6) {
          this.arrastro = true;
          this.svg.classList.add('arrastrando');
        }
        if (this.arrastro) {
          const r = this.svg.getBoundingClientRect();
          const s = Math.max(this.inicio.vb.w / r.width, this.inicio.vb.h / r.height);
          this.vb.x = this.inicio.vb.x - dx * s;
          this.vb.y = this.inicio.vb.y - dy * s;
          this.limitar();
          this.aplicar();
        }
      } else if (this.punteros.size === 2 && this.pinch) {
        const [a, b] = [...this.punteros.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        this.vb = { ...this.pinch.vb };
        this.zoom(d / this.pinch.d, this.pinch.centro);
      }
    }

    subir(e) {
      if (!this.punteros.has(e.pointerId)) return;
      this.punteros.delete(e.pointerId);
      if (this.punteros.size < 2) this.pinch = null;
      if (this.punteros.size === 0) {
        this.inicio = null;
        this.svg.classList.remove('arrastrando');
        setTimeout(() => { this.arrastro = false; }, 0);
      }
    }
  }

  function construirMapa(clave) {
    const m = S.mapas[clave];
    const [x, y, w, h] = m.viewBox.split(' ').map(Number);
    const svg = el('svg', {
      viewBox: m.viewBox,
      preserveAspectRatio: 'xMidYMid meet',
      role: 'img',
      'aria-label': clave === 'argentina' ? 'Mapa de la República Argentina' : 'Mapa de Latinoamérica'
    });
    const grupo = nombre => svg.appendChild(el('g', { class: 'capa-' + nombre }));

    // El orden importa: lo de abajo se dibuja primero.
    const gAguas = grupo('aguas');
    (m.aguas || []).forEach(a => gAguas.appendChild(el('path', { d: a.d, class: 'agua', 'data-id': a.id, 'data-capa': 'rios' })));
    const gFondo = grupo('fondo');
    (m.fondo || []).forEach(f => gFondo.appendChild(el('path', { d: f.d, class: 'vecino' })));
    const gReg = grupo('regiones');
    m.regiones.forEach(r => gReg.appendChild(el('path', { d: r.d, class: 'region', 'data-id': r.id, 'data-capa': 'regiones' })));

    if (clave === 'argentina') {
      const gRios = grupo('rios');
      m.rios.forEach(r => {
        const g = el('g', { class: 'rio', 'data-id': r.id, 'data-capa': 'rios' });
        g.appendChild(el('path', { d: r.d, class: 'rio-toque' }));
        g.appendChild(el('path', { d: r.d, class: 'rio-linea' }));
        gRios.appendChild(g);
      });
      // La Ciudad de Buenos Aires es muy chica: se marca con un círculo para poder tocarla.
      const [cx, cy] = proyectar(m.proyeccion, -58.44, -34.61);
      gReg.appendChild(el('circle', { cx, cy, r: 5, class: 'marcador-caba', 'data-id': 'caba', 'data-capa': 'regiones' }));
      const gCap = grupo('capitales');
      S.contenido.capitales.forEach(c => {
        const [px, py] = proyectar(m.proyeccion, c.lon, c.lat);
        const g = el('g', { class: 'capital', 'data-id': c.id, 'data-capa': 'capitales' });
        g.appendChild(el('circle', { cx: px, cy: py, r: 10, class: 'toque' }));
        g.appendChild(el('circle', { cx: px, cy: py, r: 4, class: 'punto' }));
        gCap.appendChild(g);
      });
    }

    // Los puntos mantienen el mismo tamaño en pantalla aunque se haga zoom.
    const visor = new Visor(svg, { x, y, w, h }, s => {
      $$('.capital .punto', svg).forEach(c => c.setAttribute('r', 5 * s));
      $$('.capital .toque', svg).forEach(c => c.setAttribute('r', 10 * s));
      $$('.marcador-caba', svg).forEach(c => c.setAttribute('r', 8 * s));
    });
    visor.clave = clave;

    svg.addEventListener('click', e => {
      if (visor.arrastro) return;
      const t = e.target.closest('[data-id]');
      if (t) clickMapa(t.dataset.id, t.dataset.capa);
    });
    return visor;
  }

  function obtenerMapa(clave) {
    if (!S.visores[clave]) S.visores[clave] = construirMapa(clave);
    const v = S.visores[clave];
    const marco = $('#mapa-marco');
    if (marco.firstChild !== v.svg) {
      marco.innerHTML = '';
      marco.appendChild(v.svg);
    }
    return v;
  }

  function marcar(svg, clase, ids) {
    $$('.' + clase, svg).forEach(e => e.classList.remove(clase));
    ids.forEach(id => $$(`[data-id="${id}"]`, svg).forEach(e => e.classList.add(clase)));
  }

  function idsDeCapa(mapa, capa) {
    if (capa === 'regiones') return S.mapas[mapa].regiones.map(r => r.id);
    if (capa === 'capitales') return S.contenido.capitales.map(c => c.id);
    return S.contenido.rios.map(r => r.id);
  }

  function nombreDe(mapa, capa, id) {
    let lista;
    if (capa === 'regiones') lista = mapa === 'argentina' ? S.contenido.provincias : S.contenido.paises;
    else if (capa === 'capitales') lista = S.contenido.capitales;
    else lista = S.contenido.rios;
    const item = lista.find(x => x.id === id);
    return item ? capitalizar(item.nombre) : 'otro lugar';
  }

  // =========================================================
  //   PARTIDA: armado de niveles y rondas
  // =========================================================
  const FUENTES = { provincia: 'provincias', capital: 'capitales', rio: 'rios', pais: 'paises', capitalPais: 'paises' };

  function crearPregunta(tipo, usados) {
    const clave = FUENTES[tipo];
    const pool = S.contenido[clave];
    usados[clave] = usados[clave] || new Set();
    let libres = pool.filter(x => !usados[clave].has(x.id));
    if (!libres.length) { usados[clave].clear(); libres = pool.slice(); }
    const it = elegir(libres);
    usados[clave].add(it.id);
    switch (tipo) {
      case 'provincia':
        return { capa: 'regiones', objetivo: it.id, explicacion: it.explicacion, correcto: it.nombre,
          enunciado: it.id === 'caba' ? 'Ubicá la Ciudad Autónoma de Buenos Aires' : `Ubicá la provincia de ${it.nombre}` };
      case 'capital':
        return { capa: 'capitales', objetivo: it.id, explicacion: it.explicacion, correcto: `${it.nombre}, capital de ${it.provincia}`,
          enunciado: `Ubicá la ciudad de ${it.nombre}` };
      case 'rio':
        return { capa: 'rios', objetivo: it.id, explicacion: it.explicacion, correcto: capitalizar(it.nombre),
          enunciado: `Ubicá el ${it.nombre}` };
      case 'pais':
        return { capa: 'regiones', objetivo: it.id, explicacion: it.explicacion, correcto: `${it.nombre} (capital: ${it.capital})`,
          enunciado: `Ubicá ${it.nombre}` };
      default: // capitalPais
        return { capa: 'regiones', objetivo: it.id, explicacion: it.explicacion, correcto: `${it.capital} es la capital de ${it.nombre}`,
          enunciado: `¿Qué país tiene como capital a ${it.capital}?` };
    }
  }

  function generarRondas(nivel) {
    const usados = {};
    const usadosEventos = new Set();
    return nivel.rondas.map(spec => {
      if (spec.tipo === 'tiempo') {
        const banco = spec.banco === 'todos' ? Object.values(S.contenido.eventos).flat() : S.contenido.eventos[spec.banco];
        const libres = banco.filter(e => !usadosEventos.has(e.id));
        const eventos = muestra(libres.length >= spec.cantidad ? libres : banco, spec.cantidad);
        eventos.forEach(e => usadosEventos.add(e.id));
        return { tipo: 'tiempo', eventos };
      }
      const preguntas = [];
      for (let i = 0; i < spec.cantidad; i++) preguntas.push(crearPregunta(elegir(spec.preguntas), usados));
      return { tipo: 'mapa', mapa: spec.mapa, preguntas };
    });
  }

  // ---------- Reloj ----------
  let relojId = null;
  let ultimoT = 0;
  function arrancarReloj() {
    pararReloj();
    ultimoT = performance.now();
    relojId = setInterval(tic, 100);
  }
  function pararReloj() { if (relojId) clearInterval(relojId); relojId = null; }

  function tic() {
    const ahora = performance.now();
    const dt = (ahora - ultimoT) / 1000;
    ultimoT = ahora;
    const P = S.partida;
    if (!P || P.pausada || P.estado !== 'jugando') return;
    P.tiempo = Math.max(0, P.tiempo - dt);
    const seg = Math.ceil(P.tiempo);
    if (seg <= 10 && seg > 0 && seg !== P.ultimoTic) { P.ultimoTic = seg; sonido.efecto('tic'); }
    actualizarTiempo();
    if (P.tiempo <= 0) {
      sonido.efecto('tiempo');
      terminar(false, 'Se terminó el tiempo de la ronda.');
    }
  }

  // ---------- Inicio de nivel y rondas ----------
  function iniciarNivel(id) {
    const nivel = nivelPorId(id);
    S.partida = {
      nivel, rondas: generarRondas(nivel), r: 0,
      vidas: 3, puntos: 0, racha: 0, pistas: 2,
      errores: [], aciertos: 0,
      tiempo: nivel.tiempo, ultimoTic: 0,
      estado: 'jugando', pausada: false
    };
    ocultarCapas();
    mostrar('juego');
    iniciarRonda();
    arrancarReloj();
  }

  function iniciarRonda() {
    const P = S.partida;
    const ronda = P.rondas[P.r];
    P.tiempo = P.nivel.tiempo;
    P.ultimoTic = 0;
    $('#zona-tiempo').hidden = ronda.tipo !== 'tiempo';
    $('#zona-mapa').hidden = ronda.tipo !== 'mapa';
    if (ronda.tipo === 'tiempo') {
      iniciarRondaTiempo(ronda);
    } else {
      P.qi = 0;
      const v = obtenerMapa(ronda.mapa);
      requestAnimationFrame(() => v.reset());
      mostrarPreguntaMapa();
    }
    actualizarHud();
  }

  function finRonda() {
    const P = S.partida;
    P.r++;
    if (P.r >= P.rondas.length) { terminar(true); return; }
    aviso(`¡Ronda completada! Empieza la ronda ${P.r + 1}.`);
    iniciarRonda();
  }

  // =========================================================
  //   MODO LÍNEA DE TIEMPO
  // =========================================================
  function iniciarRondaTiempo(ronda) {
    const P = S.partida;
    const evs = mezclar(ronda.eventos);
    P.colocados = [{ ev: evs[0], estado: 'ancla' }];
    P.cola = evs.slice(1);
    P.actual = P.cola.shift();
    P.hueco = null;
    P.descartados = new Set();
    $('#consigna').textContent = '¿Dónde va este hecho en la línea del tiempo?';
    renderCinta();
    renderTarjetaActual();
    botonConfirmar(false);
  }

  const posCorrecta = () => S.partida.colocados.filter(c => c.ev.fecha < S.partida.actual.fecha).length;

  function renderCinta() {
    const P = S.partida;
    const cinta = $('#cinta');
    cinta.innerHTML = '';
    const total = P.colocados.length;
    for (let i = 0; i <= total; i++) {
      const h = document.createElement('button');
      h.className = 'hueco';
      h.dataset.i = i;
      if (P.hueco === i) h.classList.add('elegido');
      if (i === 0) h.setAttribute('aria-label', 'Ubicar al principio');
      else if (i === total) h.setAttribute('aria-label', 'Ubicar al final');
      else h.setAttribute('aria-label', `Ubicar entre «${P.colocados[i - 1].ev.titulo}» y «${P.colocados[i].ev.titulo}»`);
      if (P.descartados.has(i)) {
        h.classList.add('descartado');
        h.disabled = true;
        h.setAttribute('aria-label', 'Descartado por la pista');
      }
      h.addEventListener('click', () => elegirHueco(i));
      cinta.appendChild(h);
      if (i < total) {
        const c = P.colocados[i];
        const t = document.createElement('div');
        t.className = 'tarjeta';
        if (c.estado === 'ok' || c.estado === 'mal') t.classList.add(c.estado);
        if (c.nueva) t.classList.add('nueva');
        t.innerHTML = `<span class="fecha">${esc(c.ev.mostrar)}</span><span class="titulo">${esc(c.ev.titulo)}</span>`;
        cinta.appendChild(t);
      }
    }
  }

  function renderTarjetaActual() {
    const P = S.partida;
    const t = $('#tarjeta-actual');
    t.hidden = !P.actual;
    if (P.actual) t.innerHTML = `<span class="fecha">¿Cuándo?</span><span class="titulo">${esc(P.actual.titulo)}</span>`;
    $('#pista-texto').hidden = true;
  }

  function elegirHueco(i) {
    const P = S.partida;
    if (!P || P.estado !== 'jugando' || P.pausada) return;
    if (P.descartados.has(i)) return;
    P.hueco = i;
    renderCinta();
    const h = $(`.hueco[data-i="${i}"]`);
    if (h) h.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    botonConfirmar(true);
    sonido.efecto('soltar');
  }

  function moverHueco(paso) {
    const P = S.partida;
    const max = P.colocados.length;
    let i = P.hueco === null ? (paso > 0 ? -1 : max + 1) : P.hueco;
    do { i += paso; } while (i >= 0 && i <= max && P.descartados.has(i));
    if (i >= 0 && i <= max) elegirHueco(i);
  }

  function huecoEn(x, y) {
    const objetivo = document.elementFromPoint(x, y);
    if (!objetivo) return null;
    const h = objetivo.closest('.hueco');
    if (h) return h;
    if (!objetivo.closest('.cinta')) return null;
    // Si se suelta sobre una tarjeta, se usa el hueco más cercano.
    let mejor = null, dist = Infinity;
    $$('.hueco:not(.descartado)').forEach(hu => {
      const r = hu.getBoundingClientRect();
      const d = Math.hypot(r.left + r.width / 2 - x, r.top + r.height / 2 - y);
      if (d < dist) { dist = d; mejor = hu; }
    });
    return mejor;
  }

  function activarArrastre() {
    const tarjeta = $('#tarjeta-actual');
    tarjeta.addEventListener('pointerdown', e => {
      const P = S.partida;
      if (!P || P.estado !== 'jugando' || P.pausada || !P.actual) return;
      e.preventDefault();
      const flot = tarjeta.cloneNode(true);
      flot.removeAttribute('id');
      flot.classList.add('tarjeta-flotante');
      flot.style.width = tarjeta.offsetWidth + 'px';
      document.body.appendChild(flot);
      tarjeta.classList.add('levantada');
      const cinta = $('#cinta');

      const mover = ev => {
        flot.style.left = ev.clientX + 'px';
        flot.style.top = ev.clientY + 'px';
        $$('.hueco.sobre').forEach(x => x.classList.remove('sobre'));
        const h = huecoEn(ev.clientX, ev.clientY);
        if (h) h.classList.add('sobre');
        // Desplaza la cinta si la tarjeta se acerca a un borde.
        const r = cinta.getBoundingClientRect();
        if (ev.clientY > r.top && ev.clientY < r.bottom) {
          if (ev.clientX < r.left + 50) cinta.scrollLeft -= 12;
          if (ev.clientX > r.right - 50) cinta.scrollLeft += 12;
        }
        if (ev.clientX > r.left && ev.clientX < r.right) {
          if (ev.clientY < r.top + 40) cinta.scrollTop -= 10;
          if (ev.clientY > r.bottom - 40) cinta.scrollTop += 10;
        }
      };
      const soltar = ev => {
        window.removeEventListener('pointermove', mover);
        window.removeEventListener('pointerup', soltar);
        window.removeEventListener('pointercancel', soltar);
        const h = huecoEn(ev.clientX, ev.clientY);
        flot.remove();
        tarjeta.classList.remove('levantada');
        $$('.hueco.sobre').forEach(x => x.classList.remove('sobre'));
        if (h) elegirHueco(Number(h.dataset.i));
      };
      mover(e);
      window.addEventListener('pointermove', mover);
      window.addEventListener('pointerup', soltar);
      window.addEventListener('pointercancel', soltar);
    });
  }

  function confirmarTiempo() {
    const P = S.partida;
    if (P.hueco === null) return;
    const ev = P.actual;
    const correcta = posCorrecta();
    const ok = P.hueco === correcta;
    P.colocados.forEach(c => { c.nueva = false; });
    // La tarjeta siempre queda en su lugar correcto, así se aprende del error.
    P.colocados.splice(correcta, 0, { ev, estado: ok ? 'ok' : 'mal', nueva: true });
    P.hueco = null;
    P.descartados = new Set();
    P.actual = null;
    renderCinta();
    renderTarjetaActual();
    botonConfirmar(false);
    const t = $('.tarjeta.nueva');
    if (t) t.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    responder(ok, {
      pregunta: ev.titulo,
      respuesta: ok ? `${ev.titulo}: ${ev.mostrar}.` : `Ese hecho iba en otro lugar. Fecha: ${ev.mostrar}.`,
      explicacion: ev.explicacion
    });
  }

  // =========================================================
  //   MODO MAPA-QUIZ
  // =========================================================
  function preguntaActual() {
    const P = S.partida;
    const ronda = P.rondas[P.r];
    return { ronda, q: ronda.preguntas[P.qi] };
  }

  function mostrarPreguntaMapa() {
    const P = S.partida;
    const { ronda, q } = preguntaActual();
    const v = obtenerMapa(ronda.mapa);
    const svg = v.svg;
    svg.classList.remove('modo-regiones', 'modo-capitales', 'modo-rios');
    svg.classList.add('modo-' + q.capa);
    ['sel', 'ok', 'mal', 'candidata'].forEach(c => marcar(svg, c, []));
    P.seleccion = null;
    P.pistaMapa = false;
    $('#consigna').textContent = q.enunciado;
    $('#seleccion-mapa').textContent = '';
    botonConfirmar(false);
    actualizarHud();
  }

  function clickMapa(id, capa) {
    const P = S.partida;
    if (!P || P.estado !== 'jugando' || P.pausada) return;
    const { ronda, q } = preguntaActual();
    if (!q || capa !== q.capa) return;
    P.seleccion = id;
    marcar(S.visores[ronda.mapa].svg, 'sel', [id]);
    $('#seleccion-mapa').textContent = 'Lugar marcado. Tocá Confirmar o apretá Enter.';
    botonConfirmar(true);
    sonido.efecto('elegir');
  }

  function confirmarMapa() {
    const P = S.partida;
    if (!P.seleccion) return;
    const { ronda, q } = preguntaActual();
    const svg = S.visores[ronda.mapa].svg;
    const ok = P.seleccion === q.objetivo;
    marcar(svg, 'sel', []);
    marcar(svg, 'candidata', []);
    marcar(svg, 'ok', [q.objetivo]);
    if (!ok) marcar(svg, 'mal', [P.seleccion]);
    $('#seleccion-mapa').textContent = '';
    botonConfirmar(false);
    responder(ok, {
      pregunta: q.enunciado,
      respuesta: ok ? q.correcto + '.' : `Marcaste ${nombreDe(ronda.mapa, q.capa, P.seleccion)}. La respuesta correcta es ${q.correcto} (en verde).`,
      explicacion: q.explicacion
    });
  }

  // =========================================================
  //   RESPUESTAS, PUNTAJE, PISTAS Y PAUSA
  // =========================================================
  function botonConfirmar(activo) { $('#btn-confirmar').disabled = !activo; }

  function confirmar() {
    const P = S.partida;
    if (!P || P.estado !== 'jugando' || P.pausada) return;
    if (P.rondas[P.r].tipo === 'tiempo') confirmarTiempo();
    else confirmarMapa();
  }

  function responder(ok, info) {
    const P = S.partida;
    P.estado = 'feedback';
    const hoja = $('#c-feedback .hoja');
    let titulo, detalle = '';
    if (ok) {
      P.racha++;
      P.aciertos++;
      const bonoTiempo = Math.round(50 * P.tiempo / P.nivel.tiempo);
      const bonoRacha = 10 * (P.racha - 1);
      const ganado = 100 + bonoTiempo + bonoRacha;
      P.puntos += ganado;
      titulo = `${elegir(['¡Correcto!', '¡Muy bien!', '¡Exacto!'])} +${ganado}`;
      detalle = ` (100 por acertar, ${bonoTiempo} por tiempo${bonoRacha ? `, ${bonoRacha} por racha de ${P.racha}` : ''})`;
      // Cada 3 aciertos seguidos se gana una pista, sin pasar de 3 guardadas.
      if (P.racha % 3 === 0 && P.pistas < 3) {
        P.pistas++;
        detalle += `. ¡${P.racha} seguidas: ganaste una pista!`;
      }
      sonido.efecto('acierto');
    } else {
      P.racha = 0;
      P.vidas--;
      P.errores.push(info);
      titulo = P.vidas > 0 ? `No era ahí. Te quedan ${P.vidas} ${P.vidas === 1 ? 'vida' : 'vidas'}` : 'No era ahí';
      sonido.efecto('error');
    }
    actualizarHud();
    hoja.classList.toggle('ok', ok);
    hoja.classList.toggle('mal', !ok);
    $('#fb-titulo').textContent = titulo;
    $('#fb-respuesta').textContent = info.respuesta + (ok ? detalle : '');
    $('#fb-explicacion').textContent = info.explicacion;
    $('#c-feedback').hidden = false;
    $('#c-feedback .btn').focus({ preventScroll: true });
  }

  function seguir() {
    const P = S.partida;
    if (!P || P.estado !== 'feedback') return;
    $('#c-feedback').hidden = true;
    if (P.vidas <= 0) { terminar(false, 'Te quedaste sin vidas.'); return; }
    P.estado = 'jugando';
    const ronda = P.rondas[P.r];
    if (ronda.tipo === 'tiempo') {
      if (P.cola.length) {
        P.actual = P.cola.shift();
        renderTarjetaActual();
        renderCinta();
      } else {
        finRonda();
      }
    } else {
      P.qi++;
      if (P.qi < ronda.preguntas.length) mostrarPreguntaMapa();
      else finRonda();
    }
  }

  function usarPista() {
    const P = S.partida;
    if (!P || P.estado !== 'jugando' || P.pausada) return;
    if (P.pistas <= 0) { aviso('No te quedan pistas. Acertá 3 seguidas para ganar otra.'); return; }
    const ronda = P.rondas[P.r];
    if (ronda.tipo === 'tiempo' && P.actual.pista) {
      // La pista da un dato de contexto sobre el hecho, sin revelar su fecha ni su lugar.
      const caja = $('#pista-texto');
      if (!caja.hidden) { aviso('La pista ya está en pantalla.'); return; }
      caja.innerHTML = `<strong>Pista:</strong> ${esc(P.actual.pista)}`;
      caja.hidden = false;
    } else if (ronda.tipo === 'tiempo') {
      // Hechos sin texto de pista: se descartan huecos incorrectos, dejando al menos 2 opciones.
      if (P.descartados.size) { aviso('Ya usaste una pista con esta tarjeta.'); return; }
      const total = P.colocados.length + 1;
      if (total <= 2) { aviso('Con solo dos lugares posibles no hay pista. ¡Arriesgá!'); return; }
      const quedan = total === 3 ? 2 : 3;
      const correcta = posCorrecta();
      const incorrectos = mezclar([...Array(total).keys()].filter(i => i !== correcta));
      incorrectos.slice(0, total - quedan).forEach(i => P.descartados.add(i));
      if (P.descartados.has(P.hueco)) { P.hueco = null; botonConfirmar(false); }
      renderCinta();
      aviso(`La pista descartó algunos lugares: quedan ${quedan} opciones.`);
    } else {
      if (P.pistaMapa) { aviso('La pista ya está en pantalla.'); return; }
      const { q } = preguntaActual();
      const otros = muestra(idsDeCapa(ronda.mapa, q.capa).filter(id => id !== q.objetivo), 2);
      marcar(S.visores[ronda.mapa].svg, 'candidata', [q.objetivo, ...otros]);
      P.pistaMapa = true;
      aviso('Es uno de los 3 lugares que titilan en verde.');
    }
    P.pistas--;
    P.puntos = Math.max(0, P.puntos - 30);
    sonido.efecto('pista');
    actualizarHud();
  }

  function pausar() {
    const P = S.partida;
    if (!P || P.estado === 'fin' || P.pausada) return;
    P.pausada = true;
    $('#c-pausa').hidden = false;
    $('#c-pausa .btn').focus({ preventScroll: true });
  }

  function reanudar() {
    const P = S.partida;
    if (!P) return;
    P.pausada = false;
    $('#c-pausa').hidden = true;
    if (P.estado === 'feedback') $('#c-feedback .btn').focus({ preventScroll: true });
  }

  function ocultarCapas() { ['#c-feedback', '#c-pausa', '#c-fin'].forEach(s => { $(s).hidden = true; }); }

  function salirAlMenu() {
    pararReloj();
    S.partida = null;
    ocultarCapas();
    mostrar('sala');
  }

  // ---------- HUD ----------
  function actualizarHud() {
    const P = S.partida;
    if (!P) return;
    $('#hud-vidas').innerHTML = '♥'.repeat(Math.max(0, P.vidas)) + '<span class="perdida">♥</span>'.repeat(3 - Math.max(0, P.vidas));
    $('#hud-vidas').setAttribute('aria-label', `${P.vidas} vidas`);
    const r = Math.min(P.r, P.rondas.length - 1);
    let detalle = `Ronda ${r + 1} de ${P.rondas.length}`;
    const ronda = P.rondas[r];
    if (ronda.tipo === 'mapa' && P.qi !== undefined) detalle += `, pregunta ${Math.min(P.qi + 1, ronda.preguntas.length)} de ${ronda.preguntas.length}`;
    $('#hud-nivel').textContent = `Nivel ${P.nivel.id}: ${P.nivel.nombre}. ${detalle}`;
    $('#hud-puntos').textContent = P.puntos;
    $('#hud-pistas').textContent = P.pistas;
    $('#btn-pista').disabled = P.pistas <= 0;
    actualizarTiempo();
  }

  function actualizarTiempo() {
    const P = S.partida;
    const seg = Math.ceil(P.tiempo);
    $('#hud-tiempo').textContent = seg;
    const urgente = seg <= 10;
    $('#hud-tiempo-cont').classList.toggle('urgente', urgente);
    const barra = $('#barra-tiempo');
    barra.style.transform = `scaleX(${P.tiempo / P.nivel.tiempo})`;
    barra.classList.toggle('urgente', urgente);
  }

  // =========================================================
  //   FIN DE NIVEL: VICTORIA O DERROTA
  // =========================================================
  function terminar(gano, motivo = '') {
    const P = S.partida;
    if (!P || P.estado === 'fin') return;
    P.estado = 'fin';
    $('#c-feedback').hidden = true;
    $('#c-pausa').hidden = true;
    const nivel = P.nivel;
    const fin = nivelFinal();
    const finalAntes = fin ? desbloqueado(fin) : false;
    let estrellas = 0;
    if (gano) {
      estrellas = Math.max(1, P.vidas);
      S.progreso.completados[nivel.id] = Math.max(S.progreso.completados[nivel.id] || 0, estrellas);
      almacen.guardar('progreso', S.progreso);
      sonido.efecto('nivel');
    }
    const puesto = guardarRanking(P.puntos, nivel);

    $('#fin-titulo').textContent = gano ? '¡Nivel completado!' : 'Esta vez no salió';
    let mensaje;
    if (gano) {
      mensaje = `Reparaste la pieza ${nivel.id} de la Máquina del Tiempo.`;
      const modoCompleto = nivelesDelModo(nivel.modo).every(n => completado(n.id));
      if (modoCompleto && nivel.modo === 'tiempo') mensaje += ' ¡Restauraste toda la línea del tiempo!';
      if (modoCompleto && nivel.modo === 'mapa') mensaje += ' ¡Devolviste cada territorio a su lugar!';
      if (nivel.modo === 'final') mensaje = '¡La Máquina del Tiempo quedó completamente reparada! Superaste el Desafío final.';
      if (fin && !finalAntes && desbloqueado(fin)) mensaje += ' Se habilitó el Desafío final.';
    } else {
      mensaje = `${motivo} Repasá lo que salió mal y volvé a intentarlo: cada error te deja algo aprendido.`;
    }
    $('#fin-mensaje').textContent = mensaje;
    $('#fin-estrellas').hidden = !gano;
    $('#fin-estrellas').innerHTML = '★'.repeat(estrellas) + '<span class="apagada">★</span>'.repeat(3 - estrellas);
    $('#fin-puntos').textContent = P.puntos;
    $('#fin-ranking').textContent = puesto ? `Entraste al ranking en el puesto ${puesto}.` : '';
    $('#fin-repaso').innerHTML = P.errores.length
      ? '<h3>Repaso de errores</h3>' + P.errores.map(e => `<div class="repaso-item"><strong>${esc(e.pregunta)}</strong>${esc(e.explicacion)}</div>`).join('')
      : '';

    const botones = $('#fin-botones');
    botones.innerHTML = '';
    const agregar = (texto, clase, accion) => {
      const b = document.createElement('button');
      b.className = 'btn ' + clase;
      b.textContent = texto;
      b.addEventListener('click', accion);
      botones.appendChild(b);
      return b;
    };
    let primero;
    if (gano) {
      const sig = siguienteNivel(nivel);
      if (sig) primero = agregar('Siguiente nivel', 'btn-principal', () => iniciarNivel(sig.id));
      const elegirNivel = agregar('Elegir nivel', sig ? '' : 'btn-principal', () => { salirAlMenu(); S.modoNiveles = nivel.modo; mostrar('niveles'); });
      primero = primero || elegirNivel;
    } else {
      primero = agregar('Reintentar', 'btn-principal', () => iniciarNivel(nivel.id));
      agregar('Volver al menú', 'btn-suave', salirAlMenu);
    }
    $('#c-fin').hidden = false;
    primero.focus({ preventScroll: true });
  }

  // =========================================================
  //   EVENTOS GLOBALES
  // =========================================================
  const acciones = {
    jugar: () => mostrar('niveles'),
    continuar: () => {
      const n = nivelParaContinuar();
      if (n) pedirApodoY(() => iniciarNivel(n.id));
      else mostrar('niveles');
    },
    ranking: () => mostrar('ranking'),
    instrucciones: () => { S.diapo = 0; mostrar('instrucciones'); },
    config: () => mostrar('config'),
    salir: () => { sonido.pararMusica(); mostrar('salir'); },
    sala: () => { if (S.pantalla === 'salir') sonido.actualizarMusica(); mostrar('sala'); },
    'diapo-ant': () => cambiarDiapo(-1),
    'diapo-sig': () => cambiarDiapo(1),
    pista: usarPista,
    pausa: pausar,
    confirmar,
    seguir,
    reanudar,
    reiniciar: () => { if (S.partida) iniciarNivel(S.partida.nivel.id); },
    'menu-desde-juego': salirAlMenu,
    'zoom-mas': () => visorActual()?.zoom(1.5),
    'zoom-menos': () => visorActual()?.zoom(1 / 1.5),
    'zoom-reset': () => visorActual()?.reset(),
    'guardar-apodo': guardarApodo,
    'borrar-progreso': (b) => borrarProgreso(b)
  };

  function visorActual() {
    const P = S.partida;
    if (!P) return null;
    const ronda = P.rondas[P.r];
    return ronda && ronda.tipo === 'mapa' ? S.visores[ronda.mapa] : null;
  }

  function conectarEventos() {
    document.addEventListener('click', e => {
      const b = e.target.closest('[data-accion]');
      if (b && !b.disabled && acciones[b.dataset.accion]) acciones[b.dataset.accion](b);
    });

    $$('.pestana').forEach(p => p.addEventListener('click', () => { S.modoNiveles = p.dataset.modo; renderNiveles(); }));

    $('#cfg-musica').addEventListener('change', e => {
      S.config.musica = e.target.checked;
      almacen.guardar('config', S.config);
      sonido.actualizarMusica();
    });
    $('#cfg-efectos').addEventListener('change', e => {
      S.config.efectos = e.target.checked;
      almacen.guardar('config', S.config);
      sonido.efecto('elegir');
    });
    $('#cfg-apodo').addEventListener('input', e => {
      S.apodo = e.target.value.trim().slice(0, 16);
      almacen.guardar('apodo', S.apodo);
    });

    // Deslizar entre diapositivas de instrucciones
    const carrusel = $('#carrusel');
    let x0 = null;
    carrusel.addEventListener('pointerdown', e => { x0 = e.clientX; });
    carrusel.addEventListener('pointerup', e => {
      if (x0 === null) return;
      const dx = e.clientX - x0;
      if (Math.abs(dx) > 50) cambiarDiapo(dx < 0 ? 1 : -1);
      x0 = null;
    });

    activarArrastre();

    // La música arranca con el primer toque o tecla (los navegadores lo exigen).
    const desbloquearAudio = () => {
      sonido.actualizarMusica();
      document.removeEventListener('pointerdown', desbloquearAudio);
      document.removeEventListener('keydown', desbloquearAudio);
    };
    document.addEventListener('pointerdown', desbloquearAudio);
    document.addEventListener('keydown', desbloquearAudio);

    document.addEventListener('visibilitychange', () => {
      if (document.hidden && S.partida && S.pantalla === 'juego') pausar();
    });

    document.addEventListener('keydown', e => {
      const k = e.key;
      if (e.target.tagName === 'INPUT') {
        if (k === 'Enter' && e.target.id === 'input-apodo') guardarApodo();
        return;
      }
      if (!$('#c-apodo').hidden) {
        if (k === 'Escape') { $('#c-apodo').hidden = true; S.despuesApodo = null; }
        return;
      }
      if (S.pantalla === 'juego' && S.partida) {
        const P = S.partida;
        if (k === 'Escape') { e.preventDefault(); if (P.pausada) reanudar(); else pausar(); return; }
        if (P.pausada || P.estado === 'fin') return;
        if (P.estado === 'feedback') {
          if (k === 'Enter' || k === ' ') { e.preventDefault(); seguir(); }
          return;
        }
        if (k === 'h' || k === 'H') { usarPista(); return; }
        if (k === 'Enter') { e.preventDefault(); confirmar(); return; }
        if ((k === 'ArrowRight' || k === 'ArrowLeft' || k === 'ArrowDown' || k === 'ArrowUp') && P.rondas[P.r].tipo === 'tiempo') {
          e.preventDefault();
          moverHueco(k === 'ArrowRight' || k === 'ArrowDown' ? 1 : -1);
        }
        return;
      }
      if (k === 'Escape' && S.pantalla !== 'sala' && S.pantalla !== 'cargando') { mostrar('sala'); return; }
      if (k === 'ArrowRight' || k === 'ArrowLeft') {
        const paso = k === 'ArrowRight' ? 1 : -1;
        if (S.pantalla === 'instrucciones') cambiarDiapo(paso);
        if (S.pantalla === 'niveles') cambiarModo(paso);
      }
    });
  }

  // =========================================================
  //   CARGA DE DATOS E INICIO
  // =========================================================
  async function cargarDatos() {
    // Versión de un solo archivo: los datos vienen incrustados.
    if (window.CRONOMAPA_DATOS) {
      S.contenido = window.CRONOMAPA_DATOS.contenido;
      S.mapas = window.CRONOMAPA_DATOS.mapas;
      return;
    }
    const leer = url => fetch(url).then(r => {
      if (!r.ok) throw new Error('No se encontró ' + url);
      return r.json();
    });
    [S.contenido, S.mapas] = await Promise.all([leer('datos/contenido.json'), leer('datos/mapas.json')]);
  }

  async function iniciar() {
    try {
      await cargarDatos();
    } catch (err) {
      console.error(err);
      $('#p-cargando').innerHTML = `
        <div class="despedida">
          <h2>No se pudo cargar el contenido</h2>
          <p>El juego necesita leer los archivos de la carpeta <strong>datos</strong>. Abrilo desde GitHub Pages o con la extensión Live Server de VS Code: si abrís index.html con doble clic, el navegador bloquea esa lectura.</p>
        </div>`;
      return;
    }
    conectarEventos();
    mostrar('sala');
  }

  iniciar();
})();
