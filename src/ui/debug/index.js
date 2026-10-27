// index.js - Vista Debug v2: editor de ensamblador + barra de comandos + panel "Qué pasa con este comando".
//
// mountDebugView(host) -> controller
//   host: {
//     scene, shell,
//     root,            elemento de la columna izquierda (shell.slots.left.debug)
//     rightPanel,      elemento del panel derecho (shell.slots.rightPanel): se le agrega la sección de Debug
//     examples,        EXAMPLES (con el código real; '__PIPELINE_TEST__' ya se acepta igual)
//     getSource(),     código inicial para el editor (p. ej. el del simulador)
//     getPipe(), getDbg(),     Pipeline y DebugUnit vigentes (los crea main.js al entrar en Debug)
//     render(snap, prev, {animate}),   pinta un snapshot del pipeline en toda la UI
//     colors,          COLORS de ui/driver.js
//     onProgram?(src, result),  aviso cuando cambia el programa del editor
//   }
//   controller: { enter(), leave(), sync(), send(bytes, meaning?), command('L'|'S'|'R'|'P'|'X'|'D'),
//                 setSource(src), isBusy, editor, player, panel }
import { h, clear } from '../dom.js';
import { decodeDump, encodeLoad, bytesToMs, BAUD } from '../../sim/debugUnit.js';
import { VIEWS } from '../../content/modules/index.js';
import { createFsmGraph } from '../fsmGraph.js';
import { createAsmEditor } from './asmEditor.js';
import { createExplainPanel } from './explain.js';
import { createPlayer } from './player.js';
import { createResultViews } from './dumpView.js';
import { runTrace, CMD_NAMES, RESPONSES, classifyHostBytes } from './trace.js';
import { hx2, asc, FSM_SCHEMA } from './texts.js';

