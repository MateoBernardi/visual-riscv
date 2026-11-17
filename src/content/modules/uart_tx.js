import { githubUrl } from '../repo.js';

const F = 'uart/uart_tx.v';
const L = (sym, t) => `<a href="${githubUrl(F, sym)}" target="_blank" rel="noopener">${t ?? sym}</a>`;
const P = (name, dir, width, side, ext, desc) => ({ name, dir, width, side, ext, desc });

export default {
  id: 'uart_tx',
  module: 'uart_tx',
  file: F,
  instance: 'TX',
  parent: 'uart_core',
  blockIds: [],
  title: 'uart_tx (transmisor)',
  stage: null,
  kind: 'struct',
  explain: {
    firstPrinciples: `
      <p>Transmitir es más simple que recibir: el emisor marca el tiempo. Saca 16 ticks de start (0), los 8 bits (LSB primero) y 16 de stop (1). El byte se carga en un desplazador y siempre se manda el bit 0. La salida pasa por un flip-flop para que el pin no tenga glitches.</p>`,
    inThisProject: `
      <ul>
        <li>Arranca apenas <code>i_tx_ready = ~tx_empty</code>, sin esperar un tick. El byte sigue en la FIFO hasta <code>o_tx_done</code>, que hace el pop.</li>
        <li>Si hay otro byte, la trama siguiente arranca enseguida, sin hueco.</li>
        <li>El primer bit puede durar hasta 1/16 de bit menos, que el receptor absorbe.</li>
      </ul>`,
    whyThisChoice: `
      <p><b>Salida registrada</b>: un flip-flop y un ciclo de latencia, a cambio de un pin limpio.</p>
      <p><b>Copiar el byte a <code>send_byte</code></b> para desplazarlo, sin tocar la cabeza de la FIFO hasta el pop. Sin control de flujo: el que más transmite es la FPGA (el volcado) y se frena sola con <code>tx_full</code>.</p>`,
  },
  refs: [
    { label: 'FSM', sym: 'FSM' },
    { label: 'COMB', sym: 'COMB' },
    { label: 'REGS', sym: 'REGS' },
    { label: 'o_tx', sym: 'o_tx' },
  ],
  grid: [14, 9],
  ports: [
    P('i_clk', 'in', 1, 'b', 'clk (70 MHz)', 'Reloj del sistema.'),
    P('i_reset', 'in', 1, 'b', 'sys_reset', 'Reset sincrónico; la línea vuelve a 1.'),
    P('i_tx_ready', 'in', 1, 'l', 'TX_FIFO (~tx_empty)', 'Hay un byte para enviar.'),
    P('i_tick', 'in', 1, 'l', 'BAUD_GEN', 'Pulso a 16&times; el baud rate.'),
    P('i_din', 'in', 8, 'l', 'TX_FIFO (o_data_to_read)', 'Byte de la cabeza del FIFO.'),
    P('o_tx_done', 'out', 1, 'r', 'TX_FIFO (i_read_fifo)', 'Pulso: se terminó de enviar el byte.'),
    P('o_tx', 'out', 1, 'r', 'pin FPGA D4 (UART_RXD_OUT)', 'Línea serie hacia la PC (registrada).'),
  ],
  parts: [
    { id: 'FSM', kind: 'submodule', label: 'FSM (uart_tx_fsm)', width: 2, symbol: 'FSM', at: [4, 0], size: [4, 4], drill: 'uart_tx_fsm', live: 'uart.tx.state',
      desc: '<p>Máquina de estados IDLE / START / DATA / STOP; decide el nivel de la línea (<code>tx_level</code>, <code>tx_data</code>), cuándo cargar y desplazar el byte y cuándo avisar <code>tx_done</code>.</p>' },
    { id: 'COMB', kind: 'submodule', label: 'COMB (uart_tx_comb)', width: 1, symbol: 'COMB', at: [4, 5], size: [4, 4], drill: 'uart_tx_comb',
      desc: '<p>Próximos <code>s</code>, <code>n</code>, <code>send_byte</code> y <code>tx</code>, más las banderas <code>s_last</code> y <code>n_last</code>.</p>' },
    { id: 'REGS', kind: 'submodule', label: 'REGS (uart_tx_regs)', width: 1, symbol: 'REGS', at: [10, 2], size: [3, 5], drill: 'uart_tx_regs', live: 'uart.tx.state',
      desc: '<p>Registros: estado, <code>s</code>, <code>n</code>, <code>send_byte</code> y <code>tx</code> (la línea).</p>' },
  ],
  nets: [
    { id: 'n_ready', from: 'port:i_tx_ready', to: 'FSM', name: 'i_tx_ready', width: 1, desc: '<p>Si vale 1 en IDLE, empieza la transmisión.</p>' },
    { id: 'n_tick', from: 'port:i_tick', to: 'FSM', name: 'i_tick', width: 1, desc: '<p>Las cuentas sólo avanzan con tick.</p>' },
    { id: 'n_din', from: 'port:i_din', to: 'COMB', name: 'i_din', width: 8, desc: '<p>Byte a copiar en <code>send_byte</code> cuando <code>load = 1</code>.</p>' },
    { id: 'n_clk', from: 'port:i_clk', to: 'REGS', name: 'i_clk', width: 1, desc: '<p>Reloj de los registros.</p>' },
    { id: 'n_reset', from: 'port:i_reset', to: 'REGS', name: 'i_reset', width: 1, desc: '<p>Reset: IDLE y línea en 1.</p>' },
    { id: 'n_state', from: 'REGS', to: 'FSM', name: 'state', width: 2, live: 'uart.tx.state', desc: '<p>Estado actual.</p>' },
    { id: 'n_state_next', from: 'FSM', to: 'REGS', name: 'state_next', width: 2, desc: '<p>Próximo estado.</p>' },
    { id: 'n_s', from: 'REGS', to: 'COMB', name: 's', width: 4, live: 'uart.tx.s', desc: '<p>Ticks dentro del bit.</p>' },
    { id: 'n_n', from: 'REGS', to: 'COMB', name: 'n', width: 3, live: 'uart.tx.n', desc: '<p>Bits ya enviados.</p>' },
    { id: 'n_byte', from: 'REGS', to: 'COMB', name: 'send_byte', width: 8, live: 'uart.tx.byte', desc: '<p>Byte en transmisión (se desplaza a la derecha).</p>' },
    { id: 'n_s_next', from: 'COMB', to: 'REGS', name: 's_next', width: 4, desc: '<p>Próximo <code>s</code>.</p>' },
    { id: 'n_n_next', from: 'COMB', to: 'REGS', name: 'n_next', width: 3, desc: '<p>Próximo <code>n</code>.</p>' },
    { id: 'n_byte_next', from: 'COMB', to: 'REGS', name: 'send_byte_next', width: 8, desc: '<p>Próximo byte.</p>' },
    { id: 'n_tx_next', from: 'COMB', to: 'REGS', name: 'tx_next', width: 1, desc: '<p>Nivel que tomará la línea en el próximo flanco.</p>' },
    { id: 'n_s_ctl', from: 'FSM', to: 'COMB', name: 's_clear', width: 1, desc: '<p>Control del contador de ticks (<code>s_clear</code>, <code>s_inc</code>).</p>' },
    { id: 'n_n_ctl', from: 'FSM', to: 'COMB', name: 'n_clear', width: 1, desc: '<p>Control del contador de bits (<code>n_clear</code>, <code>n_inc</code>).</p>' },
    { id: 'n_load', from: 'FSM', to: 'COMB', name: 'load', width: 1, desc: '<p>Cargar <code>i_din</code> en <code>send_byte</code> (en IDLE).</p>' },
    { id: 'n_shift', from: 'FSM', to: 'COMB', name: 'shift', width: 1, desc: '<p>Desplazar <code>send_byte</code> a la derecha (al fin de cada bit de datos).</p>' },
    { id: 'n_tx_data', from: 'FSM', to: 'COMB', name: 'tx_data', width: 1, desc: '<p>1: la línea toma el bit de datos actual.</p>' },
    { id: 'n_tx_level', from: 'FSM', to: 'COMB', name: 'tx_level', width: 1, desc: '<p>Nivel de la línea cuando <code>tx_data = 0</code> (0 en START, 1 en IDLE/STOP).</p>' },
    { id: 'n_s_last', from: 'COMB', to: 'FSM', name: 's_last', width: 1, desc: '<p><code>s == 15</code>.</p>' },
    { id: 'n_n_last', from: 'COMB', to: 'FSM', name: 'n_last', width: 1, desc: '<p><code>n == 7</code>.</p>' },
    { id: 'n_done', from: 'FSM', to: 'port:o_tx_done', name: 'o_tx_done', width: 1, desc: '<p>Pulso al final del stop bit: el FIFO descarta el byte.</p>' },
    { id: 'n_tx', from: 'REGS', to: 'port:o_tx', name: 'o_tx', width: 1, live: 'uart.tx.tx', desc: '<p><code>assign o_tx = tx</code>: sale del flip-flop.</p>' },
  ],
};
