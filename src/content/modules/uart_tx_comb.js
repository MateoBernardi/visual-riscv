import { githubUrl } from '../repo.js';

const F = 'uart/uart_tx_comb.v';
const L = (sym, t) => `<a href="${githubUrl(F, sym)}" target="_blank" rel="noopener">${t ?? sym}</a>`;
const P = (name, dir, width, side, ext, desc) => ({ name, dir, width, side, ext, desc });

export default {
  id: 'uart_tx_comb',
  module: 'uart_tx_comb',
  file: F,
  instance: 'COMB',
  parent: 'uart_tx',
  blockIds: [],
  title: 'uart_tx_comb (datapath)',
  stage: null,
  kind: 'comb',
  explain: {
    firstPrinciples: `
      <p>El desplazador se carga con el byte (<code>load</code>) y corre a la derecha (<code>shift</code>) para que el bit a mandar quede siempre en la posición 0. El último mux da el nivel de la línea: ese bit en DATA, o un nivel fijo.</p>`,
    inThisProject: `
      <ul>
        <li>${L('o_tx_next')} <code>= i_tx_data ? i_byte[0] : i_tx_level</code>.</li>
        <li>No hay bandera de medio bit: el transmisor no muestrea, solo cuenta bits completos.</li>
      </ul>`,
    whyThisChoice: `
      <p>Desplazar en lugar de indexar con <code>n</code> saca un mux 8:1 del camino al pin: lo que sale es siempre un bit fijo.</p>`,
  },
  refs: [{ label: 'o_byte_next', sym: 'o_byte_next' }, { label: 'o_tx_next', sym: 'o_tx_next' }],
  grid: [12, 7],
  ports: [
    P('i_din', 'in', 8, 'l', 'TX_FIFO', 'Byte a cargar.'),
    P('i_s', 'in', 4, 'l', 'REGS', 'Ticks dentro del bit.'),
    P('i_n', 'in', 3, 'l', 'REGS', 'Bits ya enviados.'),
    P('i_byte', 'in', 8, 'l', 'REGS', 'Byte en transmisión.'),
    P('i_s_clear', 'in', 1, 'l', 'FSM', 'Limpiar <code>s</code>.'),
    P('i_s_inc', 'in', 1, 'l', 'FSM', 'Incrementar <code>s</code>.'),
    P('i_n_clear', 'in', 1, 'l', 'FSM', 'Limpiar <code>n</code>.'),
    P('i_n_inc', 'in', 1, 'l', 'FSM', 'Incrementar <code>n</code>.'),
    P('i_load', 'in', 1, 'l', 'FSM', 'Cargar <code>i_din</code>.'),
    P('i_shift', 'in', 1, 'l', 'FSM', 'Desplazar a la derecha.'),
    P('i_tx_data', 'in', 1, 'l', 'FSM', 'La línea toma el bit de datos.'),
    P('i_tx_level', 'in', 1, 'l', 'FSM', 'Nivel fijo.'),
    P('o_s_next', 'out', 4, 'r', 'REGS', 'Próximo <code>s</code>.'),
    P('o_n_next', 'out', 3, 'r', 'REGS', 'Próximo <code>n</code>.'),
    P('o_byte_next', 'out', 8, 'r', 'REGS', 'Próximo byte.'),
    P('o_tx_next', 'out', 1, 'r', 'REGS', 'Próximo nivel de la línea.'),
    P('o_s_last', 'out', 1, 'r', 'FSM', '<code>s == 15</code>.'),
    P('o_n_last', 'out', 1, 'r', 'FSM', '<code>n == 7</code>.'),
  ],
  parts: [
    { id: 'o_s_next', kind: 'mux', label: 'o_s_next', width: 4, symbol: 'o_s_next', at: [3, 0], size: [3, 1], live: 'uart.tx.s', desc: '<p><code>clear ? 0 : inc ? s+1 : s</code>.</p>' },
    { id: 'o_n_next', kind: 'mux', label: 'o_n_next', width: 3, symbol: 'o_n_next', at: [3, 2], size: [3, 1], live: 'uart.tx.n', desc: '<p><code>clear ? 0 : inc ? n+1 : n</code>.</p>' },
    { id: 'o_byte_next', kind: 'mux', label: 'o_byte_next', width: 8, symbol: 'o_byte_next', at: [3, 4], size: [3, 1], live: 'uart.tx.byte', desc: '<p><code>load ? din : shift ? byte&gt;&gt;1 : byte</code>.</p>' },
    { id: 'o_tx_next', kind: 'mux', label: 'o_tx_next', width: 1, symbol: 'o_tx_next', at: [3, 6], size: [3, 1], live: 'uart.tx.tx', desc: '<p><code>tx_data ? byte[0] : tx_level</code>.</p>' },
    { id: 'o_s_last', kind: 'cmp', label: 's == N_TICKS-1', width: 1, symbol: 'o_s_last', at: [8, 0], size: [3, 1], desc: '<p>Fin de bit.</p>' },
    { id: 'o_n_last', kind: 'cmp', label: 'n == NB_DATA-1', width: 1, symbol: 'o_n_last', at: [8, 2], size: [3, 1], desc: '<p>Último bit de datos.</p>' },
  ],
  nets: [
    { id: 'n_s_in', from: 'port:i_s', to: 'o_s_next', name: 'i_s', width: 4, live: 'uart.tx.s', desc: '<p>Valor actual de <code>s</code>.</p>' },
    { id: 'n_s_last', from: 'port:i_s', to: 'o_s_last', name: 'i_s', width: 4, live: 'uart.tx.s', desc: '<p><code>s</code> hacia el comparador.</p>' },
    { id: 'n_n_in', from: 'port:i_n', to: 'o_n_next', name: 'i_n', width: 3, live: 'uart.tx.n', desc: '<p>Valor actual de <code>n</code>.</p>' },
    { id: 'n_n_last', from: 'port:i_n', to: 'o_n_last', name: 'i_n', width: 3, live: 'uart.tx.n', desc: '<p><code>n</code> hacia el comparador.</p>' },
    { id: 'n_byte_in', from: 'port:i_byte', to: 'o_byte_next', name: 'i_byte', width: 8, live: 'uart.tx.byte', desc: '<p>Byte actual, a desplazar o mantener.</p>' },
    { id: 'n_byte_tx', from: 'port:i_byte', to: 'o_tx_next', name: 'i_byte', width: 1, live: 'uart.tx.byte', desc: '<p>Sólo el bit 0 va al mux de línea.</p>' },
    { id: 'n_din', from: 'port:i_din', to: 'o_byte_next', name: 'i_din', width: 8, desc: '<p>Byte a cargar.</p>' },
    { id: 'n_load', from: 'port:i_load', to: 'o_byte_next', name: 'i_load', width: 1, desc: '<p>Selecciona la carga (con <code>i_shift</code> forman el control del byte).</p>' },
    { id: 'n_s_ctl', from: 'port:i_s_clear', to: 'o_s_next', name: 'i_s_clear', width: 1, desc: '<p>Control del contador de ticks (<code>i_s_clear</code>, <code>i_s_inc</code>).</p>' },
    { id: 'n_n_ctl', from: 'port:i_n_clear', to: 'o_n_next', name: 'i_n_clear', width: 1, desc: '<p>Control del contador de bits (<code>i_n_clear</code>, <code>i_n_inc</code>).</p>' },
    { id: 'n_tx_data', from: 'port:i_tx_data', to: 'o_tx_next', name: 'i_tx_data', width: 1, desc: '<p>Elige entre el bit de datos y el nivel fijo.</p>' },
    { id: 'n_tx_level', from: 'port:i_tx_level', to: 'o_tx_next', name: 'i_tx_level', width: 1, desc: '<p>Nivel fijo (START = 0, IDLE/STOP = 1).</p>' },
    { id: 'n_o_s', from: 'o_s_next', to: 'port:o_s_next', name: 'o_s_next', width: 4, desc: '<p>A REGS.</p>' },
    { id: 'n_o_n', from: 'o_n_next', to: 'port:o_n_next', name: 'o_n_next', width: 3, desc: '<p>A REGS.</p>' },
    { id: 'n_o_byte', from: 'o_byte_next', to: 'port:o_byte_next', name: 'o_byte_next', width: 8, desc: '<p>A REGS.</p>' },
    { id: 'n_o_tx', from: 'o_tx_next', to: 'port:o_tx_next', name: 'o_tx_next', width: 1, desc: '<p>A REGS (flip-flop de la línea).</p>' },
    { id: 'n_o_slast', from: 'o_s_last', to: 'port:o_s_last', name: 'o_s_last', width: 1, desc: '<p>A la FSM.</p>' },
    { id: 'n_o_nlast', from: 'o_n_last', to: 'port:o_n_last', name: 'o_n_last', width: 1, desc: '<p>A la FSM.</p>' },
  ],
};
