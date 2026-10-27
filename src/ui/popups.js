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
 * Tarjetas de explicación: riel lateral (desktop) / hoja inferior deslizable (móvil), con línea guía al objeto 3D; el modal de alternativas va centrado.
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
  // Riel "Explicación": las tarjetas (instrucción, evento, por qué funciona) se apilan en una columna lateral, con una línea fina
  // hasta el bloque 3D, para que la placa quede despejada. En móvil es una hoja inferior con tarjetas deslizables.
  const railList = h('div', { class: 'rail-list' });
  const railCount = h('span', { class: 'rail-n' }, '0');
  const railBtn = h('button', { class: 'icon-btn rail-toggle', title: 'Plegar o desplegar el riel de explicación', 'aria-label': 'Plegar riel', onclick: () => { rail.classList.toggle('collapsed'); railBtn.textContent = rail.classList.contains('collapsed') ? '‹' : '›'; lastRail = ''; if (cb.onRailChange) cb.onRailChange(); update(); } }, '›');
  const rail = h('aside', { class: 'rail', hidden: true }, h('div', { class: 'rail-head' }, h('span', { class: 'eyebrow' }, 'Explicación'), railCount, railBtn), railList);
  layer.append(rail);
  // móvil: el riel arranca como una píldora ("Explicación · 2") y se abre como hoja inferior al tocarla, para no tapar Paso / Run
  rail.querySelector('.rail-head').addEventListener('click', (e) => {
    if (layer.clientWidth >= 720 || e.target.closest('.rail-toggle')) return;
    rail.classList.toggle('m-open'); if (cb.onRailChange) cb.onRailChange();
  });
  let lastRail = '';
  const railCards = () => [...items.values()].filter((p) => p.inRail);
  function syncRailMeta() {
    const n = railCards().length;
    rail.hidden = n === 0; railCount.textContent = String(n);
    if (cb.onRailChange) cb.onRailChange();
  }

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
    const inRail = type !== 'alternatives';
    if (inRail) {
      card.classList.add('rail-card');
      const fold = h('button', { class: 'icon-btn fold', title: 'Plegar esta tarjeta', 'aria-label': 'Plegar tarjeta', onclick: () => { const c = card.classList.toggle('folded'); fold.textContent = c ? '▾' : '▴'; lastRail = ''; } }, '▴');
      card.querySelector('.pu-actions').prepend(fold);
      railList.append(card);
    } else layer.append(card);
    const line = document.createElementNS(SVGNS, 'g');
    line.innerHTML = '<line x1="0" y1="0" x2="0" y2="0"/><circle r="4"/>';
    svg.append(line);
    const p = { id, key, type, anchorId, card, line, pinned, born: seq, last: '', inRail };
    if (pinned) { pinBtn.classList.add('on'); card.classList.add('pinned'); }
    items.set(id, p);
    const head = card.firstChild;
    if (!inRail) { head.style.cursor = 'grab'; head.title = 'Arrastrá para mover'; }
    head.addEventListener('pointerdown', (e) => {
      if (inRail || e.target.closest('button')) return;
      const lr = layer.getBoundingClientRect(), cr = card.getBoundingClientRect();
      const dx = e.clientX - cr.left, dy = e.clientY - cr.top;
      head.setPointerCapture(e.pointerId); head.style.cursor = 'grabbing';
      const move = (ev) => { p.drag = { x: ev.clientX - lr.left - dx, y: ev.clientY - lr.top - dy }; p.last = ''; update(); };
      const up = () => { head.style.cursor = 'grab'; head.removeEventListener('pointermove', move); head.removeEventListener('pointerup', up); };
      head.addEventListener('pointermove', move); head.addEventListener('pointerup', up);
    });
    requestAnimationFrame(() => card.classList.add('in'));
    enforceLimit(id);
    syncRailMeta();
    if (inRail) railList.scrollTop = 0;
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
    items.delete(id); p.card.remove(); p.line.remove(); lastRail = '';
    if (p.inRail) syncRailMeta();
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
    const B = cb.bounds ? cb.bounds() : { left: 8, top: 74, right: W - 8, bottom: H - 8 };
    layer.style.setProperty('--pu-max', Math.max(220, B.bottom - B.top) + 'px');
    // ---- riel ----
    if (!mobile) {
      const side = cb.railSide ? cb.railSide() : 'right';
      const w = rail.classList.contains('collapsed') ? 150 : Math.min(340, Math.max(260, (B.right - B.left) * 0.34));
      const k = `${side}|${Math.round(B.left)}|${Math.round(B.right)}|${Math.round(B.top)}|${Math.round(B.bottom)}|${w}`;
      if (k !== lastRail + '') {
        rail.dataset.side = side;
        rail.style.top = B.top + 'px'; rail.style.maxHeight = Math.max(160, B.bottom - B.top) + 'px'; rail.style.width = w + 'px';
        rail.style.left = side === 'left' ? B.left + 'px' : 'auto'; rail.style.right = side === 'right' ? (W - B.right) + 'px' : 'auto';
      }
      lastRail = k;
    } else { rail.style.cssText = ''; rail.dataset.side = 'bottom'; }
    // posiciones de las tarjetas del riel (para las líneas guía)
    const lr = layer.getBoundingClientRect();
    const railRect = !rail.hidden && !mobile ? rail.getBoundingClientRect() : null;
    const collapsed = rail.classList.contains('collapsed');
    let idx = 0;
    const placed = [];
    for (const p of items.values()) {
      const c = p.card;
      if (p.inRail) {
        if (mobile || !railRect || collapsed) { p.line.style.display = 'none'; continue; }
        const a = cb.project && p.anchorId ? cb.project(p.anchorId) : null;
        const cr = c.getBoundingClientRect(), lrect = railList.getBoundingClientRect();
        if (!a || cr.bottom < lrect.top || cr.top > lrect.bottom) { p.line.style.display = 'none'; continue; }
        const left = rail.dataset.side === 'left';
        const x1 = (left ? cr.right : cr.left) - lr.left, y1 = Math.min(Math.max(cr.top + Math.min(cr.height, 60) / 2, lrect.top + 8), lrect.bottom - 8) - lr.top;
        const key = `${Math.round(x1)}|${Math.round(y1)}|${Math.round(a.x)}|${Math.round(a.y)}|${a.visible}`;
        if (key === p.last) continue;
        p.last = key;
        const ln = p.line.firstChild, dot = p.line.lastChild;
        ln.setAttribute('x1', x1); ln.setAttribute('y1', y1); ln.setAttribute('x2', a.x); ln.setAttribute('y2', a.y);
        dot.setAttribute('cx', a.x); dot.setAttribute('cy', a.y);
        p.line.style.display = a.visible ? '' : 'none';
        continue;
      }
      if (mobile) continue;
      const cw = c.offsetWidth, ch = c.offsetHeight;
      if (p.type === 'alternatives') {
        const key = 'alt' + W + H + cw + ch + B.bottom;
        if (p.last !== key) { c.style.left = Math.max(8, (W - cw) / 2) + 'px'; c.style.top = Math.max(B.top, B.top + (B.bottom - B.top - ch) / 2) + 'px'; p.last = key; }
        p.line.style.display = 'none'; continue;
      }
      idx++; placed.push(0);
    }
  }
  function railInfo() {
    if (rail.hidden || layer.clientWidth < 720) return null;
    return { side: cb.railSide ? cb.railSide() : 'right', width: rail.classList.contains('collapsed') ? 150 : Math.min(340, Math.max(260, ((cb.bounds ? cb.bounds().right - cb.bounds().left : 700)) * 0.34)) };
  }
  return { railInfo, hasRail: () => !rail.hidden && rail.classList.contains('m-open'), show, close, closeAll, closeUnpinned, closeType, update, has: (key) => [...items.values()].some((p) => p.key === key), get count() { return items.size; } };
}
