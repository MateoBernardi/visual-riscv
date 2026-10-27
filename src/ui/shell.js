import { h, safeStorage } from './dom.js';

const NAV_TIPS = {
  home: 'Presentación y por dónde empezar', lessons: 'Lecciones: ISA, pipeline, hazards, memoria, debug unit y UART',
  examples: 'Programas de ejemplo para cargar en el simulador', sim: 'Simulador ciclo a ciclo del pipeline sobre la placa 3D',
  debug: 'Consola de la debug unit: cargar, ejecutar y volcar por UART',
};
export const VIEWS = [
  ['home', 'Inicio'],
  ['lessons', 'Lecciones'],
  ['examples', 'Ejemplos'],
  ['sim', 'Simulador'],
  ['debug', 'Debug'],
];

const ICON_SUN = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
const ICON_MOON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
const ICON_HOME = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12l9-8 9 8M5 10v10h14V10"/></svg>';

/**
 * Esqueleto de la app: barra superior, pantalla de carga, paneles y capa de pop-ups.
 * callbacks: { onView(name), onTheme('light'|'dark'), onResetView() }
 * Devuelve { slots, setView, getView, setTheme, getTheme, hideLoading, update }
 */
export function createShell(root, callbacks = {}) {
  const store = safeStorage();
  let theme = store.get('vr-theme');
  if (theme !== 'light' && theme !== 'dark') {
    theme = (typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  }
  let view = 'home';
  // paneles plegables: preferencia del usuario (localStorage) > valor por defecto según vista y ancho > apertura automática
  let prefs = {};
  try { prefs = JSON.parse(store.get('vr-panels') || '{}') || {}; } catch (e) { prefs = {}; }
  const auto = { l: null, r: null };
  const wide = () => (typeof window !== 'undefined' ? window.innerWidth : 1440) >= 1600;
  function defaultOpen(side, v) {
    if (side === 'l') return v === 'sim' ? wide() : true;
    return v === 'sim' ? wide() : false;
  }
  function isPanelOpen(side) {
    if (view === 'home') return side === 'l';
    if (view === 'debug' && side === 'r') return auto.r === true;
    if (auto[side] != null) return auto[side];
    const p = prefs[view + ':' + side];
    return p != null ? !!p : defaultOpen(side, view);
  }

  const loading = h('div', { class: 'loading' },
    h('div', { class: 'loading-card' },
      h('div', { class: 'logo big' }, 'visual', h('i', {}, '·'), 'RISCV'),
      h('div', { class: 'loading-chip' }, h('span'), h('span'), h('span'), h('span'), h('span')),
      h('div', { class: 'loading-text' }, 'Cargando', h('b', { class: 'dots' }, '...')),
      h('div', { class: 'loading-bar' }, h('i'))));

  const navBtns = {};
  const nav = h('nav', { class: 'nav' }, VIEWS.map(([id, label]) => {
    const b = h('button', { class: 'nav-btn', 'data-view': id, title: NAV_TIPS[id], onclick: () => setView(id) }, label);
    navBtns[id] = b; return b;
  }));
  const themeBtn = h('button', { class: 'icon-btn', title: 'Cambiar tema', 'aria-label': 'Cambiar tema', onclick: () => setTheme(theme === 'light' ? 'dark' : 'light', true) });
  const sheetBtn = h('button', { class: 'icon-btn sheet-toggle', title: 'Mostrar/ocultar panel', 'aria-label': 'Mostrar u ocultar panel', onclick: () => toggleSheet() }, '☰');
  const topbar = h('header', { class: 'topbar' },
    h('a', { class: 'logo', href: '#', onclick: (e) => { e.preventDefault(); setView('home'); } }, 'visual', h('i', {}, '·'), 'RISCV'),
    nav, h('div', { class: 'spacer' }),
    h('span', { class: 'top-tag' }, 'RV32I · 5 etapas'),
    themeBtn, sheetBtn);

  const sceneEl = h('div', { class: 'scene-host' });
  const sec = (name, views) => h('section', { class: 'sec sec-' + name, 'data-v': views });
  const left = {
    home: sec('home', 'home'), lessons: sec('lessons', 'lessons'), examples: sec('examples', 'examples'),
    editor: sec('editor', 'sim'), debug: sec('debug', 'debug'),
  };
  const right = { inspector: sec('inspector', 'lessons examples sim debug') };
  const leftPanel = h('aside', { class: 'panel panel-left' }, Object.values(left));
  const rightPanel = h('aside', { class: 'panel panel-right' }, Object.values(right));
  const dock = { controls: sec('controls', 'lessons examples sim'), timeline: sec('timeline', 'lessons examples sim') };
  const dockEl = h('div', { class: 'dock' }, dock.controls, dock.timeline);
  const sheetHandle = h('button', { class: 'sheet-handle', 'aria-label': 'Panel', onclick: () => toggleSheet() }, h('i'));
  const sheet = h('div', { class: 'sheet' }, sheetHandle, leftPanel, rightPanel, dockEl);

  const popups = h('div', { class: 'popup-layer' });
  const hint = h('div', { class: 'cam-hint' },
    h('span', {}, h('kbd', {}, 'Arrastrar'), ' mover'), h('span', {}, h('kbd', {}, 'Clic der. + arrastrar'), ' rotar'),
    h('span', {}, h('kbd', {}, 'Rueda'), ' zoom'), h('span', {}, h('kbd', {}, 'Esc'), ' subir un nivel'));
  const legend = h('div', { class: 'status-legend', title: 'Colores de los chips de estado que aparecen bajo los bloques' },
    h('span', { class: 'sl-t' }, 'Chips'),
    h('span', { class: 'sl-i info' }, 'info'), h('span', { class: 'sl-i warn' }, 'aviso'), h('span', { class: 'sl-i danger' }, 'stall'));
  const crumbs = h('div', { class: 'crumbs-host' });
  const tools = h('div', { class: 'scene-tools' },
    h('button', { class: 'pill-btn', title: 'Restablecer vista de cámara', onclick: () => callbacks.onResetView && callbacks.onResetView() }, h('span', { html: ICON_HOME }), 'Vista inicial'),
    h('button', { class: 'pill-btn pill-top', title: 'Qué es esta vista: un dibujo simplificado del datapath (no un módulo de Verilog) y cómo se relaciona con top_riscv y riscv_pipeline.', onclick: () => callbacks.onTop && callbacks.onTop() }, '¿Qué es esta vista?'), legend);
  const tabL = h('button', { class: 'edge-tab edge-l', title: 'Mostrar u ocultar el panel izquierdo', 'aria-label': 'Panel izquierdo', onclick: () => setPanel('l', !isPanelOpen('l'), { persist: true }) }, h('span', { class: 'et-ch' }, '‹'), h('span', { class: 'et-t' }, 'Editor'));
  const tabR = h('button', { class: 'edge-tab edge-r', title: 'Mostrar u ocultar el panel derecho', 'aria-label': 'Panel derecho', onclick: () => setPanel('r', !isPanelOpen('r'), { persist: true }) }, h('span', { class: 'et-ch' }, '›'), h('span', { class: 'et-t' }, 'Inspector'));
  const TAB_LABEL = { sim: ['Editor', 'Inspector'], lessons: ['Lección', 'Inspector'], examples: ['Ejemplos', 'Inspector'], debug: ['Consola', 'Inspector'], home: ['', ''] };
  const stage = h('main', { class: 'stage' }, sceneEl, popups, tools, hint, crumbs, tabL, tabR, sheet);

  const app = h('div', { id: 'app-shell', class: 'app' }, topbar, stage, loading);
  root.appendChild(app);

  function toggleSheet(force) {
    const open = force !== undefined ? force : !app.classList.contains('sheet-open');
    app.classList.toggle('sheet-open', open);
    if (callbacks.onLayout) callbacks.onLayout();
  }
  function applyPanels(notify = true) {
    const l = isPanelOpen('l'), r = isPanelOpen('r');
    app.classList.toggle('l-open', l); app.classList.toggle('r-open', r);
    tabL.classList.toggle('open', l); tabR.classList.toggle('open', r);
    const [a, b] = TAB_LABEL[view] || ['', ''];
    tabL.querySelector('.et-t').textContent = a; tabR.querySelector('.et-t').textContent = b;
    if (notify && callbacks.onLayout) callbacks.onLayout();
  }
  // persist: el usuario lo pidió (se recuerda); si no, es una apertura automática (p. ej. clic en un bloque)
  function setPanel(side, open, { persist = false } = {}) {
    if (persist) { prefs[view + ':' + side] = open; auto[side] = null; store.set('vr-panels', JSON.stringify(prefs)); }
    else auto[side] = open;
    if (view === 'debug' && side === 'r') auto.r = open;
    applyPanels();
  }
  function setView(v, silent) {
    if (!navBtns[v]) return;
    view = v; auto.l = null; auto.r = null;
    root.dataset.view = v; app.dataset.view = v;
    for (const [id, b] of Object.entries(navBtns)) b.classList.toggle('active', id === v);
    if (v === 'home') app.classList.remove('sheet-open'); else if (!silent) app.classList.add('sheet-open');
    applyPanels(false);
    if (!silent && callbacks.onView) callbacks.onView(v);
  }
  function setTheme(t, fromUser) {
    theme = t;
    document.documentElement.dataset.theme = t;
    themeBtn.innerHTML = t === 'light' ? ICON_MOON : ICON_SUN;
    themeBtn.title = t === 'light' ? 'Tema oscuro' : 'Tema claro';
    store.set('vr-theme', t);
    if (callbacks.onTheme) callbacks.onTheme(t, !!fromUser);
  }
  function hideLoading() {
    loading.classList.add('done');
    setTimeout(() => loading.remove(), 700);
  }

  document.documentElement.dataset.theme = theme;
  themeBtn.innerHTML = theme === 'light' ? ICON_MOON : ICON_SUN;
  setView('home', true);

  return {
    slots: { sheet, scene: sceneEl, left, right, dock, popups, leftPanel, rightPanel, dockEl, stage, crumbs },
    setView, getView: () => view, setTheme, getTheme: () => theme, hideLoading, toggleSheet, setPanel, isPanelOpen,
    update() {},
  };
}
