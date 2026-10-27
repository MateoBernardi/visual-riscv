// Arnés de desarrollo del inspector v2 + grafo FSM (sirve vite en /dev/inspector.html).
// Parámetros: ?v=fsm|alu|uart  &theme=dark  &focus=part:id | net:id  &open=all  &graph=1
import '../src/styles.css';
import { createInspector } from '../src/ui/inspector.js';
import { ALTERNATIVES } from '../src/content/alternatives.js';

const q = new URLSearchParams(location.search);
if (q.get('theme') === 'dark') document.documentElement.dataset.theme = 'dark';

const T = (from, to, cond, actions, caseLabel) => ({ from, to, cond, actions, caseLabel });
const S = (name, code, desc, pos, outputs = []) => ({ name, code, desc, pos, outputs });
const DEBUG_FSM = {
  stateSymbol: 'o_state', file: 'debug/debug_unit_fsm.v', live: 'dbg.state',
  explain: '<p>La FSM decodifica un byte de comando y recorre los estados necesarios para atenderlo.</p>',
  states: [
    S('IDLE', 0, '<p>Espera un comando.</p>', [0.04, 0.5]),
    S('LOAD_LEN_LO', 1, '<p>Byte bajo de la longitud.</p>', [0.22, 0.04]), S('LOAD_LEN_HI', 2, '<p>Byte alto de la longitud.</p>', [0.42, 0.04]),
    S('LOAD_DATA', 3, '<p>Recibe los bytes del programa.</p>', [0.62, 0.04]), S('LOAD_FILL', 4, '<p>Rellena con NOP.</p>', [0.82, 0.04]),
    S('REPLY', 5, '<p>Manda el código de respuesta.</p>', [0.96, 0.5]),
    S('DUMP_CNT_LO', 6, '', [0.12, 0.96]), S('DUMP_CNT_HI', 7, '', [0.3, 0.96]), S('DUMP_ADDR', 8, '', [0.48, 0.96]),
    S('DUMP_LATCH', 9, '', [0.66, 0.96]), S('DUMP_BYTE', 10, '<p>Envía los 4 bytes de la palabra.</p>', [0.84, 0.96]),
  ],
  transitions: [
    T('IDLE', 'LOAD_LEN_LO', 'rx_byte == CMD_LOAD', 'run_next=0', 'CMD_LOAD'),
    T('IDLE', 'REPLY', 'CMD_STEP / RUN / PAUSE / RESET / desconocido', 'reply_load=1', 'CMD_STEP'),
    T('IDLE', 'REPLY', 'run && cpu_halt', 'reply_code=RSP_HALT', 'IDLE'),
    T('IDLE', 'DUMP_CNT_LO', 'rx_byte == CMD_DUMP', 'dbg_addr_clear=1', 'CMD_DUMP'),
    T('LOAD_LEN_LO', 'LOAD_LEN_HI', '~rx_empty', 'len_lo_load=1', 'LOAD_LEN_LO'),
    T('LOAD_LEN_HI', 'LOAD_DATA', '~rx_empty && ~len_zero', 'cnt_clear=1', 'LOAD_LEN_HI'),
    T('LOAD_LEN_HI', 'LOAD_FILL', '~rx_empty && len_zero', 'cnt_clear=1', 'LOAD_LEN_HI'),
    T('LOAD_DATA', 'LOAD_DATA', '~rx_empty && ~load_last', 'imem_load=1, cnt_inc=1', 'LOAD_DATA'),
    T('LOAD_DATA', 'LOAD_FILL', '~rx_empty && load_last', 'imem_load=1', 'LOAD_DATA'),
    T('LOAD_FILL', 'LOAD_FILL', 'in_range', 'imem_fill=1', 'LOAD_FILL'),
    T('LOAD_FILL', 'REPLY', '~in_range', 'reply_load=1', 'LOAD_FILL'),
    T('REPLY', 'IDLE', '~tx_full', 'tx_write=1', 'REPLY'),
    T('DUMP_CNT_LO', 'DUMP_CNT_HI', '~tx_full', 'send_count_lo=1', 'DUMP_CNT_LO'),
    T('DUMP_CNT_HI', 'DUMP_ADDR', '~tx_full && ~dbg_count_zero', 'send_count_hi=1', 'DUMP_CNT_HI'),
    T('DUMP_CNT_HI', 'IDLE', '~tx_full && dbg_count_zero', 'send_count_hi=1', 'DUMP_CNT_HI'),
    T('DUMP_ADDR', 'DUMP_LATCH', '1', '', 'DUMP_ADDR'),
    T('DUMP_LATCH', 'DUMP_BYTE', '1', 'word_load=1', 'DUMP_LATCH'),
    T('DUMP_BYTE', 'DUMP_BYTE', '~tx_full && ~byte_last', 'send_word=1', 'DUMP_BYTE'),
    T('DUMP_BYTE', 'DUMP_ADDR', '~tx_full && byte_last && ~dbg_last', 'dbg_addr_inc=1', 'DUMP_BYTE'),
    T('DUMP_BYTE', 'IDLE', '~tx_full && byte_last && dbg_last', '', 'DUMP_BYTE'),
  ],
};

