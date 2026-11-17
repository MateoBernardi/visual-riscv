import { githubUrl } from '../repo.js';

const F = 'uart/uart_rx.v';
const L = (sym, t) => `<a href="${githubUrl(F, sym)}" target="_blank" rel="noopener">${t ?? sym}</a>`;
const P = (name, dir, width, side, ext, desc) => ({ name, dir, width, side, ext, desc });

export default {
  id: 'uart_rx',
  module: 'uart_rx',
  file: F,
  instance: 'RX',
  parent: 'uart_core',
  blockIds: [],
  title: 'uart_rx (receptor)',
  stage: null,
  kind: 'struct',
  explain: {
    firstPrinciples: `
      <p>Recibir es reconstruir 8 bits sin el reloj del emisor: detectar el flanco del start, muestrear en el centro de cada bit y acumular en un registro de desplazamiento. Como llega primero el LSB, se desplaza a la derecha y el bit nuevo entra por la izquierda: después de 8 bits, cada uno quedó en su lugar.</p>`,
    inThisProject: `
      <ul>
        <li>START cuenta hasta <code>s == 7</code> (centro del start); desde ahí, cada 16 ticks muestrea un bit; en STOP emite <code>o_rx_done = i_rx</code>, así que solo hay pulso si el stop vale 1.</li>
        <li>No vuelve a mirar la línea en el centro del start: un pulso de ruido puede producir un byte basura. Un stop malo descarta el byte sin avisar.</li>
      </ul>`,
    whyThisChoice: `
      <p><b>Una muestra por bit</b>, sin votar tres como la 16550: menos lógica, y alcanza para un cable USB corto.</p>
      <p><b>Un <code>tick</code> que habilita, no un reloj de 16&times;</b>: un solo dominio de reloj, y Vivado analiza todo el timing. Es la técnica estándar en FPGA.</p>`,
  },
  refs: [
    { label: 'FSM', sym: 'FSM' },
    { label: 'COMB', sym: 'COMB' },
    { label: 'REGS', sym: 'REGS' },
    { label: 'o_dout', sym: 'o_dout' },
  ],
  grid: [14, 9],
  ports: [
    P('i_clk', 'in', 1, 'b', 'clk (70 MHz)', 'Reloj del sistema.'),
    P('i_reset', 'in', 1, 'b', 'sys_reset', 'Reset sincrónico (lo usa REGS).'),
    P('i_rx', 'in', 1, 'l', 'rx_sync (línea serie sincronizada)', 'Línea serie. Reposo = 1.'),
    P('i_tick', 'in', 1, 'l', 'BAUD_GEN', 'Pulso a 16&times; el baud rate.'),
    P('o_rx_done', 'out', 1, 'r', 'RX_FIFO (i_write_fifo)', 'Pulso de un ciclo: llegó un byte válido.'),
    P('o_dout', 'out', 8, 'r', 'RX_FIFO (i_data_to_write)', 'Byte recibido.'),
  ],
  parts: [
    { id: 'FSM', kind: 'submodule', label: 'FSM (uart_rx_fsm)', width: 2, symbol: 'FSM', at: [4, 0], size: [4, 4], drill: 'uart_rx_fsm', live: 'uart.rx.state',
      desc: '<p>Máquina de estados IDLE / START / DATA / STOP. Decide cuándo limpiar o incrementar los contadores, cuándo desplazar un bit y cuándo avisar <code>o_rx_done</code>.</p>' },
    { id: 'COMB', kind: 'submodule', label: 'COMB (uart_rx_comb)', width: 1, symbol: 'COMB', at: [4, 5], size: [4, 4], drill: 'uart_rx_comb',
      desc: '<p>Próximos valores de <code>s</code>, <code>n</code> y <code>received_byte</code> y las banderas <code>s_half</code>, <code>s_last</code>, <code>n_last</code>.</p>' },
    { id: 'REGS', kind: 'submodule', label: 'REGS (uart_rx_regs)', width: 1, symbol: 'REGS', at: [10, 2], size: [3, 5], drill: 'uart_rx_regs', live: 'uart.rx.state',
      desc: '<p>Registros: estado (2 bits), <code>s</code> (4 bits), <code>n</code> (3 bits) y <code>received_byte</code> (8 bits).</p>' },
  ],
  nets: [
    { id: 'n_rx_fsm', from: 'port:i_rx', to: 'FSM', name: 'i_rx', width: 1, desc: '<p>La FSM la mira para detectar el start (IDLE) y para validar el stop (<code>o_rx_done = i_rx</code>).</p>' },
    { id: 'n_rx_comb', from: 'port:i_rx', to: 'COMB', name: 'i_rx', width: 1, desc: '<p>COMB inserta este bit por la izquierda al desplazar el byte.</p>' },
    { id: 'n_tick', from: 'port:i_tick', to: 'FSM', name: 'i_tick', width: 1, desc: '<p>Solo se cuenta o se avanza de estado cuando <code>i_tick = 1</code>.</p>' },
    { id: 'n_clk', from: 'port:i_clk', to: 'REGS', name: 'i_clk', width: 1, desc: '<p>Reloj de los registros.</p>' },
    { id: 'n_reset', from: 'port:i_reset', to: 'REGS', name: 'i_reset', width: 1, desc: '<p>Reset: IDLE, contadores y byte en 0.</p>' },
    { id: 'n_state', from: 'REGS', to: 'FSM', name: 'state', width: 2, live: 'uart.rx.state', desc: '<p>Estado actual, de REGS a la FSM.</p>' },
    { id: 'n_state_next', from: 'FSM', to: 'REGS', name: 'state_next', width: 2, desc: '<p>Estado siguiente.</p>' },
    { id: 'n_s', from: 'REGS', to: 'COMB', name: 's', width: 4, live: 'uart.rx.s', desc: '<p>Contador de ticks dentro del bit (0..15).</p>' },
    { id: 'n_n', from: 'REGS', to: 'COMB', name: 'n', width: 3, live: 'uart.rx.n', desc: '<p>Contador de bits del byte (0..7).</p>' },
    { id: 'n_byte', from: 'REGS', to: 'COMB', name: 'received_byte', width: 8, live: 'uart.rx.byte', desc: '<p>Byte en construcción.</p>' },
    { id: 'n_s_next', from: 'COMB', to: 'REGS', name: 's_next', width: 4, desc: '<p>Próximo valor de <code>s</code>.</p>' },
    { id: 'n_n_next', from: 'COMB', to: 'REGS', name: 'n_next', width: 3, desc: '<p>Próximo valor de <code>n</code>.</p>' },
    { id: 'n_byte_next', from: 'COMB', to: 'REGS', name: 'received_byte_next', width: 8, desc: '<p>Próximo valor del byte (desplazado o igual).</p>' },
    { id: 'n_s_ctl', from: 'FSM', to: 'COMB', name: 's_clear', width: 1, desc: '<p>Grupo de control del contador de ticks: <code>s_clear</code>, <code>s_inc</code>.</p>' },
    { id: 'n_n_ctl', from: 'FSM', to: 'COMB', name: 'n_clear', width: 1, desc: '<p>Grupo de control del contador de bits: <code>n_clear</code>, <code>n_inc</code>.</p>' },
    { id: 'n_shift', from: 'FSM', to: 'COMB', name: 'shift', width: 1, desc: '<p>Desplazar <code>i_rx</code> dentro del byte (una vez por bit de datos).</p>' },
    { id: 'n_flags_half', from: 'COMB', to: 'FSM', name: 's_half', width: 1, desc: '<p><code>s == 7</code>: mitad del bit de start.</p>' },
    { id: 'n_flags_last', from: 'COMB', to: 'FSM', name: 's_last', width: 1, desc: '<p><code>s == 15</code>: bit completo.</p>' },
    { id: 'n_flags_nlast', from: 'COMB', to: 'FSM', name: 'n_last', width: 1, desc: '<p><code>n == 7</code>: último bit de datos.</p>' },
    { id: 'n_done', from: 'FSM', to: 'port:o_rx_done', name: 'o_rx_done', width: 1, desc: '<p>Pulso: byte completo con stop bit válido.</p>' },
    { id: 'n_dout', from: 'REGS', to: 'port:o_dout', name: 'o_dout', width: 8, live: 'uart.rx.byte', desc: '<p><code>assign o_dout = received_byte</code>.</p>' },
  ],
};
