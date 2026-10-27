// player.js - reproduce una traza (trace.js) sincronizando el panel "Qué pasa" y la escena 3D.
//
// createPlayer({ scene, panel, getMode, colors }) -> { play(trace, env), skip(), next(), playing }
//   mode: 'animada' (primeros ~12 bytes lentos y explicados, el resto en avance rápido),
//         'todo' (todo animado), 'manual' (paso a paso con "Siguiente"), 'instantanea' (sin animación).
//   env: { cmd:{key,title}, listing, onLine(line|null), onCpu() , finalize() }
//     onCpu: se llama cuando el CPU realmente avanza/resetea (la integración renderiza el snapshot nuevo).
//     finalize: se llama al terminar (o al saltar) para dejar la escena en el estado final.
import { bytesToMs, STATES } from '../../sim/debugUnit.js';
import { simulateByte } from '../../sim/uart.js';
import { CMD_NAMES } from './trace.js';
import { NODES, nodeLink, hx2, hx8, asc, hostText, uartText, SYNC_TEXT, RXFSM_TEXT, RXFIFO_TEXT, findTransition, stateInfo, destFor, link } from './texts.js';
import { dumpWordName } from './explain.js';

const SKIPPED = Symbol('skipped');
const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
const SLOW_BUDGET = 12;

