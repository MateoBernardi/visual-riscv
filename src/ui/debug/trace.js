// trace.js - ejecuta un comando de la debug unit y devuelve una TRAZA ordenada de lo que pasó adentro.
// Sin DOM: la usan el panel "Qué pasa", la animación 3D y el loader (uartLoader.js).
//
// La traza se calcula de una vez (el DebugUnit y el Pipeline quedan en el estado final) y después
// se reproduce con calma en la pantalla. Cada item de `trace.items` es un tick "interesante" de la FSM:
//   { kind:'rx'|'fsm'|'tx'|'fill', from, to, rx:{byte,idx,role}|null, tx:{byte,role,n}|null,
//     imem:{addr,data}|null, fill:{from,to,count}|null, cycles, flags:{...}, t }
// Los ticks de espera (self-loops sin efecto) se descartan: a 19200 baudios son >99,9 % del tiempo.
import { bytesToMs, STATES } from '../../sim/debugUnit.js';

export const CMD = { L: 0x4c, S: 0x53, R: 0x52, P: 0x50, X: 0x58, D: 0x44 };
export const CMD_NAMES = {
  0x4c: { key: 'L', title: 'Cargar programa', verb: 'Cargar', short: 'Cargar' },
  0x53: { key: 'S', title: 'Un paso de reloj', verb: 'Paso', short: 'Paso' },
  0x52: { key: 'R', title: 'Ejecutar en continuo', verb: 'Ejecutar', short: 'Ejecutar' },
  0x50: { key: 'P', title: 'Pausa', verb: 'Pausa', short: 'Pausa' },
  0x58: { key: 'X', title: 'Reset del CPU', verb: 'Reset', short: 'Reset' },
  0x44: { key: 'D', title: 'Volcado de estado', verb: 'Volcado', short: 'Volcado' },
};
export const RESPONSES = { 0x4b: 'K (ok)', 0x45: 'E (error: no entra en la imem)', 0x48: 'H (el CPU está en HALT)', 0x3f: '? (comando desconocido)' };
// estados donde la FSM espera un byte del host (el resto avanza sola)
const WAITING = new Set(['IDLE', 'LOAD_LEN_LO', 'LOAD_LEN_HI', 'LOAD_DATA']);
const HEX2 = (n) => (n & 0xff).toString(16).toUpperCase().padStart(2, '0');

/**
 * Rol de cada byte que manda el host.
 * Devuelve [{ b, role: 'cmd'|'len_lo'|'len_hi'|'data'|'unknown', cmd?, word?, lane?, label }]
 */
export function classifyHostBytes(bytes) {
  const out = [];
  let st = 'cmd', n = 0, k = 0;
  for (const b0 of bytes) {
    const b = b0 & 0xff;
    let r;
    if (st === 'cmd') {
      const info = CMD_NAMES[b];
      r = { b, role: info ? 'cmd' : 'unknown', cmd: info ? info.key : '?', label: info ? `comando ${info.key}` : 'byte desconocido' };
      if (b === CMD.L) st = 'len_lo';
    } else if (st === 'len_lo') { n = b; r = { b, role: 'len_lo', label: 'n (byte bajo)' }; st = 'len_hi'; }
    else if (st === 'len_hi') {
      n |= b << 8; r = { b, role: 'len_hi', label: 'n (byte alto)' }; k = 0;
      st = n === 0 ? 'cmd' : 'data';
    } else {
      r = { b, role: 'data', word: k >> 2, lane: k & 3, label: `palabra ${k >> 2} · byte ${k & 3}` };
      if (++k >= 4 * n) st = 'cmd';
    }
    out.push(r);
  }
  return out;
}

export function describeDumpByte(n) {
  if (n === 0) return { role: 'cnt_lo', label: 'cuenta (byte bajo)' };
  if (n === 1) return { role: 'cnt_hi', label: 'cuenta (byte alto)' };
  const k = n - 2;
  return { role: 'word', word: k >> 2, lane: k & 3, label: `palabra ${k >> 2} · byte ${k & 3}` };
}

const flagsOf = (dbg) => ({ ...dbg.leds, run: dbg.run, step: dbg.step, loading: dbg.loading, dumping: dbg.dumping, cpuEnable: dbg.cpuEnable, cpuReset: dbg.cpuReset, state: dbg.state, stateCode: STATES.indexOf(dbg.state) });

/**
 * Le manda `bytes` a la debug unit (rxByte + ticks hasta que la FSM los consume) y registra todo.
 * Deja dbg/pipeline en el estado final. Las respuestas salen por dbg.onTx como siempre (se las deja
 * pasar), además de quedar en trace.tx.
 */
