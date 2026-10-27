// explain.js - panel "Qué pasa con este comando": línea de tiempo explicada, sincronizada con la simulación.
// createExplainPanel(root, cb) -> { el, set(partial), reset(), state }
//   set({...}) mezcla campos en el estado del panel y repinta solo lo que cambió. Campos (ver `S` abajo):
//   cmd, dir ('rx'|'tx'), lane (claves de NODES), active, passed[], transit, nodeVals{}, chips, byte, wave, rxfsm,
//   fifo, fsm {state, from, trans}, effect, word, html {where, how}, milestones[], progress, ctrl.
import { h, clear } from '../dom.js';
import { frameBits } from '../../sim/uart.js';
import { disasm } from '../../sim/disasm.js';
import { NODES, ROLE_META, hx2, hx8, asc, stateInfo, FSM_SCHEMA } from './texts.js';

const ICON = {
  next: '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M6 5l9 7-9 7V5zm10 0h2v14h-2z"/></svg>',
  skip: '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M4 5l8 7-8 7V5zm9 0l8 7-8 7V5z"/></svg>',
  inside: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
};
const FSM_ROWS = [['IDLE', 'REPLY'], ['LOAD_LEN_LO', 'LOAD_LEN_HI', 'LOAD_DATA', 'LOAD_FILL'], ['DUMP_CNT_LO', 'DUMP_CNT_HI', 'DUMP_ADDR', 'DUMP_LATCH', 'DUMP_BYTE']];
const DUMP_NAMES = ['pc', 'if_id.pc', 'if_id.inst', 'id_ex.control', 'id_ex.campos', 'id_ex.pc', 'id_ex.rdata1', 'id_ex.rdata2', 'id_ex.imm', 'ex.alu_a', 'ex.alu_b', 'ex.alu_out', 'ex.target', 'ex.señales', 'ex_mem.control', 'ex_mem.alu_out', 'ex_mem.rdata2', 'ex_mem.rd/f3', 'mem.dmem_rdata', 'mem_wb.control', 'mem_wb.result', 'mem_wb.rd'];
export const dumpWordName = (k) => (k < 22 ? DUMP_NAMES[k] : k < 54 ? `x${k - 22}` : `dmem[${k - 54}]`);

