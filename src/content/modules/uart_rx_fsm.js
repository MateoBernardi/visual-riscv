import { githubUrl } from '../repo.js';

const F = 'uart/uart_rx_fsm.v';
const L = (sym, t) => `<a href="${githubUrl(F, sym)}" target="_blank" rel="noopener">${t ?? sym}</a>`;
const P = (name, dir, width, side, ext, desc) => ({ name, dir, width, side, ext, desc });

export default {
  id: 'uart_rx_fsm',
  module: 'uart_rx_fsm',
  file: F,
  instance: 'FSM',
  parent: 'uart_rx',
  blockIds: [],
  title: 'uart_rx_fsm',
  stage: null,
  kind: 'fsm',
  explain: {
    firstPrinciples: `
      <p>La trama tiene fases fijas (start, datos, stop) y la FSM recuerda en cuál está. No mide tiempo: consulta las banderas de los contadores (<code>s_half</code>, <code>s_last</code>, <code>n_last</code>) y solo pide acciones (<code>s_clear</code>, <code>s_inc</code>, <code>shift</code>).</p>`,
    inThisProject: `
      <ul>
        <li>Solo IDLE &rarr; START reacciona sin tick, apenas ve <code>~i_rx</code>; el resto avanza con <code>i_tick</code>.</li>
        <li>El desplazamiento ocurre con <code>s == 15</code> en DATA, que es el centro del bit de datos.</li>
      </ul>`,
    whyThisChoice: `
      <p><b>Salir de STOP en el centro del bit</b>: el stop se valida en su punto más estable y el receptor vuelve a IDLE medio bit antes de que termine la trama, listo para el próximo start aunque el emisor vaya un poco más rápido.</p>
      <p>Salidas Mealy (dependen del tick), porque las acciones son "en el tick tal, hacé tal cosa"; en Moore haría falta un estado por acción. Codificación binaria con IDLE = 00, que es el valor de reset.</p>`,
  },
  refs: [
    { label: 'IDLE', sym: 'state:IDLE' },
    { label: 'case IDLE', sym: 'case:IDLE' },
    { label: 'o_rx_done', sym: 'o_rx_done' },
  ],
  grid: [10, 6],
  ports: [
    P('i_state', 'in', 2, 'l', 'REGS', 'Estado actual.'),
    P('i_rx', 'in', 1, 'l', 'rx_sync', 'Línea serie.'),
    P('i_tick', 'in', 1, 'l', 'BAUD_GEN', 'Tick a 16&times; baud.'),
    P('i_s_half', 'in', 1, 'l', 'COMB', '<code>s == N_TICKS/2 - 1</code> (7).'),
    P('i_s_last', 'in', 1, 'l', 'COMB', '<code>s == N_TICKS - 1</code> (15).'),
    P('i_n_last', 'in', 1, 'l', 'COMB', '<code>n == NB_DATA - 1</code> (7).'),
    P('o_state_next', 'out', 2, 'r', 'REGS', 'Próximo estado.'),
    P('o_s_clear', 'out', 1, 'r', 'COMB', 'Poner <code>s</code> en 0.'),
    P('o_s_inc', 'out', 1, 'r', 'COMB', 'Sumar 1 a <code>s</code>.'),
    P('o_n_clear', 'out', 1, 'r', 'COMB', 'Poner <code>n</code> en 0.'),
    P('o_n_inc', 'out', 1, 'r', 'COMB', 'Sumar 1 a <code>n</code>.'),
    P('o_shift', 'out', 1, 'r', 'COMB', 'Desplazar <code>i_rx</code> dentro del byte.'),
    P('o_rx_done', 'out', 1, 'r', 'RX_FIFO', 'Pulso: byte recibido válido.'),
  ],
  parts: [
    { id: 'o_state_next', kind: 'fsm', label: 'case (i_state)', width: 2, symbol: 'o_state_next', at: [3, 0], size: [4, 4], live: 'uart.rx.state',
      desc: '<p>El <code>always @(*)</code> con el <code>case</code> de los 4 estados. Valores por defecto: estado igual, todos los controles en 0.</p>' },
  ],
  nets: [
    { id: 'n_state', from: 'port:i_state', to: 'o_state_next', name: 'i_state', width: 2, live: 'uart.rx.state', desc: '<p>Selector del <code>case</code>.</p>' },
    { id: 'n_rx', from: 'port:i_rx', to: 'o_state_next', name: 'i_rx', width: 1, desc: '<p>Detecta el start (flanco a 0) y valida el stop.</p>' },
    { id: 'n_tick', from: 'port:i_tick', to: 'o_state_next', name: 'i_tick', width: 1, desc: '<p>Habilita el avance dentro de START/DATA/STOP.</p>' },
    { id: 'n_half', from: 'port:i_s_half', to: 'o_state_next', name: 'i_s_half', width: 1, desc: '<p>Mitad del start.</p>' },
    { id: 'n_last', from: 'port:i_s_last', to: 'o_state_next', name: 'i_s_last', width: 1, desc: '<p>Fin de un bit.</p>' },
    { id: 'n_nlast', from: 'port:i_n_last', to: 'o_state_next', name: 'i_n_last', width: 1, desc: '<p>Último bit de datos.</p>' },
    { id: 'n_next', from: 'o_state_next', to: 'port:o_state_next', name: 'o_state_next', width: 2, desc: '<p>Próximo estado.</p>' },
    { id: 'n_s', from: 'o_state_next', to: 'port:o_s_clear', name: 'o_s_clear', width: 1, desc: '<p>Grupo de control del contador de ticks: <code>o_s_clear</code>, <code>o_s_inc</code>.</p>' },
    { id: 'n_n', from: 'o_state_next', to: 'port:o_n_clear', name: 'o_n_clear', width: 1, desc: '<p>Grupo de control del contador de bits: <code>o_n_clear</code>, <code>o_n_inc</code>.</p>' },
    { id: 'n_shift', from: 'o_state_next', to: 'port:o_shift', name: 'o_shift', width: 1, desc: '<p>Capturar un bit de datos.</p>' },
    { id: 'n_done', from: 'o_state_next', to: 'port:o_rx_done', name: 'o_rx_done', width: 1, desc: '<p>Pulso: <code>i_rx</code> del bit de stop (válido sólo si 1).</p>' },
  ],
  fsm: {
    stateSymbol: 'i_state',
    file: F,
    live: 'uart.rx.state',
    explain: `
      <p>Cuatro estados, un camino principal circular IDLE &rarr; START &rarr; DATA &rarr; STOP &rarr; IDLE, y esperas (self-loops) en cada estado mientras se cuentan los ticks. Para recibir un byte la FSM pasa por START una vez (8 ticks hasta el centro), por DATA ocho veces (16 ticks cada una) y por STOP una vez (16 ticks): en total 8 + 128 + 16 = 152 ticks desde el flanco hasta que se emite <code>o_rx_done</code>.</p>
      <p>Observación: las auto-transiciones etiquetadas con <code>s_inc</code> son las que cuentan; el resto de ticks sin evento no hacen nada.</p>`,
    states: [
      { name: 'IDLE', code: 0, pos: [0.1, 0.5], desc: 'Línea en reposo (1). Espera el flanco de bajada del start.', outputs: ['todas las salidas en 0'] },
      { name: 'START', code: 1, pos: [0.5, 0.1], desc: 'Cuenta ticks hasta el centro del bit de start (s == 7).', outputs: ['o_s_inc=1 en cada tick (salvo el último)'] },
      { name: 'DATA', code: 2, pos: [0.9, 0.5], desc: 'Recibe los 8 bits de datos, LSB primero; muestrea en s == 15 (centro del bit).', outputs: ['o_shift=1 al final de cada bit', 'o_n_inc=1 entre bits'] },
      { name: 'STOP', code: 3, pos: [0.5, 0.9], desc: 'Espera el bit de stop (16 ticks) y reporta el byte si es 1.', outputs: ['o_rx_done = i_rx al terminar'] },
    ],
    transitions: [
      { from: 'IDLE', to: 'START', cond: '~i_rx', caseLabel: 'IDLE', actions: 'o_s_clear=1' },
      { from: 'IDLE', to: 'IDLE', cond: 'i_rx', caseLabel: 'IDLE', actions: '(espera)' },
      { from: 'START', to: 'DATA', cond: 'i_tick && i_s_half', caseLabel: 'START', actions: 'o_s_clear=1; o_n_clear=1' },
      { from: 'START', to: 'START', cond: 'i_tick && ~i_s_half', caseLabel: 'START', actions: 'o_s_inc=1' },
      { from: 'DATA', to: 'DATA', cond: 'i_tick && ~i_s_last', caseLabel: 'DATA', actions: 'o_s_inc=1' },
      { from: 'DATA', to: 'DATA', cond: 'i_tick && i_s_last && ~i_n_last', caseLabel: 'DATA', actions: 'o_s_clear=1; o_shift=1; o_n_inc=1' },
      { from: 'DATA', to: 'STOP', cond: 'i_tick && i_s_last && i_n_last', caseLabel: 'DATA', actions: 'o_s_clear=1; o_shift=1' },
      { from: 'STOP', to: 'STOP', cond: 'i_tick && ~i_s_last', caseLabel: 'STOP', actions: 'o_s_inc=1' },
      { from: 'STOP', to: 'IDLE', cond: 'i_tick && i_s_last', caseLabel: 'STOP', actions: 'o_rx_done = i_rx' },
    ],
  },
};
