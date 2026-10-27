// Grafo de FSM en SVG, sin dependencias. Ver CONTRACT.md v2.
// createFsmGraph(el, fsm, { onSelect }) -> { setState(nameOrCode), highlightTransition(from, to), dispose() }
// Posiciones: fsm.states[i].pos = [x, y] en 0..1 si el schema las da; si no, círculo (<8 estados) o capas BFS (>=8).
const NS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}, ...kids) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) e.setAttribute(k, v);
  for (const c of kids.flat()) if (c != null) e.append(c.nodeType ? c : document.createTextNode(String(c)));
  return e;
};
const NODE_W = 84, NODE_H = 28;

function layout(states, transitions, W, H) {
  const n = states.length;
  const pos = {};
  const padX = NODE_W / 2 + 22, padY = NODE_H / 2 + 34;
  if (states.every((s) => Array.isArray(s.pos))) {
    states.forEach((s) => { pos[s.name] = { x: padX + s.pos[0] * (W - 2 * padX), y: padY + s.pos[1] * (H - 2 * padY) }; });
    return pos;
  }
  if (n < 8) {
    const cx = W / 2, cy = H / 2, rx = W / 2 - padX, ry = H / 2 - padY;
    states.forEach((s, i) => {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      pos[s.name] = { x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) };
    });
    return pos;
  }
  // capas BFS de izquierda a derecha
  const depth = { [states[0].name]: 0 };
  const q = [states[0].name];
  while (q.length) {
    const u = q.shift();
    for (const t of transitions) if (t.from === u && depth[t.to] == null) { depth[t.to] = depth[u] + 1; q.push(t.to); }
  }
  let maxD = Math.max(0, ...Object.values(depth));
  for (const s of states) if (depth[s.name] == null) depth[s.name] = ++maxD;
  const cols = {};
  states.forEach((s) => { (cols[depth[s.name]] ||= []).push(s.name); });
  const nc = Object.keys(cols).length;
  Object.entries(cols).forEach(([d, names]) => {
    names.forEach((nm, i) => {
      pos[nm] = { x: nc === 1 ? W / 2 : padX + (Number(d) * (W - 2 * padX)) / (nc - 1), y: padY + ((i + 0.5) * (H - 2 * padY)) / names.length };
    });
  });
  return pos;
}

function boundary(c, toward) {
  const dx = toward.x - c.x, dy = toward.y - c.y;
  if (!dx && !dy) return { ...c };
  const hw = NODE_W / 2 + 2, hh = NODE_H / 2 + 2;
  const k = Math.min(dx ? hw / Math.abs(dx) : Infinity, dy ? hh / Math.abs(dy) : Infinity);
  return { x: c.x + dx * k, y: c.y + dy * k };
}

const trunc = (s, n) => (s && s.length > n ? s.slice(0, n - 1) + '…' : s || '');