const DEBUG = {
  id: 'debug_unit', module: 'debug_unit_fsm', file: 'debug/debug_unit_fsm.v', parent: 'top_riscv', title: 'Debug unit (FSM)', stage: null, kind: 'fsm',
  explain: {
    firstPrinciples: '<p>Para cargar y depurar un programa desde la PC hace falta algo que entienda un <b>protocolo de bytes</b> y mueva el CPU en consecuencia.</p>',
    inThisProject: '<p>La FSM lee comandos de la FIFO de RX. Estado actual en <code>o_state</code>, ver <a href="#">la FSM</a>.</p>',
    whyThisChoice: '<p>Una FSM explícita es fácil de verificar y de explicar.</p>',
  },
  refs: [{ label: 'estados (localparam)', sym: 'state:IDLE' }, { label: 'case principal', sym: 'case:IDLE' }],
  ports: [
    { name: 'i_rx_empty', dir: 'in', width: 1, ext: 'uart', desc: 'La FIFO de recepción no tiene bytes.', live: 'dbg.rxEmpty' },
    { name: 'i_rx_byte', dir: 'in', width: 8, ext: 'uart', desc: 'Siguiente byte recibido.', live: 'dbg.rxByte' },
    { name: 'i_cpu_halt', dir: 'in', width: 1, ext: 'riscv_pipeline', desc: 'El CPU llegó a un ECALL/EBREAK.', live: 'dbg.halt' },
    { name: 'o_state_next', dir: 'out', width: 4, ext: 'debug_unit_regs', desc: 'Próximo estado.', live: 'dbg.stateCode' },
    { name: 'o_cpu_enable', dir: 'out', width: 1, ext: 'riscv_pipeline', desc: 'Habilita el reloj lógico del CPU.', live: 'dbg.cpuEnable' },
    { name: 'o_cpu_reset', dir: 'out', width: 1, ext: 'riscv_pipeline', desc: 'Reset del CPU.', live: 'dbg.cpuReset' },
  ],
  parts: [{ id: 'fsm', kind: 'fsm', label: 'FSM de comandos', width: 4, symbol: 'IDLE', desc: '<p>Decodifica el byte recibido.</p>' }],
  nets: [{ id: 'n1', from: 'port:i_rx_byte', to: 'fsm', name: 'i_rx_byte', width: 8, desc: '<p>El comando.</p>' }],
  fsm: DEBUG_FSM,
};

const ALU = {
  id: 'alu_tp1', module: 'alu_tp1', file: 'pipeline/3_execute/alu.v', parent: 'riscv_pipeline', title: 'ALU', stage: 'EX', kind: 'comb',
  explain: {
    firstPrinciples: '<p>La ALU calcula, con una sola operación por vez, el resultado aritmético o lógico que pide cada instrucción.</p>',
    inThisProject: '<p>Siempre calcula <code>zero</code>, <code>lt</code> y <code>ltu</code> para los branches.</p>',
    whyThisChoice: '<p>Un único bloque combinacional resuelve todo en un ciclo.</p>',
  },
  refs: [{ label: 'módulo alu_tp1', sym: 'module:alu_tp1' }],
  ports: [
    { name: 'i_data_a', dir: 'in', width: 32, ext: 'fwdMuxA', desc: 'Operando A (tras forwarding).', live: 'snap.signals.aluA' },
    { name: 'i_data_b', dir: 'in', width: 32, ext: 'aluSrcMux', desc: 'Operando B.', live: 'snap.signals.aluB' },
    { name: 'i_data_op', dir: 'in', width: 4, ext: 'idex', desc: 'Operación elegida.', live: 'snap.signals.aluOp' },
    { name: 'o_result', dir: 'out', width: 32, ext: 'exmem', desc: 'Resultado.', live: 'snap.signals.aluOut' },
    { name: 'zero', dir: 'out', width: 1, ext: 'branch', desc: 'Resultado == 0.', live: 'snap.signals.zero' },
    { name: 'stall', dir: 'in', width: 1, ext: 'hazard', desc: 'Detiene el pipeline.', live: 'snap.signals.stall' },
    { name: 'forward_a', dir: 'in', width: 2, ext: 'forward', desc: 'Selecciona el origen del operando A.', live: 'snap.signals.fwdA' },
    { name: 'wb_sel', dir: 'out', width: 2, ext: 'wbMux', desc: 'Qué se escribe en rd.', live: 'snap.signals.wbSel' },
  ],
  parts: [{ id: 'adder', kind: 'adder', label: 'Sumador', width: 32, symbol: 'o_result', desc: '<p>Suma A + B.</p>' }],
  nets: [{ id: 'a_in', from: 'port:i_data_a', to: 'adder', name: 'i_data_a', width: 32, desc: '<p>Entra A.</p>' }],
};

