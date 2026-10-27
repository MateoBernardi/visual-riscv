import { h, hex32 } from './dom.js';
import { glossify } from './glossary.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const MAX_UNPINNED = 3;

function ctrlChips(ctrl) {
  if (!ctrl) return [];
  const items = Array.isArray(ctrl) ? ctrl.map((c) => [c, null]) : Object.entries(ctrl);
  return items.map(([k, v]) => h('span', { class: 'chip ctrl' + (v === 0 || v === false ? ' off' : '') }, v == null ? String(k) : `${k}=${typeof v === 'boolean' ? (v ? 1 : 0) : v}`));
}

function fieldDiagram(fields, word) {
  const sorted = [...fields].sort((a, b) => b.hi - a.hi);
  const total = 32;
  const seg = sorted.map((f) => {
    const n = f.hi - f.lo + 1;
    const bits = f.bits || (f.value != null ? (f.value >>> 0).toString(2).padStart(n, '0').slice(-n) : '');
    return h('div', { class: 'fld', style: { flexGrow: String(n), flexBasis: (n / total) * 100 + '%', '--fc': f.color || '#4a7bd0' } },
      h('div', { class: 'fld-idx mono' }, h('span', {}, String(f.hi)), n > 1 ? h('span', {}, String(f.lo)) : null),
      h('div', { class: 'fld-box' }, h('b', {}, f.name)),
      h('div', { class: 'fld-bits mono' }, bits));
  });
  return h('div', { class: 'fields' }, seg);
}

function buildIsa(d) {
  return h('div', { class: 'pu-body isa' },
    h('div', { class: 'isa-head' },
      h('span', { class: 'mnemonic' }, d.mnemonic), d.fmt ? h('span', { class: 'chip fmt' }, 'Formato ' + d.fmt) : null,
      d.word != null ? h('span', { class: 'mono word' }, hex32(d.word)) : null),
    d.fields ? fieldDiagram(d.fields) : null,
    d.name ? h('div', { class: 'isa-name' }, d.name + (d.asm ? ' · ' : ''), d.asm ? h('code', {}, d.asm) : null) : null,
    d.semantics ? h('div', { class: 'semantics mono' }, d.semantics) : null,
    d.target != null ? h('div', { class: 'pu-p' }, 'Destino del salto: ', h('code', {}, hex32(d.target))) : null,
    h('details', { class: 'more', open: d.open ? true : null }, h('summary', {}, 'Descripción, señales de control y relacionadas'),
      d.description ? h('div', { class: 'pu-p', html: d.description }) : null,
    d.ctrl && (Array.isArray(d.ctrl) ? d.ctrl.length : Object.keys(d.ctrl).length) ? h('div', { class: 'chips' }, h('span', { class: 'eyebrow' }, 'Señales de control'), ctrlChips(d.ctrl)) : null,
    d.related && d.related.length ? h('div', { class: 'chips' }, h('span', { class: 'eyebrow' }, 'Relacionadas'), d.related.map((r) => h('span', { class: 'chip' }, r))) : null));
}
function buildEvent(d) {
  const what = typeof d.what === 'function' ? d.what(d.ev, d.snap) : d.what;
  return h('div', { class: 'pu-body event' },
    d.example ? h('section', { class: 'pu-example' }, h('h4', {}, 'En este ejemplo'), h('div', { class: 'pu-p', html: d.example })) : null,
    what ? h('section', {}, h('h4', {}, 'Qué pasa'), h('div', { class: 'pu-p', html: what })) : null,
    h('details', { class: 'more' }, h('summary', {}, 'Por qué, RTL y costo'),
      d.why ? h('section', {}, h('h4', {}, 'Por qué'), h('div', { class: 'pu-p', html: d.why })) : null,
      d.rtl ? h('pre', { class: 'rtl' }, h('code', {}, d.rtl)) : null,
      d.cost ? h('section', {}, h('h4', {}, 'Costo'), h('div', { class: 'pu-p', html: d.cost })) : null),
    h('div', { class: 'pu-foot' },
      d.onAlternatives ? h('button', { class: 'btn accent small', onclick: d.onAlternatives }, 'Otras opciones de hardware') : null));
}
function buildResolver(d) {
  return h('div', { class: 'pu-body resolver' },
    h('div', { class: 'pu-p', html: d.html }));
}
function buildAlt(d) {
  return h('div', { class: 'pu-body alt' },
    d.current ? h('div', { class: 'alt-current' }, h('span', { class: 'eyebrow' }, 'Hardware actual'), h('div', { class: 'pu-p', html: d.current })) : null,
    h('div', { class: 'alt-list' }, (d.options || []).map((o) => h('article', { class: 'alt-opt' },
      h('h4', {}, o.name),
      h('div', { class: 'pu-p', html: o.summary }),
      h('div', { class: 'pc' },
        h('ul', { class: 'pros' }, (o.pros || []).map((x) => h('li', { html: x }))),
        h('ul', { class: 'cons' }, (o.cons || []).map((x) => h('li', { html: x })))),
      h('div', { class: 'alt-meta' },
        o.area ? h('span', { class: 'chip' }, 'Área: ' + o.area) : null,
        o.cycles ? h('span', { class: 'chip' }, 'Ciclos: ' + o.cycles) : null,
        o.usedIn ? h('span', { class: 'chip' }, 'Usado en: ' + o.usedIn) : null)))));
}

