import { githubUrl } from '../repo.js';

const F = 'uart/uart_tx_fsm.v';
const L = (sym, t) => `<a href="${githubUrl(F, sym)}" target="_blank" rel="noopener">${t ?? sym}</a>`;
const P = (name, dir, width, side, ext, desc) => ({ name, dir, width, side, ext, desc });

export default {
  id: 'uart_tx_fsm',
  module: 'uart_tx_fsm',
  file: F,
  instance: 'FSM',
  parent: 'uart_tx',
  blockIds: [],
  title: 'uart_tx_fsm',
  stage: null,
  kind: 'fsm',
  explain: {
    firstPrinciples: `
      <p>Cuatro estados recorren la trama: reposo, start, datos, stop. Acá la FSM decide el nivel de la línea: <code>o_tx_data</code> (mandar el bit del byte) u <code>o_tx_level</code> (un nivel fijo).</p>`,
    inThisProject: `
      <ul>
        <li>IDLE &rarr; START no espera tick: arranca con <code>i_tx_ready</code>. El resto avanza con <code>i_tick &amp;&amp; i_s_last</code>.</li>
        <li>Al final de STOP emite <code>o_tx_done</code>; si hay otro byte, al ciclo siguiente ya está en START.</li>
      </ul>`,
    whyThisChoice: `
      <p>Cada estado declara su nivel de línea junto con sus demás salidas, en vez de que el datapath lo deduzca del estado. Arrancar sin tick ahorra hasta 1/16 de bit de espera inútil.</p>`,
  },
  refs: [{ label: 'IDLE', sym: 'state:IDLE' }, { label: 'o_tx_done', sym: 'o_tx_done' }],
  grid: [10, 6],
  ports: [
    P('i_state', 'in', 2, 'l', 'REGS', 'Estado actual.'),
    P('i_tx_ready', 'in', 1, 'l', 'TX_FIFO', 'Hay un byte para enviar.'),
    P('i_tick', 'in', 1, 'l', 'BAUD_GEN', 'Tick a 16&times; baud.'),
    P('i_s_last', 'in', 1, 'l', 'COMB', '<code>s == 15</code>.'),
    P('i_n_last', 'in', 1, 'l', 'COMB', '<code>n == 7</code>.'),
    P('o_state_next', 'out', 2, 'r', 'REGS', 'Próximo estado.'),
    P('o_s_clear', 'out', 1, 'r', 'COMB', 'Limpiar <code>s</code>.'),
    P('o_s_inc', 'out', 1, 'r', 'COMB', 'Incrementar <code>s</code>.'),
    P('o_n_clear', 'out', 1, 'r', 'COMB', 'Limpiar <code>n</code>.'),
    P('o_n_inc', 'out', 1, 'r', 'COMB', 'Incrementar <code>n</code>.'),
    P('o_load', 'out', 1, 'r', 'COMB', 'Cargar <code>i_din</code>.'),
    P('o_shift', 'out', 1, 'r', 'COMB', 'Desplazar el byte.'),
    P('o_tx_data', 'out', 1, 'r', 'COMB', '1: la línea muestra el bit de datos.'),
    P('o_tx_level', 'out', 1, 'r', 'COMB', 'Nivel fijo de la línea.'),
    P('o_tx_done', 'out', 1, 'r', 'TX_FIFO', 'Trama terminada.'),
  ],
  parts: [
    { id: 'o_state_next', kind: 'fsm', label: 'case (i_state)', width: 2, symbol: 'o_state_next', at: [3, 0], size: [4, 4], live: 'uart.tx.state',
      desc: '<p>El <code>case</code> de los 4 estados. Por defecto: estado igual, controles en 0, <code>o_tx_level = 1</code>.</p>' },
  ],
  nets: [
    { id: 'n_state', from: 'port:i_state', to: 'o_state_next', name: 'i_state', width: 2, live: 'uart.tx.state', desc: '<p>Selector del <code>case</code>.</p>' },
    { id: 'n_ready', from: 'port:i_tx_ready', to: 'o_state_next', name: 'i_tx_ready', width: 1, desc: '<p>Dispara START desde IDLE.</p>' },
    { id: 'n_tick', from: 'port:i_tick', to: 'o_state_next', name: 'i_tick', width: 1, desc: '<p>Habilita avanzar dentro de START/DATA/STOP.</p>' },
    { id: 'n_s_last', from: 'port:i_s_last', to: 'o_state_next', name: 'i_s_last', width: 1, desc: '<p>Fin de bit.</p>' },
    { id: 'n_n_last', from: 'port:i_n_last', to: 'o_state_next', name: 'i_n_last', width: 1, desc: '<p>Último bit de datos.</p>' },
    { id: 'n_next', from: 'o_state_next', to: 'port:o_state_next', name: 'o_state_next', width: 2, desc: '<p>Próximo estado.</p>' },
    { id: 'n_s', from: 'o_state_next', to: 'port:o_s_clear', name: 'o_s_clear', width: 1, desc: '<p>Control de ticks: <code>o_s_clear</code>, <code>o_s_inc</code>.</p>' },
    { id: 'n_n', from: 'o_state_next', to: 'port:o_n_clear', name: 'o_n_clear', width: 1, desc: '<p>Control de bits: <code>o_n_clear</code>, <code>o_n_inc</code>.</p>' },
    { id: 'n_load', from: 'o_state_next', to: 'port:o_load', name: 'o_load', width: 1, desc: '<p>Carga del byte.</p>' },
    { id: 'n_shift', from: 'o_state_next', to: 'port:o_shift', name: 'o_shift', width: 1, desc: '<p>Desplazamiento del byte.</p>' },
    { id: 'n_level', from: 'o_state_next', to: 'port:o_tx_level', name: 'o_tx_level', width: 1, desc: '<p>Nivel de la línea (0 en START, 1 en IDLE/STOP).</p>' },
    { id: 'n_data', from: 'o_state_next', to: 'port:o_tx_data', name: 'o_tx_data', width: 1, desc: '<p>Selecciona el bit de datos como nivel (sólo en DATA).</p>' },
    { id: 'n_done', from: 'o_state_next', to: 'port:o_tx_done', name: 'o_tx_done', width: 1, desc: '<p>Pulso al terminar el stop.</p>' },
  ],
  fsm: {
    stateSymbol: 'i_state',
    file: F,
    live: 'uart.tx.state',
    explain: `
      <p>Un byte completo cuesta 10 &times; 16 = 160 ticks (1 start + 8 datos + 1 stop). La FSM pasa por START una vez, DATA ocho veces y STOP una vez. A diferencia del receptor, el camino IDLE &rarr; START es inmediato.</p>`,
    states: [
      { name: 'IDLE', code: 0, pos: [0.1, 0.5], desc: 'Reposo: la línea vale 1. Si hay un byte, lo carga y empieza.', outputs: ['o_tx_level=1', 'si i_tx_ready: o_load=1, o_s_clear=1'] },
      { name: 'START', code: 1, pos: [0.5, 0.1], desc: 'Bit de start: la línea vale 0 durante 16 ticks.', outputs: ['o_tx_level=0'] },
      { name: 'DATA', code: 2, pos: [0.9, 0.5], desc: 'Ocho bits de datos, LSB primero: la línea muestra send_byte[0] y el byte se desplaza al final de cada bit.', outputs: ['o_tx_data=1'] },
      { name: 'STOP', code: 3, pos: [0.5, 0.9], desc: 'Bit de stop: la línea vale 1 durante 16 ticks; al terminar avisa tx_done.', outputs: ['o_tx_level=1', 'al terminar: o_tx_done=1'] },
    ],
    transitions: [
      { from: 'IDLE', to: 'START', cond: 'i_tx_ready', caseLabel: 'IDLE', actions: 'o_s_clear=1; o_load=1' },
      { from: 'IDLE', to: 'IDLE', cond: '~i_tx_ready', caseLabel: 'IDLE', actions: '(espera)' },
      { from: 'START', to: 'DATA', cond: 'i_tick && i_s_last', caseLabel: 'START', actions: 'o_s_clear=1; o_n_clear=1' },
      { from: 'START', to: 'START', cond: 'i_tick && ~i_s_last', caseLabel: 'START', actions: 'o_s_inc=1' },
      { from: 'DATA', to: 'DATA', cond: 'i_tick && ~i_s_last', caseLabel: 'DATA', actions: 'o_s_inc=1' },
      { from: 'DATA', to: 'DATA', cond: 'i_tick && i_s_last && ~i_n_last', caseLabel: 'DATA', actions: 'o_s_clear=1; o_shift=1; o_n_inc=1' },
      { from: 'DATA', to: 'STOP', cond: 'i_tick && i_s_last && i_n_last', caseLabel: 'DATA', actions: 'o_s_clear=1; o_shift=1' },
      { from: 'STOP', to: 'STOP', cond: 'i_tick && ~i_s_last', caseLabel: 'STOP', actions: 'o_s_inc=1' },
      { from: 'STOP', to: 'IDLE', cond: 'i_tick && i_s_last', caseLabel: 'STOP', actions: 'o_tx_done=1' },
    ],
  },
};