const UART_RX = {
  id: 'uart_rx', module: 'uart_rx_fsm', file: 'uart/uart_rx_fsm.v', parent: 'uart_core', title: 'UART RX', stage: null, kind: 'fsm',
  explain: { firstPrinciples: '<p>Una línea serie no tiene reloj: el receptor debe muestrear cada bit en el centro.</p>', inThisProject: '<p>16 ticks por bit; muestrea en <code>s==7</code> del start y luego cada 16.</p>', whyThisChoice: '<p>×16 da tolerancia a la deriva de reloj.</p>' },
  refs: [{ label: 'estados', sym: 'state:IDLE' }],
  ports: [{ name: 'i_rx', dir: 'in', width: 1, ext: 'pin', desc: 'Línea serie.' }],
  parts: [], nets: [],
  fsm: {
    stateSymbol: 'i_state', live: 'uart.rx.state',
    states: [S('IDLE', 0, '<p>Línea en reposo (1).</p>'), S('START', 1, '<p>Cuenta 8 ticks hasta el medio del bit de start.</p>'), S('DATA', 2, '<p>Muestrea 8 bits cada 16 ticks.</p>'), S('STOP', 3, '<p>Verifica que la línea valga 1.</p>')],
    transitions: [T('IDLE', 'START', '~i_rx', 's_clear', 'IDLE'), T('START', 'DATA', 'tick && s_half', 's_clear, n_clear', 'START'), T('DATA', 'DATA', 'tick && s_last && ~n_last', 'shift, n_inc', 'DATA'),
      T('DATA', 'STOP', 'tick && s_last && n_last', 'shift', 'DATA'), T('STOP', 'IDLE', 'tick && s_last', 'rx_done = i_rx', 'STOP')],
    explain: '<p>Cuatro estados, un contador de ticks <code>s</code> y uno de bits <code>n</code>.</p>',
  },
};

const VIEWS_H = { fsm: DEBUG, alu: ALU, uart: UART_RX };
const view = VIEWS_H[q.get('v') || 'fsm'];
const root = document.getElementById('root');
const insp = createInspector(root, { onEnter: (id) => console.log('enter', id), onClose() {}, onFsmSelect: (s) => console.log('state', s) });

const ctx = { snap: { signals: { aluA: 0x12345678, aluB: 4, aluOp: 0, aluOut: 0x1234567c, zero: false, stall: 1, fwdA: 2, wbSel: 1 } }, dbg: { state: 'LOAD_DATA', stateCode: 3, rxEmpty: 0, rxByte: 0x4c, halt: 0, cpuEnable: 1, cpuReset: 0 }, uart: { rx: { state: 'DATA' } } };
const focus = q.get('focus') ? { type: q.get('focus').split(':')[0], id: q.get('focus').split(':')[1] } : null;
const alt = q.get('v') === 'alu' ? ALTERNATIVES.alu : null;
['Desde cero', 'En este proyecto', 'Por qué esta elección', 'Otras opciones', 'Qué entra y qué sale', 'FSM', 'Simular un byte'];
insp.update({ blockId: 'x', view, alt, ctx, focus });
window.__insp = insp;
// abrir todas las secciones / el grafo para las capturas
if (q.get('open') === 'all') document.querySelectorAll('details.isec').forEach((d) => { d.open = true; });
if (q.get('open')) { const t = q.get('open'); if (t !== 'all') document.querySelectorAll('details.isec').forEach((d) => { d.open = d.querySelector('.isec-t').textContent === t; }); }
if (q.get('graph')) document.querySelector('.fsm-bar .btn')?.click();
if (q.get('sim')) document.querySelector('.usim .btn')?.click();
if (q.get('big')) document.querySelector('.fsm-bar .btn.ghost')?.click();
