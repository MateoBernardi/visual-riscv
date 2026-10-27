import { h, clear, getPath, fmtValue, STAGE_COLORS } from './dom.js';
import { githubUrl, fileUrl, resolveSymbol } from '../content/repo.js';
import { VIEWS, breadcrumb } from '../content/modules/index.js';
import { createFsmGraph } from './fsmGraph.js';
import { simulateByte, frameBits, UART_STATES } from '../sim/uart.js';
import { describeValue, meaningOf, isControlName } from './signalMeaning.js';

/**
 * Inspector de módulo (v2).
 * createInspector(root, { onAlternatives(blockId), onEnter(viewId), onDrill(viewId), onClose(), onFsmSelect(stateName) })
 *   .update({ blockId, view, info, alt, ctx, focus, inside })
 * También acepta la forma vieja { blockId, info, snap }.
 */
const stripHtml = (s) => String(s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const ext = (url, label, cls = 'chip gh-chip') => h('a', { class: cls, href: url, target: '_blank', rel: 'noopener', title: url }, label);
const GH = '↗';

function resolveLive(ctx, path) {
  if (!path || !ctx) return undefined;
  if (/^(snap|dbg|uart)\./.test(path)) return getPath(ctx, path);
  return getPath(ctx.snap, path);
}

export function createInspector(root, cb = {}) {
  const box = h('div', { class: 'inspector card insp2' });
  root.append(box);
  let key = null;
  let live = { rows: [], fsm: null, graph: null, focusLive: null, timer: null };
  const openState = new Map([['Desde cero', true], ['En este proyecto', true]]);

  function disposeLive() {
    if (live.timer) clearInterval(live.timer);
    if (live.graph) live.graph.dispose();
    live = { rows: [], fsm: null, graph: null, focusLive: null, timer: null };
  }

  function section(title, body, { count, extra } = {}) {
    const d = h('details', { class: 'isec' }, h('summary', {}, h('span', { class: 'isec-t' }, title), count != null ? h('span', { class: 'isec-n' }, count) : null, extra), h('div', { class: 'isec-body' }, body));
    if (openState.get(title)) d.open = true;
    d.addEventListener('toggle', () => openState.set(title, d.open));
    return d;
  }

  // ---------- Qué entra y qué sale ----------
  function buildIO(view, info) {
    const rows = [];
    const used = new Set();
    for (const p of (view && view.ports) || []) {
      const infoSig = ((info && info.signals) || []).find((s) => s.name === p.name);
      const dir = p.dir === 'in' ? 'in' : 'out';
      rows.push({ rtl: p.name, dir, group: isControlName(p.name) ? 'ctrl' : dir, width: p.width, ext: p.ext, desc: p.desc || (infoSig && infoSig.desc), path: p.live || (infoSig && infoSig.path) });
      if (infoSig) used.add(infoSig.name);
    }
    for (const s of (info && info.signals) || []) {
      if (used.has(s.name)) continue;
      rows.push({ rtl: s.name, group: isControlName(s.name) ? 'ctrl' : (view && view.ports && view.ports.length ? 'out' : 'plain'), desc: s.desc, path: s.path });
    }
    return rows;
  }

  function buildRow(r) {
    const m = meaningOf(r.rtl);
    const human = (m && m.human) || (r.desc ? (stripHtml(r.desc).split(/[.:;]/)[0].slice(0, 46)) : r.rtl);
    const el = h('div', { class: 'io-row' },
      h('div', { class: 'io-top' },
        h('span', { class: 'io-name' }, human),
        h('span', { class: 'io-rtl mono' }, r.rtl),
        r.width != null ? h('span', { class: 'io-w mono' }, `${r.width}b`) : null),
      h('div', { class: 'io-val' }, h('span', { class: 'io-num mono' }, '—'), h('span', { class: 'io-mean' })),
      r.desc ? h('div', { class: 'io-desc', html: r.desc }) : null,
      r.ext ? h('div', { class: 'io-ext' }, r.dir === 'in' ? 'viene de ' : 'va a ', h('b', {}, String(r.ext))) : null);
    return el;
  }

  function buildIOSection(view, info) {
    const all = buildIO(view, info);
    if (!all.length) return null;
    const wrap = h('div', { class: 'io' });
    const groups = [['in', 'Entradas'], ['out', 'Salidas'], ['ctrl', 'Control'], ['plain', 'Señales']];
    const hidden = [];
    const rowObjs = [];
    for (const [g, label] of groups) {
      const list = all.filter((r) => r.group === g);
      if (!list.length) continue;
      const body = h('div', { class: 'io-list' });
      wrap.append(h('div', { class: 'io-group' }, h('div', { class: 'io-gh' }, label), body));
      for (const r of list) {
        const el = buildRow(r);
        body.append(el);
        const o = { r, el, num: el.querySelector('.io-num'), mean: el.querySelector('.io-mean') };
        rowObjs.push(o);
      }
    }
    const toggle = h('button', { class: 'btn ghost small io-more', type: 'button' }, '');
    let showAll = false;
    const apply = () => {
      let nHidden = 0;
      const none = rowObjs.every((o) => o.irrelevant);   // sin ningún valor en vivo: mostrar todo
      for (const o of rowObjs) {
        const hide = !showAll && !none && o.irrelevant;
        o.el.hidden = hide;
        if (o.irrelevant) nHidden++;
      }
      toggle.hidden = (nHidden === 0 || none) && !showAll;
      toggle.textContent = showAll ? 'ocultar las que no importan ahora' : `ver todas (${nHidden} más)`;
    };
    toggle.addEventListener('click', () => { showAll = !showAll; apply(); });
    wrap.append(toggle);
    live.rows = rowObjs;
    live.applyIO = apply;
    return { wrap, count: rowObjs.length };
  }

  function refreshIO(ctx) {
    for (const o of live.rows) {
      const v = o.r.path ? resolveLive(ctx, o.r.path) : undefined;
      const d = describeValue(o.r.rtl, v, fmtValue);
      o.num.textContent = d.num;
      o.mean.textContent = d.mean ? '→ ' + d.mean : '';
      o.el.classList.toggle('empty', !!d.empty);
      const isZero = v === 0 || v === false;
      o.irrelevant = d.empty || (isZero && o.r.group !== 'ctrl' && !meaningOf(o.r.rtl)?.mean);
      o.el.classList.toggle('active', !d.empty && !isZero);
    }
    if (live.applyIO) live.applyIO();
  }

  // ---------- Alternativas inline ----------
  function buildAlt(alt) {
    const wrap = h('div', { class: 'alt2' });
    if (alt.current) wrap.append(h('div', { class: 'alt2-current' }, h('span', { class: 'eyebrow' }, 'Lo que tiene este proyecto'), h('div', { class: 'prose', html: alt.current })));
    const list = h('div', { class: 'alt2-list' });
    for (const o of alt.options || []) {
      list.append(h('article', { class: 'alt2-opt' },
        h('h4', {}, o.name),
        h('p', { class: 'alt2-sum', html: o.summary }),
        h('div', { class: 'alt2-pc' },
          h('div', { class: 'alt2-pros' }, h('b', {}, 'A favor'), h('ul', {}, (o.pros || []).map((x) => h('li', { html: x })))),
          h('div', { class: 'alt2-cons' }, h('b', {}, 'En contra'), h('ul', {}, (o.cons || []).map((x) => h('li', { html: x }))))),
        h('dl', { class: 'alt2-meta' },
          o.area ? [h('dt', {}, 'Área'), h('dd', {}, o.area)] : null,
          o.cycles ? [h('dt', {}, 'Ciclos'), h('dd', {}, o.cycles)] : null,
          o.usedIn ? [h('dt', {}, 'Se usa en'), h('dd', {}, o.usedIn)] : null)));
    }
    wrap.append(list);
    return wrap;
  }

  // ---------- FSM ----------
  function stateLink(view, fsm, st) {
    const f = fsm.file || view.file;
    const url = githubUrl(f, `state:${st}`);
    return ext(url, `${st} ${GH}`, 'gh-link');
  }
  function buildFsm(view, ctx) {
    const fsm = view.fsm;
    const wrap = h('div', { class: 'fsm2' });
    const graphBox = h('div', { class: 'fsm-box' });
    const curLabel = h('div', { class: 'fsm-cur' }, 'Estado actual: ', h('b', { class: 'mono' }, '—'));
    const btn = h('button', { class: 'btn small', type: 'button' }, 'Ver grafo de la FSM');
    const big = h('button', { class: 'btn small ghost', type: 'button', hidden: true }, 'Ampliar ⤢');
    big.addEventListener('click', () => { const on = graphBox.classList.toggle('big'); big.textContent = on ? 'Cerrar ✕' : 'Ampliar ⤢'; });
    const trTable = h('table', { class: 'fsm-table' },
      h('thead', {}, h('tr', {}, ['Desde → Hacia', 'Condición', 'Acciones'].map((t) => h('th', {}, t)))),
      h('tbody', {}, (fsm.transitions || []).map((t) => {
        const f = fsm.file || view.file;
        const tr = h('tr', { 'data-from': t.from, 'data-to': t.to },
          h('td', {}, h('span', { class: 'mono' }, `${t.from} → ${t.to}`), ' ',
            t.caseLabel && resolveSymbol(f, `case:${t.caseLabel}`) ? ext(githubUrl(f, `case:${t.caseLabel}`), GH, 'gh-link') : null),
          h('td', {}, h('code', {}, t.cond || '—')),
          h('td', {}, t.actions ? h('code', {}, t.actions) : '—'));
        tr.addEventListener('mouseenter', () => live.graph && live.graph.highlightTransition(t.from, t.to));
        tr.addEventListener('mouseleave', () => live.graph && live.graph.highlightTransition(null));
        return tr;
      })));
    const states = h('div', { class: 'fsm-states' }, (fsm.states || []).map((s) => h('div', { class: 'fsm-st', 'data-state': s.name },
      h('span', { class: 'mono fsm-stn' }, s.name), h('span', { class: 'chip' }, String(s.code)), stateLink(view, fsm, s.name),
      s.desc ? h('div', { class: 'fsm-std', html: s.desc }) : null,
      s.outputs && s.outputs.length ? h('div', { class: 'fsm-out' }, s.outputs.map((o) => h('code', {}, o))) : null)));
    btn.addEventListener('click', () => {
      if (live.graph) { live.graph.dispose(); live.graph = null; clear(graphBox); graphBox.classList.remove('big'); big.hidden = true; btn.textContent = 'Ver grafo de la FSM'; return; }
      live.graph = createFsmGraph(graphBox, fsm, {
        onSelect: (s) => {
          if (s.type === 'state') { cb.onFsmSelect && cb.onFsmSelect(s.name); wrap.querySelectorAll('.fsm-st').forEach((n) => n.classList.toggle('sel', n.dataset.state === s.name)); }
          else wrap.querySelectorAll('.fsm-table tr[data-from]').forEach((n) => n.classList.toggle('sel', n.dataset.from === s.from && n.dataset.to === s.to));
        },
      });
      btn.textContent = 'Ocultar el grafo'; big.hidden = false; big.textContent = 'Ampliar ⤢';
      refreshFsm(live.ctx);
    });
    wrap.append(fsm.explain ? h('div', { class: 'prose', html: fsm.explain }) : null, h('div', { class: 'fsm-bar' }, btn, big, curLabel), graphBox, h('h5', { class: 'fsm-h' }, 'Transiciones'), trTable, h('h5', { class: 'fsm-h' }, 'Estados'), states);
    live.fsm = { curLabel: curLabel.querySelector('b'), wrap };
    return wrap;
  }
  function currentStateName(view, ctx) {
    const f = view.fsm; if (!f) return null;
    let v = f.live ? resolveLive(ctx, f.live) : undefined;
    if (v == null) return null;
    const st = (f.states || []).find((s) => s.name === v || s.code === v || String(s.code) === String(v));
    return st ? st.name : (typeof v === 'string' ? v : null);
  }
  function refreshFsm(ctx) {
    if (!live.fsm || !live.view) return;
    const nm = currentStateName(live.view, ctx) ?? live.localState ?? null;
    live.fsm.curLabel.textContent = nm || '—';
    if (live.graph) live.graph.setState(nm);
    live.fsm.wrap.querySelectorAll('.fsm-st').forEach((n) => n.classList.toggle('cur', n.dataset.state === nm));
    live.fsm.wrap.querySelectorAll('.fsm-table tr[data-from]').forEach((n) => n.classList.toggle('cur', n.dataset.from === nm));
  }

  // ---------- UART: simular un byte ----------
  function buildUartSim(view) {
    const isTx = view.id.includes('uart_tx');
    const input = h('input', { class: 'u-in mono', value: '4C', maxlength: 2, size: 3, 'aria-label': 'Byte en hexadecimal' });
    const go = h('button', { class: 'btn small primary', type: 'button' }, 'Simular');
    const out = h('div', { class: 'u-out' });
    const wave = h('div', { class: 'u-wave' });
    const status = h('div', { class: 'u-status mono' });
    go.addEventListener('click', () => {
      const b = parseInt(input.value, 16);
      if (!Number.isFinite(b) || b < 0 || b > 255) { status.textContent = 'Ingresá un byte en hexadecimal (00 a FF).'; return; }
      if (live.timer) clearInterval(live.timer);
      const trace = simulateByte(b);
      const bits = frameBits(b);
      const W = 320, Hh = 70, N = 16, total = trace.length;
      const x = (t) => 8 + (t / total) * (W - 16);
      let d = '';
      let prev = null;
      trace.forEach((p, i) => { const y = p.tx ? 14 : 50; d += prev == null ? `M ${x(i)} ${y}` : (y !== prev ? ` L ${x(i)} ${prev} L ${x(i)} ${y}` : ` L ${x(i)} ${y}`); prev = y; });
      const NS = 'http://www.w3.org/2000/svg';
      const s = document.createElementNS(NS, 'svg');
      s.setAttribute('viewBox', `0 0 ${W} ${Hh}`); s.setAttribute('class', 'u-svg');
      const labels = ['S', ...bits.slice(1, 9).map(String), 'P'];
      const firstLow = trace.findIndex((p) => p.tx === 0);
      let inner = '';
      labels.forEach((l, i) => { const cx = x(firstLow + i * N + N / 2); inner += `<text x="${cx}" y="66" class="u-bl" text-anchor="middle">${l}</text>`; inner += `<line x1="${x(firstLow + i * N)}" x2="${x(firstLow + i * N)}" y1="8" y2="56" class="u-grid"/>`; });
      s.innerHTML = `${inner}<path d="${d}" class="u-line"/><line id="u-head" x1="8" x2="8" y1="4" y2="58" class="u-head"/>`;
      clear(wave); wave.append(s);
      const head = s.querySelector('#u-head');
      let i = 0;
      const stateOf = (p) => (isTx ? p.txState : p.rxState);
      const step = () => {
        const p = trace[i];
        head.setAttribute('x1', x(i)); head.setAttribute('x2', x(i));
        const nm = stateOf(p);
        live.localState = nm;
        status.textContent = `tick ${i}/${total - 1}  línea=${p.tx}  ${isTx ? 'tx' : 'rx'}: ${nm}  s=${isTx ? p.s : p.rxS}  n=${isTx ? p.n : p.rxN}${p.rxDone ? `  rx_done → 0x${p.rxByte.toString(16).toUpperCase().padStart(2, '0')}` : ''}`;
        if (live.graph && UART_STATES.includes(nm)) live.graph.setState(nm);
        if (live.fsm) live.fsm.curLabel.textContent = nm;
        if (++i >= total) { clearInterval(live.timer); live.timer = null; }
      };
      step();
      live.timer = setInterval(step, 14);
    });
    out.append(wave, status);
    return h('div', { class: 'usim' }, h('p', { class: 'muted small' }, `Transmitimos un byte con el ${isTx ? 'transmisor' : 'receptor'} de este RTL (16 ticks por bit, formato 8N1) y seguimos la línea y la FSM tick a tick.`),
      h('div', { class: 'u-ctl' }, h('label', {}, '0x', input), go), out);
  }

  // ---------- Foco (parte / red clickeada) ----------
  function buildFocus(view, focus, ctx) {
    if (!focus || !view) return null;
    const parts = view.parts || [];
    const lab = (id) => { if (typeof id === 'string' && id.startsWith('port:')) return id.slice(5); const p = parts.find((x) => x.id === id); return p ? p.label || p.id : id; };
    let item, kind;
    if (focus.type === 'net') { item = (view.nets || []).find((n) => n.id === focus.id); kind = 'Cable'; }
    else if (focus.type === 'port') { item = (view.ports || []).find((p) => p.name === focus.id); kind = 'Puerto'; }
    else { item = parts.find((p) => p.id === focus.id); kind = 'Parte'; }
    if (!item) return null;
    const symbol = item.symbol || item.name;
    let parentFile = view.parent && VIEWS[view.parent] ? VIEWS[view.parent].file : null;
    let link = null;
    if (symbol) {
      const sym = item.kind === 'submodule' ? `inst:${symbol}` : focus.type === 'port' ? `port:${symbol}` : symbol;
      if (resolveSymbol(view.file, sym)) link = githubUrl(view.file, sym);
      else if (parentFile && resolveSymbol(parentFile, symbol)) link = githubUrl(parentFile, symbol);
    }
    const livePath = item.live;
    const card = h('div', { class: 'focus-card' },
      h('div', { class: 'focus-top' }, h('span', { class: 'eyebrow' }, kind), h('b', { class: 'focus-l' }, item.label || item.name || item.id)),
      h('div', { class: 'focus-meta' },
        symbol ? h('code', {}, symbol) : null,
        item.width != null ? h('span', { class: 'chip' }, `${item.width} bits`) : null,
        item.kind ? h('span', { class: 'chip' }, item.kind) : null,
        link ? ext(link, `Ver en GitHub ${GH}`) : null),
      focus.type === 'net' ? h('div', { class: 'focus-ft' }, h('b', {}, lab(item.from)), ' → ', h('b', {}, lab(item.to))) : null,
      item.desc ? h('div', { class: 'prose', html: item.desc }) : null,
      livePath ? h('div', { class: 'focus-live' }, 'Valor ahora: ', h('b', { class: 'mono' }, '—')) : null);
    if (livePath) live.focusLive = { path: livePath, el: card.querySelector('.focus-live b'), name: symbol || '' };
    if (item.drill && cb.onDrill) card.append(h('button', { class: 'btn small primary', type: 'button', onclick: () => cb.onDrill(item.drill) }, 'Entrar a este módulo ⤵'));
    return card;
  }

  // ---------- render ----------
  function renderEmpty() {
    clear(box);
    box.append(h('div', { class: 'panel-head' }, h('div', { class: 'panel-title' }, h('span', { class: 'eyebrow' }, 'Inspector'), h('h2', {}, 'Elegí un bloque'))),
      h('p', { class: 'muted pad' }, 'Hacé clic en cualquier bloque de la escena 3D para ver qué hace, cómo está hecho en este RTL y qué entra y sale en este ciclo.'));
  }

  function render(d) {
    disposeLive();
    clear(box);
    const { view, info, alt } = d;
    const ctx = d.ctx;
    live.view = view; live.ctx = ctx;
    const title = (view && view.title) || (info && info.title) || d.blockId;
    const stage = (view && view.stage) || (info && info.stage);
    const crumbIds = view ? breadcrumb(view.id) : [];
    const crumb = crumbIds.length ? crumbIds.map((id) => (VIEWS[id] && VIEWS[id].title) || id).join(' › ') : null;

    const ghUrl = view ? githubUrl(view.file, view.pseudo ? ((view.refs && view.refs[0] && view.refs[0].sym) || undefined) : `module:${view.module}`) : (info && info.rtlFile ? fileUrl(info.rtlFile) : null);
    box.append(h('div', { class: 'panel-head insp-head' },
      h('div', { class: 'panel-title' }, h('span', { class: 'eyebrow' }, view ? (view.kind === 'fsm' ? 'Máquina de estados' : 'Módulo') : 'Inspector'), h('h2', {}, title)),
      stage ? h('span', { class: 'chip stage-chip', style: { background: STAGE_COLORS[stage] } }, stage) : null,
      h('button', { class: 'icon-btn', title: 'Cerrar', onclick: () => cb.onClose && cb.onClose() }, '✕')));
    const acts = h('div', { class: 'insp-acts' });
    if (view && cb.onEnter && !d.inside) acts.append(h('button', { class: 'btn small primary', type: 'button', onclick: () => cb.onEnter(view.id) }, 'Entrar ⤵'));
    if (ghUrl) acts.append(ext(ghUrl, 'Ver en GitHub ↗', 'btn small ghost'));
    if (cb.onAlternatives && d.blockId && alt && !view) acts.append(h('button', { class: 'btn small accent', type: 'button', onclick: () => cb.onAlternatives(d.blockId) }, 'Otras opciones de hardware'));
    box.append(h('div', { class: 'insp-sub' }, crumb ? h('div', { class: 'insp-crumb' }, crumb) : null, acts));

    const focusCard = buildFocus(view, d.focus, ctx);
    if (focusCard) box.append(focusCard);

    const body = h('div', { class: 'insp-body' });
    box.append(body);
    const ex = (view && view.explain) || null;
    if (!view && info && info.summary) body.append(h('div', { class: 'summary prose', html: info.summary }));

    if (ex && ex.firstPrinciples) body.append(section('Desde cero', h('div', { class: 'prose', html: ex.firstPrinciples })));
    if (ex && ex.inThisProject) {
      const chips = h('div', { class: 'chips gh-chips' });
      if (view) {
        chips.append(ext(githubUrl(view.file, view.pseudo ? undefined : `module:${view.module}`), `${view.file}${view.pseudo ? '' : ' · ' + view.module} ${GH}`));
        for (const r of view.refs || []) chips.append(ext(githubUrl(view.file, r.sym), `${r.label} ${GH}`));
      }
      body.append(section('En este proyecto', [h('div', { class: 'prose', html: ex.inThisProject }), chips]));
    } else if (view) {
      body.append(section('En este proyecto', h('div', { class: 'chips gh-chips' }, ext(fileUrl(view.file), `${view.file} ${GH}`))));
    }
    if (ex && ex.whyThisChoice) body.append(section('Por qué esta elección', h('div', { class: 'prose', html: ex.whyThisChoice })));
    if (alt && ((alt.options && alt.options.length) || alt.current)) {
      body.append(section('Otras opciones', buildAlt(alt), { count: (alt.options || []).length || null }));
    }
    const io = buildIOSection(view, info);
    if (io) body.append(section('Qué entra y qué sale', io.wrap, { count: io.count }));
    if (view && view.fsm) body.append(section('FSM', buildFsm(view, ctx), { count: (view.fsm.states || []).length + ' estados' }));
    if (view && /uart_(rx|tx|core)/.test(view.id)) body.append(section('Simular un byte', buildUartSim(view)));
    if (info && info.rtlFile && !view) body.append(h('div', { class: 'rtl-file' }, h('span', { class: 'eyebrow' }, 'Archivo RTL'), ext(fileUrl(info.rtlFile), `${info.rtlFile} ${GH}`)));

    refresh(ctx);
  }

  function refresh(ctx) {
    live.ctx = ctx;
    refreshIO(ctx);
    refreshFsm(ctx);
    if (live.focusLive) {
      const v = resolveLive(ctx, live.focusLive.path);
      const dv = describeValue(live.focusLive.name, v, fmtValue);
      live.focusLive.el.textContent = dv.num + (dv.mean ? '  → ' + dv.mean : '');
    }
  }

  function update(d) {
    if (!d || (!d.blockId && !d.view) || (!d.view && !d.info)) { key = null; disposeLive(); renderEmpty(); return; }
    const nd = { ...d, ctx: d.ctx || { snap: d.snap } };
    const k = [nd.view ? nd.view.id : nd.blockId, nd.focus ? nd.focus.type + ':' + nd.focus.id : '', nd.inside ? 1 : 0, nd.alt ? 1 : 0].join('|');
    if (k === key) { refresh(nd.ctx); return; }
    key = k;
    render(nd);
  }
  renderEmpty();
  return { update };
}