export function createPlayer({ scene, panel, getMode, colors }) {
  const C = colors;
  let ctl = null;

  function newCtl() {
    const c = { skipped: false, wakers: new Set(), gate: null };
    c.wait = (ms) => new Promise((res, rej) => {
      if (c.skipped) return rej(SKIPPED);
      const id = setTimeout(() => { c.wakers.delete(w); res(); }, ms);
      const w = () => { clearTimeout(id); c.wakers.delete(w); rej(SKIPPED); };
      c.wakers.add(w);
    });
    c.anim = (ms, fn) => new Promise((res, rej) => {
      const t0 = performance.now();
      let id = 0;
      const w = () => { cancelAnimationFrame(id); c.wakers.delete(w); rej(SKIPPED); };
      c.wakers.add(w);
      const tick = (t) => {
        const p = Math.max(0, Math.min(1, (t - t0) / ms));
        fn(p);
        if (p >= 1) { c.wakers.delete(w); res(); } else id = requestAnimationFrame(tick);
      };
      id = requestAnimationFrame(tick);
    });
    c.pause = () => new Promise((res, rej) => { if (c.skipped) return rej(SKIPPED); c.gate = res; c.wakers.add(() => rej(SKIPPED)); });
    c.stop = () => { c.skipped = true; const w = [...c.wakers]; c.wakers.clear(); w.forEach((f) => f()); if (c.gate) { const g = c.gate; c.gate = null; g(); } };
    return c;
  }

  function milestonesOf(trace) {
    const segs = [];
    const keyOf = (it) => {
      if (it.kind === 'fill') return ['fill', 'Relleno con NOP'];
      if (it.rx && it.rx.role === 'cmd') return ['cmd', `Comando ${it.rx.cmd}`];
      if (it.rx && (it.rx.role === 'len_lo' || it.rx.role === 'len_hi')) return ['len', 'Longitud n'];
      if (it.rx && it.rx.role === 'data') return ['data', 'Programa → IMEM'];
      if (it.rx) return ['unk', 'Byte desconocido'];
      if (it.tx && it.tx.role === 'reply') return ['reply', 'Respuesta de la FPGA'];
      if (it.tx && (it.tx.role === 'cnt_lo' || it.tx.role === 'cnt_hi')) return ['cnt', 'Cuenta de palabras'];
      if (it.tx) return ['words', 'Palabras del volcado'];
      if (it.cpuRst) return ['rst', 'Reset del CPU'];
      if (it.cpuStep) return ['step', 'El CPU avanza 1 ciclo'];
      return null;
    };
    trace.items.forEach((it, i) => {
      const k = keyOf(it);
      if (!k) { if (segs.length) segs[segs.length - 1].end = i; return; }
      const last = segs[segs.length - 1];
      if (last && last.key === k[0]) { last.end = i; last.n++; } else segs.push({ key: k[0], label: k[1], start: i, end: i, n: 1 });
    });
    return segs;
  }
  const detailOf = (s, trace) => {
    if (s.key === 'len') return '2 bytes (little-endian)';
    if (s.key === 'data') return `${s.n} bytes = ${s.n / 4} palabras`;
    if (s.key === 'fill') { const f = trace.items[s.start].fill; return f ? `${f.count} bytes de la IMEM (0x13, 0, 0, 0 …)` : ''; }
    if (s.key === 'words') return `${s.n} bytes`;
    if (s.key === 'reply') return trace.items[s.start].tx.label;
    if (s.key === 'cmd') return '1 byte';
    return '';
  };
  const msStatus = (segs, cur, trace, done) => segs.map((s) => ({ label: s.label, detail: detailOf(s, trace), status: done || cur > s.end ? 'done' : cur >= s.start ? 'doing' : 'todo' }));

  function laneFor(trace, item) {
    if (item && item.tx) return trace.dumping ? ['dbgread', 'fsm', 'txfifo', 'tx', 'host'] : ['fsm', 'txfifo', 'tx', 'host'];
    return ['host', 'sync', 'rx', 'rxfifo', 'fsm', destFor(item)];
  }
  const where = (key, extra) => { const n = NODES[key]; return `<b>${nodeLink(key)}</b><span class="wh"> · ${extra || n.where}</span>`; };

  async function play(trace, env) {
    if (ctl) ctl.stop();
    const my = ctl = newCtl();
    const mode = getMode();
    const items = trace.items;
    const total = items.length;
    const cmdInfo = env.cmd;
    trace.dumping = trace.first === 0x44;
    const nBytesTotal = trace.bytes.length + trace.txBytes;
    const segs = milestonesOf(trace);
    const rxRoles = trace.roles;
    const txRoles = items.filter((i) => i.tx).map((i) => ({ b: i.tx.byte, role: i.tx.role, label: i.tx.label }));
    const bufs = { rx: [], tx: [] };
    const word = { bytes: [null, null, null, null], addr: null };
    let bytesDone = 0, slowCount = 0, lastPkt = 0, lastWordPkt = 0, cpuDone = false, curLine = null;
    const st = { fsm: 'IDLE' };
    const manual = mode === 'manual';
    const budget = mode === 'todo' || manual ? Infinity : mode === 'instantanea' ? 0 : SLOW_BUDGET;
    const setStatus = (id, s) => scene.setBlockStatus(id, s);
    const flagsToScene = (f) => { scene.setLeds({ halt: !!f.halt, rst: !!f.cpuReset, en: !!f.cpuEnable }); env.onFlags && env.onFlags(f); };
    const durFor = (k, it) => (it.tx && it.tx.role === 'reply' ? 1700 : k < 3 ? 2200 : k < 7 ? 1200 : k < 12 ? 650 : 380) * (manual ? 0.8 : 1);
    const fastDur = Math.max(2, Math.min(16, 3600 / Math.max(1, total)));

    const setPanelBase = (extra) => panel.set({ idle: false, cmd: cmdInfo, ...extra });
    const progressOf = (done, fast) => { env.onProgress && env.onProgress(done, nBytesTotal, fast); return { done, total: nBytesTotal, fast, label: `${done}/${nBytesTotal} bytes · ≈${bytesToMs(done).toFixed(1)} ms de UART${fast ? ' · avance rápido' : ''}` }; };

    panel.set({ ctrl: { playing: true, manual, waiting: false } });
    setPanelBase({ dir: 'rx', lane: laneFor(trace, items[0]), active: null, passed: [], transit: null, nodeVals: {}, wave: null, rxfsm: null, effect: null, word: null,
      chips: { roles: rxRoles, cur: -1, title: 'Trama que manda la PC' },
      fsm: { state: trace.startFlags.state, from: null, trans: null }, fifo: { rx: { n: 0, bytes: [] }, tx: { n: 0, bytes: [] } },
      milestones: msStatus(segs, -1, trace, false), progress: progressOf(0, false),
      html: { where: where('host'), how: `Voy a mandar <b>${trace.bytes.length}</b> byte${trace.bytes.length === 1 ? '' : 's'} por UART a 19200 baudios (≈${bytesToMs(trace.bytes.length).toFixed(1)} ms en total).` } });
    scene.clearPackets && scene.clearPackets();
    env.onLine && env.onLine(null);

    // ---------------------------------------------------------------- helpers de estado
    function wordFor(item) {
      if (!item.imem) return null;
      const lane = item.imem.addr & 3;
      if (lane === 0) word.bytes = [null, null, null, null];
      word.bytes[lane] = item.imem.data; word.addr = item.imem.addr & ~3;
      return { title: `Escribiendo la palabra ${item.imem.addr >> 2} de la IMEM`, addr: word.addr, bytes: [...word.bytes], cur: lane, note: lane === 3 ? 'Palabra completa: ya es una instrucción que el CPU podrá ejecutar.' : 'we_next se registra y la imem escribe este byte un ciclo después.' };
    }
    function dumpWordFor(item) {
      if (!item.tx || item.tx.role !== 'word') return null;
      const lane = item.tx.lane;
      if (lane === 0) word.bytes = [null, null, null, null];
      word.bytes[lane] = item.tx.byte;
      return { title: `Volcado: ${dumpWordName(item.tx.word)}`, addr: null, bytes: [...word.bytes], cur: lane, disasm: false, name: `palabra ${item.tx.word} de 86`, note: 'dbg_word se desplaza 8 bits por byte enviado (LSB primero).' };
    }
    function effectOf(item, hot) {
      const t = findTransition(item.from, item.to, item.rx ? item.rx.byte : null);
      const e = t && t.effect ? t.effect : null;
      const f = item.flags;
      return { cpu: e ? e.cpu : '—', imem: e ? e.imem : '—', uart: e ? e.uart : '—', hot, led: [['HALT', !!f.halt], ['RST', !!f.cpuReset], ['EN', !!f.cpuEnable]] };
    }
    function trackFifo(item, phase) {
      // phase: 'in' (byte recibido, antes de que la FSM lo lea), 'out'
      if (item.rx) {
        if (phase === 'in') { bufs.rx = [item.rx.byte]; } else bufs.rx = [];
      }
      return { rx: { n: bufs.rx.length, bytes: [...bufs.rx] }, tx: { n: Math.min(4, bufs.tx.length), bytes: bufs.tx.slice(-4) } };
    }
    function updateLine(item) {
      if (item.imem && item.rx && item.rx.role === 'data') { env.onLine && env.onLine(item.imem.addr >> 2); curLine = item.imem.addr >> 2; }
    }
    function pkt(wire, label, color, ms) { scene.sendPacket(wire, { color, label, durationMs: Math.max(120, ms) }); }
    function doCpu() { if (!cpuDone) { cpuDone = true; env.onCpu && env.onCpu(); } }

    // ---------------------------------------------------------------- item lento (todas las fases)
    async function slowItem(item, idx, k) {
      const D = durFor(k, item);
      const w = (f) => my.wait(Math.max(40, D * f));
      const pms = Math.min(900, Math.max(260, D * 0.34));
      const manualGate = async () => { if (!manual) return; panel.set({ ctrl: { playing: true, manual: true, waiting: true } }); await my.pause(); panel.set({ ctrl: { playing: true, manual: true, waiting: false } }); };
      const fl = item.flags;
      if (item.rx) {
        const r = item.rx, b = r.byte;
        const dest = destFor(item);
        const lane = ['host', 'sync', 'rx', 'rxfifo', 'fsm', dest];
        const nv = (o) => ({ host: `0x${hx2(b)}`, ...o });
        await manualGate();
        // 1. host
        setPanelBase({ dir: 'rx', lane, active: 'host', passed: [], transit: null, nodeVals: nv({}), chips: { roles: rxRoles, cur: r.idx, title: 'Trama que manda la PC' }, byte: { value: b }, wave: { byte: b, p: 0, dir: 'rx' }, rxfsm: { state: 'IDLE', s: 0, n: 0, shifted: 0 },
          fifo: trackFifo({ rx: null }, 'out'), fsm: { state: item.from, from: null, trans: null }, effect: null, word: null,
          html: { where: where('host'), how: hostText(item) }, progress: progressOf(bytesDone, false), milestones: msStatus(segs, idx, trace, false) });
        setStatus('uart', { text: `RX 0x${hx2(b)}`, tone: 'info' }); scene.highlightBlock('uart', C.orange);
        pkt('uart-debug', `0x${hx2(b)}`, C.orange, pms);
        await w(0.08);
        // 2. el byte viaja por el cable: forma de onda + FSM de uart_rx
        const sim = simulateByte(b);
        const nRx = sim.length;
        setPanelBase({ active: 'rx', transit: 'host>sync', html: { where: where('rx'), how: uartText(b) } });
        await my.anim(Math.max(120, D * 0.36), (p) => {
          const s = sim[Math.min(nRx - 1, Math.floor(p * (nRx - 1)))];
          const shifted = Math.max(0, Math.min(8, s.rxState === 'STOP' ? 8 : s.rxState === 'DATA' ? s.rxN + (s.rxS >= 15 ? 1 : 0) : 0));
          panel.set({ wave: { byte: b, p, dir: 'rx' }, rxfsm: { state: s.rxState, s: s.rxS, n: s.rxN, shifted, done: false } });
        });
        // 3. sincronizador (2FF)
        setPanelBase({ active: 'sync', transit: 'sync>rx', passed: ['host'], nodeVals: nv({ sync: '2 FF' }), html: { where: where('sync'), how: SYNC_TEXT } });
        await w(0.06);
        // 4. uart_rx termina el byte
        setPanelBase({ active: 'rx', transit: null, passed: ['host', 'sync'], nodeVals: nv({ sync: '2 FF', rx: `0x${hx2(b)}` }), wave: { byte: b, p: 1, dir: 'rx' }, rxfsm: { state: 'STOP', s: 15, n: 7, shifted: 8, done: true }, html: { where: where('rx'), how: RXFSM_TEXT } });
        await w(0.06);
        // 5. RX FIFO
        setPanelBase({ active: 'rxfifo', transit: 'rx>rxfifo', passed: ['host', 'sync', 'rx'], nodeVals: nv({ rx: `0x${hx2(b)}`, rxfifo: '1/4' }), fifo: trackFifo(item, 'in'), html: { where: where('rxfifo'), how: RXFIFO_TEXT } });
        await w(0.1);
        // 6. FSM de la debug unit
        const t = findTransition(item.from, item.to, b);
        const si = stateInfo(item.to);
        setPanelBase({ active: 'fsm', transit: 'rxfifo>fsm', passed: ['host', 'sync', 'rx', 'rxfifo'], nodeVals: nv({ rxfifo: '0/4', fsm: item.to }), fifo: trackFifo(item, 'out'), fsm: { state: item.to, from: item.from, trans: t },
          html: { where: where('fsm'), how: `<code>o_rx_read=1</code> saca el byte de la FIFO y la FSM, que estaba en <b>${item.from}</b>, ${item.from === item.to ? 'se queda en' : 'pasa a'} <b>${item.to}</b>.${si ? '' : ''}` } });
        setStatus('debug', { text: item.to, tone: 'info' }); scene.highlightBlock('debug', C.teal);
        flagsToScene(fl);
        await manualGate();
        await w(0.16);
        // 7. efecto
        const wd = wordFor(item);
        const hot = item.imem ? 'imem' : (item.cpuStep || item.cpuRst || dest === 'cpu') ? 'cpu' : item.tx ? 'uart' : null;
        const destVal = item.imem ? `0x${(item.imem.addr).toString(16).toUpperCase()}` : dest === 'cpu' ? (fl.cpuReset ? 'rst' : fl.cpuEnable ? 'en' : fl.run ? 'run' : '') : dest === 'regs' ? 'len' : '';
        setPanelBase({ active: dest, transit: 'fsm>' + dest, passed: ['host', 'sync', 'rx', 'rxfifo', 'fsm'], nodeVals: nv({ rxfifo: '0/4', fsm: item.to, [dest]: destVal }), effect: effectOf(item, hot), word: wd,
          html: { where: where(dest), how: effectHow(item, trace) } });
        updateLine(item);
        if (item.imem) {
          const a = item.imem.addr, lane3 = (a & 3) === 3;
          const lbl = lane3 ? `imem[0x${(a & ~3).toString(16).toUpperCase()}] ← 0x${hx8(wordValue(word.bytes))}` : `[0x${a.toString(16).toUpperCase()}] ← 0x${hx2(item.imem.data)}`;
          pkt('debug-imem', lbl, C.orange, pms);
          setStatus('imem', { text: `escribiendo 0x${a.toString(16).toUpperCase()}`, tone: 'warn' }); scene.highlightBlock('imem', C.orange);
        } else if (item.cpuStep || item.cpuRst || dest === 'cpu') {
          const lbl = fl.cpuReset ? 'rst=1' : fl.cpuEnable || fl.run ? 'en=1' : 'run=0';
          pkt('debug-pc', lbl, C.orange, pms); scene.highlightBlock('pc', C.orange);
        }
        if (item.cpuStep || item.cpuRst) doCpu();
        await w(0.2);
        scene.highlightBlock('imem', null); scene.highlightBlock('pc', null);
        scene.highlightBlock('uart', null);
        setStatus('uart', null);
      } else if (item.tx) {
        const b = item.tx.byte;
        const lane = trace.dumping ? ['dbgread', 'fsm', 'txfifo', 'tx', 'host'] : ['fsm', 'txfifo', 'tx', 'host'];
        const txIdx = item.tx.n;
        await manualGate();
        bufs.tx.push(b);
        const fifoNow = () => ({ rx: { n: 0, bytes: [] }, tx: { n: Math.min(4, bufs.tx.length), bytes: bufs.tx.slice(-4) } });
        const t = findTransition(item.from, item.to, null);
        const wd = dumpWordFor(item);
        setPanelBase({ dir: 'tx', lane, active: 'fsm', passed: trace.dumping ? ['dbgread'] : [], transit: trace.dumping ? 'dbgread>fsm' : null, nodeVals: { fsm: item.to, dbgread: item.tx.role === 'word' ? dumpWordName(item.tx.word) : '' },
          chips: { roles: txRoles, cur: txIdx, title: 'Respuesta de la FPGA', mask: true }, byte: { value: b }, wave: null, rxfsm: null, fifo: { rx: { n: 0, bytes: [] }, tx: { n: Math.max(0, Math.min(4, bufs.tx.length - 1)), bytes: bufs.tx.slice(-5, -1) } },
          fsm: { state: item.to, from: item.from, trans: t, descState: item.from }, effect: effectOf(item, 'uart'), word: wd,
          html: { where: where('fsm'), how: txHow(item, trace) }, progress: progressOf(bytesDone, false), milestones: msStatus(segs, idx, trace, false) });
        setStatus('debug', { text: item.to, tone: 'info' }); scene.highlightBlock('debug', C.teal); flagsToScene(fl);
        await w(0.24);
        setPanelBase({ active: 'txfifo', transit: 'fsm>txfifo', passed: ['fsm'], nodeVals: { fsm: item.to, txfifo: `${Math.min(4, bufs.tx.length)}/4` }, fifo: fifoNow(), html: { where: where('txfifo'), how: 'La FSM hace <code>o_tx_write=1</code>: el byte entra en la <b>TX FIFO</b>. La FIFO se vacía sola cada vez que <code>uart_tx</code> queda libre; si se llena (<code>tx_full=1</code>), la FSM espera en el mismo estado.' } });
        await w(0.14);
        const sim = simulateByte(b);
        setPanelBase({ active: 'tx', transit: 'txfifo>tx', passed: ['fsm', 'txfifo'], nodeVals: { tx: `0x${hx2(b)}` }, wave: { byte: b, p: 0, dir: 'tx' },
          html: { where: where('tx'), how: `<code>uart_tx</code> serializa el byte: start, 8 bits LSB primero y stop, a 19200 baudios (≈520 µs por byte).` } });
        setStatus('uart', { text: `TX 0x${hx2(b)}`, tone: 'info' }); scene.highlightBlock('uart', C.purple);
        await my.anim(Math.max(120, D * 0.4), (p) => {
          const s = sim[Math.min(sim.length - 1, Math.floor(p * (sim.length - 1)))];
          panel.set({ wave: { byte: b, p, dir: 'tx' }, rxfsm: { state: s.txState, s: s.s, n: s.n, shifted: s.txState === 'DATA' ? s.n : s.txState === 'STOP' ? 8 : 0, done: p >= 1 } });
        });
        setPanelBase({ active: 'host', transit: 'tx>host', passed: ['fsm', 'txfifo', 'tx'], nodeVals: { host: `0x${hx2(b)}` }, html: { where: where('host'), how: txHostHow(item, trace) } });
        pkt('debug-uart', item.tx.role === 'word' ? `${dumpWordName(item.tx.word)}.${item.tx.lane}=${hx2(b)}` : `0x${hx2(b)}${item.tx.role === 'reply' ? ` '${asc(b)}'` : ''}`, C.purple, pms);
        await w(0.2);
        scene.highlightBlock('uart', null); setStatus('uart', null);
      } else {
        // transición sin bytes (p. ej. DUMP_ADDR, DUMP_LATCH, pulso de step)
        const t = findTransition(item.from, item.to, null);
        await manualGate();
        const nde = item.cpuStep || item.cpuRst ? 'cpu' : 'fsm';
        const lane = laneFor(trace, trace.dumping ? { tx: true } : item);
        setPanelBase({ dir: item.cpuStep || item.cpuRst ? 'rx' : panelDir(trace, item), lane: item.cpuStep || item.cpuRst ? ['fsm', 'cpu'] : lane, active: nde, passed: nde === 'cpu' ? ['fsm'] : [], transit: nde === 'cpu' ? 'fsm>cpu' : null, nodeVals: { fsm: item.to, cpu: item.flags.cpuReset ? 'rst' : item.flags.cpuEnable ? 'en' : '' },
          fsm: { state: item.to, from: item.from, trans: t, descState: item.from }, effect: effectOf(item, nde === 'cpu' ? 'cpu' : null), word: null,
          html: { where: where(nde), how: fsmOnlyHow(item, trace) } });
        setStatus('debug', { text: item.to, tone: 'info' }); scene.highlightBlock('debug', C.teal); flagsToScene(fl);
        if (item.cpuStep || item.cpuRst) { pkt('debug-pc', item.cpuRst ? 'rst' : 'en=1', C.orange, 600); scene.highlightBlock('pc', C.orange); doCpu(); }
        await w(0.5);
        scene.highlightBlock('pc', null);
      }
    }

    function panelDir(trace2, item) { return trace2.dumping || (item && item.tx) ? 'tx' : 'rx'; }

    // ---------------------------------------------------------------- item rápido
    let lastPanel = 0, fastNoted = false;
    function fastItem(item, idx) {
      if (!fastNoted) { fastNoted = true; panel.set({ html: { where: `<b>Avance rápido</b><span class="wh"> · el resto de los bytes</span>`, how: 'Cada byte repite el mismo recorrido (cable → 2FF → RX → FIFO → FSM → destino). Se acelera para no esperar ~100 ms de UART real; elegí <b>Todo animado</b> o <b>Paso a paso</b> para verlos uno por uno.' } }); }
      const fl = item.flags;
      st.fsm = item.to;
      if (item.rx) {
        updateLine(item);
        if (item.imem) {
          const lane = item.imem.addr & 3;
          if (lane === 0) word.bytes = [null, null, null, null];
          word.bytes[lane] = item.imem.data; word.addr = item.imem.addr & ~3;
          const now = performance.now();
          if (lane === 3 && now - lastWordPkt > 90) { lastWordPkt = now; pkt('uart-debug', `0x${hx2(item.rx.byte)}`, C.orange, 220); pkt('debug-imem', `imem[0x${word.addr.toString(16).toUpperCase()}] ← 0x${hx8(wordValue(word.bytes))}`, C.orange, 320); setStatus('imem', { text: `escribiendo 0x${word.addr.toString(16).toUpperCase()}`, tone: 'warn' }); }
        }
      } else if (item.tx) {
        const lane = item.tx.lane;
        if (item.tx.role === 'word') { if (lane === 0) word.bytes = [null, null, null, null]; word.bytes[lane] = item.tx.byte; }
        bufs.tx.push(item.tx.byte);
        const now = performance.now();
        if (item.tx.role === 'word' && lane === 3 && now - lastWordPkt > 90) { lastWordPkt = now; pkt('debug-uart', `${dumpWordName(item.tx.word)}=${hx8(wordValue(word.bytes))}`, C.purple, 300); }
      } else if (item.kind === 'fill') {
        /* se maneja en el camino lento */
      }
      if (item.cpuStep || item.cpuRst) doCpu();
      const now = performance.now();
      if (now - lastPanel > 30) {
        lastPanel = now;
        const isTx = !!item.tx;
        const si = item.rx || item.tx;
        panel.set({ progress: progressOf(bytesDone, true), milestones: msStatus(segs, idx, trace, false), dir: isTx ? 'tx' : 'rx',
          chips: isTx ? { roles: txRoles, cur: item.tx.n, title: 'Respuesta de la FPGA', mask: true } : item.rx ? { roles: rxRoles, cur: item.rx.idx, title: 'Trama que manda la PC' } : undefined,
          fsm: { state: item.to, from: item.from, descState: item.tx || item.to === 'IDLE' ? item.from : item.to, trans: findTransition(item.from, item.to, item.rx ? item.rx.byte : null) }, byte: si ? { value: si.byte } : undefined,
          word: item.imem ? { title: `Escribiendo la palabra ${item.imem.addr >> 2} de la IMEM`, addr: word.addr, bytes: [...word.bytes], cur: item.imem.addr & 3 } : item.tx && item.tx.role === 'word' ? { title: `Volcado: ${dumpWordName(item.tx.word)}`, addr: null, bytes: [...word.bytes], cur: item.tx.lane, disasm: false, name: `palabra ${item.tx.word} de 86` } : undefined,
          fifo: { rx: { n: 0, bytes: [] }, tx: { n: Math.min(4, bufs.tx.length), bytes: bufs.tx.slice(-4) } },
          nodeVals: { fsm: item.to }, wave: null, rxfsm: null, active: 'fsm', transit: null, passed: [] });
        setStatus('debug', { text: item.to, tone: 'info' }); flagsToScene(fl);
      }
    }

    // fill: una sola animación que representa miles de ciclos
    async function fillItem(item, idx) {
      const f = item.fill;
      const t = findTransition('LOAD_FILL', 'LOAD_FILL', null);
      const instant = mode === 'instantanea' || ctl !== my;
      setPanelBase({ dir: 'rx', lane: ['fsm', 'imem'], active: 'imem', passed: ['fsm'], transit: 'fsm>imem', nodeVals: { fsm: 'LOAD_FILL', imem: `0x${f.from.toString(16).toUpperCase()}…` }, fsm: { state: 'LOAD_FILL', from: 'LOAD_DATA', trans: t },
        wave: null, rxfsm: null, byte: null, word: { title: `Relleno: ${f.count} bytes de NOP`, addr: f.from & ~3, bytes: [0x13, 0, 0, 0], cur: 0, note: `Cada palabra que el programa no cubre se rellena con 0x00000013 (nop = addi x0, x0, 0). Son ${f.count} escrituras de 1 byte, una por ciclo de reloj (≈${(f.count * 0.02).toFixed(0)} µs).` },
        effect: { cpu: 'Sigue en reset; al salir de LOAD_FILL queda detenido con PC=0.', imem: `Escribe 0x13,0x00,0x00,0x00 repetido en los bytes 0x${f.from.toString(16).toUpperCase()} a 0x${f.to.toString(16).toUpperCase()}.`, uart: 'No transmite todavía: deja lista la respuesta K.', hot: 'imem', led: [['HALT', false], ['RST', true], ['EN', false]] },
        html: { where: where('imem'), how: `Terminada la carga, la FSM entra en <b>LOAD_FILL</b>: escribe NOPs en toda la IMEM que el programa no ocupa, para que un salto fuera del código no ejecute basura.` }, milestones: msStatus(segs, idx, trace, false) });
      setStatus('debug', { text: 'LOAD_FILL', tone: 'warn' }); setStatus('imem', { text: `NOP ×${f.count}`, tone: 'warn' }); flagsToScene(item.flags);
      scene.highlightBlock('imem', C.orange);
      for (let i = 0; i < 4; i++) { pkt('debug-imem', `NOP @0x${(f.from + i * 4).toString(16).toUpperCase()}`, C.grey, 420); if (!instant) await my.wait(180); }
      if (!instant) await my.wait(500);
      scene.highlightBlock('imem', null); setStatus('imem', null);
    }

    // ---------------------------------------------------------------- bucle principal
    try {
      if (mode === 'instantanea') throw SKIPPED;
      let i = 0;
      while (i < total) {
        const item = items[i];
        const isByte = !!(item.rx || item.tx);
        const important = item.kind === 'fill' || (item.tx && item.tx.role === 'reply') || item.cpuStep || item.cpuRst;
        const slow = (isByte && slowCount < budget) || (!isByte && (important || slowCount < budget)) || (item.tx && item.tx.role === 'reply');
        if (item.kind === 'fill') { await fillItem(item, i); }
        else if (slow) { await slowItem(item, i, slowCount); if (isByte) slowCount++; }
        else {
          // tanda rápida
          const t0 = performance.now(); let j = i, n = 0;
          const run = [];
          for (let q = i; q < total; q++) {
            const it = items[q];
            const b = !!(it.rx || it.tx);
            const imp = it.kind === 'fill' || (it.tx && it.tx.role === 'reply') || it.cpuStep || it.cpuRst;
            if (imp || (budget === Infinity)) break;
            run.push(q);
          }
          while (n < run.length) {
            const target = Math.min(run.length, Math.floor((performance.now() - t0) / fastDur) + 1);
            while (n < target) { const q = run[n++]; const it = items[q]; if (it.rx || it.tx) bytesDone++; fastItem(it, q); }
            await frame(); if (my.skipped) throw SKIPPED;
          }
          i = run.length ? run[run.length - 1] + 1 : i + 1;
          continue;
        }
        if (isByte) bytesDone++;
        i++;
      }
    } catch (e) {
      if (e !== SKIPPED) throw e;
    }
    // ---------------------------------------------------------------- estado final
    if (ctl === my) {
      const last = items[items.length - 1];
      const dumpWords = items.filter((x) => x.tx && x.tx.role === 'word').length / 4;
      setPanelBase({ dir: trace.dumping ? 'tx' : 'rx', lane: trace.dumping ? ['dbgread', 'fsm', 'txfifo', 'tx', 'host'] : last && last.tx ? ['fsm', 'txfifo', 'tx', 'host'] : laneFor(trace, items.find((x) => x.rx)), active: null, passed: [], transit: null, wave: null, rxfsm: null,
        chips: trace.txBytes && !trace.bytes.length ? { roles: txRoles, cur: txRoles.length, title: 'Respuesta de la FPGA', mask: true } : { roles: rxRoles, cur: rxRoles.length, title: 'Trama que mandó la PC' },
        fsm: { state: trace.endFlags.state, from: last ? last.from : null, trans: null }, fifo: { rx: { n: 0, bytes: [] }, tx: { n: 0, bytes: [] } },
        milestones: msStatus(segs, total, trace, true), progress: { done: nBytesTotal, total: nBytesTotal, fast: false, label: `${nBytesTotal} bytes · ≈${bytesToMs(nBytesTotal).toFixed(1)} ms de UART a 19200 baudios` },
        html: { where: `<b>Listo</b><span class="wh"> · la debug unit volvió a IDLE</span>`, how: summaryHtml(trace, dumpWords) }, ctrl: { playing: false, manual, waiting: false } });
      panel.flush && panel.flush();
      for (const id of ['uart', 'debug', 'imem']) setStatus(id, null);
      for (const id of ['uart', 'debug', 'imem', 'pc']) scene.highlightBlock(id, null);
      env.onLine && env.onLine(null);
      doCpu();
      env.finalize && env.finalize();
      ctl = null;
    }
  }

  return {
    play,
    skip() { if (ctl) ctl.stop(); },
    next() { if (ctl && ctl.gate) { const g = ctl.gate; ctl.gate = null; g(); } },
    get playing() { return !!ctl; },
  };
}