/**
 * Pop-ups flotantes anclados a objetos 3D.
 * callbacks: { project(anchorId) -> {x, y, visible} | null, onClose(id) }
 * API: show({type:'isa'|'event'|'alternatives'|'resolver', anchorId, data, title?, key?, pinned?}) -> id
 *      close(id), closeAll(), closeUnpinned(), update() (reposicionar; llamar cada frame), has(key)
 */
export function createPopups(layer, cb = {}) {
  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('class', 'leaders');
  layer.append(svg);
  const items = new Map();
  let seq = 0;

  function show({ type, anchorId, data = {}, title, key, pinned = false }) {
    key = key || `${type}:${anchorId || ''}:${data.mnemonic || data.title || title || ''}`;
    for (const [id, p] of items) if (p.key === key) close(id, true);
    const id = ++seq;
    const titleText = title || data.title || (type === 'isa' ? 'Instrucción' : type === 'alternatives' ? 'Otras opciones de hardware' : 'Evento');
    const kindLabel = { isa: 'Instrucción', event: 'Evento', alternatives: 'Alternativas', resolver: 'Por qué funciona' }[type] || '';
    const pinBtn = h('button', { class: 'icon-btn pin', title: 'Fijar', 'aria-label': 'Fijar pop-up', onclick: () => { p.pinned = !p.pinned; pinBtn.classList.toggle('on', p.pinned); card.classList.toggle('pinned', p.pinned); } }, '📌');
    const closeBtn = h('button', { class: 'icon-btn', title: 'Cerrar', 'aria-label': 'Cerrar', onclick: () => close(id) }, '✕');
    const body = type === 'isa' ? buildIsa(data) : type === 'alternatives' ? buildAlt(data) : type === 'resolver' ? buildResolver(data) : buildEvent(data);
    const card = h('div', { class: `popup popup-${type}` },
      h('div', { class: 'pu-head' }, h('div', {}, h('span', { class: 'eyebrow' }, kindLabel), h('h3', {}, type === 'isa' ? titleText : titleText)), h('div', { class: 'pu-actions' }, type === 'alternatives' ? null : pinBtn, closeBtn)),
      body);
    glossify(body);
    layer.append(card);
    const line = document.createElementNS(SVGNS, 'g');
    line.innerHTML = '<line x1="0" y1="0" x2="0" y2="0"/><circle r="4"/>';
    svg.append(line);
    const p = { id, key, type, anchorId, card, line, pinned, born: seq, last: '' };
    if (pinned) { pinBtn.classList.add('on'); card.classList.add('pinned'); }
    items.set(id, p);
    const head = card.firstChild;
    head.style.cursor = 'grab'; head.title = 'Arrastrá para mover';
    head.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      const lr = layer.getBoundingClientRect(), cr = card.getBoundingClientRect();
      const dx = e.clientX - cr.left, dy = e.clientY - cr.top;
      head.setPointerCapture(e.pointerId); head.style.cursor = 'grabbing';
      const move = (ev) => { p.drag = { x: ev.clientX - lr.left - dx, y: ev.clientY - lr.top - dy }; p.last = ''; update(); };
      const up = () => { head.style.cursor = 'grab'; head.removeEventListener('pointermove', move); head.removeEventListener('pointerup', up); };
      head.addEventListener('pointermove', move); head.addEventListener('pointerup', up);
    });
    requestAnimationFrame(() => card.classList.add('in'));
    enforceLimit(id);
    update();
    return id;
  }
  function enforceLimit(newId) {
    const un = [...items.values()].filter((p) => !p.pinned && p.type !== 'alternatives' && p.type !== 'resolver' && p.id !== newId).sort((a, b) => a.born - b.born);
    const extra = un.length + 1 - MAX_UNPINNED;
    for (let i = 0; i < extra; i++) close(un[i].id);
    if (items.get(newId)?.type === 'alternatives') {
      for (const p of [...items.values()]) if (p.type === 'alternatives' && p.id !== newId) close(p.id);
    }
  }
  function close(id, silent) {
    const p = items.get(id); if (!p) return;
    items.delete(id); p.card.remove(); p.line.remove();
    if (!silent && cb.onClose) cb.onClose(id, p);
  }
  function closeUnpinned(except = []) { for (const p of [...items.values()]) if (!p.pinned && !except.includes(p.key)) close(p.id); }
  function closeType(t) { for (const p of [...items.values()]) if (p.type === t) close(p.id, true); }
  function closeAll() { for (const id of [...items.keys()]) close(id); }

  function update() {
    const W = layer.clientWidth, H = layer.clientHeight;
    const mobile = W < 720;
    layer.classList.toggle('stack', mobile);
    svg.style.display = mobile ? 'none' : '';
    if (mobile) return;
    svg.setAttribute('width', W); svg.setAttribute('height', H);
    const B = cb.bounds ? cb.bounds() : { left: 8, top: 74, right: W - 8, bottom: H - 8 };
    layer.style.setProperty('--pu-max', Math.max(220, B.bottom - B.top) + 'px');
    let idx = 0;
    const placed = [];
    for (const p of items.values()) {
      const c = p.card;
      const cw = c.offsetWidth, ch = c.offsetHeight;
      if (p.type === 'alternatives') {
        const key = 'alt' + W + H + cw + ch + B.bottom;
        if (p.last !== key) { c.style.left = Math.max(8, (W - cw) / 2) + 'px'; c.style.top = Math.max(B.top, B.top + (B.bottom - B.top - ch) / 2) + 'px'; p.last = key; }
        p.line.style.display = 'none'; continue;
      }
      const a = cb.project && p.anchorId ? cb.project(p.anchorId) : null;
      if (!a) { p.line.style.display = 'none'; continue; }
      const clampX = (v) => Math.min(Math.max(B.left, v), Math.max(B.left, B.right - cw));
      const clampY = (v) => Math.min(Math.max(B.top, v), Math.max(B.top, B.bottom - ch));
      const cands = [];
      // primero, fuera de la escena: sobre los paneles laterales (la escena queda visible)
      const zones = (B.zones || []).filter((z) => z.right - z.left >= Math.min(cw, 300)).sort((z1, z2) => Math.abs((z1.left + z1.right) / 2 - a.x) - Math.abs((z2.left + z2.right) / 2 - a.x));
      for (const z of zones) {
        const x = Math.min(z.left, Math.max(B.left, z.right - cw)) === z.left ? z.left : z.right - cw;
        for (const y of [a.y - ch / 2, B.top, B.bottom - ch, B.top + 200]) cands.push([x, y]);
      }
      // luego, en las esquinas libres de la escena (primero las de abajo: tapan la zona decorativa de la placa)
      const corners = [[B.left, B.bottom - ch], [B.right - cw, B.bottom - ch], [B.left, B.top], [B.right - cw, B.top]]
        .sort((c1, c2) => (c2[1] > B.top ? 1 : 0) - (c1[1] > B.top ? 1 : 0) || Math.abs(c1[0] + cw / 2 - a.x) - Math.abs(c2[0] + cw / 2 - a.x));
      cands.push(...corners);
      for (const gap of [34, 120, 220]) {
        cands.push([a.x + 40, a.y - ch - gap + 6], [a.x + 40, a.y + gap], [a.x - 40 - cw, a.y - ch - gap + 6], [a.x - 40 - cw, a.y + gap]);
      }
      let left = 0, top = 0, found = false;
      for (const [cx, cy] of cands) {
        const l = clampX(cx), t = clampY(cy);
        const coversAnchor = a.x > l - 14 && a.x < l + cw + 14 && a.y > t - 14 && a.y < t + ch + 14;
        if (!coversAnchor && !placed.some((r) => l < r.x + r.w + 6 && l + cw + 6 > r.x && t < r.y + r.h + 6 && t + ch + 6 > r.y)) { left = l; top = t; found = true; break; }
      }
      if (p.drag) { left = p.drag.x; top = p.drag.y; found = true; }
      if (!found) { left = clampX(a.x + 40 + (idx % 4) * 24); top = clampY(a.y - ch - 28 - (idx % 4) * 24); }
      idx++;
      placed.push({ x: left, y: top, w: cw, h: ch });
      const key = `${Math.round(left)}|${Math.round(top)}|${Math.round(a.x)}|${Math.round(a.y)}|${a.visible}`;
      if (key === p.last) continue;
      p.last = key;
      c.style.left = left + 'px'; c.style.top = top + 'px';
      const nx = Math.min(Math.max(a.x, left), left + cw), ny = Math.min(Math.max(a.y, top), top + ch);
      const ln = p.line.firstChild, dot = p.line.lastChild;
      ln.setAttribute('x1', nx); ln.setAttribute('y1', ny); ln.setAttribute('x2', a.x); ln.setAttribute('y2', a.y);
      dot.setAttribute('cx', a.x); dot.setAttribute('cy', a.y);
      p.line.style.display = a.visible ? '' : 'none';
    }
  }
  return { show, close, closeAll, closeUnpinned, closeType, update, has: (key) => [...items.values()].some((p) => p.key === key), get count() { return items.size; } };
}