export function createFsmGraph(el, fsm, opts = {}) {
  const states = fsm.states || [];
  const trans = fsm.transitions || [];
  const n = states.length;
  const W = n >= 8 ? 840 : 520;
  const H = n >= 8 ? 380 : 270;
  const pos = layout(states, trans, W, H);

  const root = svg('svg', { class: 'fsm-svg', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Grafo de la máquina de estados' });
  root.append(svg('defs', {},
    svg('marker', { id: 'fsm-arr', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, svg('path', { d: 'M0 0 L10 5 L0 10 z', class: 'fsm-arrow' })),
    svg('marker', { id: 'fsm-arr-hi', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, svg('path', { d: 'M0 0 L10 5 L0 10 z', class: 'fsm-arrow hi' }))));

  // agrupar transiciones por par from->to
  const groups = new Map();
  trans.forEach((t, i) => {
    const key = t.from + '→' + t.to;
    if (!groups.has(key)) groups.set(key, { from: t.from, to: t.to, items: [] });
    groups.get(key).items.push({ t, i });
  });
  const hasReverse = (g) => g.from !== g.to && groups.has(g.to + '→' + g.from);

  const edgeLayer = svg('g', { class: 'fsm-edges' });
  const labelLayer = svg('g', { class: 'fsm-labels' });
  const nodeLayer = svg('g', { class: 'fsm-nodes' });
  root.append(edgeLayer, labelLayer, nodeLayer);

  const edgeEls = new Map();
  for (const g of groups.values()) {
    const a = pos[g.from], b = pos[g.to];
    if (!a || !b) continue;
    const title = g.items.map(({ t }) => `${t.from} → ${t.to}: ${t.cond || ''}${t.actions ? '  /  ' + t.actions : ''}`).join('\n');
    const chord = Math.hypot(b.x - a.x, b.y - a.y);
    const maxCh = g.from === g.to ? 24 : Math.max(0, Math.min(24, Math.floor((chord - NODE_W) / 6.4)));
    const more = g.items.length > 1 ? ` +${g.items.length - 1}` : '';
    const label = maxCh < 4 ? '' : trunc(g.items[0].t.cond, maxCh - more.length) + more;
    let d, lx, ly;
    if (g.from === g.to) {
      const x = a.x, y = a.y - NODE_H / 2;
      d = `M ${x - 18} ${y} C ${x - 40} ${y - 38}, ${x + 40} ${y - 38}, ${x + 18} ${y}`;
      lx = x; ly = y - 32;
    } else {
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
      const off = (hasReverse(g) ? 0.2 : 0.08) * len + 6;
      const cp = { x: mx + (-dy / len) * off, y: my + (dx / len) * off };
      const s = boundary(a, cp), e = boundary(b, cp);
      d = `M ${s.x} ${s.y} Q ${cp.x} ${cp.y} ${e.x} ${e.y}`;
      lx = 0.25 * s.x + 0.5 * cp.x + 0.25 * e.x; ly = 0.25 * s.y + 0.5 * cp.y + 0.25 * e.y;
    }
    const path = svg('path', { d, class: 'fsm-edge', 'marker-end': 'url(#fsm-arr)' });
    const hit = svg('path', { d, class: 'fsm-edge-hit' });
    const text = svg('text', { x: lx, y: ly, class: 'fsm-elabel', 'text-anchor': 'middle' }, label);
    const grp = svg('g', { class: 'fsm-edge-g', 'data-from': g.from, 'data-to': g.to }, svg('title', {}, title), path, hit);
    const sel = () => opts.onSelect && opts.onSelect({ type: 'transition', from: g.from, to: g.to, transitions: g.items.map((x) => x.t) });
    grp.addEventListener('click', sel);
    text.addEventListener('click', sel);
    text.append(svg('title', {}, title));
    edgeLayer.append(grp);
    labelLayer.append(text);
    edgeEls.set(g.from + '→' + g.to, { path, text });
  }

  const nodeEls = new Map();
  states.forEach((s) => {
    const p = pos[s.name];
    const rect = svg('rect', { x: p.x - NODE_W / 2, y: p.y - NODE_H / 2, width: NODE_W, height: NODE_H, rx: 15, class: 'fsm-rect' });
    const txt = svg('text', { x: p.x, y: p.y + 4, class: 'fsm-nlabel', 'text-anchor': 'middle' }, trunc(s.name, 14));
    const g = svg('g', { class: 'fsm-node', tabindex: 0, 'data-state': s.name },
      svg('title', {}, `${s.name} (${s.code})${s.desc ? ' — ' + String(s.desc).replace(/<[^>]+>/g, '') : ''}`), rect, txt);
    const sel = () => opts.onSelect && opts.onSelect({ type: 'state', name: s.name, state: s });
    g.addEventListener('click', sel);
    g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') sel(); });
    nodeLayer.append(g);
    nodeEls.set(s.name, g);
  });

  el.append(root);
  let cur = null, hi = null;

  function resolveName(v) {
    if (v == null) return null;
    if (nodeEls.has(v)) return v;
    const f = states.find((s) => s.code === v || String(s.code) === String(v));
    return f ? f.name : null;
  }
  function setState(v) {
    const nm = resolveName(v);
    if (nm === cur) return;
    if (cur) nodeEls.get(cur).classList.remove('cur');
    cur = nm;
    if (cur) nodeEls.get(cur).classList.add('cur');
  }
  function highlightTransition(from, to) {
    if (hi) { hi.path.classList.remove('hi'); hi.path.setAttribute('marker-end', 'url(#fsm-arr)'); hi.text.classList.remove('hi'); hi = null; }
    const e = from && edgeEls.get(from + '→' + to);
    if (e) { e.path.classList.add('hi'); e.path.setAttribute('marker-end', 'url(#fsm-arr-hi)'); e.text.classList.add('hi'); hi = e; }
  }
  return { setState, highlightTransition, dispose() { root.remove(); nodeEls.clear(); edgeEls.clear(); } };
}
