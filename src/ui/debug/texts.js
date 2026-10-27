// texts.js - textos y enlaces del panel "Qué pasa con este comando" (todo en español, HTML confiable).
import { githubUrl } from '../../content/repo.js';
import { VIEWS } from '../../content/modules/index.js';
import { CMD_NAMES, RESPONSES } from './trace.js';

export const hx2 = (n) => (n & 0xff).toString(16).toUpperCase().padStart(2, '0');
export const hx8 = (n) => (n >>> 0).toString(16).toUpperCase().padStart(8, '0');
export const asc = (b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '·');

export const link = (file, sym, text) => `<a href="${githubUrl(file, sym)}" target="_blank" rel="noopener">${text}</a>`;

// Nodos del camino del dato. `block` = bloque 3D que se resalta; `view` = vista interior para "Ver por dentro".
export const NODES = {
  host: { short: 'PC', title: 'PC (host)', block: null, file: null,
    where: 'Script de debug en la PC, conectado por USB-UART a la Nexys4' },
  sync: { short: '2FF', title: 'sync_2ff', block: 'uart', file: 'common/sync_2ff.v', sym: 'module:sync_2ff', view: 'sync_2ff',
    where: 'top_riscv · u_rx_sync' },
  rx: { short: 'RX', title: 'uart_rx', block: 'uart', file: 'uart/uart_rx.v', sym: 'module:uart_rx', view: 'uart_rx_fsm',
    where: 'uart_core · RX' },
  rxfifo: { short: 'FIFO', title: 'RX FIFO (4 bytes)', block: 'uart', file: 'uart/fifo.v', sym: 'module:fifo', view: 'fifo',
    where: 'uart_core · RX_FIFO' },
  fsm: { short: 'FSM', title: 'debug_unit_fsm', block: 'debug', file: 'debug/debug_unit_fsm.v', sym: 'module:debug_unit_fsm', view: 'debug_unit_fsm',
    where: 'debug_unit · FSM' },
  imem: { short: 'IMEM', title: 'imem', block: 'imem', file: 'pipeline/1_fetch/imem.v', sym: 'module:imem', view: 'imem',
    where: 'riscv_pipeline · u_imem (puerto de escritura wr_en / wr_addr / wr_data)' },
  cpu: { short: 'CPU', title: 'o_cpu_reset / o_cpu_enable', block: 'pc', file: 'debug/debug_unit_fsm.v', sym: 'o_cpu_enable', view: 'debug_unit_fsm',
    where: 'debug_unit_fsm → riscv_pipeline (i_rst, i_enable)' },
  regs: { short: 'REGS', title: 'debug_unit_regs', block: 'debug', file: 'debug/debug_unit_regs.v', sym: 'module:debug_unit_regs', view: 'debug_unit_regs',
    where: 'debug_unit · REGS / COMB' },
  txfifo: { short: 'FIFO', title: 'TX FIFO (4 bytes)', block: 'uart', file: 'uart/fifo.v', sym: 'module:fifo', view: 'fifo',
    where: 'uart_core · TX_FIFO' },
  tx: { short: 'TX', title: 'uart_tx', block: 'uart', file: 'uart/uart_tx.v', sym: 'module:uart_tx', view: 'uart_tx_fsm',
    where: 'uart_core · TX' },
  dbgread: { short: 'DBG', title: 'dbg_data (86 palabras)', block: 'debug', file: 'debug/debug_unit.v', sym: 'module:debug_unit', view: 'debug_unit',
    where: 'riscv_pipeline → debug_unit (i_dbg_data)' },
};
export const nodeLink = (key, text) => { const n = NODES[key]; return n && n.file ? link(n.file, n.sym, text || n.title) : (text || (n && n.title) || key); };

const fsmSchema = VIEWS.debug_unit_fsm;
export const FSM_SCHEMA = fsmSchema;
export const stateInfo = (name) => (fsmSchema ? fsmSchema.fsm.states.find((s) => s.name === name) : null);

// Transición del schema para (from,to) con el byte que la dispara
export function findTransition(from, to, byte) {
  if (!fsmSchema) return null;
  const all = fsmSchema.fsm.transitions.filter((t) => t.from === from && t.to === to);
  if (all.length <= 1) return all[0] || null;
  const names = { 0x4c: 'CMD_LOAD', 0x53: 'CMD_STEP', 0x52: 'CMD_RUN', 0x50: 'CMD_PAUSE', 0x58: 'CMD_RESET', 0x44: 'CMD_DUMP' };
  if (from === 'IDLE' && to === 'REPLY') {
    if (byte == null) return all.find((t) => /i_run && i_cpu_halt/.test(t.cond)) || all[0];
    return all.find((t) => t.cond.includes(names[byte] || '@@')) || all.find((t) => /no es un comando/.test(t.cond)) || all[0];
  }
  return all.find((t) => !/i_rx_empty$/.test(t.cond) && !/^i_tx_full$/.test(t.cond)) || all[0];
}