export function createExplainPanel(root, cb = {}) {
  const S = { dir: 'rx', lane: ['host', 'sync', 'rx', 'rxfifo', 'fsm', 'imem'], active: null, passed: [], transit: null, nodeVals: {}, chips: null, byte: null, wave: null, rxfsm: null,
    fifo: { rx: { n: 0, bytes: [] }, tx: { n: 0, bytes: [] } }, fsm: { state: 'IDLE', from: null, trans: null }, effect: null, word: null, html: { where: '', how: '' }, milestones: [], progress: null, ctrl: { playing: false, manual: false, waiting: false }, cmd: null, idle: true };
  const sig = {};
  const changed = (k, v) => { const s = typeof v === 'string' ? v : JSON.stringify(v); if (sig[k] === s) return false; sig[k] = s; return true; };

  // ------------------------------------------------------------------ cabecera
  const badge = h('span', { class: 'xp-badge' }, '·');
  const ttl = h('span', { class: 'xp-ttl' }, 'Qué pasa con este comando');
  const sub = h('span', { class: 'xp-sub' }, '');
  const btnNext = h('button', { class: 'xp-btn', title: 'Avanzar al siguiente paso', onclick: () => cb.onNext && cb.onNext() }, h('span', { html: ICON.next }), 'Siguiente');
  const btnSkip = h('button', { class: 'xp-btn', title: 'Saltar la animación y mostrar el resultado', onclick: () => cb.onSkip && cb.onSkip() }, h('span', { html: ICON.skip }), 'Saltar');
  const btnIn = h('button', { class: 'xp-btn ghost', title: 'Entrar en la debug unit (vista interior en la escena 3D)', onclick: () => cb.onInside && cb.onInside() }, h('span', { html: ICON.inside }), 'Ver por dentro');
  const head = h('div', { class: 'xp-head' }, badge, h('div', { class: 'xp-ht' }, ttl, sub), h('div', { class: 'xp-hb' }, btnNext, btnSkip, btnIn));
  const progBar = h('i'), progTxt = h('span', {});
  const prog = h('div', { class: 'xp-prog' }, h('div', { class: 'xp-bar' }, progBar), progTxt);

  // ------------------------------------------------------------------ trama de bytes
  const chipsHost = h('div', { class: 'xp-chips' });
  const chipsTitle = h('span', { class: 'xp-h' }, 'Trama que manda la PC');
  const chipsLegend = h('span', { class: 'xp-leg' });
  const frameBox = h('div', { class: 'xp-sec xp-frame' }, h('div', { class: 'xp-sh' }, chipsTitle, chipsLegend), chipsHost);

  // ------------------------------------------------------------------ carril del dato
  const laneEl = h('div', { class: 'xp-lane' });
  const laneBox = h('div', { class: 'xp-sec' }, h('div', { class: 'xp-sh' }, h('span', { class: 'xp-h' }, 'Camino del dato'), h('span', { class: 'xp-leg lane-dir' }, '')), laneEl);

  // ------------------------------------------------------------------ forma de onda + UART
  const waveSvg = h('div', { class: 'xp-wave' });
  const rxLine = h('div', { class: 'xp-rxline mono' });
  const waveBox = h('div', { class: 'xp-sec xp-uart' }, h('div', { class: 'xp-sh' }, h('span', { class: 'xp-h' }, 'Trama 8N1 en el cable'), h('span', { class: 'xp-leg' }, '19200 baudios · ×16')), waveSvg, rxLine);

  // ------------------------------------------------------------------ FIFO
  const fifoRx = h('div', { class: 'xp-fifo' }), fifoTx = h('div', { class: 'xp-fifo' });
  const fifoBox = h('div', { class: 'xp-sec xp-fifos' },
    h('div', { class: 'xp-fifo-wrap' }, h('div', { class: 'xp-fh' }, h('span', { class: 'xp-h' }, 'RX FIFO'), h('span', { class: 'xp-flag fl-rx' }, 'rx_empty=1')), fifoRx),
    h('div', { class: 'xp-fifo-wrap' }, h('div', { class: 'xp-fh' }, h('span', { class: 'xp-h' }, 'TX FIFO'), h('span', { class: 'xp-flag fl-tx' }, 'tx_full=0')), fifoTx));

  // ------------------------------------------------------------------ FSM
  const pills = {};
  const fsmRows = FSM_ROWS.map((row) => h('div', { class: 'xp-prow' }, row.map((n) => { const p = h('span', { class: 'xp-pill', title: n }, n); pills[n] = p; return p; })));
  const trCard = h('div', { class: 'xp-tr' });
  const fsmBox = h('div', { class: 'xp-sec xp-fsm' }, h('div', { class: 'xp-sh' }, h('span', { class: 'xp-h' }, 'debug_unit_fsm'), h('span', { class: 'xp-leg fsm-code mono' }, '')), fsmRows, trCard);

  // ------------------------------------------------------------------ efecto
  const effEl = h('div', { class: 'xp-eff' });
  const wordEl = h('div', { class: 'xp-word' });
  const effBox = h('div', { class: 'xp-sec' }, h('div', { class: 'xp-sh' }, h('span', { class: 'xp-h' }, 'Cómo afecta'), h('span', { class: 'xp-leg eff-leg' }, '')), wordEl, effEl);

  // ------------------------------------------------------------------ dónde / explicación
  const whereEl = h('div', { class: 'xp-where' });
  const howEl = h('div', { class: 'xp-how' });
  const textBox = h('div', { class: 'xp-sec xp-text' }, h('div', { class: 'xp-sh' }, h('span', { class: 'xp-h' }, 'Dónde y por qué')), whereEl, howEl);

  const msEl = h('div', { class: 'xp-steps', role: 'list', 'aria-label': 'Línea de tiempo del comando' });
  const msBox = msEl;

  const idleEl = h('div', { class: 'xp-idle' },
    h('div', { class: 'xp-idle-art', html: '<svg viewBox="0 0 280 54" width="100%"><g fill="none" stroke="currentColor" stroke-width="1.6"><rect x="4" y="14" width="34" height="26" rx="7"/><rect x="62" y="14" width="34" height="26" rx="7"/><rect x="120" y="14" width="34" height="26" rx="7"/><rect x="178" y="14" width="34" height="26" rx="7"/><rect x="238" y="14" width="38" height="26" rx="7"/><path d="M38 27h24M96 27h24M154 27h24M212 27h26" marker-end="url(#a)"/></g><g font-family="JetBrains Mono, monospace" font-size="10" fill="currentColor" text-anchor="middle"><text x="21" y="31">PC</text><text x="79" y="31">UART</text><text x="137" y="31">FIFO</text><text x="195" y="31">FSM</text><text x="257" y="31">IMEM</text></g></svg>' }),
    h('p', {}, h('b', {}, 'Elegí un comando'), ' (L, S, R, P, X o D) y acá se cuenta, paso a paso, qué hace cada byte: cómo viaja por la UART, cómo lo ve la FIFO, qué transición toma la FSM de la debug unit y qué cambia en la IMEM o en el CPU.'),
    h('p', { class: 'muted' }, 'Todo está sincronizado con la placa en 3D.'));

  const body = h('div', { class: 'xp-body' }, msBox, frameBox, laneBox, textBox, waveBox, fifoBox, fsmBox, effBox);
  const el = h('div', { class: 'xp' }, head, prog, idleEl, body);
  root.append(el);

  // ================================================================== render por secciones
  function renderHead() {
    const c = S.cmd;
    if (!changed('head', [c, S.ctrl, S.idle, S.progress && S.progress.fast])) return;
    el.classList.toggle('is-idle', S.idle);
    badge.textContent = c ? c.key : '·'; badge.className = 'xp-badge' + (c ? ' k-' + c.key : '');
    ttl.textContent = c ? c.title : 'Qué pasa con este comando';
    sub.textContent = c ? (S.ctrl.playing ? (S.ctrl.waiting ? 'esperando "Siguiente"' : (S.progress && S.progress.fast ? 'avance rápido' : 'explicando…')) : 'terminado') : 'elegí un comando';
    btnNext.style.display = S.ctrl.manual && S.ctrl.playing ? '' : 'none';
    btnNext.disabled = !S.ctrl.waiting;
    btnSkip.style.display = S.ctrl.playing ? '' : 'none';
    btnIn.style.display = '';
  }
  function renderProgress() {
    const p = S.progress;
    if (!changed('prog', p)) return;
    prog.style.display = p ? '' : 'none';
    if (!p) return;
    progBar.style.width = (p.total ? (100 * p.done) / p.total : 0) + '%';
    progTxt.textContent = p.label || '';
    prog.classList.toggle('fast', !!p.fast);
  }
  function chip(role, text, state, title) {
    const m = ROLE_META[role] || ROLE_META.data;
    return h('span', { class: `xp-chip ${m.cls} ${state || ''}`, title: title || m.name }, text);
  }
  function renderChips() {
    const c = S.chips;
    if (!changed('chips', c)) return;
    frameBox.style.display = c ? '' : 'none';
    if (!c) return;
    chipsTitle.textContent = c.title || 'Trama que manda la PC';
    clear(chipsLegend).append(...(c.mask ? [h('i', { class: 'r-rep' }), 'respuesta', h('i', { class: 'r-len' }), 'cuenta', h('i', { class: 'r-data' }), 'dato'] : [h('i', { class: 'r-cmd' }), 'comando', h('i', { class: 'r-len' }), 'longitud', h('i', { class: 'r-data' }), 'dato']));
    const n = c.roles.length, cur = c.cur;
    const show = new Set([0, 1, 2, n - 1]);
    for (let i = Math.max(0, cur - 3); i <= Math.min(n - 1, cur + 6); i++) show.add(i);
    if (n <= 16) for (let i = 0; i < n; i++) show.add(i);
    const idx = [...show].filter((i) => i >= 0 && i < n).sort((a, b) => a - b);
    clear(chipsHost);
    let prev = -1;
    for (const i of idx) {
      if (i - prev > 1) chipsHost.append(h('span', { class: 'xp-gap', title: `${i - prev - 1} bytes más` }, `…${i - prev - 1}`));
      const r = c.roles[i];
      const state = i < cur ? 'sent' : i === cur ? 'cur' : '';
      chipsHost.append(chip(r.role, c.mask && i > cur ? '··' : hx2(r.b), state, `${r.label} · byte ${i}`));
      prev = i;
    }
  }
  function renderLane() {
    const key = [S.lane, S.active, S.passed, S.transit, S.nodeVals, S.dir];
    if (!changed('lane', key)) return;
    laneBox.querySelector('.lane-dir').textContent = S.dir === 'rx' ? 'PC → FPGA' : 'FPGA → PC';
    clear(laneEl);
    S.lane.forEach((k, i) => {
      const nd = NODES[k];
      if (i) laneEl.append(h('span', { class: 'xp-conn' + (S.transit === `${S.lane[i - 1]}>${k}` ? ' go' : '') + (S.passed.includes(k) || S.active === k ? ' on' : '') }, h('i')));
      const cls = 'xp-node' + (S.active === k ? ' act' : '') + (S.passed.includes(k) ? ' done' : '');
      laneEl.append(h('button', { class: cls, title: nd.title, onclick: () => { cb.onFocusBlock && cb.onFocusBlock(nd.block); cb.onNodeClick && cb.onNodeClick(k); } },
        h('b', {}, nd.short), h('span', { class: 'nv mono' }, S.nodeVals[k] || '')));
    });
  }
  function waveSvgFor(byte, dir) {
    const bits = frameBits(byte);
    const W = 300, X0 = 10, CW = 28, Y1 = 12, Y0 = 38;
    let d = '';
    let y = Y1;
    d += `M ${X0 - 8} ${Y1} L ${X0} ${Y1}`;
    bits.forEach((b, i) => { const yy = b ? Y1 : Y0; const x = X0 + i * CW; if (yy !== y) d += ` L ${x} ${yy}`; d += ` L ${x + CW} ${yy}`; y = yy; });
    d += ` L ${X0 + 10 * CW + 8} ${Y1}`;
    const labels = ['S', 0, 1, 2, 3, 4, 5, 6, 7, 'P'];
    const NS = 'http://www.w3.org/2000/svg';
    const wrap = document.createElementNS(NS, 'svg');
    wrap.setAttribute('viewBox', `0 0 ${W} 60`); wrap.setAttribute('class', 'xp-wsvg');
    let inner = '';
    bits.forEach((b, i) => { const x = X0 + i * CW; inner += `<rect class="wc ${i === 0 ? 'wc-s' : i === 9 ? 'wc-p' : ''}" x="${x}" y="2" width="${CW}" height="46"/>`;
      inner += `<text class="wl" x="${x + CW / 2}" y="58" text-anchor="middle">${labels[i] === 'S' ? 'start' : labels[i] === 'P' ? 'stop' : 'D' + labels[i]}</text>`;
      inner += `<text class="wb" x="${x + CW / 2}" y="${b ? Y0 + 5 : Y1 + 4}" text-anchor="middle">${b}</text>`; });
    inner += `<path class="wp" d="${d}"/>`;
    bits.forEach((b, i) => { inner += `<circle class="ws" data-i="${i}" cx="${X0 + i * CW + CW / 2}" cy="${b ? Y1 : Y0}" r="3.2"/>`; });
    inner += `<line class="wcur" x1="${X0}" x2="${X0}" y1="0" y2="50"/>`;
    wrap.innerHTML = inner;
    wrap.dataset.byte = byte; wrap.dataset.dir = dir; wrap._X0 = X0; wrap._CW = CW;
    return wrap;
  }
  function renderWave() {
    const w = S.wave;
    waveBox.style.display = w ? '' : 'none';
    if (!w) { changed('wave', null); return; }
    let svg = waveSvg.firstChild;
    if (!svg || svg.dataset.byte !== String(w.byte) || svg.dataset.dir !== w.dir) { clear(waveSvg).append(svg = waveSvgFor(w.byte, w.dir)); }
    const p = Math.max(0, Math.min(1, w.p));
    const cur = svg.querySelector('.wcur'), x = svg._X0 + p * 10 * svg._CW;
    cur.setAttribute('x1', x); cur.setAttribute('x2', x);
    svg.querySelectorAll('.ws').forEach((c, i) => c.classList.toggle('on', svg._X0 + i * svg._CW + svg._CW / 2 <= x));
    svg.querySelectorAll('.wc').forEach((c, i) => c.classList.toggle('now', x >= svg._X0 + i * svg._CW && x < svg._X0 + (i + 1) * svg._CW));
    const r = S.rxfsm;
    const k = JSON.stringify([r, w.byte, w.dir]);
    if (sig.rxline !== k) {
      sig.rxline = k;
      clear(rxLine);
      if (r) {
        rxLine.append(h('span', { class: 'rl-m' }, w.dir === 'rx' ? 'uart_rx' : 'uart_tx'), h('b', { class: 'rl-s st-' + r.state }, r.state), h('span', {}, `s=${r.s}`), h('span', {}, `n=${r.n}`),
          h('span', { class: 'rl-sh' }, 'registro: ', ...Array.from({ length: 8 }, (_, i) => h('i', { class: 'sb' + (r.shifted > i ? ' on' : '') }, r.shifted > i ? String((w.byte >> i) & 1) : '·')).reverse()),
          r.done ? h('b', { class: 'rl-done' }, `rx_done → 0x${hx2(w.byte)}`) : null);
      }
    }
  }
  function renderFifo() {
    const f = S.fifo;
    if (!changed('fifo', [f, S.dir])) return;
    const draw = (box, q, label) => {
      clear(box);
      for (let i = 0; i < 4; i++) {
        const v = q.bytes[i];
        box.append(h('span', { class: 'slot' + (i < q.n ? ' on' : '') }, i < q.n && v != null ? hx2(v) : ''));
      }
      void label;
    };
    draw(fifoRx, f.rx, 'rx'); draw(fifoTx, f.tx, 'tx');
    const fr = fifoBox.querySelector('.fl-rx'), ft = fifoBox.querySelector('.fl-tx');
    fr.textContent = `rx_empty=${f.rx.n ? 0 : 1}`; fr.classList.toggle('hot', !!f.rx.n);
    ft.textContent = `tx_full=${f.tx.n >= 4 ? 1 : 0}`; ft.classList.toggle('hot', f.tx.n >= 4);
    fifoBox.classList.toggle('tx-dir', S.dir === 'tx');
  }
  function renderFsm() {
    const f = S.fsm;
    if (!changed('fsm', [f.state, f.from, f.descState, f.trans && f.trans.cond, f.trans && f.trans.actions])) return;
    for (const [n, p] of Object.entries(pills)) { p.classList.toggle('cur', n === f.state); p.classList.toggle('was', n === f.from && f.from !== f.state); }
    const si = stateInfo(f.state);
    const di = stateInfo(f.descState || f.state);
    fsmBox.querySelector('.fsm-code').textContent = si ? `${f.state} = 4'd${si.code}` : '';
    clear(trCard);
    if (f.trans) {
      trCard.append(
        h('div', { class: 'tr-h' }, h('b', { class: 'mono' }, f.trans.from), h('span', { class: 'arr' }, f.trans.from === f.trans.to ? '↺' : '→'), h('b', { class: 'mono' }, f.trans.to)),
        h('div', { class: 'tr-c mono' }, 'si ', h('span', {}, f.trans.cond)),
        f.trans.actions ? h('div', { class: 'tr-a mono' }, 'hace ', h('span', {}, f.trans.actions)) : null);
    } else trCard.append(h('div', { class: 'muted small' }, f.state === 'IDLE' ? 'IDLE: esperando un comando (rx_empty = 1).' : ''));
    if (di) trCard.append(h('div', { class: 'tr-d', html: di.desc }));
  }
  function renderEffect() {
    const e = S.effect, wd = S.word;
    if (changed('word', wd)) {
      clear(wordEl);
      wordEl.style.display = wd ? '' : 'none';
      if (wd) {
        const bytes = wd.bytes;
        const val = bytes.every((b) => b != null) ? ((bytes[0] | bytes[1] << 8 | bytes[2] << 16 | bytes[3] << 24) >>> 0) : null;
        wordEl.append(
          h('div', { class: 'wd-h' }, h('span', { class: 'wd-t' }, wd.title), h('span', { class: 'wd-a mono' }, wd.addr != null ? `0x${(wd.addr >>> 0).toString(16).toUpperCase().padStart(3, '0')}` : '')),
          h('div', { class: 'wd-slots' }, [3, 2, 1, 0].map((i) => h('div', { class: 'wd-s' + (bytes[i] != null ? ' on' : '') + (wd.cur === i ? ' cur' : '') },
            h('span', { class: 'wd-sa mono' }, wd.addr != null ? `+${i}` : `b${i}`), h('b', { class: 'mono' }, bytes[i] != null ? hx2(bytes[i]) : '··')))),
          h('div', { class: 'wd-v mono' }, val != null ? `= 0x${hx8(val)}` : '= 0x········', val != null && wd.disasm !== false ? h('span', { class: 'wd-d' }, disasm(val, wd.addr || 0)) : (wd.name ? h('span', { class: 'wd-d' }, wd.name) : null)),
          wd.note ? h('div', { class: 'wd-n muted small' }, wd.note) : null);
      }
    }
    if (!changed('eff', e)) return;
    clear(effEl);
    effBox.querySelector('.eff-leg').textContent = '';
    if (e) {
      const row = (tag, cls, text, on) => h('div', { class: 'eff-r ' + cls + (on ? ' on' : '') }, h('b', {}, tag), h('span', {}, text));
      effEl.append(row('CPU', 'cpu', e.cpu, e.hot === 'cpu'), row('IMEM', 'imem', e.imem, e.hot === 'imem'), row('UART', 'uart', e.uart, e.hot === 'uart'));
      if (e.led) effEl.append(h('div', { class: 'eff-led' }, ...e.led.map(([n, on]) => h('span', { class: 'ledc ' + (on ? 'on ' : '') + n }, h('i'), n))));
    }
  }
  function renderText() {
    if (!changed('where', S.html.where)) { /* igual */ } else whereEl.innerHTML = S.html.where;
    if (changed('how', S.html.how)) howEl.innerHTML = S.html.how;
  }
  function renderMs() {
    if (!changed('ms', S.milestones)) return;
    clear(msEl);
    S.milestones.forEach((m, i) => msEl.append(h('span', { class: 'xp-stp ms-' + m.status, role: 'listitem', title: m.detail || m.label }, h('i', {}, m.status === 'done' ? '✓' : String(i + 1)), h('b', {}, m.label))));
    msBox.style.display = S.milestones.length ? '' : 'none';
  }
  function renderAll() {
    renderHead(); renderProgress();
    idleEl.style.display = S.idle ? '' : 'none';
    body.style.display = S.idle ? 'none' : '';
    if (S.idle) return;
    renderChips(); renderLane(); renderWave(); renderFifo(); renderFsm(); renderEffect(); renderText(); renderMs();
  }
  let raf = 0;
  function set(p) {
    for (const k of Object.keys(p)) if (p[k] !== undefined) S[k] = p[k];
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; renderAll(); });
  }
  function flush() { cancelAnimationFrame(raf); raf = 0; renderAll(); }
  function reset() {
    Object.assign(S, { idle: true, cmd: null, progress: null, chips: null, wave: null, active: null, passed: [], transit: null, nodeVals: {}, effect: null, word: null, html: { where: '', how: '' }, milestones: [], ctrl: { playing: false, manual: false, waiting: false }, fifo: { rx: { n: 0, bytes: [] }, tx: { n: 0, bytes: [] } } });
    flush();
  }
  renderAll();
  return { el, set, flush, reset, state: S, schema: FSM_SCHEMA };
}
