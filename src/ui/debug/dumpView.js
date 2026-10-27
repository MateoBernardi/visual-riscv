// dumpView.js - registro de tráfico UART y volcado decodificado (respuesta del comando D).
// createResultViews(logRoot, dumpRoot) -> { log({dir, bytes, meaning}), clearLog(), showDump(decoded), clearDump(), counts }
import { h, clear, hex8, hex32, ABI } from '../dom.js';
import { disasm } from '../../sim/disasm.js';
import { bytesToMs, BAUD } from '../../sim/debugUnit.js';

const ascii = (bytes) => bytes.map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '·')).join('');
const ARROW_TX = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h14M13 6l6 6-6 6"/></svg>';
const ARROW_RX = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12H6M11 6l-6 6 6 6"/></svg>';

export function createResultViews(logRoot, dumpRoot) {
  // ---------------------------------------------------------------- log
  let n = 0, totalBytes = 0;
  const body = h('div', { class: 'lg-body', role: 'log' });
  const sum = h('span', { class: 'lg-sum mono' }, '0 bytes · 0 ms');
  const empty = () => h('div', { class: 'lg-empty' }, 'Todavía no se mandó nada. Probá ', h('b', {}, 'L Cargar'), ' o ', h('b', {}, 'S Paso'), '.');
  body.append(empty());
  logRoot.append(h('div', { class: 'lg' }, h('div', { class: 'lg-head' }, h('span', { class: 'xp-h' }, 'Tráfico UART'), sum, h('button', { class: 'xp-btn ghost', onclick: () => clearLog() }, 'Limpiar')), body));
  function log({ dir = 'TX', bytes = [], meaning = '' }) {
    if (!n) clear(body);
    n++; totalBytes += bytes.length;
    const tx = dir === 'TX';
    const shown = bytes.slice(0, 10).map(hex8).join(' ') + (bytes.length > 10 ? ` … +${bytes.length - 10}` : '');
    body.append(h('div', { class: 'lg-row ' + (tx ? 'tx' : 'rx') },
      h('span', { class: 'lg-dir', title: tx ? 'PC → FPGA' : 'FPGA → PC' }, h('span', { html: tx ? ARROW_TX : ARROW_RX }), tx ? 'TX' : 'RX'),
      h('span', { class: 'lg-hx mono' }, shown), h('span', { class: 'lg-as mono' }, ascii(bytes.slice(0, 10))),
      h('span', { class: 'lg-mn' }, meaning, h('em', {}, ` ${bytes.length} B · ${bytesToMs(bytes.length).toFixed(bytes.length > 20 ? 0 : 1)} ms`))));
    while (body.children.length > 200) body.firstChild.remove();
    body.scrollTop = body.scrollHeight;
    sum.textContent = `${totalBytes} bytes · ≈${bytesToMs(totalBytes).toFixed(0)} ms @ ${BAUD}`;
  }
  function clearLog() { n = 0; totalBytes = 0; clear(body).append(empty()); sum.textContent = '0 bytes · 0 ms'; }

  // ---------------------------------------------------------------- volcado
  let prev = null;
  const dumpBody = h('div', { class: 'dp-body' });
  const dumpEmpty = () => h('div', { class: 'lg-empty' }, 'Mandá ', h('b', {}, 'D Volcado'), ' para pedirle a la FPGA el estado del pipeline: 86 palabras (346 bytes ≈ 180 ms), que acá se decodifican.');
  dumpBody.append(dumpEmpty());
  dumpRoot.append(h('div', { class: 'dp' }, dumpBody));
  function clearDump() { prev = null; clear(dumpBody).append(dumpEmpty()); }

  function showDump(d, meta = {}) {
    const x = d.id_ex, e = d.ex, m = d.ex_mem, w = d.mem_wb;
    const flags = ['stall', 'flush_if_id', 'flush_id_ex', 'redirect', 'taken', 'halting'].filter((k) => e[k]);
    const stages = [
      ['IF', `pc = ${hex32(d.pc)}`],
      ['ID', `${disasm(d.if_id.inst, d.if_id.pc)}`, `pc ${hex32(d.if_id.pc)}`],
      ['EX', `${x.alu_op}  x${x.rs1}, x${x.rs2} → x${x.rd}`, `A=${hex32(e.alu_a)} B=${hex32(e.alu_b)} → ${hex32(e.alu_out)} · fwd A:${e.fwd_a} B:${e.fwd_b}`],
      ['MEM', `rd=x${m.rd} · alu ${hex32(m.alu_out)}`, m.mem_read ? `lee ${hex32(m.dmem_rdata)}` : m.mem_write ? `escribe ${hex32(m.rdata2)}` : 'sin acceso a memoria'],
      ['WB', `x${w.rd} ← ${hex32(w.result)}`, w.reg_write ? 'escribe en el regfile' : 'sin escritura'],
    ];
    const cell = (label, v, pv, cls = '') => h('div', { class: 'dp-c ' + cls + ((v >>> 0) === 0 ? ' zero' : '') + (pv != null && (pv >>> 0) !== (v >>> 0) ? ' chg' : '') }, h('span', { class: 'dp-k' }, label), h('span', { class: 'dp-v mono' }, hex32(v)));
    clear(dumpBody).append(
      h('div', { class: 'dp-meta' }, h('b', {}, 'Volcado decodificado'), h('span', { class: 'muted' }, ` ${meta.bytes || 346} bytes · 86 palabras`), flags.length ? h('span', { class: 'dp-flags' }, flags.map((f) => h('i', {}, f))) : null),
      h('div', { class: 'dp-stages' }, stages.map(([n2, a, b]) => h('div', { class: 'dp-st', 'data-s': n2 }, h('b', {}, n2), h('span', { class: 'mono' }, a), b ? h('small', { class: 'mono' }, b) : null))),
      h('div', { class: 'dp-h' }, h('span', { class: 'xp-h' }, 'Registros'), h('span', { class: 'dp-note' }, 'en naranja: cambió desde el volcado anterior')),
      h('div', { class: 'dp-grid' }, Array.from(d.regs, (v, i) => cell(`x${i} ${ABI[i]}`, v, prev ? prev.regs[i] : null))),
      h('div', { class: 'dp-h' }, h('span', { class: 'xp-h' }, 'DMEM (palabras 0..31)')),
      h('div', { class: 'dp-grid' }, Array.from(d.dmem, (v, i) => cell(`[${i}] 0x${(i * 4).toString(16).padStart(2, '0')}`, v, prev ? prev.dmem[i] : null, 'mem'))));
    prev = { regs: Array.from(d.regs), dmem: Array.from(d.dmem) };
  }
  return { log, clearLog, showDump, clearDump };
}