export function cmdBadge(byte) {
  const i = CMD_NAMES[byte];
  return i ? i.key : '?';
}

// Rol de color para los chips de bytes
export const ROLE_META = {
  cmd: { cls: 'r-cmd', name: 'comando' },
  len_lo: { cls: 'r-len', name: 'longitud' }, len_hi: { cls: 'r-len', name: 'longitud' },
  data: { cls: 'r-data', name: 'dato' }, unknown: { cls: 'r-unk', name: 'desconocido' },
  reply: { cls: 'r-rep', name: 'respuesta' }, cnt_lo: { cls: 'r-len', name: 'cuenta' }, cnt_hi: { cls: 'r-len', name: 'cuenta' }, word: { cls: 'r-data', name: 'dato' },
};

// Qué es el destino del byte en el camino RX
export function destFor(item, cmdKey) {
  if (!item) return 'regs';
  if (item.tx) return 'txfifo';
  const r = item.rx && item.rx.role;
  if (item.fill || item.kind === 'fill') return 'imem';
  if (item.imem) return 'imem';
  if (r === 'cmd') return ['L', 'S', 'R', 'P', 'X'].includes(item.rx.cmd) ? 'cpu' : (item.rx.cmd === 'D' ? 'dbgread' : 'regs');
  if (r === 'len_lo' || r === 'len_hi') return 'regs';
  return item.cpuStep || item.cpuRst ? 'cpu' : 'regs';
}

// Texto de lo que hace el host con este byte
export function hostText(item) {
  const r = item.rx;
  if (!r) return '';
  const b = r.b != null ? r.b : r.byte;
  const bh = `<code>0x${hx2(r.byte)}</code>`;
  if (r.role === 'cmd') {
    const i = CMD_NAMES[r.byte];
    return i ? `La PC manda ${bh} (<b>'${asc(r.byte)}'</b>): el comando <b>${i.key}</b> = ${i.title.toLowerCase()}. Es un solo byte, sin parámetros${i.key === 'L' ? ' propios: después vienen la longitud y el programa' : ''}.`
      : `La PC manda ${bh}, que no es ningún comando conocido.`;
  }
  if (r.role === 'len_lo') return `Primer parámetro de L: ${bh} es el byte bajo de <b>n</b>, la cantidad de instrucciones (16 bits, little-endian).`;
  if (r.role === 'len_hi') return `Segundo parámetro: ${bh} es el byte alto de <b>n</b>. Ahora la debug unit sabe que vienen <b>4·n</b> bytes de programa.`;
  if (r.role === 'data') return `Byte ${r.lane} de la instrucción ${r.word} (little-endian: primero el menos significativo): ${bh}.`;
  return `La PC manda ${bh}.`;
}

export function uartText(byte) {
  const bits = [];
  for (let i = 0; i < 8; i++) bits.push((byte >> i) & 1);
  return `Cada byte viaja como una trama <b>8N1</b>: bit de start (0), los 8 bits <b>LSB primero</b> (<code>${bits.join('')}</code> para 0x${hx2(byte)}) y bit de stop (1). A 19200 baudios cada bit dura ≈52 µs. El receptor corre a ×16: toma 16 muestras por bit y lee el valor en el centro (muestra 8).`;
}
export const SYNC_TEXT = 'La línea <code>rx</code> llega del pin de la FPGA sin relación con el reloj de 50 MHz. Antes de usarla pasa por <b>dos flip-flops en serie</b> (<code>sync_2ff</code>): si el primero queda metaestable, el segundo ya la ve estable.';
export const RXFSM_TEXT = 'La FSM de <code>uart_rx</code> detecta el flanco de bajada (start), cuenta ticks hasta el centro de cada bit y va desplazando los 8 bits dentro del registro. Al final del stop levanta <code>rx_done</code>.';
export const RXFIFO_TEXT = 'El byte recibido se escribe en la <b>RX FIFO</b> (4 entradas de 8 bits). Al dejar de estar vacía, <code>rx_empty</code> baja a 0 y la debug unit sabe que hay algo para leer. En la práctica la FSM lo consume en 1-2 ciclos de reloj, mucho antes de que llegue el byte siguiente (520 µs ≈ 26 000 ciclos).';

export function fsmText(item) {
  const t = findTransition(item.from, item.to, item.rx ? item.rx.byte : null);
  const si = stateInfo(item.to);
  return { t, si };
}

export function effectLines(item) {
  const t = findTransition(item.from, item.to, item.rx ? item.rx.byte : null);
  return t && t.effect ? t.effect : null;
}

export function replyMeaning(b) { return RESPONSES[b] || 'respuesta'; }