const wordValue = (b) => ((b[0] | 0) | ((b[1] | 0) << 8) | ((b[2] | 0) << 16) | ((b[3] | 0) << 24)) >>> 0;

function effectHow(item, trace) {
  const r = item.rx;
  const cur = (k) => k;
  if (item.imem) {
    const a = item.imem.addr;
    return `<code>o_imem_load</code> guarda dirección y dato; el flip-flop <code>imem_we</code> sube y, un ciclo después, la <b>imem</b> escribe el byte <code>0x${hx2(item.imem.data)}</code> en el byte <b>${a & 3}</b> de la palabra <b>${a >> 2}</b> (dirección <code>0x${a.toString(16).toUpperCase()}</code>). ${link('pipeline/1_fetch/imem.v', 'wr_en', 'wr_en / wr_addr / wr_data')}. El CPU sigue en reset (<code>loading=1</code>), así que no ejecuta instrucciones a medio escribir.`;
  }
  if (r && r.role === 'cmd') {
    const m = { L: 'La FSM pasa a <b>LOAD_LEN_LO</b> y <code>loading</code> pone el CPU en reset durante toda la carga (<code>o_cpu_reset=1</code>, LED RST).', S: 'La FSM levanta <code>step</code> por un ciclo: <code>o_cpu_enable=1</code> deja avanzar al CPU <b>un solo ciclo de reloj</b>; contesta K (o H si ya hizo halt).', R: 'Se activa <code>run</code>: <code>o_cpu_enable</code> queda en 1 y el CPU avanza un ciclo por cada flanco del reloj hasta un halt o un comando P.', P: 'Se baja <code>run</code>: <code>o_cpu_enable=0</code>. El estado del CPU queda congelado, no se pierde nada.', X: 'Pulso <code>cpu_rst</code> de un ciclo: el PC vuelve a 0 y los latches se vacían. La IMEM y la DMEM no se tocan.', D: 'La FSM empieza el volcado: <code>dumping=1</code> congela el CPU (enable=0) y manda primero la cuenta y después las 86 palabras.' };
    return m[r.cmd] || 'La FSM contesta <b>?</b> (comando desconocido).';
  }
  if (r && (r.role === 'len_lo' || r.role === 'len_hi')) return r.role === 'len_lo' ? `<code>o_len_lo_load</code> guarda el byte en el registro de longitud. Todavía no se escribe nada en la imem.` : `<code>o_len_hi_load</code> completa <b>n</b>; <code>o_cnt_clear</code> pone <code>byte_cnt</code> en 0 y <code>o_ovf_load</code> calcula si 4·n bytes entran en la imem (1 KB).`;
  return item.cpuStep ? 'El CPU avanzó un ciclo.' : '';
}
function txHow(item, trace) {
  const t = item.tx;
  if (t.role === 'reply') return `La FSM está en <b>${item.from}</b> y encola la respuesta <b>${asc(t.byte)}</b> (<code>0x${hx2(t.byte)}</code>): ${t.label}.`;
  if (t.role === 'cnt_lo') return 'DUMP_CNT_LO: primero la <b>cuenta</b> de palabras que van a venir (86 = 0x0056), byte bajo.';
  if (t.role === 'cnt_hi') return 'DUMP_CNT_HI: byte alto de la cuenta (0x00). Con eso la PC sabe cuántos bytes esperar: 2 + 4·86 = 346.';
  return `DUMP_BYTE: byte ${t.lane} de la palabra ${t.word} (<b>${dumpWordName(t.word)}</b>). Se manda LSB primero y <code>dbg_word</code> se desplaza 8 bits.`;
}
function txHostHow(item) {
  const t = item.tx;
  if (t.role === 'reply') return `La PC recibe <b>${asc(t.byte)}</b>: ${t.label}.`;
  return 'La PC va guardando los bytes; al final decodifica las 86 palabras (ver pestaña Volcado).';
}
function fsmOnlyHow(item, trace) {
  if (item.cpuStep) return 'El CPU hace un ciclo de reloj gracias a <code>o_cpu_enable</code>.';
  if (item.cpuRst) return 'Pulso de reset al CPU (<code>o_cpu_reset</code>): PC=0 y latches vacíos.';
  if (item.from === 'DUMP_ADDR') return 'DUMP_ADDR: un ciclo con <code>dbg_addr</code> estable para que el CPU responda la palabra pedida.';
  if (item.from === 'DUMP_LATCH') return 'DUMP_LATCH: <code>o_word_load</code> captura la palabra en <code>dbg_word</code>; el índice de byte vuelve a 0.';
  if (item.to === 'IDLE') return 'La FSM vuelve a IDLE: está lista para el próximo comando.';
  return `La FSM pasa de <b>${item.from}</b> a <b>${item.to}</b>.`;
}
function summaryHtml(trace, dumpWords) {
  const n = trace.bytes.length;
  if (trace.first === 0x4c) {
    const nWords = (trace.bytes[1] | (trace.bytes[2] << 8));
    const fill = trace.items.find((i) => i.kind === 'fill');
    return `Se escribieron <b>${nWords}</b> instrucciones (${4 * nWords} bytes) en la IMEM${fill ? ` y <b>${fill.fill.count}</b> bytes de NOP de relleno` : ''}. El CPU queda en <code>PC=0</code>, detenido, y la FPGA contestó <b>${trace.tx.map((b) => asc(b)).join('')}</b>. Podés correr <b>S</b> (un paso) o <b>R</b> (continuo).`;
  }
  if (trace.first === 0x44) return `La FPGA mandó <b>${trace.tx.length}</b> bytes (${dumpWords * 4 + 2} esperados) ≈ ${bytesToMs(trace.tx.length).toFixed(0)} ms a 19200 baudios. La PC los decodifica en la pestaña <b>Volcado</b>.`;
  if (trace.first === 0x53) return `El CPU avanzó <b>${trace.cyclesRun}</b> ciclo y la FPGA contestó <b>${trace.tx.map((b) => asc(b)).join('')}</b>.`;
  if (trace.first === 0x52) return `El modo continuo quedó activo (<code>run=1</code>): el CPU avanza ciclo a ciclo sin parar hasta un halt o un P. Contestó <b>${trace.tx.map((b) => asc(b)).join('')}</b>.`;
  if (trace.first === 0x50) return 'El CPU quedó pausado (<code>run=0</code>); el estado interno se conserva.';
  if (trace.first === 0x58) return 'El CPU volvió a PC=0 con los latches vacíos. La IMEM y la DMEM no se tocan.';
  return `La FPGA contestó <b>${trace.tx.map((b) => asc(b)).join('') || '—'}</b>.`;
}
export { summaryHtml };
