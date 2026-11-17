import { githubUrl } from '../repo.js';

const F = 'uart/uart_rx_regs.v';
const L = (sym, t) => `<a href="${githubUrl(F, sym)}" target="_blank" rel="noopener">${t ?? sym}</a>`;
const P = (name, dir, width, side, ext, desc) => ({ name, dir, width, side, ext, desc });

export default {
  id: 'uart_rx_regs',
  module: 'uart_rx_regs',
  file: F,
  instance: 'REGS',
  parent: 'uart_rx',
  blockIds: [],
  title: 'uart_rx_regs (registros)',
  stage: null,
  kind: 'seq',
  explain: {
    firstPrinciples: `
      <p>Todo lo que el receptor recuerda entre ciclos son 17 bits: estado (2), ticks (4), bits (3) y el byte (8). Ponerlos en un módulo aparte deja a la vista todo el estado; lo demás es combinacional.</p>`,
    inThisProject: `
      <ul>
        <li><code>o_byte</code> no se limpia entre bytes: 8 desplazamientos lo reemplazan entero. Es la salida <code>o_dout</code>.</li>
      </ul>`,
    whyThisChoice: `
      <p><code>o_dout</code> cambia mientras se desplaza, y es correcto: la FIFO lo captura solo con <code>rx_done</code>, cuando el byte está completo. Así no hace falta un registro de salida aparte.</p>`,
  },
  refs: [{ label: 'o_state', sym: 'o_state' }, { label: 'o_byte', sym: 'o_byte' }],
  grid: [10, 5],
  ports: [
    P('i_clk', 'in', 1, 'b', 'clk (70 MHz)', 'Reloj.'),
    P('i_reset', 'in', 1, 'b', 'sys_reset', 'Reset sincrónico.'),
    P('i_state_next', 'in', 2, 'l', 'FSM', 'Próximo estado.'),
    P('i_s_next', 'in', 4, 'l', 'COMB', 'Próximo <code>s</code>.'),
    P('i_n_next', 'in', 3, 'l', 'COMB', 'Próximo <code>n</code>.'),
    P('i_byte_next', 'in', 8, 'l', 'COMB', 'Próximo byte.'),
    P('o_state', 'out', 2, 'r', 'FSM', 'Estado actual.'),
    P('o_s', 'out', 4, 'r', 'COMB', 'Ticks dentro del bit.'),
    P('o_n', 'out', 3, 'r', 'COMB', 'Bits ya leídos.'),
    P('o_byte', 'out', 8, 'r', 'COMB y o_dout', 'Byte en construcción / recibido.'),
  ],
  parts: [
    { id: 'o_state', kind: 'reg', label: 'o_state [1:0]', width: 2, symbol: 'o_state', at: [3, 0], size: [3, 1], live: 'uart.rx.state', desc: '<p>Estado de la FSM. Reset: 00 = IDLE.</p>' },
    { id: 'o_s', kind: 'reg', label: 'o_s [3:0]', width: 4, symbol: 'o_s', at: [3, 1], size: [3, 1], live: 'uart.rx.s', desc: '<p>Contador de ticks en el bit actual (0..15).</p>' },
    { id: 'o_n', kind: 'reg', label: 'o_n [2:0]', width: 3, symbol: 'o_n', at: [3, 2], size: [3, 1], live: 'uart.rx.n', desc: '<p>Cantidad de bits de datos ya leídos (0..7).</p>' },
    { id: 'o_byte', kind: 'reg', label: 'o_byte [7:0]', width: 8, symbol: 'o_byte', at: [3, 3], size: [3, 1], live: 'uart.rx.byte', desc: '<p>Registro de desplazamiento con el byte recibido.</p>' },
  ],
  nets: [
    { id: 'n_clk', from: 'port:i_clk', to: 'o_state', name: 'i_clk', width: 1, desc: '<p>Reloj común a los cuatro registros.</p>' },
    { id: 'n_reset', from: 'port:i_reset', to: 'o_state', name: 'i_reset', width: 1, desc: '<p>Reset sincrónico común.</p>' },
    { id: 'n_i_state', from: 'port:i_state_next', to: 'o_state', name: 'i_state_next', width: 2, desc: '<p>Próximo estado desde la FSM.</p>' },
    { id: 'n_i_s', from: 'port:i_s_next', to: 'o_s', name: 'i_s_next', width: 4, desc: '<p>Próximo <code>s</code> desde COMB.</p>' },
    { id: 'n_i_n', from: 'port:i_n_next', to: 'o_n', name: 'i_n_next', width: 3, desc: '<p>Próximo <code>n</code> desde COMB.</p>' },
    { id: 'n_i_byte', from: 'port:i_byte_next', to: 'o_byte', name: 'i_byte_next', width: 8, desc: '<p>Próximo byte desde COMB.</p>' },
    { id: 'n_o_state', from: 'o_state', to: 'port:o_state', name: 'o_state', width: 2, live: 'uart.rx.state', desc: '<p>Estado hacia la FSM.</p>' },
    { id: 'n_o_s', from: 'o_s', to: 'port:o_s', name: 'o_s', width: 4, live: 'uart.rx.s', desc: '<p>Ticks hacia COMB.</p>' },
    { id: 'n_o_n', from: 'o_n', to: 'port:o_n', name: 'o_n', width: 3, live: 'uart.rx.n', desc: '<p>Bits hacia COMB.</p>' },
    { id: 'n_o_byte', from: 'o_byte', to: 'port:o_byte', name: 'o_byte', width: 8, live: 'uart.rx.byte', desc: '<p>Byte hacia COMB y hacia <code>o_dout</code>.</p>' },
  ],
};
