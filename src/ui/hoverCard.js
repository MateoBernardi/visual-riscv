import { h, clear, getPath, fmtValue, STAGE_COLORS } from './dom.js';

// Tarjeta de información completa al pasar el cursor por un bloque / parte / cable / puerto: nunca tapa nada porque flota junto al cursor,
// sale del camino de la escena y desaparece al salir. Las etiquetas 3D solo muestran lo mínimo; acá está todo (valor completo, descripción, señales).
const strip = (s) => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&rarr;/g, '→').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const cut = (s, n) => (s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s);

export function createHoverCard(host, trackEl) {
  const card = h('div', { class: 'hover-card', hidden: true });
  host.append(card);
  let x = 0, y = 0, shown = false, timer = 0;
  trackEl.addEventListener('pointermove', (e) => { const r = host.getBoundingClientRect(); x = e.clientX - r.left; y = e.clientY - r.top; if (shown) place(); }, { passive: true });
  trackEl.addEventListener('pointerleave', () => hide());
  function place() {
    const W = host.clientWidth, H = host.clientHeight, cw = card.offsetWidth, ch = card.offsetHeight;
    let l = x + 18, t = y + 16;
    if (l + cw > W - 8) l = x - cw - 14;
    if (t + ch > H - 8) t = y - ch - 12;
    card.style.transform = `translate(${Math.max(8, Math.round(l))}px,${Math.max(8, Math.round(t))}px)`;
  }
  function show(d) {
    clearTimeout(timer);
    timer = setTimeout(() => {
      clear(card);
      card.append(
        h('div', { class: 'hc-top' }, d.eyebrow ? h('span', { class: 'eyebrow' }, d.eyebrow) : null, d.stage ? h('span', { class: 'chip stage-chip', style: { background: STAGE_COLORS[d.stage] || 'var(--teal)' } }, d.stage) : null),
        h('b', { class: 'hc-t' }, d.title),
        d.meta && d.meta.length ? h('div', { class: 'hc-meta' }, d.meta.map((m) => h('span', { class: 'chip' }, m))) : null,
        d.value != null ? h('div', { class: 'hc-v' }, h('span', {}, 'valor ahora'), h('b', { class: 'mono' }, d.value)) : null,
        d.text ? h('p', { class: 'hc-p' }, cut(strip(d.text), 280)) : null,
        d.rows && d.rows.length ? h('div', { class: 'hc-rows' }, d.rows.map((r) => h('div', {}, h('span', { class: 'mono' }, r[0]), h('b', { class: 'mono' }, r[1])))) : null,
        d.hint ? h('div', { class: 'hc-hint' }, d.hint) : null);
      card.hidden = false; shown = true; place();
    }, 90);
  }
  function hide() { clearTimeout(timer); timer = 0; if (shown) { card.hidden = true; shown = false; } }
  return { show, hide, refresh: (fn) => { if (shown) fn(); } };
}

// ---- constructores de contenido ----
export function blockCard(id, info, snap) {
  if (!info) return { title: id, eyebrow: 'Bloque' };
  const rows = (info.signals || []).slice(0, 4).map((s) => [s.name, fmtValue(getPath(snap, s.path))]).filter((r) => r[1] !== '—');
  return { eyebrow: 'Bloque', title: info.title, stage: info.stage && STAGE_COLORS[info.stage] ? info.stage : null, text: info.summary, rows, hint: 'Clic para ver el detalle y entrar al módulo' };
}
export function interiorCard(h2, view, ctx) {
  if (!h2 || !view) return null;
  let item, kind;
  if (h2.type === 'net') { item = (view.nets || []).find((n) => n.id === h2.id); kind = 'Cable'; }
  else if (h2.type === 'port') { item = (view.ports || []).find((p) => p.name === h2.id); kind = 'Puerto'; }
  else { item = (view.parts || []).find((p) => p.id === h2.id); kind = 'Parte'; }
  if (!item) return null;
  const path = item.live;
  let value = null;
  if (path && ctx) { const v = /^(snap|dbg|uart)\./.test(path) ? getPath(ctx, path) : getPath(ctx.snap, path); if (v !== undefined) value = fmtValue(v); }
  const label = strip(item.label || item.name || item.id);
  const meta = [];
  if (item.symbol || item.name) meta.push(String(item.symbol || item.name));
  if (item.width != null) meta.push(`${item.width} bits`);
  if (item.kind) meta.push(item.kind);
  if (item.dir) meta.push(item.dir === 'in' ? 'entrada' : 'salida');
  return { eyebrow: kind, title: label, stage: view.stage, meta, value, text: item.desc, hint: item.drill ? 'Clic para entrar a este módulo' : 'Clic para fijar en el inspector' };
}