export function runTrace(dbg, bytes, { maxTicks = 400000 } = {}) {
  const pipe = dbg.pipe;
  bytes = Array.from(bytes, (b) => b & 0xff);
  const roles = classifyHostBytes(bytes);
  const items = [];
  const txAll = [];
  const trace = { bytes, roles, items, tx: txAll, cmd: roles.length ? roles[0].cmd || null : null, first: bytes[0], pre: null, post: null, ticks: 0, cyclesRun: 0, txBytes: 0 };
  const startCycle = pipe.cycle;
  const startState = flagsOf(dbg);
  trace.startFlags = startState;
  let txState = null;
  const cb = (b) => { txState.push(b); };
  dbg.txCbs.push(cb);
  let rxIdx = -1; // índice del byte del host que se está consumiendo
  let dumpN = 0, tNow = 0;
  let curFill = null;
  const isDump = bytes.includes(CMD.D) && bytes[0] === CMD.D;
  let tickNo = 0;

  const doTick = () => {
    const from = dbg.state, rxBefore = dbg.rx.length, cycBefore = pipe.cycle, headByte = rxBefore ? dbg.rx[0] : null;
    const stepBefore = dbg.step, rstPulse = !!dbg._cpuRst;
    txState = [];
    dbg.tick(1); tickNo++;
    const to = dbg.state;
    const consumed = rxBefore > dbg.rx.length;
    const imem = dbg._imemWe ? { addr: dbg._imemAddr, data: dbg._imemData } : null; // escritura que esta FSM acaba de programar
    const tx = txState.length ? txState[0] : null;
    const cycles = pipe.cycle >= cycBefore ? pipe.cycle - cycBefore : 0;
    if (imem && from === 'LOAD_FILL') {
      if (curFill) { curFill.fill.to = imem.addr; curFill.fill.count++; }
      else {
        curFill = { kind: 'fill', from, to, rx: null, tx: null, imem: null, fill: { from: imem.addr, to: imem.addr, count: 1 }, cycles: 0, flags: flagsOf(dbg), t: tNow };
        items.push(curFill);
      }
      return;
    }
    let ev = null;
    if (consumed) ev = 'rx'; else if (tx != null) ev = 'tx'; else if (from !== to || imem || (stepBefore && cycles > 0) || rstPulse) ev = 'fsm';
    if (!ev) return;
    curFill = null;
    let txInfo = null;
    if (tx != null) {
      if (isDump) { txInfo = { byte: tx, n: dumpN, ...describeDumpByte(dumpN) }; dumpN++; }
      else txInfo = { byte: tx, n: txAll.length, role: 'reply', label: RESPONSES[tx] || 'respuesta' };
      txAll.push(tx); trace.txBytes++;
    }
    const rx = consumed ? { byte: headByte, idx: rxIdx, ...(roles[rxIdx] || {}) } : null;
    items.push({ kind: ev, from, to, rx, tx: txInfo, imem, fill: null, cycles, cpuStep: stepBefore && cycles > 0, cpuRst: rstPulse, flags: flagsOf(dbg), t: tNow, tick: tickNo });
  };

  try {
    for (let i = 0; i < bytes.length; i++) {
      rxIdx = i;
      tNow = bytesToMs(i + 1);
      dbg.rxByte(bytes[i]);
      let guard = 0;
      while (dbg.rx.length && guard++ < 64) doTick();
      // la FSM sigue sola si quedó en un estado que no espera bytes
      guard = 0;
      while ((!WAITING.has(dbg.state) || dbg.step || dbg._cpuRst || dbg._imemWe) && guard++ < maxTicks) { rxIdx = -1; doTick(); }
    }
    let g = 0;
    while (!dbg.idle && g++ < maxTicks) doTick();
    doTick(); // aplica una escritura pendiente de imem
  } finally {
    const k = dbg.txCbs.indexOf(cb);
    if (k >= 0) dbg.txCbs.splice(k, 1);
  }
  // el último fill se cierra
  trace.ticks = tickNo;
  trace.cyclesRun = Math.max(0, pipe.cycle - startCycle);
  trace.endFlags = flagsOf(dbg);
  trace.hostMs = bytesToMs(bytes.length);
  trace.txMs = bytesToMs(trace.txBytes);
  return trace;
}

export function wordLabel(addr, word) {
  return `imem[0x${(addr & ~3).toString(16).toUpperCase().padStart(2, '0')}] ← 0x${(word >>> 0).toString(16).toUpperCase().padStart(8, '0')}`;
}
export { HEX2 };
