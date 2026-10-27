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
      <p>Una trama UART tiene una estructura fija en el tiempo: un bit de start, ocho bits de datos y un bit de stop. Para recibirla, el hardware tiene que "saber en qué parte de la trama está". Eso es lo que recuerda una máquina de estados. Cada bit tiene una duración de 16 ticks; la FSM no mide tiempo por sí misma, sino que consulta banderas del contador de ticks (<code>s_half</code>, <code>s_last</code>) y del contador de bits (<code>n_last</code>).</p>
      <p>Separar la FSM del datapath tiene una ventaja: la FSM solo habla de "hacer algo" (<code>s_clear</code>, <code>s_inc</code>, <code>shift</code>), no de cómo se hace. Las salidas por defecto son 0 en cada ciclo; la FSM solo activa la que necesita, por lo que son pulsos de exactamente un ciclo.</p>
      <p>Cuatro estados son suficientes, y 2 bits los codifican: <code>IDLE = 00</code>, <code>START = 01</code>, <code>DATA = 10</code>, <code>STOP = 11</code>. El código de IDLE es 0 porque es el valor de reset del registro de estado.</p>`,
    inThisProject: `
      <p>La FSM actúa solo sobre <code>i_tick</code>: en START, DATA y STOP no pasa nada entre ticks; en cada tick, o suma <code>s</code> o resuelve la transición. La única transición que <b>no</b> espera un tick es IDLE &rarr; START, que reacciona al flanco de bajada en cuanto se ve <code>~i_rx</code> (y limpia <code>s</code>, de modo que la cuenta de los 8 ticks al centro del bit comienza en el reloj en que se detectó el start).</p>
      <p><b>Efecto sobre los datos.</b> El desplazamiento (<code>o_shift</code>) ocurre cuando <code>s == 15</code> en DATA: el bit se muestrea un bit-tiempo después del centro del start, o sea en el centro del bit de datos. En STOP, cuando <code>s == 15</code> la FSM vuelve a IDLE y reporta <code>o_rx_done = i_rx</code>: si la línea no está en 1 (stop inválido) el pulso no se emite y el byte se pierde.</p>
      <p>El <code>default</code> del <code>case</code> (estado fuera de rango) manda a IDLE. Con 2 bits están los cuatro estados definidos, por lo que la rama solo existe por prolijidad y para evitar latches.</p>`,
    whyThisChoice: `
      <p><b>Moore vs. Mealy.</b> Las salidas de control (<code>o_s_inc</code>, <code>o_shift</code>) dependen de <code>i_tick</code> y de las banderas, así que son Mealy: es lo natural cuando las acciones son "en el tick tal, hacé tal cosa". Una versión Moore pura necesitaría estados extra para cada acción puntual.</p>
      <p><b>Codificación binaria vs. one-hot.</b> One-hot usaría 4 flip-flops en vez de 2 y simplificaría la lógica de próximo estado; para 4 estados la diferencia es irrelevante. Se eligió binario porque el código de IDLE tiene que ser 0 (reset).</p>
      <p><b>Salir de STOP en el centro del bit.</b> Como la cuenta empezó en el centro del start, el contador llega a 15 en STOP justo en el centro del bit de stop (152 ticks = 9,5 bits desde el flanco). La FSM vuelve entonces a IDLE medio bit antes de que termine la trama: queda lista para detectar el siguiente start aunque el emisor sea un poco más rápido, y el stop se valida en el punto más estable del bit.</p>`,
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
