import { githubUrl } from '../repo.js';

const F = 'uart/uart_tx_regs.v';
const L = (sym, t) => `<a href="${githubUrl(F, sym)}" target="_blank" rel="noopener">${t ?? sym}</a>`;
const P = (name, dir, width, side, ext, desc) => ({ name, dir, width, side, ext, desc });

export default {
  id: 'uart_tx_regs',
  module: 'uart_tx_regs',
  file: F,
  instance: 'REGS',
  parent: 'uart_tx',
  blockIds: [],
  title: 'uart_tx_regs (registros)',
  stage: null,
  kind: 'seq',
  explain: {
    firstPrinciples: `
      <p>Estado, ticks, bits y byte, como en el receptor, más un quinto flip-flop: la línea (<code>o_tx</code>). Su valor de reset importa, porque la UART en reposo está en 1.</p>`,
    inThisProject: `
      <ul>
        <li>Con reset: estado IDLE, contadores y byte en 0, ${L('o_tx')} = <b>1</b>. Sale al pin D4.</li>
      </ul>`,
    whyThisChoice: `
      <p><b>Línea a 1 en el reset</b>: si arrancara en 0, la PC vería un start falso y recibiría un byte basura al encender la placa. El ciclo de latencia del registro es irrelevante: un bit dura unos 3600 ciclos.</p>`,
  },
  refs: [{ label: 'o_tx', sym: 'o_tx' }, { label: 'o_state', sym: 'o_state' }],
  grid: [10, 6],
  ports: [
    P('i_clk', 'in', 1, 'b', 'clk (70 MHz)', 'Reloj.'),
    P('i_reset', 'in', 1, 'b', 'sys_reset', 'Reset sincrónico.'),
    P('i_state_next', 'in', 2, 'l', 'FSM', 'Próximo estado.'),
    P('i_s_next', 'in', 4, 'l', 'COMB', 'Próximo <code>s</code>.'),
    P('i_n_next', 'in', 3, 'l', 'COMB', 'Próximo <code>n</code>.'),
    P('i_byte_next', 'in', 8, 'l', 'COMB', 'Próximo byte.'),
    P('i_tx_next', 'in', 1, 'l', 'COMB', 'Próximo nivel de la línea.'),
    P('o_state', 'out', 2, 'r', 'FSM', 'Estado actual.'),
    P('o_s', 'out', 4, 'r', 'COMB', 'Ticks dentro del bit.'),
    P('o_n', 'out', 3, 'r', 'COMB', 'Bits enviados.'),
    P('o_byte', 'out', 8, 'r', 'COMB', 'Byte en transmisión.'),
    P('o_tx', 'out', 1, 'r', 'pin FPGA D4 (UART_RXD_OUT)', 'Línea serie registrada.'),
  ],
  parts: [
    { id: 'o_state', kind: 'reg', label: 'o_state [1:0]', width: 2, symbol: 'o_state', at: [3, 0], size: [3, 1], live: 'uart.tx.state', desc: '<p>Estado de la FSM. Reset: 00 = IDLE.</p>' },
    { id: 'o_s', kind: 'reg', label: 'o_s [3:0]', width: 4, symbol: 'o_s', at: [3, 1], size: [3, 1], live: 'uart.tx.s', desc: '<p>Ticks transcurridos en el bit actual.</p>' },
    { id: 'o_n', kind: 'reg', label: 'o_n [2:0]', width: 3, symbol: 'o_n', at: [3, 2], size: [3, 1], live: 'uart.tx.n', desc: '<p>Bits de datos ya enviados.</p>' },
    { id: 'o_byte', kind: 'reg', label: 'o_byte [7:0]', width: 8, symbol: 'o_byte', at: [3, 3], size: [3, 1], live: 'uart.tx.byte', desc: '<p>Registro de desplazamiento con el byte a enviar.</p>' },
    { id: 'o_tx', kind: 'ff', label: 'o_tx (línea)', width: 1, symbol: 'o_tx', at: [3, 4], size: [3, 1], live: 'uart.tx.tx', desc: '<p>Flip-flop de la línea. Reset: 1 (reposo).</p>' },
  ],
  nets: [
    { id: 'n_clk', from: 'port:i_clk', to: 'o_state', name: 'i_clk', width: 1, desc: '<p>Reloj común.</p>' },
    { id: 'n_reset', from: 'port:i_reset', to: 'o_state', name: 'i_reset', width: 1, desc: '<p>Reset sincrónico común (la línea vuelve a 1).</p>' },
    { id: 'n_i_state', from: 'port:i_state_next', to: 'o_state', name: 'i_state_next', width: 2, desc: '<p>Próximo estado.</p>' },
    { id: 'n_i_s', from: 'port:i_s_next', to: 'o_s', name: 'i_s_next', width: 4, desc: '<p>Próximo <code>s</code>.</p>' },
    { id: 'n_i_n', from: 'port:i_n_next', to: 'o_n', name: 'i_n_next', width: 3, desc: '<p>Próximo <code>n</code>.</p>' },
    { id: 'n_i_byte', from: 'port:i_byte_next', to: 'o_byte', name: 'i_byte_next', width: 8, desc: '<p>Próximo byte.</p>' },
    { id: 'n_i_tx', from: 'port:i_tx_next', to: 'o_tx', name: 'i_tx_next', width: 1, desc: '<p>Próximo nivel de la línea.</p>' },
    { id: 'n_o_state', from: 'o_state', to: 'port:o_state', name: 'o_state', width: 2, live: 'uart.tx.state', desc: '<p>Estado hacia la FSM.</p>' },
    { id: 'n_o_s', from: 'o_s', to: 'port:o_s', name: 'o_s', width: 4, live: 'uart.tx.s', desc: '<p>Ticks hacia COMB.</p>' },
    { id: 'n_o_n', from: 'o_n', to: 'port:o_n', name: 'o_n', width: 3, live: 'uart.tx.n', desc: '<p>Bits hacia COMB.</p>' },
    { id: 'n_o_byte', from: 'o_byte', to: 'port:o_byte', name: 'o_byte', width: 8, live: 'uart.tx.byte', desc: '<p>Byte hacia COMB.</p>' },
    { id: 'n_o_tx', from: 'o_tx', to: 'port:o_tx', name: 'o_tx', width: 1, live: 'uart.tx.tx', desc: '<p>La línea, hacia el pin.</p>' },
  ],
};