const I = (d) => `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICONS = {
  L: I('<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>'),
  S: I('<path d="M5 5l9 7-9 7zM18 5v14"/>'),
  R: I('<path d="M7 4l12 8-12 8z"/>'),
  P: I('<path d="M8 5v14M16 5v14"/>'),
  X: I('<path d="M4 12a8 8 0 1 0 3-6.2M4 4v5h5"/>'),
  D: I('<path d="M12 4v12M7 11l5 5 5-5M4 20h16"/>'),
};
const CMD_BAR = [
  ['L', 'Cargar', 'Cargar el programa del editor en la IMEM (comando L)', 'primary'],
  ['S', 'Paso', 'Avanzar un ciclo de reloj (comando S)', ''],
  ['R', 'Ejecutar', 'Ejecutar en continuo (comando R)', 'accent'],
  ['P', 'Pausa', 'Pausar el CPU (comando P)', ''],
  ['X', 'Reset', 'Reiniciar el CPU: PC = 0 (comando X)', ''],
  ['D', 'Volcado', 'Pedir el estado completo del pipeline (comando D)', ''],
];
const BYTE_OF = { L: 0x4c, S: 0x53, R: 0x52, P: 0x50, X: 0x58, D: 0x44 };

export function mountDebugView(host) {
  const { scene, shell, colors: C } = host;
  const shortHex = (n) => '0x' + n.toString(16).toUpperCase();
  let busy = false, live = { on: false, raf: 0, last: 0, acc: 0, rate: 10 };
  let curTrace = null, lastFlags = null, insideView = false, enteredOnce = false, attachedDbg = null, inTrace = false;

  // ====================================================================== columna izquierda
  const stateBadge = h('span', { class: 'dv-state mono', title: 'Estado de la FSM de la debug unit' }, 'IDLE');
  const led = (k, t) => h('span', { class: 'dv-led', title: t }, h('i', { class: 'k-' + k }), k.toUpperCase());
  const leds = { halt: led('halt', 'cpu_halt: el CPU ejecutó ebreak'), rst: led('rst', 'cpu_reset: el CPU está en reset'), en: led('en', 'cpu_enable: el CPU avanza este ciclo') };
  const topbar = h('div', { class: 'dv-top' }, h('div', { class: 'dv-t' }, h('span', { class: 'eyebrow' }, 'Consola UART'), h('h2', {}, 'Debug unit')), h('div', { class: 'dv-st' }, stateBadge, h('div', { class: 'dv-leds' }, leds.halt, leds.rst, leds.en)));

  const edHost = h('div', { class: 'dv-editor' });
  const editor = createAsmEditor(edHost, {
    examples: host.examples, source: host.getSource ? host.getSource() : undefined, rows: 9,
    onSubmit: () => command('L'),
    onChange: (res, src) => { if (host.onProgram) host.onProgram(src, res); },
  });

  const cmdBtns = {};
  const cmdBar = h('div', { class: 'dv-cmds', role: 'toolbar', 'aria-label': 'Comandos de la debug unit' }, CMD_BAR.map(([k, label, title, cls]) => {
    const b = h('button', { class: 'dv-cmd ' + cls, title, 'data-cmd': k, onclick: () => command(k) }, h('span', { class: 'ci', html: ICONS[k] }), h('kbd', {}, k), h('span', { class: 'cl' }, label));
    cmdBtns[k] = b; return b;
  }));

  const modeSel = h('select', { class: 'dv-sel', 'aria-label': 'Velocidad de la explicación', onchange: () => { mode = modeSel.value; } },
    [['animada', 'Animada'], ['todo', 'Todo animado'], ['manual', 'Paso a paso'], ['instantanea', 'Instantánea']].map(([v, l]) => h('option', { value: v }, l)));
  let mode = 'animada';
  const rateSel = h('select', { class: 'dv-sel', 'aria-label': 'Velocidad de Run', onchange: () => { live.rate = Number(rateSel.value); } },
    [[2, '2 c/s'], [10, '10 c/s'], [60, '60 c/s'], [600, '600 c/s'], [5000, '5000 c/s']].map(([v, l]) => h('option', { value: String(v) }, l)));
  rateSel.value = '10';
  const btnInside = h('button', { class: 'dv-mini', title: 'Entrar a la debug unit en la escena 3D', onclick: () => toggleInside() }, h('span', { html: I('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>') }), h('span', { class: 'lbl' }, 'Ver por dentro'));
  const opts = h('div', { class: 'dv-opts' },
    h('label', {}, h('span', {}, 'Explicación'), modeSel), h('label', {}, h('span', {}, 'Run'), rateSel), btnInside);

  const rawIn = h('input', { class: 'dv-raw mono', placeholder: '4C 02 00 13 00 50 00 93 …', spellcheck: 'false', 'aria-label': 'Bytes crudos en hexadecimal' });
  const rawErr = h('div', { class: 'dv-rawerr' });
  const rawSend = () => {
    const toks = rawIn.value.trim().split(/[\s,;]+/).filter(Boolean);
    const bytes = toks.map((t) => parseInt(t.replace(/^0x/i, ''), 16));
    if (!toks.length || bytes.some((b) => !(b >= 0 && b <= 255))) { rawErr.textContent = 'Hex inválido: usá pares como 4C 0F'; return; }
    rawErr.textContent = ''; rawIn.value = '';
    send(bytes, 'bytes crudos');
  };
  rawIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') rawSend(); });
  const adv = h('details', { class: 'dv-adv' }, h('summary', {}, 'Avanzado · bytes crudos'),
    h('div', { class: 'dv-advb' }, h('div', { class: 'dv-rawrow' }, rawIn, h('button', { class: 'dv-mini', onclick: rawSend }, 'Enviar')), rawErr,
      h('p', { class: 'muted small' }, 'Se mandan tal cual por la UART. Comandos: ', h('code', {}, '4C'), ' L · ', h('code', {}, '53'), ' S · ', h('code', {}, '52'), ' R · ', h('code', {}, '50'), ' P · ', h('code', {}, '58'), ' X · ', h('code', {}, '44'), ' D.')));

  host.root.append(h('div', { class: 'dv-left' }, topbar, edHost, cmdBar, opts, adv));

  // ====================================================================== columna derecha
  const rxRoot = h('div', { class: 'dv-pane' }), fsmRoot = h('div', { class: 'dv-pane' }), logRoot = h('div', { class: 'dv-pane' }), dumpRoot = h('div', { class: 'dv-pane' });
  const panes = { xp: rxRoot, fsm: fsmRoot, log: logRoot, dump: dumpRoot };
  const tabBtns = {};
  const TABS = [['xp', 'Qué pasa'], ['fsm', 'FSM'], ['log', 'Tráfico'], ['dump', 'Volcado']];
  let tab = 'xp';
  const tabsEl = h('div', { class: 'dv-tabs', role: 'tablist' }, TABS.map(([id, label]) => { const b = h('button', { class: 'dv-tab', role: 'tab', onclick: () => setTab(id) }, label, h('i', { class: 'dot' })); tabBtns[id] = b; return b; }));
  function setTab(id) {
    tab = id;
    for (const [k, p] of Object.entries(panes)) { p.style.display = k === id ? '' : 'none'; tabBtns[k].classList.toggle('active', k === id); }
    tabBtns[id].classList.remove('news');
    if (id === 'fsm') graphFit();
  }
  const rightSec = h('section', { class: 'sec sec-dbgx', 'data-v': 'debug' }, h('div', { class: 'dv-right' }, tabsEl, rxRoot, fsmRoot, logRoot, dumpRoot));
  host.rightPanel.prepend(rightSec);

  const panel = createExplainPanel(rxRoot, {
    onSkip: () => player.skip(), onNext: () => player.next(),
    onInside: () => toggleInside(true),
    onFocusBlock: (b) => { if (b && !insideView) scene.focusBlock(b); },
  });
  const results = createResultViews(logRoot, dumpRoot);

  // ---- pestaña FSM (grafo real de debug_unit_fsm)
  const graphBox = h('div', { class: 'dv-graph' });
  const fsmInfo = h('div', { class: 'dv-fsminfo' });
  const bigBtn = h('button', { class: 'xp-btn ghost', onclick: () => openBig() }, 'Ampliar');
  fsmRoot.append(h('div', { class: 'dv-fsmhead' }, h('span', { class: 'xp-h' }, 'Grafo de debug_unit_fsm · 11 estados'), bigBtn), graphBox, fsmInfo);
  let graph = null, bigGraph = null, bigEl = null;
  const showSel = (sel) => {
    clear(fsmInfo);
    if (sel.type === 'state') fsmInfo.append(h('div', { class: 'tr-h' }, h('b', { class: 'mono' }, sel.name), h('span', { class: 'muted' }, ` código ${sel.state.code}`)), h('div', { class: 'tr-d', html: sel.state.desc }), sel.state.effect ? h('div', { class: 'eff-mini' }, h('div', {}, h('b', {}, 'CPU '), sel.state.effect.cpu), h('div', {}, h('b', {}, 'IMEM '), sel.state.effect.imem), h('div', {}, h('b', {}, 'UART '), sel.state.effect.uart)) : '');
    else fsmInfo.append(...sel.transitions.map((t) => h('div', { class: 'tr-block' }, h('div', { class: 'tr-h' }, h('b', { class: 'mono' }, t.from), h('span', { class: 'arr' }, t.from === t.to ? '↺' : '→'), h('b', { class: 'mono' }, t.to)), h('div', { class: 'tr-c mono' }, 'si ', h('span', {}, t.cond)), t.actions ? h('div', { class: 'tr-a mono' }, 'hace ', h('span', {}, t.actions)) : null, t.effect ? h('div', { class: 'eff-mini' }, h('div', {}, h('b', {}, 'CPU '), t.effect.cpu), h('div', {}, h('b', {}, 'IMEM '), t.effect.imem), h('div', {}, h('b', {}, 'UART '), t.effect.uart)) : null)));
  };
  function buildGraph() {
    if (graph || !FSM_SCHEMA) return;
    graph = createFsmGraph(graphBox, FSM_SCHEMA.fsm, { onSelect: showSel });
    graph.setState('IDLE');
  }
  function graphFit() { buildGraph(); }
  function openBig() {
    if (bigEl) return closeBig();
    bigEl = h('div', { class: 'fsm-box big dv-bigfsm' }, h('button', { class: 'xp-btn', style: { position: 'absolute', top: '10px', right: '12px', zIndex: 2 }, onclick: () => closeBig() }, 'Cerrar'));
    document.body.append(bigEl);
    bigGraph = createFsmGraph(bigEl, FSM_SCHEMA.fsm, { onSelect: showSel });
    bigGraph.setState(panel.state.fsm.state);
    if (panel.state.fsm.trans) bigGraph.highlightTransition(panel.state.fsm.trans.from, panel.state.fsm.trans.to);
  }
  function closeBig() { if (bigEl) { bigGraph.dispose(); bigEl.remove(); bigEl = null; bigGraph = null; } }
  const graphSet = (fsm) => {
    for (const g of [graph, bigGraph]) if (g) { g.setState(fsm.state); g.highlightTransition(fsm.trans ? fsm.trans.from : null, fsm.trans ? fsm.trans.to : null); }
  };

  // el player le habla a un panel "proxy" que además mueve el grafo y los LEDs
  const proxy = {
    set(p) {
      panel.set(p);
      if (p.fsm) { graphSet(p.fsm); stateBadge.textContent = p.fsm.state; stateBadge.classList.toggle('busy', p.fsm.state !== 'IDLE'); }
    },
    flush() { panel.flush(); },
    get state() { return panel.state; },
  };
  const player = createPlayer({ scene, panel: proxy, getMode: () => mode, colors: C });

  // ====================================================================== estado visual
  function setLedsUi(f) { for (const [k, v] of [['halt', f.halt], ['rst', f.cpuReset != null ? f.cpuReset : f.rst], ['en', f.cpuEnable != null ? f.cpuEnable : f.en]]) leds[k].classList.toggle('on', !!v); }
  function sync() {
    const dbg = host.getDbg();
    if (!dbg || player.playing) return;
    setLedsUi(dbg.leds);
    stateBadge.textContent = dbg.state; stateBadge.classList.toggle('busy', dbg.state !== 'IDLE' || dbg.run);
    scene.setLeds(dbg.leds);
  }

  // ====================================================================== comandos
  function logTx(trace, meaning) { results.log({ dir: 'TX', bytes: trace.bytes, meaning }); }
  function describe(bytes) {
    const r = classifyHostBytes(bytes);
    if (r[0].cmd === 'L') { const n = bytes.length > 2 ? bytes[1] | (bytes[2] << 8) : '?'; return `L: cargar ${n} instrucciones (${bytes.length} bytes ≈ ${bytesToMs(bytes.length).toFixed(0)} ms a ${BAUD} baudios)`; }
    const i = CMD_NAMES[bytes[0]];
    return i ? `${i.key}: ${i.title.toLowerCase()}` : `byte 0x${hx2(bytes[0])}`;
  }
  async function send(bytes, meaning) {
    bytes = Array.from(bytes, (b) => b & 0xff);
    if (!bytes.length) return;
    if (shell.getView() !== 'debug') shell.setView('debug');
    const pipe = host.getPipe(), dbg = host.getDbg();
    if (!pipe || !dbg) return;
    if (player.playing) { player.skip(); await new Promise((r) => setTimeout(r, 30)); }
    if (insideView) { /* se queda adentro: la animación sigue en el panel */ }
    stopLive();
    const wasRun = dbg.run;
    busy = true; refreshButtons();
    const before = pipe.snapshot();
    inTrace = true;
    let trace;
    try { trace = runTrace(dbg, bytes); } finally { inTrace = false; }
    curTrace = trace;
    logTx(trace, meaning || describe(bytes));
    const first = classifyHostBytes(bytes)[0];
    const info = CMD_NAMES[bytes[0]] || { key: '?', title: 'Byte desconocido' };
    setTab('xp');
    if (editor && trace.first !== 0x4c) editor.setActiveLine(null);
    const listing = editor.getResult().listing;
    await player.play(trace, {
      cmd: { key: bytes.length > 1 && bytes[0] !== 0x4c ? 'RAW' : info.key, title: bytes[0] === 0x4c ? 'Cargar programa en la IMEM' : bytes.length > 1 ? 'Bytes crudos' : info.title },
      onLine: (wi) => {
        if (wi == null) { editor.setActiveLine(null); return; }
        const ent = listing.find((l) => l.addr === wi * 4);
        editor.setActiveLine(ent ? ent.line : null, 'write');
      },
      onCpu: () => host.render(pipe.snapshot(), before, { animate: trace.cyclesRun === 1 }),
      onFlags: (f) => { lastFlags = f; setLedsUi(f); },
      finalize: () => {
        finishCommand(trace, before);
      },
    });
    busy = false; refreshButtons();
    if (dbg.run && host.getDbg() === dbg) startLive();
  }
  function finishCommand(trace, before) {
    const dbg = host.getDbg(), pipe = host.getPipe();
    // respuestas de la FPGA al registro
    if (trace.tx.length) {
      if (trace.first === 0x44) {
        results.log({ dir: 'RX', bytes: trace.tx, meaning: `dump: ${trace.tx.length} bytes (${(trace.tx.length - 2) / 4} palabras)` });
        try {
          results.showDump(decodeDump(Uint8Array.from(trace.tx)), { bytes: trace.tx.length });
          setTab('dump');
        } catch (e) { results.log({ dir: 'RX', bytes: [], meaning: 'dump inválido: ' + e.message }); }
      } else results.log({ dir: 'RX', bytes: trace.tx, meaning: trace.tx.map((b) => RESPONSES[b] || `0x${hx2(b)}`).join(' · ') });
    }
    sync();
    host.render(pipe.snapshot(), before, { animate: false });
    if (trace.first === 0x4c) editor.setActiveLine(null);
  }
  function command(k) {
    if (k === 'L') {
      editor.flush();
      const res = editor.getResult();
      if (!res.ok) { edHost.classList.remove('shake'); void edHost.offsetWidth; edHost.classList.add('shake'); return; }
      return send(Array.from(encodeLoad(res.words)), undefined);
    }
    return send([BYTE_OF[k]]);
  }
  function refreshButtons() {
    for (const b of Object.values(cmdBtns)) b.classList.toggle('busy', busy);
  }

  // ====================================================================== modo Run (continuo)
  const dbgRate = () => live.rate;
  function startLive() {
    if (live.on) return;
    live.on = true; live.last = performance.now(); live.acc = 0;
    live.raf = requestAnimationFrame(liveFrame);
  }
  function stopLive() { live.on = false; cancelAnimationFrame(live.raf); live.raf = 0; }
  function liveFrame(t) {
    live.raf = 0;
    if (!live.on) return;
    const dbg = host.getDbg(), pipe = host.getPipe();
    if (!dbg || shell.getView() !== 'debug') { live.on = false; return; }
    const dt = Math.min(0.25, (t - live.last) / 1000);
    live.last = t;
    if (dbg.run) {
      live.acc += dt * dbgRate();
      let n = Math.floor(live.acc);
      live.acc -= n;
      if (pipe.halted) n = Math.max(n, 4);
      if (n > 0 && !player.playing) {
        const before = pipe.snapshot();
        const txs = [];
        const cb = (b) => txs.push(b);
        dbg.txCbs.push(cb);
        dbg.tick(Math.min(n, 3000));
        dbg.txCbs.splice(dbg.txCbs.indexOf(cb), 1);
        const snap = pipe.snapshot();
        host.render(snap, before, { animate: snap.cycle - before.cycle === 1 && dbgRate() <= 10 });
        if (txs.length) {
          results.log({ dir: 'RX', bytes: txs, meaning: txs.map((b) => RESPONSES[b] || `0x${hx2(b)}`).join(' · ') + (txs[0] === 0x48 ? ' (espontáneo)' : '') });
          scene.sendPacket('debug-uart', { color: C.purple, label: String.fromCharCode(txs[0]), durationMs: 650 });
        }
        sync();
      }
      live.raf = requestAnimationFrame(liveFrame);
    } else { dbg.settle(); sync(); live.on = false; }
  }

  // ====================================================================== "Ver por dentro" (escena interior)
  let insideRaf = 0;
  function liveCtx() {
    const dbg = host.getDbg();
    const f = lastFlags && player.playing ? lastFlags : dbg ? { ...dbg.leds, run: dbg.run, step: dbg.step, loading: dbg.loading, dumping: dbg.dumping, cpuEnable: dbg.cpuEnable, cpuReset: dbg.cpuReset, state: dbg.state } : {};
    const name = player.playing ? panel.state.fsm.state : (dbg ? dbg.state : 'IDLE');
    const code = FSM_SCHEMA.fsm.states.find((s) => s.name === name)?.code ?? 0;
    const r = panel.state.rxfsm, rx = panel.state.dir === 'rx' ? r : null, tx = panel.state.dir === 'tx' ? r : null;
    const b = panel.state.byte ? panel.state.byte.value : 0;
    return {
      dbg: { state: name, stateCode: code, run: !!f.run, step: !!f.step, loading: !!f.loading, dumping: !!f.dumping, cpuEnable: !!f.cpuEnable, cpuReset: !!f.cpuReset, leds: { halt: !!f.halt, rst: !!f.cpuReset, en: !!f.cpuEnable } },
      uart: { rx: { state: rx ? rx.state : 'IDLE', s: rx ? rx.s : 0, n: rx ? rx.n : 0, byte: b }, tx: { state: tx ? tx.state : 'IDLE', s: tx ? tx.s : 0, n: tx ? tx.n : 0, byte: b, tx: 1 } },
    };
  }
  function insideLoop() {
    if (!insideView) return;
    scene.setInteriorLive(liveCtx());
    insideRaf = requestAnimationFrame(insideLoop);
  }
  async function toggleInside(forceOn) {
    if (insideView && !forceOn) {
      insideView = false; cancelAnimationFrame(insideRaf);
      btnInside.querySelector('.lbl').textContent = 'Ver por dentro'; btnInside.classList.remove('on');
      await scene.exitView(); return;
    }
    if (insideView) return;
    const schema = VIEWS.debug_unit_fsm || VIEWS.debug_unit;
    if (!schema || !scene.enterView) return;
    insideView = true;
    btnInside.querySelector('.lbl').textContent = 'Volver a la placa'; btnInside.classList.add('on');
    await scene.enterView(schema, { fromBlockId: 'debug' });
    insideLoop();
  }

  // ====================================================================== entrar / salir de la vista
  let mo = null;
  function enter() {
    enteredOnce = true;
    if (host.getSource && !editor.getSource().trim()) editor.setSource(host.getSource());
    shell.setPanel('r', true);
    buildGraph();
    setTab(tab);
    sync();
    if (!mo) {
      // el shell reescribe la etiqueta de la pestaña lateral en cada cambio de paneles
      const tabR = document.querySelector('.edge-tab.edge-r .et-t'), tabL = document.querySelector('.edge-tab.edge-l .et-t');
      const fix = () => {
        if (shell.getView() !== 'debug') return;
        if (tabR && tabR.textContent !== 'Explicación') tabR.textContent = 'Explicación';
        if (tabL && tabL.textContent !== 'Editor') tabL.textContent = 'Editor';
      };
      if (tabR) { mo = new MutationObserver(fix); mo.observe(tabR, { childList: true, characterData: true, subtree: true }); if (tabL) mo.observe(tabL, { childList: true, characterData: true, subtree: true }); }
      fix();
    }
  }
  function leave() {
    player.skip(); stopLive(); closeBig();
    if (insideView) { insideView = false; cancelAnimationFrame(insideRaf); btnInside.querySelector('.lbl').textContent = 'Ver por dentro'; btnInside.classList.remove('on'); scene.exitView(); }
    panel.reset();
    for (const id of ['uart', 'debug', 'imem']) scene.setBlockStatus(id, null);
    for (const id of ['uart', 'debug', 'imem', 'pc']) scene.highlightBlock(id, null);
    editor.setActiveLine(null);
  }

  panel.reset();
  setTab('xp');
  return {
    enter, leave, sync, send, command, setSource: (s) => editor.setSource(s),
    get isBusy() { return busy || player.playing; },
    get lastTrace() { return curTrace; },
    setMode: (m) => { mode = m; modeSel.value = m; },
    toggleInside, setTab, openBig, closeBig,
    editor, player, panel, results,
  };
}
