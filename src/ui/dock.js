import { h } from './dom.js';

export const DOCK_TABS = [
  ['cycles', 'Diagrama de ciclos'],
  ['regs', 'Registros'],
  ['mem', 'Memoria'],
  ['verify', 'Verificación'],
];

/**
 * Dock inferior con los datos de la ejecución (no explica el módulo: eso es el inspector).
 *   createDock(root, { onToggle(open), onTab(id) })
 *   -> { pane(id): HTMLElement, setTab(id, { open }), open(), close(), isOpen(), tab(), setCycle(n), setBadge(tabId, { text, tone }|null) }
 */
export function createDock(root, cb = {}) {
  const panes = {}, btns = {}, badges = {};
  let tab = 'cycles';
  const cyc = h('span', { class: 'bd-cyc mono' }, 'ciclo 0');
  const collapse = h('button', { class: 'icon-btn bd-collapse', title: 'Expandir o contraer', 'aria-label': 'Expandir o contraer el dock', onclick: (e) => { e.stopPropagation(); toggle(); } }, '⌃');
  const tabsEl = h('div', { class: 'bd-tabs', role: 'tablist' }, DOCK_TABS.map(([id, label]) => {
    const badge = h('i', { class: 'bd-badge', hidden: true });
    const b = h('button', { class: 'bd-tab', role: 'tab', 'data-tab': id, onclick: () => { if (box.classList.contains('collapsed') || tab !== id) setTab(id, { open: true }); else close(); } }, label, badge);
    btns[id] = b; badges[id] = badge;
    return b;
  }));
  const head = h('div', { class: 'bd-head', onclick: (e) => { if (e.target === head) toggle(); } },
    h('span', { class: 'bd-kind', title: 'Estado de la simulación: lo que pasa en este programa' }, 'Ejecución'),
    tabsEl, cyc, collapse);
  const body = h('div', { class: 'bd-body' }, DOCK_TABS.map(([id]) => { const p = h('div', { class: 'bd-pane', 'data-pane': id }); panes[id] = p; return p; }));
  const box = h('div', { class: 'bdock collapsed' }, head, body);
  root.append(box);

  function setTab(id, { open = false, silent = false } = {}) {
    tab = id;
    for (const [k, p] of Object.entries(panes)) p.style.display = k === id ? '' : 'none';
    for (const [k, b] of Object.entries(btns)) { b.classList.toggle('active', k === id); b.setAttribute('aria-selected', k === id ? 'true' : 'false'); }
    if (open && box.classList.contains('collapsed')) openDock();
    if (cb.onTab && !silent) cb.onTab(id);
  }
  function openDock() { box.classList.remove('collapsed'); if (cb.onToggle) cb.onToggle(true); }
  function close() { box.classList.add('collapsed'); if (cb.onToggle) cb.onToggle(false); }
  function toggle() { if (box.classList.contains('collapsed')) openDock(); else close(); }
  setTab('cycles', { silent: true });
  return {
    pane: (id) => panes[id], setTab, open: openDock, close, toggle,
    isOpen: () => !box.classList.contains('collapsed'), tab: () => tab,
    setCycle(n) { cyc.textContent = 'ciclo ' + n; },
    setBadge(id, st) {
      const b = badges[id]; if (!b) return;
      if (!st) { b.hidden = true; b.textContent = ''; return; }
      b.hidden = false; b.textContent = st.text; b.className = 'bd-badge tone-' + (st.tone || 'info');
    },
  };
}
