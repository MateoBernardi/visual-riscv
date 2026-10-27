import { h, clear, hex32, STAGE_COLORS, debounce } from './dom.js';
import { highlightLine } from './debug/asmEditor.js';

const LH = 21; // alto de línea en px (debe coincidir con CSS --lh)

/**
 * Editor de ensamblador.
 * callbacks: { onChange(src), onLineClick(line) }
 * El ensamblado es automático: onChange se llama ~400 ms después de la última tecla (o ya, con Ctrl/Cmd+Enter).
 * Los errores salen en la línea (subrayado, mensaje a la derecha) y en la barra de estado.
 * update({ source?, listing?, errors?, stages?, assembled? })
 *   listing: [{addr, word, src, line}], errors: [{line, msg}], stages: snapshot.stages (para resaltar el PC por etapa)
 * Extras: getSource(), setSource(text)
 */
export function createEditor(root, callbacks = {}) {
  let listing = [], errors = [], stages = null, tab = 'code';
  const ta = h('textarea', { class: 'ed-ta', spellcheck: 'false', wrap: 'off', autocapitalize: 'off', autocomplete: 'off', 'aria-label': 'Código ensamblador RV32I' });
  const gutter = h('div', { class: 'ed-gutter' });
  const hl = h('div', { class: 'ed-hl' });
  const pre = h('div', { class: 'ed-pre', 'aria-hidden': 'true' }); // texto coloreado (mismo tokenizador que el editor de Debug) detrás del textarea
  const body = h('div', { class: 'ed-body' }, h('div', { class: 'ed-gutter-wrap' }, gutter), h('div', { class: 'ed-main' }, pre, hl, ta));
  const status = h('div', { class: 'ed-status' }, 'Se ensambla solo mientras escribís');
  const listWrap = h('div', { class: 'ed-listing' });
  const tabCode = h('button', { class: 'tab active', onclick: () => setTab('code') }, 'Código');
  const tabList = h('button', { class: 'tab', onclick: () => setTab('list') }, 'Listado');
  const head = h('div', { class: 'panel-head' },
    h('div', { class: 'panel-title' }, h('span', { class: 'eyebrow' }, 'Editor'), h('h2', {}, 'Ensamblador RV32I')),
    h('div', { class: 'tabs small' }, tabCode, tabList));
  const foot = h('div', { class: 'ed-foot' }, status);
  root.append(h('div', { class: 'ed card-col' }, head, body, listWrap, foot));
  listWrap.style.display = 'none';

  function setTab(t) {
    tab = t;
    tabCode.classList.toggle('active', t === 'code'); tabList.classList.toggle('active', t === 'list');
    body.style.display = t === 'code' ? '' : 'none'; listWrap.style.display = t === 'list' ? '' : 'none';
  }

  function renderGutter() {
    const n = Math.max(1, ta.value.split('\n').length);
    const errLines = new Map(errors.map((e) => [e.line, e.msg]));
    const frag = document.createDocumentFragment();
    for (let i = 1; i <= n; i++) {
      const d = h('div', { class: 'gl' + (errLines.has(i) ? ' err' : ''), title: errLines.get(i) || null }, String(i));
      frag.append(d);
    }
    clear(gutter).append(frag);
    renderPre();
    renderHl();
  }
  function renderPre() {
    const f = document.createDocumentFragment();
    for (const ln of ta.value.split('\n')) f.append(h('div', { class: 'ed-ln', html: highlightLine(ln) || '&#8203;' }));
    clear(pre).append(f);
    pre.scrollTop = ta.scrollTop; pre.scrollLeft = ta.scrollLeft;
  }
  function renderHl() {
    const n = Math.max(1, ta.value.split('\n').length);
    const marks = new Map(); // línea -> [{stage}]
    if (stages && listing.length) {
      for (const s of ['IF', 'ID', 'EX', 'MEM', 'WB']) {
        const st = stages[s];
        if (!st || st.kind === 'bubble' || st.id == null) continue;
        const ent = listing.find((l) => l.addr === st.pc);
        if (ent) { if (!marks.has(ent.line)) marks.set(ent.line, []); marks.get(ent.line).push(s); }
      }
    }
    const errLines = new Map(); for (const e of errors) if (!errLines.has(e.line)) errLines.set(e.line, e.msg);
    clear(hl);
    hl.style.height = n * LH + 'px';
    for (const [line, ss] of marks) {
      const top = (line - 1) * LH;
      const w = 100 / ss.length;
      ss.forEach((s, i) => hl.append(h('div', { class: 'hl-line', style: { top: top + 'px', left: i * w + '%', width: w + '%', background: STAGE_COLORS[s] }, title: s })));
      hl.append(h('div', { class: 'hl-tags', style: { top: top + 'px' } }, ss.map((s) => h('b', { style: { background: STAGE_COLORS[s] } }, s))));
    }
    for (const [l, msg] of errLines) hl.append(h('div', { class: 'hl-err', style: { top: (l - 1) * LH + 'px' } }, h('span', { class: 'hl-errmsg' }, msg)));
    syncScroll();
  }
  function syncScroll() {
    gutter.style.transform = `translateY(${-ta.scrollTop}px)`;
    hl.style.transform = `translateY(${-ta.scrollTop}px)`;
    pre.scrollTop = ta.scrollTop; pre.scrollLeft = ta.scrollLeft;
  }
  function renderListing() {
    clear(listWrap);
    if (!listing.length) { listWrap.append(h('p', { class: 'muted pad' }, 'Todavía no hay listado: el programa tiene errores o está vacío.')); return; }
    const rows = listing.map((l) => h('tr', { dataset: { addr: l.addr } },
      h('td', { class: 'mono a' }, '0x' + l.addr.toString(16).padStart(4, '0')),
      h('td', { class: 'mono w' }, hex32(l.word)),
      h('td', { class: 'mono s' }, l.src)));
    listWrap.append(h('table', { class: 'tbl listing' }, h('thead', {}, h('tr', {}, h('th', {}, 'Dir.'), h('th', {}, 'Hex'), h('th', {}, 'Instrucción'))), h('tbody', {}, rows)));
  }

  const later = debounce(() => callbacks.onChange && callbacks.onChange(ta.value), 400);
  ta.addEventListener('input', () => { renderGutter(); status.className = 'ed-status'; status.textContent = 'Ensamblando…'; later(); });
  ta.addEventListener('scroll', syncScroll);
  const caretLine = () => ta.value.slice(0, ta.selectionStart).split('\n').length;
  ta.addEventListener('click', () => callbacks.onLineClick && callbacks.onLineClick(caretLine()));
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') { e.preventDefault(); const s = ta.selectionStart; ta.setRangeText('    ', s, ta.selectionEnd, 'end'); ta.dispatchEvent(new Event('input')); }
    else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); callbacks.onChange && callbacks.onChange(ta.value); }
  });

  function update(d = {}) {
    if (d.source !== undefined && d.source !== ta.value) ta.value = d.source;
    if (d.listing) { listing = d.listing; renderListing(); }
    if (d.errors) {
      errors = d.errors;
      status.className = 'ed-status' + (errors.length ? ' bad' : ' ok');
      status.textContent = errors.length ? `${errors.length} error${errors.length > 1 ? 'es' : ''}: línea ${errors[0].line}, ${errors[0].msg}` : `Ensamblado: ${listing.length} instrucciones`;
    }
    if (d.stages !== undefined) stages = d.stages;
    if (d.source !== undefined || d.errors) renderGutter(); else renderHl();
  }
  renderGutter(); renderListing();
  return { update, getSource: () => ta.value, setSource: (s) => update({ source: s }) };
}
